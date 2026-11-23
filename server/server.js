'use strict';
// Pixel Garden — авторитетный сервер. Клиент шлёт только «намерения» (посадить/полить/собрать/купить…),
// а все числа (время, рост, цены, редкость, награды) считает и хранит сервер. Зависимостей нет.
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const openStore = require('./store');
const auth = require('./auth');
const runMod = require('./mod');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1'; // в Docker задаётся 0.0.0.0, порт наружу НЕ публикуется
const ADMIN_PORT = Number(process.env.ADMIN_PORT) || 3001; // консоль модератора, только loopback внутри контейнера
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const GAME_TZ = process.env.GAME_TZ || 'Europe/Berlin'; // по этому поясу считаются день и ночь в игре
const MAX_PLAYERS = 20000;
const PRUNE_MS = 90 * 864e5; // забываем игроков без пароля, не заходивших 90 дней (с паролем, ником и заблокированных не трогаем)
const NICK_COOLDOWN = 864e5;

const store = openStore(DATA_DIR);
const { players, touch } = store;
const fail = store.fail;

// ---------- баланс ----------
const RAR = [ // time — секунд роста при полной скорости; thirst — расход воды (1 = обычный); val — цена; dig — цена выкапывания лопатой
  { time: 90, thirst: 1, val: 12, dig: 3 }, { time: 180, thirst: 0.8, val: 40, dig: 12 }, { time: 420, thirst: 0.5, val: 150, dig: 45 },
  { time: 1500, thirst: 0.12, val: 700, dig: 200 }, { time: 4500, thirst: 0.04, val: 3500, dig: 900 },
];
const SEEDS = [ // w — шансы редкости; обычные семена бесплатны, остальные дорогие
  { id: 'basic', cost: 0, w: [80, 16, 3.5, 0.45, 0.05] }, { id: 'select', cost: 35, w: [35, 40, 20, 4.5, 0.5] },
  { id: 'rare', cost: 110, w: [5, 25, 50, 18, 2] }, { id: 'royal', cost: 320, w: [0, 5, 40, 45, 10] }, { id: 'myth', cost: 700, w: [0, 0, 15, 55, 30] },
];
const FERT = [{ id: 'compost', cost: 20, m: 1.5, sec: 300 }, { id: 'bio', cost: 120, m: 2, sec: 600 }, { id: 'nectar', cost: 600, m: 3, sec: 900 }];
const UPG = {
  slot: { max: 9, from: 2, cost: n => Math.round(40 * 2.5 ** (n - 2)) }, tank: { max: 10, from: 0, cost: n => Math.round(30 * 2.2 ** n) },
  luck: { max: 8, from: 0, cost: n => Math.round(60 * 2.5 ** n) }, nurs: { max: 6, from: 0, cost: n => Math.round(40 * 2.4 ** n) },
  lamp: { max: 5, from: 0, cost: n => Math.round(150 * 2.6 ** n) }, mulch: { max: 8, from: 0, cost: n => Math.round(50 * 2.3 ** n) },
  bk: { max: 5, from: 0, cost: n => Math.round(60 * 2.3 ** n) }, // семенной банк: +2 места за уровень
};
// Горшки: у каждой грядки свой, небольшие бонусы. 0 глиняный — без бонуса.
const SKINS = [0, 400, 1500, 4000, 10000];
const POT_FX = { 1: { drain: 0.85 }, 2: { growth: 1.1 }, 3: { grace: 1.5 }, 4: { value: 1.1 } }; // медный: воды −15%; стеклянный: рост +10%; каменный: терпит засуху на 50% дольше; золотой: урожай +10%
// Питомцы: куплены один раз, кормятся за монеты; пока сыты — раз в every секунд приносят подарок (копится до 3)
const PETS = { fish: { cost: 150, feed: 2, every: 600, gift: 4 }, cat: { cost: 500, feed: 5, every: 900, gift: 14 }, dog: { cost: 800, feed: 6, every: 900, gift: 18 }, seal: { cost: 3500, feed: 20, every: 1200, gift: 80 } };
const FEED_MS = 4 * 36e5, GIFT_CAP = 3;
const GRACE = 600, WARN = 180; // сек без воды до засыхания / за сколько сек до него слать уведомление
const VAPID_SUB = process.env.VAPID_SUB || 'mailto:admin@example.com';
const CATALOG = {
  rar: RAR, seeds: SEEDS, fert: FERT, skins: SKINS, potFx: POT_FX, pets: PETS, grace: GRACE, warn: WARN, tz: GAME_TZ, bankBase: 4, nurseryBase: 2,
  feedMs: FEED_MS, giftCap: GIFT_CAP, // нужны клиенту, чтобы считать питомцев без ожидания сервера
  upg: Object.fromEntries(Object.entries(UPG).map(([k, u]) => [k, { max: u.max, from: u.from, costs: Array.from({ length: u.max - u.from }, (_, i) => u.cost(u.from + i)) }])),
};
const lvl = (P, k) => (k === 'slot' ? P.plants.length : P[k]);
const capSec = P => 180 + 120 * P.tank;
const mulch = P => 1 - 0.07 * P.mulch;
const nurseryCap = P => 2 + P.nurs;
const bankCap = P => 4 + 2 * P.bk;
const potOf = (P, p) => P.slotPots[P.plants.indexOf(p)] || 0;
const potFx = (P, p) => POT_FX[potOf(P, p)] || {};
const graceOf = (P, p) => GRACE * (potFx(P, p).grace || 1);

// ---------- день и ночь ----------
let FMT;
try { FMT = new Intl.DateTimeFormat('en-GB', { timeZone: GAME_TZ, hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' }); FMT.format(0); }
catch { console.warn('Неизвестный GAME_TZ, использую UTC'); FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', hourCycle: 'h23', hour: 'numeric', minute: 'numeric', second: 'numeric' }); }
const secOfDay = ms => { const o = {}; for (const x of FMT.formatToParts(ms)) o[x.type] = +x.value; return o.hour * 3600 + o.minute * 60 + o.second + (ms % 1000) / 1000; };
const BOUNDS = [6, 8, 20, 22];
function phase(ms, P) { // ночью рост в 5 раз медленнее (лампа роста смягчает), но воды уходит ещё меньше
  const s = secOfDay(ms), h = s / 3600;
  let name, gm, wm;
  if (h >= 22 || h < 6) { name = 'night'; gm = Math.min(0.7, 0.2 + 0.1 * P.lamp); wm = 0.1; }
  else if (h < 8 || h >= 20) { name = 'dusk'; gm = Math.min(1, 0.6 + 0.05 * P.lamp); wm = 0.6; }
  else { name = 'day'; gm = 1; wm = 1; }
  const nb = BOUNDS.find(b => b * 3600 > s + 0.001);
  return { name, gm, wm, hour: h, until: ms + ((nb !== undefined ? nb * 3600 : 86400 + BOUNDS[0] * 3600) - s) * 1000 };
}

const { makeGenome, crossGenome, crossRarity } = require('./genome'); // геном и селекция

// ---------- игровая логика ----------
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
function rollRarity(P, pack) {
  const w = pack.w.map((x, i) => x * (1 + 0.08 * P.luck) ** i), sum = w.reduce((a, b) => a + b);
  let x = (crypto.randomInt(1e6) / 1e6) * sum;
  for (let i = 0; i < w.length; i++) if (w[i] > 0 && (x -= w[i]) < 0) return i;
  return w.findLastIndex(v => v > 0);
}
const value = (P, p) => Math.round(RAR[p.r].val * (1 + ((p.seed % 21) - 10) / 50) * (potFx(P, p).value || 1));

function sim(P, p, now) { // ленивая симуляция по отрезкам постоянной скорости: idle работает и офлайн
  if (p.dead) return;
  const R = RAR[p.r], cap = capSec(P), pf = potFx(P, p), grace = GRACE * (pf.grace || 1);
  let t = p.t, guard = 0;
  while (t < now && !p.dead && p.g < 1 && guard++ < 500) {
    const ph = phase(t, P);
    let e = Math.min(now, ph.until), fm = 1;
    if (p.fx) { if (t < p.fx.until) { fm = p.fx.m; e = Math.min(e, p.fx.until); } else p.fx = null; }
    const dt = (e - t) / 1000, drain = R.thirst * ph.wm * mulch(P) * (pf.drain || 1) / cap; // доля воды в секунду
    const tw = drain > 0 ? Math.min(dt, p.w / drain) : dt; // секунд с водой на этом отрезке
    const rate = ph.gm * fm * (pf.growth || 1) / R.time;
    p.g = Math.min(1, p.g + Math.min(tw, (1 - p.g) / rate) * rate);
    p.w = Math.max(0, p.w - drain * dt); if (p.w < 1e-9) p.w = 0;
    if (p.g >= 1) p.d = 0;
    else if (p.w === 0) {
      if (!p.d) p.d = t + tw * 1000; // момент, когда закончилась вода
      if (e - p.d >= grace * 1000) { p.dead = true; P.stats.wilt++; touch(P); } // слишком долго без воды
    }
    t = e;
  }
  p.t = now;
}

function petInfo(P, id, now) {
  const d = PETS[id], pt = P.pets[id]; if (!pt) return null;
  const end = Math.min(now, pt.fed), every = d.every * 1000; let n = 0, base = pt.last;
  if (end > pt.last) { base = Math.max(pt.last, end - GIFT_CAP * every); n = Math.min(GIFT_CAP, Math.floor((end - base) / every)); }
  return { fed: Math.max(0, Math.ceil((pt.fed - now) / 1000)), gifts: n, base };
}

function view(P) {
  const now = Date.now(), ph = phase(now, P);
  P.plants.forEach(p => p && sim(P, p, now));
  return {
    coins: P.coins, slots: P.plants.length, capSec: capSec(P), push: !!P.push, hasPass: !!P.pass, skins: P.skins, slotPots: P.slotPots,
    nick: P.nick, nickLock: !!P.nickLock, nickWait: P.nick ? Math.max(0, Math.ceil((P.nickAt + NICK_COOLDOWN - now) / 1000)) : 0,
    lv: { slot: P.plants.length, tank: P.tank, luck: P.luck, nurs: P.nurs, lamp: P.lamp, mulch: P.mulch, bk: P.bk },
    now, ph: { name: ph.name, gm: +ph.gm.toFixed(2), wm: ph.wm, hour: +ph.hour.toFixed(3), h: ph.hour }, nurseryCap: nurseryCap(P), bankCap: bankCap(P),
    nursery: P.nursery.map(p => ({ seed: p.seed, r: p.r, gn: p.gn | 0, g: +p.g.toFixed(4), w: +p.w.toFixed(4), xd: p.xd ? 1 : 0 })), bank: P.bank,
    pets: Object.fromEntries(Object.keys(P.pets).map(id => { const i = petInfo(P, id, now); return [id, { fed: i.fed, gifts: i.gifts, fe: P.pets[id].fed, la: P.pets[id].last }]; })),
    stats: { ...P.stats, earned: P.earned, harvests: P.harvests },
    plants: P.plants.map(p => p && {
      seed: p.seed, r: p.r, gn: p.gn | 0, xd: !!p.xd, g: +p.g.toFixed(4), w: +p.w.toFixed(4), v: value(P, p), x: !!p.dead, gr: graceOf(P, p),
      l: !p.dead && p.d ? Math.max(0, Math.ceil(graceOf(P, p) - (now - p.d) / 1000)) : null, // секунд до засыхания
      f: p.fx && p.fx.until > now ? { m: p.fx.m, l: Math.ceil((p.fx.until - now) / 1000), u: p.fx.until } : null,
      d: p.dead ? 0 : p.d || 0, // момент, когда кончилась вода (мс): клиент по нему досчитывает засыхание сам
    }),
  };
}

function act(P, b) {
  const now = Date.now();
  P.plants.forEach(p => p && sim(P, p, now));
  const slot = (v = b.slot) => { if (!Number.isInteger(v) || v < 0 || v >= P.plants.length) fail('Нет такой грядки'); return v; };
  const nidx = () => { if (!Number.isInteger(b.idx) || b.idx < 0 || b.idx >= P.nursery.length) fail('Нет такого растения'); return b.idx; };
  const pay = c => { if (P.coins < c) fail('Не хватает монет'); P.coins -= c; P.stats.spent += c; };
  const pet = () => { if (typeof b.id !== 'string' || !Object.hasOwn(PETS, b.id)) fail('Нет такого питомца'); return b.id; };
  switch (b.a) {
    case 'plant': {
      const i = slot();
      if (P.plants[i]) fail('Грядка занята');
      if (b.bank !== undefined) { // семя из банка (гибрид)
        if (!Number.isInteger(b.bank) || b.bank < 0 || b.bank >= P.bank.length) fail('Нет такого семени');
        const s = P.bank.splice(b.bank, 1)[0];
        P.plants[i] = { seed: s.seed, r: s.r, gn: s.gn | 0, g: 0, w: 1, t: now, d: 0, nw: 0, fx: null, xd: 0 }; break;
      }
      const pack = SEEDS.find(s => s.id === b.seed);
      if (!pack) fail('Неизвестные семена');
      pay(pack.cost);
      const r = rollRarity(P, pack);
      P.plants[i] = { seed: makeGenome(r), r, gn: 0, g: 0, w: 1, t: now, d: 0, nw: 0, fx: null, xd: 0 };
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
      const v = value(P, p); P.coins += v; P.earned += v; P.harvests++; P.stats.hr[p.r]++;
      store.galleryAdd(P.id, p.seed, p.r); P.plants[i] = null; break;
    }
    case 'cross': { // селекция: два созревших растения дают гибридное семя в банк (растения остаются, но второй раз опыляться не могут)
      const ia = slot(b.pa), ib = slot(b.pb), A = P.plants[ia], B = P.plants[ib]; // родители: pa, pb (поле a занято под имя действия)
      if (ia === ib) fail('Нужны два разных растения');
      for (const p of [A, B]) { if (!p || p.dead) fail('Нужны живые растения'); if (p.g < 1) fail('Растения должны созреть'); if (p.xd) fail('Это растение уже опыляли'); }
      if (P.bank.length >= bankCap(P)) fail('Банк семян заполнен');
      pay(20 * 2 ** Math.max(A.r, B.r));
      A.xd = B.xd = 1; P.stats.cross++;
      P.bank.push({ seed: crossGenome(A.seed, A.r, B.seed, B.r), r: crossRarity(A.r, B.r), gn: Math.max(A.gn | 0, B.gn | 0) + 1 }); break;
    }
    case 'bankdrop': { if (!Number.isInteger(b.idx) || b.idx < 0 || b.idx >= P.bank.length) fail('Нет такого семени'); P.bank.splice(b.idx, 1); break; }
    case 'fert': {
      const p = P.plants[slot()], f = FERT.find(x => x.id === b.id);
      if (!f) fail('Неизвестное удобрение');
      if (!p || p.dead) fail('Нечего удобрять');
      if (p.g >= 1) fail('Растение уже выросло');
      if (p.fx && p.fx.until > now) fail('Уже удобрено');
      pay(f.cost); P.stats.fert++; p.fx = { m: f.m, until: now + f.sec * 1000 }; break;
    }
    case 'dig': { // лопата: растение уходит в питомник с сохранением роста, цена зависит от редкости
      const i = slot(), p = P.plants[i];
      if (!p || p.dead) fail('Нечего выкапывать');
      if (p.g >= 1) fail('Созревшее растение просто соберите');
      if (P.nursery.length >= nurseryCap(P)) fail('Питомник заполнен');
      pay(RAR[p.r].dig); P.stats.dug++;
      P.nursery.push({ seed: p.seed, r: p.r, gn: p.gn | 0, g: p.g, w: p.w, t: now, d: 0, nw: 0, fx: null, xd: p.xd ? 1 : 0 }); P.plants[i] = null; break;
    }
    case 'replant': {
      const idx = nidx();
      const i = Number.isInteger(b.slot) && b.slot >= 0 && b.slot < P.plants.length && !P.plants[b.slot] ? b.slot : P.plants.findIndex(p => !p);
      if (i < 0) fail('Нет свободной грядки');
      const [p] = P.nursery.splice(idx, 1); p.t = now; P.plants[i] = p; break;
    }
    case 'drop': P.nursery.splice(nidx(), 1); break;
    case 'upgrade': {
      const k = b.kind, u = UPG[k];
      if (!u || !Object.hasOwn(UPG, k)) fail('Неизвестное улучшение');
      const n = lvl(P, k);
      if (n >= u.max) fail('Максимальный уровень');
      pay(u.cost(n));
      if (k === 'slot') { P.plants.push(null); P.slotPots.push(0); } else P[k]++;
      break;
    }
    case 'skin': { // покупка горшка (надевается отдельно, для каждой грядки)
      const id = b.id;
      if (!Number.isInteger(id) || id < 1 || id >= SKINS.length) fail('Нет такого горшка');
      if ((P.skins >> id) & 1) fail('Уже куплен');
      pay(SKINS[id]); P.skins |= 1 << id; break;
    }
    case 'setpot': {
      const i = slot(), id = b.id;
      if (!Number.isInteger(id) || id < 0 || id >= SKINS.length || !((P.skins >> id) & 1)) fail('Этот горшок не куплен');
      P.slotPots[i] = id; break;
    }
    case 'buypet': { const id = pet(); if (P.pets[id]) fail('Уже есть'); pay(PETS[id].cost); P.pets[id] = { fed: 0, last: now }; break; }
    case 'feed': {
      const id = pet(), pt = P.pets[id]; if (!pt) fail('Сначала заведите питомца');
      const i = petInfo(P, id, now);
      if (i.fed > 6 * 3600) fail('Он сыт');
      pay(PETS[id].feed);
      if (pt.fed < now) pt.last = now; else pt.last = i.base; // голодному отсчёт подарков начинается с кормления
      pt.fed = Math.max(pt.fed, now) + FEED_MS; break;
    }
    case 'gift': {
      const id = pet(), pt = P.pets[id]; if (!pt) fail('Сначала заведите питомца');
      const i = petInfo(P, id, now);
      if (i.gifts < 1) fail('Подарка пока нет');
      const c = i.gifts * PETS[id].gift; P.coins += c; P.earned += c; P.stats.pg += i.gifts;
      pt.last = i.base + i.gifts * PETS[id].every * 1000; break;
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

// ---------- профили и лидеры ----------
function profile(P, self) {
  const garden = P.plants.map(p => p && { seed: p.seed, r: p.r, gn: p.gn | 0, g: +p.g.toFixed(3), x: !!p.dead });
  return {
    nick: P.nick, since: P.created, online: Date.now() - P.seen < 3e5, slotPots: P.slotPots, pets: Object.keys(P.pets), self: !!self,
    stats: { ...P.stats, earned: P.earned, harvests: P.harvests, slots: P.plants.length }, garden, gallery: store.gallery(P.id),
  };
}
const TOPS = { earned: P => P.earned, harvests: P => P.harvests, rare: P => P.stats.hr[3] + P.stats.hr[4] * 3 };
const topCache = {};
function top(k) {
  const f = TOPS[k] || TOPS.earned, key = TOPS[k] ? k : 'earned', c = topCache[key];
  if (c && Date.now() - c.t < 10000) return c;
  const L = [...players.values()];
  const list = L.filter(P => P.nick && !P.banned && f(P) > 0).sort((a, b) => f(b) - f(a)).slice(0, 10).map(P => ({ nick: P.nick, v: f(P) }));
  const g = { players: L.length, harvests: L.reduce((s, P) => s + P.harvests, 0), legend: L.reduce((s, P) => s + P.stats.hr[4], 0) };
  return (topCache[key] = { t: Date.now(), list, g });
}

// ---------- push-уведомления (Web Push + VAPID, без payload) ----------
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
// Защита от SSRF: адрес подписки присылает клиент, поэтому шлём только на известные push-сервисы браузеров.
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
    if (r.status === 404 || r.status === 410) { P.push = null; touch(P); }
  } catch { /* попробуем при следующей проверке */ }
}
setInterval(() => {
  const now = Date.now();
  for (const P of players.values()) {
    if (!P.push || P.banned) continue;
    let need = false;
    for (const p of P.plants) {
      if (!p) continue;
      sim(P, p, now);
      if (!p.dead && p.d && !p.nw && now >= p.d + (graceOf(P, p) - WARN) * 1000) { p.nw = 1; need = true; touch(P); }
    }
    if (need) sendPush(P);
  }
}, 30000);

// ---------- обслуживание ----------
setInterval(store.flush, 5000);
setInterval(() => { try { store.backup(); } catch (e) { console.error('backup:', e.message); } }, 864e5);
setInterval(() => {
  const old = Date.now() - PRUNE_MS;
  for (const P of [...players.values()]) if (P.seen < old && !P.banned && !P.pass && !P.nick) store.remove(P.id);
}, 36e5);
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => { store.flush(); process.exit(0); });

// ---------- защита от флуда и перебора паролей ----------
const bucket = new Map(), authLog = new Map(), fails = new Map();
function allow(ip) { // 5 запросов/с, всплеск до 20
  const now = Date.now();
  let b = bucket.get(ip);
  if (!b) bucket.set(ip, (b = { t: 20, ts: now }));
  b.t = Math.min(20, b.t + Math.max(0, now - b.ts) / 200); b.ts = now; // max(0,…) — на случай перевода системных часов назад
  if (b.t < 1) return false;
  b.t--; return true;
}
function authAllow(ip) { // 20 попыток входа/регистрации за 10 минут с адреса
  const now = Date.now(), a = (authLog.get(ip) || []).filter(t => now - t < 6e5);
  if (a.length >= 20) return false;
  a.push(now); authLog.set(ip, a); return true;
}
const failCount = k => { const f = fails.get(k); return f && Date.now() - f.ts < 9e5 ? f.n : 0; }; // 6 неудач за 15 минут на пару «адрес+ник»
const failAdd = k => fails.set(k, { n: failCount(k) + 1, ts: Date.now() });
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of bucket) if (now - b.ts > 6e4) bucket.delete(k);
  for (const [k, a] of authLog) if (!a.some(t => now - t < 6e5)) authLog.delete(k);
  for (const [k, f] of fails) if (now - f.ts > 9e5) fails.delete(k);
}, 6e4);

// Caddy перезаписывает X-Forwarded-For адресом клиента; берём последнее значение. IP нигде не сохраняются.
const ipOf = req => { const x = req.headers['x-forwarded-for']; return x ? x.split(',').pop().trim() : req.socket.remoteAddress; };
function readBody(req) {
  return new Promise((ok, no) => {
    const chunks = []; let n = 0;
    req.on('data', d => { n += d.length; if (n > 2048) { no({ big: true }); req.destroy(); } else chunks.push(d); });
    req.on('end', () => {
      try { const j = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}; ok(j && typeof j === 'object' && !Array.isArray(j) ? j : {}); }
      catch (e) { no(e); }
    });
    req.on('error', no);
  });
}
const send = (res, code, o) => {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(o));
};
const newSession = P => { const token = crypto.randomBytes(32).toString('hex'); store.sessionAdd(sha(token), P.id); return token; };
const normNick = s => String(s || '').normalize('NFKC').trim().toLowerCase();

const server = http.createServer(async (req, res) => {
  try {
    const ip = ipOf(req);
    if (!allow(ip)) return send(res, 429, { error: 'Слишком часто' });
    if (req.method !== 'POST') return send(res, 405, { error: 'Только POST' });
    const url = req.url.split('?')[0];
    const b = await readBody(req);

    if (url === '/api/catalog') return send(res, 200, CATALOG);

    if (url === '/api/signup') {
      if (!authAllow(ip)) return send(res, 429, { error: 'Слишком много попыток, подождите несколько минут' });
      if (players.size >= MAX_PLAYERS) return send(res, 503, { error: 'Сервер переполнен' });
      const nick = store.checkNick(b.nick);
      auth.check(b.pass, nick);
      if (store.nickIndex.has(nick.toLowerCase())) fail('Ник уже занят');
      const ph = await auth.hash(b.pass);
      if (store.nickIndex.has(nick.toLowerCase())) fail('Ник уже занят');
      return send(res, 200, { token: newSession(store.create(nick, ph)) });
    }
    if (url === '/api/login') {
      if (!authAllow(ip)) return send(res, 429, { error: 'Слишком много попыток, подождите несколько минут' });
      const key = normNick(b.nick), fk = ip + '|' + key;
      if (failCount(fk) >= 6) return send(res, 429, { error: 'Слишком много неверных паролей, подождите 15 минут' });
      const P = players.get(store.nickIndex.get(key));
      const ok = await auth.verify(String(b.pass ?? '').slice(0, 128), P && P.pass);
      if (!P || !ok) { failAdd(fk); fail('Неверный ник или пароль'); }
      fails.delete(fk);
      return send(res, 200, { token: newSession(P) });
    }

    const m = /^Bearer ([0-9a-f]{64})$/.exec(req.headers.authorization || '');
    const hash = m && sha(m[1]);
    const P = hash && players.get(store.sessions.get(hash));
    if (!P) return send(res, 401, { error: 'Нужна авторизация' });
    if (P.banned) return send(res, 403, { error: 'Аккаунт заблокирован' + (P.banReason ? ': ' + P.banReason : '') });
    const now = Date.now();
    if (now - P.seen > 3e5) touch(P); // время захода пишем в БД не чаще раза в 5 минут
    P.seen = now;

    switch (url) {
      case '/api/state': return send(res, 200, view(P));
      case '/api/act': act(P, b); touch(P); return send(res, 200, view(P));
      case '/api/acts': { // пачка действий от клиента, который уже применил их у себя; ошибки по одному действию не рвут остальные
        if (!Array.isArray(b.list) || b.list.length > 20) fail('Некорректный запрос');
        const bid = typeof b.bid === 'string' && b.bid.length <= 32 ? b.bid : null;
        if (bid && P.bid === bid) return send(res, 200, { ...view(P), res: P.bres }); // повтор после обрыва связи: не выполняем второй раз
        const out = b.list.map(x => {
          try { if (!x || typeof x !== 'object' || Array.isArray(x)) fail('Некорректное действие'); act(P, x); return 0; }
          catch (e) { if (e && e.user) return e.user; throw e; }
        });
        touch(P); if (bid) { P.bid = bid; P.bres = out; }
        return send(res, 200, { ...view(P), res: out });
      }
      case '/api/logout': store.sessionDel(hash); return send(res, 200, {});
      case '/api/claim': { // игроки старых версий (без пароля) превращают аккаунт в защищённый
        if (P.pass) fail('Пароль уже задан');
        if (!authAllow(ip)) return send(res, 429, { error: 'Слишком много попыток' });
        const nick = P.nick || store.checkNick(b.nick);
        auth.check(b.pass, nick);
        const ph = await auth.hash(b.pass);
        if (!P.nick) store.setNick(P, nick);
        P.pass = ph; touch(P); return send(res, 200, view(P));
      }
      case '/api/passwd': {
        if (!P.pass) fail('Сначала задайте пароль');
        if (!authAllow(ip)) return send(res, 429, { error: 'Слишком много попыток' });
        if (!(await auth.verify(String(b.old ?? '').slice(0, 128), P.pass))) fail('Старый пароль неверен');
        auth.check(b.pass, P.nick);
        P.pass = await auth.hash(b.pass); touch(P); store.sessionsDelPid(P.id, hash); // остальные устройства выходят
        return send(res, 200, view(P));
      }
      case '/api/profile': {
        const T = b.nick === undefined ? P : players.get(store.nickIndex.get(normNick(b.nick)));
        if (!T || T.banned) fail('Игрок не найден');
        return send(res, 200, profile(T, T === P));
      }
      case '/api/top': { const t = top(b.k); return send(res, 200, { top: t.list, g: t.g }); }
      case '/api/push/key': return send(res, 200, { key: vapid.pub });
      case '/api/push/on':
        if (typeof b.endpoint !== 'string' || !pushOk(b.endpoint)) fail('Этот браузер не поддерживается');
        P.push = b.endpoint; touch(P); return send(res, 200, view(P));
      case '/api/push/off': P.push = null; touch(P); return send(res, 200, view(P));
      default: return send(res, 404, { error: 'Не найдено' });
    }
  } catch (e) {
    if (e && e.user) return send(res, 400, { error: e.user });
    if (!(e && e.big) && !(e instanceof SyntaxError)) console.error(e);
    send(res, e && e.big ? 413 : 400, { error: 'Некорректный запрос' });
  }
});
server.requestTimeout = 10000;
server.headersTimeout = 5000;
server.listen(PORT, HOST, () => console.log(`Pixel Garden API on http://${HOST}:${PORT} (игроков: ${players.size}, пояс: ${GAME_TZ})`));

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
