'use strict';
// Клиент: только отрисовка и отправка намерений. Растения генерируются из seed, который выдал сервер.
const RN = ['Обычное', 'Необычное', 'Редкое', 'Эпическое', 'Легендарное'];
const RC = ['#a9b4ac', '#7fe06a', '#58b4ff', '#c66bff', '#ffc233'];

// ---------- процедурная генерация ----------
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hsl = (h, s, l) => `hsl(${Math.round(h)} ${s}% ${l}%)`;
const cache = new Map();

function gen(seed, rar) {
  const key = seed + '|' + rar;
  if (cache.has(key)) return cache.get(key);
  const R = rng(seed), px = [], W = 48, B = 53;
  const put = (x, y, c, t, l = 0) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y <= B) px.push({ x, y, c, t, l }); };
  const line = (x0, y0, x1, y1, c, t0, t1, l = 0) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) { const k = i / n; put(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, c, t0 + (t1 - t0) * k, l); }
  };
  const blob = (cx, cy, rad, c, t, l = 1) => {
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++)
      if (x * x + y * y <= rad * rad + rad * 0.5) put(cx + x, cy + y, c, t + R() * 0.05, l);
  };
  const sh = 70 + R() * 80;
  const stem = hsl(sh, 45, 28), leaf = hsl(sh + R() * 30 - 15, 55, 38), leaf2 = hsl(sh + R() * 30 - 15, 60, 50);
  const kind = (R() * 3) | 0;

  if (kind === 0) { // дерево: рекурсивные ветви
    const D = 3 + ((R() * 2) | 0), sp = 0.35 + R() * 0.45, wood = hsl(25, 35, 28 + R() * 8);
    const br = (x, y, a, len, d) => {
      const t0 = d * 0.8 / (D + 1), t1 = (d + 1) * 0.8 / (D + 1);
      const x1 = x + Math.sin(a) * len, y1 = y - Math.cos(a) * len;
      line(x, y, x1, y1, wood, t0, t1);
      if (d >= D - 1) blob(x1, y1, d === D ? 3 : 2, R() < 0.5 ? leaf : leaf2, 0.8 + R() * 0.15);
      if (d < D) { const n = 2 + (R() < 0.3 ? 1 : 0); for (let i = 0; i < n; i++) br(x1, y1, a + (i - (n - 1) / 2) * sp * 2 + (R() - 0.5) * 0.3, len * 0.76, d + 1); }
    };
    br(24, B, (R() - 0.5) * 0.2, 9 + R() * 3, 0);
  } else if (kind === 1) { // цветок
    const h = 22 + R() * 18, amp = (R() - 0.5) * 10, fr = 1 + R() * 1.5, N = Math.ceil(h);
    const sx = k => 24 + amp * Math.sin(k * fr * Math.PI / 2);
    let px0 = 24, py0 = B;
    for (let i = 1; i <= N; i++) { const k = i / N, x = sx(k), y = B - i; line(px0, py0, x, y, stem, (k - 1 / N) * 0.6, k * 0.6); px0 = x; py0 = y; }
    const nl = 2 + ((R() * 2) | 0);
    for (let j = 0; j < nl; j++) {
      const k = 0.2 + 0.6 * (j + 1) / (nl + 1), y = B - h * k, x = sx(k), s = j % 2 ? 1 : -1, ln = 5 + R() * 4;
      line(x, y, x + s * ln, y - ln * 0.5, leaf, k * 0.6, k * 0.6 + 0.1, 1);
      blob(x + s * ln, y - ln * 0.5, 1, leaf2, k * 0.6 + 0.1);
    }
    const n = 5 + ((R() * 5) | 0), pl = 4 + R() * 4, rot = R() * 6.28, pc = hsl(R() * 360, 75, 60);
    for (let i = 0; i < n; i++) { const a = rot + i * 6.283 / n; blob(px0 + Math.cos(a) * pl * 0.8, py0 + Math.sin(a) * pl * 0.8, pl > 6 ? 2 : 1, pc, 0.6 + R() * 0.3, 2); }
    blob(px0, py0, 2, hsl(40 + R() * 20, 90, 55), 0.95, 3);
  } else { // кактус
    const w = 3 + ((R() * 2) | 0), h = 16 + R() * 16, col = hsl(110 + R() * 40, 45, 32), dk = hsl(110 + R() * 40, 45, 24), mid = w >> 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(24 - mid + x, B - y, x === mid ? dk : col, y / h * 0.6);
    const na = 1 + ((R() * 2) | 0);
    for (let a = 0; a < na; a++) {
      const s = a ? 1 : -1, y0 = B - ((h * (0.3 + R() * 0.3)) | 0), out = 4 + ((R() * 4) | 0), up = 5 + ((R() * 8) | 0), x0 = 24 + s * (mid + 1);
      for (let i = 0; i <= out; i++) for (let d = 0; d < 2; d++) put(x0 + s * i, y0 - d, col, 0.6 + i / out * 0.1);
      for (let i = 0; i <= up; i++) for (let d = 0; d < 2; d++) put(x0 + s * out + s * d * -1, y0 - i, col, 0.7 + i / up * 0.15);
    }
    for (let i = 0; i < 10; i++) put(24 - mid + ((R() * w) | 0), B - ((R() * h) | 0), '#e8f0c8', 0.6 + R() * 0.3, 2);
    blob(24, B - h - 1, 2, hsl(R() * 360, 80, 60), 0.9, 2);
  }
  px.sort((a, b) => a.l - b.l);
  const sp = [];
  if (rar >= 2) for (let i = 0; i < (rar - 1) * 3; i++) { const q = px[(R() * px.length) | 0]; sp.push({ x: q.x + ((R() * 9 - 4) | 0), y: q.y + ((R() * 9 - 4) | 0), o: (R() * 3) | 0 }); }
  const res = { px, sp };
  cache.set(key, res);
  return res;
}

// ---------- сцена: небо зависит от реального времени суток ----------
const DEAD = ['#6b5a3a', '#5a4a30', '#7a6842'];
function palette() {
  const h = new Date().getHours();
  if (h >= 22 || h < 5) return { n: 1, b: ['#0d0d2b', '#14143a', '#1c1b4a', '#26255c', '#302e6e', '#3a3880'] };
  if (h < 8 || h >= 18) return { b: ['#3a2a6a', '#6a3f86', '#a84f86', '#e0707a', '#ff9a6b', '#ffc27a'] };
  return { b: ['#3c9be0', '#58b0ea', '#74c3f0', '#92d3f5', '#b0e1f8', '#cdeefb'] };
}
function scene(c, tm) {
  const pal = palette(), f = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  pal.b.forEach((col, i) => f(0, i * 9, 48, 9, col));
  if (pal.n) {
    for (let i = 0; i < 14; i++) if ((((tm / 700) | 0) + i) % 5) f((i * 37 + 11) % 48, (i * 23 + 5) % 38, 1, 1, '#fff');
    f(37, 6, 4, 4, '#f4f0c8'); f(39, 6, 3, 3, '#1c1b4a');
  }
  const cc = pal.n ? '#2c2c66' : '#ffffff';
  [[0, 10, 9], [1, 24, 7], [2, 36, 8]].forEach(([o, y, w]) => {
    const x = (((tm / 1400 + o * 21) % 64) | 0) - 12;
    f(x, y, w, 2, cc); f(x + 2, y - 1, w - 4, 1, cc);
  });
}
function draw(cv, p, tm) {
  const c = cv.getContext('2d'), f = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  scene(c, tm);
  f(12, 53, 24, 1, '#3b2a1c');
  if (p) {
    const { px, sp } = gen(p.seed, p.r), L = left(p);
    const tint = p.x || L == null ? 0 : Math.min(0.55, 0.55 * (1 - L / S.grace)); // чем ближе засыхание, тем бурее
    for (const q of px) if (q.t <= p.g) {
      f(q.x, q.y, 1, 1, p.x ? DEAD[(q.x * 7 + q.y * 3) % 3] : q.c);
      if (tint) f(q.x, q.y, 1, 1, `rgba(170,120,40,${tint})`);
    }
    if (!p.x && p.g >= 1) for (const s of sp) if ((((tm / 350) | 0) + s.o) % 3 === 0) {
      f(s.x, s.y, 1, 1, RC[p.r]);
      if (p.r >= 3) { f(s.x - 1, s.y, 1, 1, RC[p.r]); f(s.x + 1, s.y, 1, 1, RC[p.r]); f(s.x, s.y - 1, 1, 1, RC[p.r]); f(s.x, s.y + 1, 1, 1, RC[p.r]); }
    }
  }
  f(11, 54, 26, 3, '#c97a4a'); f(11, 54, 26, 1, '#e09a66'); f(13, 57, 22, 4, '#a85f38');
  f(0, 61, 48, 3, '#5b3d2a'); f(0, 61, 48, 1, '#7a5238');
}

// ---------- логотип: свой пиксельный шрифт 5×7 ----------
const $ = id => document.getElementById(id);
const FONT = { P: [30, 17, 17, 30, 16, 16, 16], I: [14, 4, 4, 4, 4, 4, 14], X: [17, 17, 10, 4, 10, 17, 17], E: [31, 16, 16, 30, 16, 16, 31], L: [16, 16, 16, 16, 16, 16, 31], G: [14, 17, 16, 19, 17, 17, 14], A: [14, 17, 17, 31, 17, 17, 17], R: [30, 17, 17, 30, 20, 18, 17], D: [30, 17, 17, 17, 17, 17, 30], N: [17, 25, 21, 19, 17, 17, 17], ' ': [0, 0, 0, 0, 0, 0, 0] };
function logo() {
  const t = 'PIXEL GARDEN', cols = ['#7ef0b5', '#5cc8ff', '#ffd45e', '#ff9ac8'], cv = $('logo');
  cv.width = t.length * 6 + 1; cv.height = 8;
  const c = cv.getContext('2d');
  for (let pass = 1; pass >= 0; pass--) [...t].forEach((ch, i) => FONT[ch].forEach((row, y) => {
    for (let x = 0; x < 5; x++) if ((row >> (4 - x)) & 1) { c.fillStyle = pass ? '#0e0d1f' : cols[i % 4]; c.fillRect(i * 6 + x + pass, y + pass, 1, 1); }
  }));
}

// ---------- сеть ----------
let token = null;
try { token = localStorage.getItem('pg_token'); } catch { /* приватный режим */ }
async function api(path, body) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch('/api/' + path, { method: 'POST', headers: h, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Ошибка сети'); e.status = r.status; throw e; }
  j.at = Date.now(); // момент получения — от него идёт обратный отсчёт до засыхания
  return j;
}
function dropToken() { token = null; try { localStorage.removeItem('pg_token'); } catch { /* */ } }
async function ensure() {
  if (token) return;
  token = (await api('register')).token;
  try { localStorage.setItem('pg_token', token); } catch { /* */ }
}

// ---------- интерфейс (только textContent, никакого innerHTML) ----------
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };
let S = null, cards = [], shop = null, board = null, top = null, banned = false, toastT, pushBusy = false;
const left = p => (p && p.l != null ? Math.max(0, p.l - (Date.now() - S.at) / 1000) : null);
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const bar = cls => { const b = el('div', 'bar ' + cls), i = el('div'); b.append(i); return { b, i }; };
function toast(m, ok) {
  const t = $('toast'); t.textContent = m; t.className = ok ? 'ok' : ''; t.style.display = 'block';
  clearTimeout(toastT); toastT = setTimeout(() => { t.style.display = 'none'; }, 2500);
}

function status(i) {
  const p = S.plants[i], c = cards[i], L = left(p);
  let t = 'Пусто', cls = '';
  if (p) {
    if (p.x) { t = 'Засохло'; cls = 'bad'; }
    else if (p.g >= 1) { t = 'Готово!'; cls = 'ok'; }
    else if (L != null) { t = L <= S.warn ? `Скоро засохнет · ${mmss(L)}` : `Хочет пить · ${mmss(L)}`; cls = L <= S.warn ? 'bad' : 'mid'; }
    else t = `Растёт · ${Math.floor(p.g * 100)}%`;
  }
  c.st.textContent = t; c.st.className = 'st ' + cls;
  c.d.classList.toggle('warn', !!p && !p.x && L != null && L <= S.warn);
  c.d.classList.toggle('dead', !!p && p.x);
}

function mkCard(i) {
  const d = el('div', 'card px'), fr = el('div', 'frame'), cv = el('canvas', 'plot'), nm = el('div', 'nm'), st = el('div', 'st'), w = bar('water'), g = bar('grow'), btn = el('button');
  cv.width = 48; cv.height = 64; fr.append(cv);
  btn.onclick = async () => {
    const p = S.plants[i], v = p && !p.x && p.g >= 1 ? p.v : 0;
    if (await act(!p ? 'plant' : p.x ? 'clear' : p.g >= 1 ? 'harvest' : 'water', { slot: i }) && v) toast(`+${v} монет`, true);
  };
  d.append(fr, nm, st, w.b, g.b, btn);
  return { d, cv, nm, st, w, g, btn };
}

const UP = { slot: ['Грядки', 'больше места'], tank: ['Бак', 'воды хватает дольше'], luck: ['Удача', 'чаще редкие'] };
function mkShop() {
  const root = $('shop'), s = { ups: {} }, title = el('div', 'ttl');
  title.textContent = 'Лавка';
  s.all = el('button', 'sec'); s.all.textContent = 'Полить всё'; s.all.onclick = () => act('waterall');
  root.append(title, s.all);
  for (const k of ['slot', 'tank', 'luck']) {
    const row = el('div', 'up'), n = el('div', 'upn'), pips = el('div', 'pips'), b = el('button');
    n.textContent = `${UP[k][0]} — ${UP[k][1]}`;
    const dots = Array.from({ length: S.max[k] }, () => el('i'));
    pips.append(...dots); b.onclick = () => act('upgrade', { kind: k });
    row.append(n, pips, b); root.append(row); s.ups[k] = { b, dots };
  }
  s.nb = el('button', 'sec'); s.nb.onclick = togglePush; s.hint = el('p', 'hint');
  root.append(s.nb, s.hint);
  return s;
}

const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
function render() {
  $('coinN').textContent = S.coins;
  if (cards.length !== S.slots) {
    $('garden').replaceChildren();
    cards = Array.from({ length: S.slots }, (_, i) => mkCard(i));
    $('garden').append(...cards.map(c => c.d));
  }
  S.plants.forEach((p, i) => {
    const c = cards[i];
    c.nm.textContent = p ? RN[p.r] : 'Свободная грядка';
    c.nm.style.color = p ? RC[p.r] : '';
    c.d.style.setProperty('--rc', p ? RC[p.r] : '#4b4a8c');
    c.d.classList.toggle('glow', !!p && p.r >= 3 && !p.x);
    c.w.i.style.width = (p && !p.x ? p.w * 100 : 0) + '%';
    c.g.i.style.width = (p ? p.g * 100 : 0) + '%';
    c.btn.textContent = !p ? `Посадить · ${S.cost.seed}` : p.x ? 'Убрать' : p.g >= 1 ? `Собрать +${p.v}` : 'Полить';
    c.btn.disabled = !p && S.coins < S.cost.seed;
    status(i);
  });
  shop = shop || mkShop();
  for (const k of ['slot', 'tank', 'luck']) {
    const u = shop.ups[k], cost = S.cost[k];
    u.dots.forEach((d, i) => { d.className = i < S.lv[k] ? 'on' : ''; });
    u.b.textContent = cost == null ? 'Максимум' : `Улучшить · ${cost}`;
    u.b.disabled = cost == null || S.coins < cost;
  }
  renderBoard();
  shop.nb.textContent = !canPush() ? 'Уведомления: нужен https' : S.push ? 'Уведомления: вкл' : 'Уведомлять о засыхании';
  shop.nb.disabled = !canPush();
  shop.hint.textContent = `Без воды растение засыхает через ${S.grace / 60} мин. Уведомление придёт за ${S.warn / 60} мин до этого.`;
}

// ---------- ник и лидеры ----------
function mkBoard() {
  const root = $('board'), b = {}, title = el('div', 'ttl');
  title.textContent = 'Лидеры';
  b.list = el('ol', 'rank'); b.in = el('input'); b.btn = el('button', 'sec'); b.hint = el('p', 'hint');
  b.in.maxLength = 16; b.in.autocomplete = 'off'; b.in.placeholder = 'Ваш ник'; b.in.setAttribute('aria-label', 'Ник');
  b.in.onkeydown = e => { if (e.key === 'Enter') saveNick(); };
  b.btn.onclick = saveNick;
  root.append(title, b.list, b.in, b.btn, b.hint);
  return b;
}
async function saveNick() {
  if (await act('nick', { nick: board.in.value.trim() })) { toast('Ник сохранён', true); loadTop(); }
}
function renderBoard() {
  board = board || mkBoard();
  $('who').textContent = S.nick || '';
  const locked = S.nickLock || S.nickWait > 0;
  if (document.activeElement !== board.in) board.in.value = S.nick || '';
  board.in.disabled = locked;
  board.btn.disabled = locked;
  board.btn.textContent = S.nick ? 'Сменить ник' : 'Взять ник';
  board.hint.textContent = S.nickLock ? 'Смена ника запрещена модератором.'
    : S.nickWait > 0 ? `Менять ник можно раз в сутки: ещё ${Math.ceil(S.nickWait / 3600)} ч.`
    : 'Ник: 3–16 символов, латиница или кириллица, цифры, _ и -. Виден всем.';
  board.list.replaceChildren();
  if (!top || !top.length) { const li = el('li'); li.textContent = 'Пока пусто — задайте ник и соберите урожай.'; board.list.append(li); return; }
  top.forEach((t, i) => {
    const li = el('li', t.nick === S.nick ? 'me' : ''), n = el('span'), v = el('b');
    n.textContent = `${i + 1}. ${t.nick}`; v.textContent = t.earned;
    li.append(n, v); board.list.append(li);
  });
}
async function loadTop() {
  if (banned || !token) return;
  try { top = (await api('top')).top; if (S) renderBoard(); } catch { /* не критично */ }
}
function ban(msg) {
  banned = true; S = null;
  const d = el('div', 'card px'); d.textContent = msg;
  $('garden').replaceChildren(d);
}

// ---------- уведомления ----------
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
async function togglePush() {
  if (pushBusy) return;
  pushBusy = true;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (S.push) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      S = await api('push/off'); toast('Уведомления выключены', true);
    } else {
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Разрешите уведомления для сайта в настройках браузера');
      const { key } = await api('push/key');
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) });
      S = await api('push/on', { endpoint: sub.endpoint }); toast('Уведомления включены', true);
    }
    render();
  } catch (e) { toast(e.message); } finally { pushBusy = false; }
}

async function refresh() {
  if (banned) return;
  try { await ensure(); S = await api('state'); render(); }
  catch (e) { if (e.status === 403) ban(e.message); else if (e.status === 401) dropToken(); else toast(e.message); }
}
async function act(a, extra) {
  try { S = await api('act', { a, ...extra }); render(); return true; }
  catch (e) { if (e.status === 403) { ban(e.message); return false; } if (e.status === 401) dropToken(); toast(e.message); return false; }
}

logo();
refresh();
setInterval(refresh, 2000);
setTimeout(loadTop, 1500);
setInterval(loadTop, 20000);
setInterval(() => { if (S) S.plants.forEach((p, i) => cards[i] && draw(cards[i].cv, p, Date.now())); }, 200);
setInterval(() => { if (S) S.plants.forEach((_, i) => cards[i] && status(i)); }, 1000);
