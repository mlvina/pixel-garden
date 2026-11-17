'use strict';
// Pixel Garden — авторитетный сервер. Клиент шлёт только «намерения» (посадить/полить/собрать/купить/ник),
// а все числа (время, рост, цены, редкость, награды) считает и хранит сервер. Зависимостей нет.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const openStore = require('./store');
const runMod = require('./mod');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // в Docker задаётся 0.0.0.0, порт наружу НЕ публикуется
const ADMIN_PORT = Number(process.env.ADMIN_PORT) || 3001; // консоль модератора, только loopback внутри контейнера
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const MAX_PLAYERS = 20000;
const PRUNE_MS = 60 * 864e5; // забываем игроков, не заходивших 60 дней (заблокированных не трогаем)
const NICK_COOLDOWN = 864e5; // менять ник можно раз в сутки

const store = openStore(DATA_DIR);
const { players, touch } = store;
const fail = store.fail;

// ---------- баланс ----------
const RAR = [ // w = вес выпадения, time = секунд полива до зрелости, val = цена
  { w: 70, time: 90, val: 12 }, { w: 20, time: 150, val: 35 }, { w: 8, time: 240, val: 110 },
  { w: 1.8, time: 400, val: 400 }, { w: 0.2, time: 700, val: 2000 },
];
const SEED_COST = 5;
const GRACE = 600, WARN = 180; // сек без воды до засыхания / за сколько сек до него слать уведомление
const VAPID_SUB = process.env.VAPID_SUB || 'mailto:admin@example.com';
const MAX = { slot: 9, tank: 10, luck: 8 };
const COST = {
  slot: n => Math.round(40 * 2.5 ** (n - 2)),
  tank: n => Math.round(30 * 2.2 ** n),
  luck: n => Math.round(60 * 2.5 ** n),
};
const lvl = (P, k) => (k === 'slot' ? P.plants.length : P[k]);
const capSec = P => 180 + 120 * P.tank; // сколько секунд хватает полной воды

// ---------- игровая логика ----------
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
function rollRarity(luck) {
  const w = RAR.map((r, i) => r.w * (1 + 0.35 * luck) ** i);
  let x = (crypto.randomInt(1e6) / 1e6) * w.reduce((a, b) => a + b);
  for (let i = 0; i < w.length; i++) if ((x -= w[i]) < 0) return i;
  return 0;
}
const value = p => Math.round(RAR[p.r].val * (1 + ((p.seed % 21) - 10) / 50));

function sim(P, p, now) { // ленивая симуляция: считаем по прошедшему времени, поэтому idle работает и офлайн
  if (p.dead) return;
  const dt = Math.max(0, (now - p.t) / 1000), cap = capSec(P), w0 = p.w;
  p.w = Math.max(0, w0 - dt / cap);
  p.g = Math.min(1, p.g + Math.min(dt, w0 * cap) / RAR[p.r].time);
  if (p.g >= 1) p.d = 0; // созревшему растению вода не нужна
  else if (p.w === 0) {
    if (!p.d) p.d = p.t + w0 * cap * 1000; // момент, когда закончилась вода
    if (now - p.d >= GRACE * 1000) p.dead = true; // слишком долго без воды
  }
  p.t = now;
}

function view(P) {
  const now = Date.now();
  P.plants.forEach(p => p && sim(P, p, now));
  const next = k => (lvl(P, k) < MAX[k] ? COST[k](lvl(P, k)) : null);
  return {
    coins: P.coins, tank: P.tank, luck: P.luck, slots: P.plants.length, capSec: capSec(P),
    grace: GRACE, warn: WARN, push: !!P.push, max: MAX,
    nick: P.nick, nickLock: !!P.nickLock, nickWait: P.nick ? Math.max(0, Math.ceil((P.nickAt + NICK_COOLDOWN - now) / 1000)) : 0,
    lv: { slot: P.plants.length, tank: P.tank, luck: P.luck },
    cost: { seed: SEED_COST, slot: next('slot'), tank: next('tank'), luck: next('luck') },
    plants: P.plants.map(p => p && {
      seed: p.seed, r: p.r, g: +p.g.toFixed(4), w: +p.w.toFixed(4), v: value(p), x: !!p.dead,
      l: !p.dead && p.d ? Math.max(0, Math.ceil(GRACE - (now - p.d) / 1000)) : null, // секунд до засыхания
    }),
  };
}

function act(P, b) {
  const now = Date.now();
  P.plants.forEach(p => p && sim(P, p, now));
  const slot = () => {
    if (!Number.isInteger(b.slot) || b.slot < 0 || b.slot >= P.plants.length) fail('Нет такой грядки');
    return b.slot;
  };
  switch (b.a) {
    case 'plant': {
      const i = slot();
      if (P.plants[i]) fail('Грядка занята');
      if (P.coins < SEED_COST) fail('Не хватает монет');
      P.coins -= SEED_COST;
      P.plants[i] = { seed: crypto.randomInt(2 ** 32), r: rollRarity(P.luck), g: 0, w: 1, t: now, d: 0, nw: 0 };
      break;
    }
    case 'water': {
      const p = P.plants[slot()];
      if (!p) fail('Грядка пуста');
      if (p.dead) fail('Растение засохло, уберите его');
      p.w = 1; p.d = 0; p.nw = 0; break;
    }
    case 'waterall': P.plants.forEach(p => { if (p && !p.dead) { p.w = 1; p.d = 0; p.nw = 0; } }); break;
    case 'clear': {
      const i = slot();
      if (!P.plants[i] || !P.plants[i].dead) fail('Нечего убирать');
      P.plants[i] = null; break;
    }
    case 'harvest': {
      const i = slot(), p = P.plants[i];
      if (!p) fail('Грядка пуста');
      if (p.dead) fail('Растение засохло');
      if (p.g < 1) fail('Растение ещё не выросло');
      const v = value(p); P.coins += v; P.earned += v; P.harvests++; P.plants[i] = null; break;
    }
    case 'upgrade': {
      const k = b.kind;
      if (k !== 'slot' && k !== 'tank' && k !== 'luck') fail('Неизвестное улучшение');
      const n = lvl(P, k);
      if (n >= MAX[k]) fail('Максимальный уровень');
      const c = COST[k](n);
      if (P.coins < c) fail('Не хватает монет');
      P.coins -= c;
      if (k === 'slot') P.plants.push(null); else P[k]++;
      break;
    }
    case 'nick': {
      if (P.nickLock) fail('Смена ника запрещена модератором');
      if (P.nick && now < P.nickAt + NICK_COOLDOWN) fail('Ник можно менять раз в сутки');
      const n = store.checkNick(b.nick);
      if (P.nick === n) fail('Это ваш текущий ник');
      store.setNick(P, n); break;
    }
    default: fail('Неизвестное действие');
  }
}

// ---------- таблица лидеров (кэш на 10 с) ----------
let topCache = { t: 0, list: [] };
function top() {
  if (Date.now() - topCache.t > 10000) {
    const list = [...players.values()].filter(P => P.nick && !P.banned && P.earned > 0)
      .sort((a, b) => b.earned - a.earned).slice(0, 10).map(P => ({ nick: P.nick, earned: P.earned }));
    topCache = { t: Date.now(), list };
  }
  return topCache.list;
}

// ---------- push-уведомления (Web Push + VAPID, без payload) ----------
// Сервер шлёт «пустой» push, а текст показывает service worker (sw.js). Шифрование payload не нужно.
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
let vapid;
try { vapid = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8')); } catch {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const j = publicKey.export({ format: 'jwk' });
  vapid = {
    priv: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    pub: Buffer.concat([Buffer.from([4]), Buffer.from(j.x, 'base64url'), Buffer.from(j.y, 'base64url')]).toString('base64url'),
  };
  fs.writeFileSync(VAPID_FILE, JSON.stringify(vapid), { mode: 0o600 });
}
// Защита от SSRF: адрес подписки приходит от клиента, поэтому шлём только на известные push-сервисы браузеров.
const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'];
const PUSH_SUFFIX = ['.push.apple.com', '.notify.windows.com'];
function pushOk(u) {
  try {
    const x = new URL(u);
    return u.length <= 1000 && x.protocol === 'https:' && !x.username && !x.password && !x.port &&
      (PUSH_HOSTS.includes(x.hostname) || PUSH_SUFFIX.some(s => x.hostname.endsWith(s)));
  } catch { return false; }
}
async function sendPush(P) {
  try {
    const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const head = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud: new URL(P.push).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUB });
    const sig = crypto.sign('sha256', Buffer.from(head), { key: vapid.priv, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    const r = await fetch(P.push, {
      method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(8000),
      headers: { Authorization: `vapid t=${head}.${sig}, k=${vapid.pub}`, TTL: '600', Urgency: 'high' },
    });
    if (r.status === 404 || r.status === 410) { P.push = null; touch(P); } // подписка отозвана
  } catch { /* сеть недоступна — попробуем при следующей проверке */ }
}
setInterval(() => { // раз в 30 с проверяем только игроков с уведомлениями
  const now = Date.now();
  for (const P of players.values()) {
    if (!P.push || P.banned) continue;
    let need = false;
    for (const p of P.plants) {
      if (!p) continue;
      sim(P, p, now);
      if (!p.dead && p.d && !p.nw && now >= p.d + (GRACE - WARN) * 1000) { p.nw = 1; need = true; touch(P); }
    }
    if (need) sendPush(P);
  }
}, 30000);

// ---------- обслуживание ----------
setInterval(store.flush, 5000);
setInterval(() => { try { store.backup(); } catch (e) { console.error('backup:', e.message); } }, 864e5);
setInterval(() => {
  const old = Date.now() - PRUNE_MS;
  for (const P of [...players.values()]) if (P.seen < old && !P.banned) store.remove(P.id);
}, 36e5);
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { store.flush(); process.exit(0); });

// ---------- защита от флуда ----------
const bucket = new Map(), regLog = new Map();
function allow(ip) { // 5 запросов/с, всплеск до 20
  const now = Date.now();
  let b = bucket.get(ip);
  if (!b) bucket.set(ip, (b = { t: 20, ts: now }));
  b.t = Math.min(20, b.t + (now - b.ts) / 200); b.ts = now;
  if (b.t < 1) return false;
  b.t--; return true;
}
function regAllowed(ip) { // 5 регистраций в час с адреса
  const now = Date.now(), a = (regLog.get(ip) || []).filter(t => now - t < 36e5);
  if (a.length >= 5) return false;
  a.push(now); regLog.set(ip, a); return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of bucket) if (now - b.ts > 6e4) bucket.delete(k);
  for (const [k, a] of regLog) if (!a.some(t => now - t < 36e5)) regLog.delete(k);
}, 6e4);

// Caddy перезаписывает X-Forwarded-For адресом клиента; берём последнее значение. IP нигде не сохраняются.
const ipOf = req => { const x = req.headers['x-forwarded-for']; return x ? x.split(',').pop().trim() : req.socket.remoteAddress; };

function readBody(req) {
  return new Promise((ok, no) => {
    const chunks = []; let n = 0;
    req.on('data', d => { n += d.length; if (n > 1024) { no({ big: true }); req.destroy(); } else chunks.push(d); });
    req.on('end', () => {
      try {
        const j = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
        ok(j && typeof j === 'object' && !Array.isArray(j) ? j : {});
      } catch (e) { no(e); }
    });
    req.on('error', no);
  });
}
const send = (res, code, o) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(o));
};

const server = http.createServer(async (req, res) => {
  try {
    if (!allow(ipOf(req))) return send(res, 429, { error: 'Слишком часто' });
    if (req.method !== 'POST') return send(res, 405, { error: 'Только POST' });
    const url = req.url.split('?')[0];
    const b = await readBody(req);

    if (url === '/api/register') {
      if (players.size >= MAX_PLAYERS) return send(res, 503, { error: 'Сервер переполнен' });
      if (!regAllowed(ipOf(req))) return send(res, 429, { error: 'Слишком много регистраций' });
      const token = crypto.randomBytes(32).toString('hex'), now = Date.now();
      store.add({
        id: sha(token), nick: null, nickAt: 0, nickLock: 0, coins: 20, earned: 0, harvests: 0, tank: 0, luck: 0,
        plants: [null, null], push: null, created: now, seen: now, banned: 0, banReason: null,
      });
      return send(res, 200, { token }); // на сервере хранится только хеш токена
    }

    const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization || '');
    const P = m && players.get(sha(m[1]));
    if (!P) return send(res, 401, { error: 'Нужна авторизация' });
    if (P.banned) return send(res, 403, { error: 'Аккаунт заблокирован' + (P.banReason ? ': ' + P.banReason : '') });
    const now = Date.now();
    if (now - P.seen > 3e5) touch(P); // время захода пишем в БД не чаще раза в 5 минут
    P.seen = now;

    if (url === '/api/push/key') return send(res, 200, { key: vapid.pub });
    if (url === '/api/push/on') {
      if (typeof b.endpoint !== 'string' || !pushOk(b.endpoint)) fail('Этот браузер не поддерживается');
      P.push = b.endpoint; touch(P);
      return send(res, 200, view(P));
    }
    if (url === '/api/push/off') { P.push = null; touch(P); return send(res, 200, view(P)); }
    if (url === '/api/state') return send(res, 200, view(P));
    if (url === '/api/top') return send(res, 200, { top: top() });
    if (url === '/api/act') { act(P, b); touch(P); return send(res, 200, view(P)); }
    send(res, 404, { error: 'Не найдено' });
  } catch (e) {
    if (e && e.user) return send(res, 400, { error: e.user });
    send(res, e && e.big ? 413 : 400, { error: 'Некорректный запрос' });
  }
});
server.requestTimeout = 10000;
server.headersTimeout = 5000;
server.listen(PORT, HOST, () => console.log(`Pixel Garden API on http://${HOST}:${PORT} (игроков: ${players.size})`));

// ---------- консоль модератора: только 127.0.0.1 внутри контейнера, снаружи недоступна ----------
http.createServer((req, res) => {
  const chunks = []; let n = 0;
  req.on('data', d => { n += d.length; if (n > 4096) req.destroy(); else chunks.push(d); });
  req.on('end', () => {
    let code = 200, out;
    try {
      const { args } = JSON.parse(Buffer.concat(chunks));
      if (!Array.isArray(args) || !args.every(a => typeof a === 'string')) fail('Некорректные аргументы');
      out = runMod(args, store);
    } catch (e) { code = 400; out = e && e.user ? e.user : 'Ошибка команды'; if (!(e && e.user)) console.error(e); }
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(out);
  });
}).listen(ADMIN_PORT, '127.0.0.1');
