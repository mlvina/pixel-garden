'use strict';
// Клиент: только отрисовка и отправка намерений. Рост, вода, цены, редкость, ники и пароли решает сервер.
const $ = id => document.getElementById(id);
function h(tag, props, ...kids) { // помощник для DOM; текст всегда через textNode (никакого innerHTML)
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (k === 'style') Object.assign(e.style, v);
    else if (k in e) e[k] = v; else e.setAttribute(k, v);
  }
  const add = c => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else e.append(c instanceof Node ? c : document.createTextNode(String(c))); };
  kids.forEach(add);
  return e;
}
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } } };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NAMES = {
  seed: { basic: ['Садовое семя', 'всегда бесплатно'], select: ['Отборное семя', ''], rare: ['Редкое семя', ''], royal: ['Королевское семя', ''], myth: ['Мифическое семя', ''] },
  fert: { compost: 'Компост', bio: 'Био-удобрение', nectar: 'Нектар роста' },
  upg: { slot: ['Грядки', 'больше горшков'], tank: ['Бак', 'воды хватает дольше'], luck: ['Удача', 'чаще редкие семена'], nurs: ['Питомник', 'места для выкопанных'], lamp: ['Лампа роста', 'ночью растёт быстрее'], mulch: ['Мульча', 'меньше расход воды'] },
  pot: ['Глиняный', 'Синяя глазурь', 'Золотой', 'Кристальный'], phase: { night: 'Ночь', dusk: 'Сумерки', day: 'День' },
};
const SHORT = { seed: { basic: 'Садовое', select: 'Отборное', rare: 'Редкое', royal: 'Королев.', myth: 'Мифич.' }, fert: { compost: 'Компост', bio: 'Био', nectar: 'Нектар' } };
const POTS = [['#c97a4a', '#e09a66', '#a85f38'], ['#4f86c6', '#7fb0e8', '#3b6aa0'], ['#e8b830', '#fff0a0', '#c08a18'], ['#6fd6e8', '#d8fbff', '#3aa5c0']];
const DEAD = ['#6b5a3a', '#5a4a30', '#7a6842'];

// ---------- звук и вибрация ----------
const SFX = {}; let sound = ls.get('pg_sound', true);
for (const n of ['click', 'click2', 'coin', 'select', 'notify', 'win']) { const a = new Audio('sfx/' + n + '.mp3'); a.preload = 'auto'; a.volume = 0.35; SFX[n] = a; }
const play = n => { if (!sound || !SFX[n]) return; try { SFX[n].currentTime = 0; SFX[n].play().catch(() => {}); } catch { /* */ } };
const vib = ms => { if (sound) try { navigator.vibrate && navigator.vibrate(ms); } catch { /* */ } };
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button')) { play('click'); vib(8); } });

// ---------- логотип: свой пиксельный шрифт 5×7 ----------
const FONT = { P: [30, 17, 17, 30, 16, 16, 16], I: [14, 4, 4, 4, 4, 4, 14], X: [17, 17, 10, 4, 10, 17, 17], E: [31, 16, 16, 30, 16, 16, 31], L: [16, 16, 16, 16, 16, 16, 31], G: [14, 17, 16, 19, 17, 17, 14], A: [14, 17, 17, 31, 17, 17, 17], R: [30, 17, 17, 30, 20, 18, 17], D: [30, 17, 17, 17, 17, 17, 30], N: [17, 25, 21, 19, 17, 17, 17], ' ': [0, 0, 0, 0, 0, 0, 0] };
function logo(cv, dark) {
  const t = 'PIXEL GARDEN', cols = dark ? ['#b75b5f', '#493333', '#9c4351', '#493333'] : ['#ffd071', '#ffd7a8', '#e5b67f', '#ffd7a8'];
  cv.width = t.length * 6 + 1; cv.height = 8;
  const c = cv.getContext('2d');
  for (let pass = 1; pass >= 0; pass--) [...t].forEach((ch, i) => FONT[ch].forEach((row, y) => {
    for (let x = 0; x < 5; x++) if ((row >> (4 - x)) & 1) { c.fillStyle = pass ? (dark ? '#ffb347' : '#1d1424') : (y < 3 || dark ? cols[i % 4] : '#e5b67f'); c.fillRect(i * 6 + x + pass, y + pass, 1, 1); }
  }));
}

// ---------- сцена: плавная смена неба, холмы, облака, светлячки, птицы ----------
const rgb = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = a => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
const NIGHT = ['#0d0d2b', '#14143a', '#1c1b4a', '#26255c', '#302e6e', '#3a3880'], DAWN = ['#4a3a7a', '#7a4a8a', '#b85a86', '#e87a7a', '#ff9a6b', '#ffc27a'];
const DAY = ['#3c9be0', '#58b0ea', '#74c3f0', '#92d3f5', '#b0e1f8', '#cdeefb'], DUSK = ['#2f2a6a', '#523c88', '#8a4a8a', '#c9627e', '#f08a6a', '#ffb070'];
const KEYS = [[0, NIGHT], [5, NIGHT], [6.6, DAWN], [8.6, DAY], [17.5, DAY], [20, DUSK], [21.8, NIGHT], [24, NIGHT]].map(([hh, b]) => [hh, b.map(rgb)]);
function skyBands(hr) {
  let i = 1; while (i < KEYS.length - 1 && hr >= KEYS[i][0]) i++;
  const [h0, b0] = KEYS[i - 1], [h1, b1] = KEYS[i], t = Math.min(1, Math.max(0, (hr - h0) / (h1 - h0)));
  return b0.map((c, k) => mix(c, b1[k], t));
}
const nightF = hr => (hr >= 21.5 || hr < 5 ? 1 : hr < 7 ? (7 - hr) / 2 : hr >= 19.5 ? (hr - 19.5) / 2 : 0);
const mkCv = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
const BG = mkCv(48, 64), STATIC = mkCv(48, 64);
function renderBg(c, hr, tm) {
  const f = (x, y, w, hh, col) => { c.fillStyle = col; c.fillRect(x, y, w, hh); }, nf = nightF(hr), bands = skyBands(hr);
  bands.forEach((b, i) => f(0, i * 9, 48, 9, css(b)));
  if (nf > 0.05) { c.fillStyle = '#fff'; for (let i = 0; i < 16; i++) { c.globalAlpha = nf * ((((tm / 600) | 0) + i) % 5 ? 1 : 0.35); c.fillRect((i * 37 + 11) % 48, (i * 23 + 5) % 34, 1, 1); } c.globalAlpha = 1; }
  if (hr >= 5.5 && hr < 20.7) { // солнце идёт по дуге и садится за холмы
    const t = Math.min(1, Math.max(0, (hr - 5.8) / 14.6)), sx = 4 + t * 38, sy = 32 - Math.sin(Math.PI * t) * 22;
    f(sx - 1, sy - 1, 7, 7, `rgba(255,230,120,${0.22 + 0.08 * Math.sin(tm / 700)})`); f(sx, sy, 5, 5, '#ffe27a'); f(sx + 1, sy + 1, 3, 3, '#fff6c0');
  }
  if (hr >= 19.5 || hr < 6.5) {
    const t = Math.min(1, ((hr - 19.5 + 24) % 24) / 11), mx = 4 + t * 38, my = 32 - Math.sin(Math.PI * t) * 22;
    c.globalAlpha = Math.min(1, nf + 0.3);
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if ((x - 2.5) ** 2 + (y - 2.5) ** 2 <= 7 && (x - 4) ** 2 + (y - 1.5) ** 2 > 5.5) f(mx + x, my + y, 1, 1, '#f4f0c8');
    c.globalAlpha = 1;
  }
  const cc = css(mix([255, 255, 255], [70, 70, 130], nf));
  [[0, 9, 10, 0.0045], [1, 20, 7, 0.003], [2, 28, 8, 0.002]].forEach(([o, y, w, sp]) => { const x = (((tm * sp + o * 23) % 66) | 0) - 14; f(x, y, w, 2, cc); f(x + 2, y - 1, w - 4, 1, cc); f(x + 1, y + 2, w - 2, 1, cc); });
  c.fillStyle = css(mix(bands[5], [52, 74, 86], 0.5 + 0.25 * nf)); // дальние холмы
  for (let x = 0; x < 48; x++) { const hh = Math.round(7 + 3 * Math.sin(x * 0.21 + 1) + 2 * Math.sin(x * 0.55)); c.fillRect(x, 51 - hh, 1, hh + 2); }
  c.fillStyle = css(mix([63, 122, 74], [18, 34, 34], nf)); // ближние
  for (let x = 0; x < 48; x++) { const hh = Math.round(3 + 2 * Math.sin(x * 0.3 + 2) + Math.sin(x * 0.7)); c.fillRect(x, 53 - hh, 1, hh + 1); }
  if (nf > 0.4) for (let i = 0; i < 5; i++) { // светлячки
    const a = tm / 800 + i * 2.1, on = Math.sin(tm / 350 + i * 3) > -0.3; if (!on) continue;
    c.globalAlpha = nf; f(6 + i * 9 + Math.round(Math.sin(a) * 3), 44 + Math.round(Math.cos(a * 1.3) * 4), 1, 1, '#ffe97a'); c.globalAlpha = 1;
  }
  const bt = (tm / 1000) % 18; // птица раз в 18 секунд
  if (nf < 0.3 && bt < 6) { const bx = Math.round(-4 + bt / 6 * 56), by = Math.round(13 + Math.sin(bt * 2) * 2), fl = ((tm / 180) | 0) % 2; f(bx, by + fl, 1, 1, '#33283a'); f(bx + 1, by + 1 - fl, 1, 1, '#33283a'); f(bx + 2, by + fl, 1, 1, '#33283a'); }
}
renderBg(STATIC.getContext('2d'), 12.5, 0);
const auraCache = {};
function auraCv(col) { // мягкое свечение: три вложенных круга, рисуются один раз
  if (auraCache[col]) return auraCache[col];
  const cv = mkCv(48, 64), c = cv.getContext('2d'); c.fillStyle = col;
  for (const [r2, a] of [[440, 0.05], [270, 0.06], [130, 0.07]]) { c.globalAlpha = a; for (let y = 6; y < 58; y++) for (let x = 2; x < 46; x++) if ((x - 24) ** 2 + (y - 33) ** 2 < r2) c.fillRect(x, y, 1, 1); }
  return (auraCache[col] = cv);
}
function potDraw(c, x0, pot, tm, off) {
  const P = POTS[pot] || POTS[0], f = (x, y, w, hh, col) => { c.fillStyle = col; c.fillRect(x + off, y, w, hh); };
  f(11, 54, 26, 3, P[0]); f(11, 54, 26, 1, P[1]); f(13, 57, 22, 4, P[2]);
  if (pot === 3 && (((tm / 400) | 0) % 2)) { f(16, 58, 1, 1, '#fff'); f(30, 56, 1, 1, '#fff'); }
  c.fillStyle = '#5b3d2a'; c.fillRect(0, 61, 48, 3); c.fillStyle = '#7a5238'; c.fillRect(0, 61, 48, 1);
}
function drawStatic(cv, p, pot) { // галерея, питомник, мини-сад: один раз, без анимации
  const c = cv.getContext('2d'); c.drawImage(STATIC, 0, 0);
  c.fillStyle = '#3b2a1c'; c.fillRect(12, 53, 24, 1);
  const g = gen(p.seed, p.r), lim = p.g == null ? 1 : p.g;
  for (const q of g.px) if (q.t <= lim) { c.fillStyle = p.x && q.l >= 0 ? DEAD[(q.x * 7 + q.y * 3) % 3] : q.c; c.fillRect(q.x, q.y, 1, 1); }
  potDraw(c, 0, pot, 0, 0);
}
function getSprite(c, p, dg, tint) { // плотный спрайт растения кешируется и перерисовывается только при смене стадии
  const key = `${p.seed}|${p.r}|${Math.floor(dg * 120)}|${p.x ? 1 : 0}|${Math.round(tint * 10)}`;
  if (c.sk !== key) {
    if (!c.spr) c.spr = mkCv(48, 54);
    const s = c.spr.getContext('2d'), g = gen(p.seed, p.r); s.clearRect(0, 0, 48, 54);
    for (const q of g.px) if (q.t <= dg) {
      s.fillStyle = p.x && q.l >= 0 ? DEAD[(q.x * 7 + q.y * 3) % 3] : q.c; s.fillRect(q.x, q.y, 1, 1);
      if (tint && q.l >= 0) { s.fillStyle = `rgba(170,120,40,${tint})`; s.fillRect(q.x, q.y, 1, 1); }
    }
    c.sk = key;
  }
  return c.spr;
}
function drawSway(x, spr, tm, k) { // ветер: верхушка сдвигается на 1–2 пикселя
  if (k <= 0 || reduced) { x.drawImage(spr, 0, 0); return; }
  const wind = 0.6 + 0.4 * Math.sin(tm / 3500);
  for (let y = 0; y < 54; y++) { const lev = (53 - y) / 40, a = Math.min(2.2, 1.6 * lev * lev + lev * 0.4) * k * wind, sh = Math.round(Math.sin(tm / 1000 + y * 0.045) * a); x.drawImage(spr, 0, y, 48, 1, sh, y, 48, 1); }
}

// ---------- сеть ----------
let token = null, cat = null, S = null, topData = null, topK = 'earned', tab = 'shop', view = 'garden', banned = false, busy = false;
try { token = localStorage.getItem('pg_token'); } catch { /* приватный режим */ }
const sel = ls.get('pg_sel', { seed: 'basic', fert: 'compost' });
async function api(path, body) {
  const hd = { 'Content-Type': 'application/json' };
  if (token) hd.Authorization = 'Bearer ' + token;
  const r = await fetch('/api/' + path, { method: 'POST', headers: hd, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Ошибка сети'); e.status = r.status; throw e; }
  j.at = Date.now();
  return j;
}
function setToken(t) { token = t; try { if (t) localStorage.setItem('pg_token', t); else localStorage.removeItem('pg_token'); } catch { /* */ } }
const hourNow = () => (S ? (S.ph.hour + (Date.now() - S.at) / 3.6e6) % 24 : 12);
const left = p => (p && p.l != null ? Math.max(0, p.l - (Date.now() - S.at) / 1000) : null);
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let toastT;
function toast(m, kind) { const t = $('toast'); t.textContent = m; t.className = kind || ''; t.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => { t.style.display = 'none'; }, 2600); }
function overlay(content) { const o = $('overlay'); o.replaceChildren(content); o.hidden = false; return o; }
function closeOverlay() { $('overlay').hidden = true; $('overlay').replaceChildren(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && token) closeOverlay(); });
function fail(e) { if (e.status === 401) { setToken(null); S = null; showAuth('Войдите снова'); } else if (e.status === 403) ban(e.message); else toast(e.message, 'err'); }
function ban(msg) { banned = true; S = null; overlay(h('div', { class: 'panel auth' }, h('h2', null, 'Доступ закрыт'), h('p', null, msg))); }

// ---------- состояние с плавной интерполяцией ----------
// Сервер присылает состояние раз в 2 с. Между ответами рост и воду «дорисовываем» по скорости, замеренной на прошлом интервале.
function setState(ns) {
  const old = S; S = ns;
  ns.plants.forEach((p, i) => {
    const c = cards[i]; if (!c) return;
    const o = old && old.plants[i], dt = old ? (ns.at - old.at) / 1000 : 0;
    if (!p || !o || o.seed !== p.seed) { c.rate = 0; c.wrate = 0; }
    else if (dt >= 0.8) { c.rate = p.g >= 1 ? 0 : Math.max(0, (p.g - o.g) / dt); c.wrate = p.w <= 0 ? 0 : Math.min(0, (p.w - o.w) / dt); }
  });
  render();
}
const dispG = (c, p) => (p.g >= 1 ? 1 : Math.min(0.9999, p.g + (c.rate || 0) * (Date.now() - S.at) / 1000));
const dispW = (c, p) => (p.w <= 0 ? 0 : Math.max(0, p.w + (c.wrate || 0) * (Date.now() - S.at) / 1000));

// ---------- вход и регистрация ----------
function showAuth(msg) {
  let mode = 'login';
  const nick = h('input', { placeholder: 'Ник', maxLength: 16, autocomplete: 'username', autocapitalize: 'off', spellcheck: false, 'aria-label': 'Ник' });
  const pass = h('input', { type: 'password', placeholder: 'Пароль (от 8 символов)', maxLength: 128, autocomplete: 'current-password', 'aria-label': 'Пароль' });
  const err = h('div', { class: 'err' }, msg || ''), go = h('button', { class: 'btn', type: 'submit' }, 'Войти');
  const tLogin = h('button', { class: 'btn alt', type: 'button' }, 'Вход'), tReg = h('button', { class: 'btn alt', type: 'button' }, 'Регистрация');
  const setMode = m => { mode = m; go.textContent = m === 'login' ? 'Войти' : 'Создать аккаунт'; pass.autocomplete = m === 'login' ? 'current-password' : 'new-password'; tLogin.style.opacity = m === 'login' ? 1 : 0.6; tReg.style.opacity = m === 'reg' ? 1 : 0.6; err.textContent = ''; };
  tLogin.onclick = () => setMode('login'); tReg.onclick = () => setMode('reg'); setMode('login');
  const cv = h('canvas'); logo(cv, true);
  const form = h('form', { onsubmit: async e => {
    e.preventDefault(); err.textContent = ''; go.disabled = true;
    try { setToken((await api(mode === 'login' ? 'login' : 'signup', { nick: nick.value, pass: pass.value })).token); closeOverlay(); banned = false; await refresh(); play('win'); }
    catch (x) { err.textContent = x.message; } finally { go.disabled = false; }
  } }, h('div', { class: 'row2' }, tLogin, tReg), nick, pass, err, go,
  h('p', { class: 'hint' }, 'Пароль нельзя восстановить автоматически: если забудете, попросите администратора сбросить его.'));
  overlay(h('div', { class: 'panel auth' }, cv, form)); nick.focus();
}

// ---------- эффекты: пиксельные частицы поверх окна ----------
function fx(c, type, arg, rar) {
  if (reduced || !c) return;
  const L = c.fxl, add = (cls, st, txt) => {
    const e = h('i', { class: cls }, txt || null); for (const [k, v] of Object.entries(st)) e.style.setProperty(k, v);
    L.append(e); e.addEventListener('animationend', () => e.remove(), { once: true }); setTimeout(() => e.remove(), 1600);
  };
  const R = (a, b) => a + Math.random() * (b - a), burst = (n, cols, up, spread) => { for (let i = 0; i < n; i++) add('fp', { '--x': R(30, 70) + '%', '--y': '70%', '--c': cols[i % cols.length], '--dx': R(-spread, spread) + 'px', '--dy': -R(up * 0.4, up) + 'px', '--d': R(500, 900) + 'ms' }); };
  if (type === 'water') for (let i = 0; i < 10; i++) add('fp', { '--x': R(15, 85) + '%', '--y': '4%', '--c': i % 3 ? '#7fb8ff' : '#cfe8ff', '--dx': R(-8, 8) + 'px', '--dy': R(70, 130) + 'px', '--d': R(450, 800) + 'ms' });
  else if (type === 'plant') burst(9, ['#8fd860', '#5fae3c', '#b4f090'], 50, 26);
  else if (type === 'fert') burst(12, ['#ffd071', '#fff0a0', '#8fd860'], 70, 36);
  else if (type === 'dig') burst(10, ['#8a5a35', '#b9814f', '#5b3d2a'], 40, 34);
  else if (type === 'coin') {
    add('ft', {}, `+${arg}`); burst(8, ['#ffd071', '#fff0a0', '#e8b830'], 60, 30);
    if (rar >= 2) { const k = RCL[rar]; for (let i = 0; i < 12 + rar * 4; i++) add('fp', { '--x': '50%', '--y': '50%', '--c': i % 2 ? k : '#fff', '--dx': R(-70, 70) + 'px', '--dy': R(-90, 30) + 'px', '--d': R(700, 1200) + 'ms' }); }
  }
}

// ---------- сад ----------
let cards = [], io = null;
if ('IntersectionObserver' in window) io = new IntersectionObserver(es => es.forEach(e => { if (e.target._c) e.target._c.vis = e.isIntersecting; }), { rootMargin: '120px' });
function setBtn(btn, icon, text) { const k = icon + '|' + text; if (btn._k === k) return; btn._k = k; btn.replaceChildren(icon ? h('i', { class: 'ico ' + icon }) : null, text); }
function mkCard(i) {
  const cv = h('canvas', { class: 'plot', width: 48, height: 64 }), fxl = h('div', { class: 'fxl' });
  const win = h('div', { class: 'win', onclick: () => onTap(i) }, cv, fxl), nm = h('div', { class: 'nm' }, h('span'), h('small')), st = h('div', { class: 'st' });
  const bw = h('div', { class: 'bar water' }, h('i')), bg = h('div', { class: 'bar grow' }, h('i'));
  const main = h('button', { class: 'btn', onclick: () => onMain(i) }), fert = h('button', { class: 'btn alt sm', onclick: () => doAct({ a: 'fert', slot: i, id: sel.fert }, 'select') }), dig = h('button', { class: 'btn alt sm', onclick: () => doAct({ a: 'dig', slot: i }, 'click2') });
  const d = h('div', { class: 'card panel' }, win, nm, st, h('div', { class: 'bars' }, bw, bg), main, h('div', { class: 'row2' }, fert, dig));
  const c = { d, cv, ctx: cv.getContext('2d'), win, fxl, nm: nm.firstChild, kind: nm.lastChild, st, bw: bw.firstChild, bg: bg.firstChild, main, fert, dig, rate: 0, wrate: 0, vis: true };
  win._c = c; if (io) io.observe(win);
  return c;
}
function wateredNow(i) { const p = S.plants[i], c = cards[i]; p.w = 1; p.l = null; c.wrate = 0; c.wob = Date.now(); fx(c, 'water'); updCard(i); } // отклик мгновенный, сервер подтверждает позже
function onMain(i) {
  const p = S.plants[i];
  if (!p) return doAct({ a: 'plant', slot: i, seed: sel.seed }, 'select');
  if (p.x) return doAct({ a: 'clear', slot: i }, 'click2');
  if (p.g >= 1) return doAct({ a: 'harvest', slot: i }, 'coin');
  wateredNow(i); play('click2'); return doAct({ a: 'water', slot: i }, null, null, { nofx: true });
}
function onTap(i) { const p = S.plants[i]; if (p && !p.x) onMain(i); } // тап по растению: полить или собрать (посадка — только кнопкой, она тратит монеты)
async function doAct(body, snd, msg, o = {}) {
  const prev = S && body.slot != null ? S.plants[body.slot] : null, c = cards[body.slot];
  try {
    setState(await api('act', body));
    if (snd && !o.quiet) play(snd);
    if (c && !o.nofx) { if (body.a === 'plant') fx(c, 'plant'); else if (body.a === 'water') { fx(c, 'water'); c.wob = Date.now(); } else if (body.a === 'harvest' && prev) { fx(c, 'coin', prev.v, prev.r); if (prev.r >= 3) play('win'); vib(25); } else if (body.a === 'fert') fx(c, 'fert'); else if (body.a === 'dig') fx(c, 'dig'); }
    if (msg && !o.quiet) toast(msg, 'ok');
    return true;
  } catch (e) { fail(e); refresh(); return false; }
}
async function bulk(kind) {
  if (busy || !S) return; busy = true;
  try {
    let n = 0, sum = 0;
    if (kind === 'water') { if (await doAct({ a: 'waterall' }, 'click2', null, { quiet: true })) { S.plants.forEach((p, i) => { if (p && !p.x && cards[i]) { fx(cards[i], 'water'); cards[i].wob = Date.now(); } }); toast('Всё полито', 'ok'); } }
    else if (kind === 'harvest') {
      for (let i = 0; i < S.slots; i++) { const p = S.plants[i]; if (p && !p.x && p.g >= 1) { const v = p.v, r = p.r, c = cards[i]; if (await doAct({ a: 'harvest', slot: i }, null, null, { quiet: true, nofx: true })) { n++; sum += v; fx(c, 'coin', v, r); } else break; } }
      if (n) { play('coin'); vib(30); toast(`Собрано: ${n}, +${sum} монет`, 'ok'); } else toast('Пока нечего собирать');
    } else if (kind === 'plant') {
      const cost = (cat.seeds.find(x => x.id === sel.seed) || cat.seeds[0]).cost;
      for (let i = 0; i < S.slots; i++) { if (!S.plants[i]) { if (S.coins < cost) { toast('Не хватило монет', 'err'); break; } if (await doAct({ a: 'plant', slot: i, seed: sel.seed }, null, null, { quiet: true, nofx: true })) { n++; fx(cards[i], 'plant'); } else break; } }
      if (n) { play('select'); toast(`Посажено: ${n}`, 'ok'); }
    }
  } finally { busy = false; }
}
function cardStatus(i) {
  const p = S.plants[i], c = cards[i], L = left(p);
  let t = 'Пустая грядка', cls = '';
  if (p) {
    if (p.x) { t = 'Засохло'; cls = 'bad'; }
    else if (p.g >= 1) { t = 'Готово! Тапни — соберёшь'; cls = 'ok'; }
    else if (L != null) { t = L <= cat.warn ? `Скоро засохнет · ${mmss(L)}` : `Хочет пить · ${mmss(L)}`; cls = L <= cat.warn ? 'bad' : 'mid'; }
    else t = `Растёт · ${Math.floor(dispG(c, p) * 100)}%`;
    if (p.f && !p.x) t += ` · ×${p.f.m} (${mmss(Math.max(0, p.f.l - (Date.now() - S.at) / 1000))})`;
  }
  if (c.st.textContent !== t) c.st.textContent = t;
  c.st.className = 'st ' + cls;
  const w = !!p && !p.x && L != null && L <= cat.warn;
  if (w && !c.warned && document.visibilityState === 'visible') { play('notify'); vib([60, 40, 60]); }
  c.warned = w; c.d.classList.toggle('warn', w);
}
function updCard(i) {
  const c = cards[i], p = S.plants[i], grow = !!p && !p.x && p.g < 1;
  const seed = cat.seeds.find(x => x.id === sel.seed) || cat.seeds[0], fert = cat.fert.find(x => x.id === sel.fert) || cat.fert[0];
  c.nm.textContent = p ? RN[p.r] : 'Свободно'; c.nm.style.color = p ? RC[p.r] : ''; c.kind.textContent = p ? `${KINDS[gen(p.seed, p.r).kind]}${p.x ? ' · засохло' : ''}` : ' ';
  c.win.style.setProperty('--rc', p ? RCL[p.r] : 'transparent'); c.d.classList.toggle('glow', !!p && p.r >= 3 && !p.x); c.win.classList.toggle('tap', !!p && !p.x);
  c.bg.style.width = (p ? Math.min(1, p.g + (p.g >= 1 ? 0 : c.rate * 2)) * 100 : 0) + '%'; c.bw.style.width = (p && !p.x ? Math.max(0, p.w + (p.w <= 0 ? 0 : c.wrate * 2)) * 100 : 0) + '%';
  if (!p) setBtn(c.main, 'sprout', `Посадить${seed.cost ? ' −' + seed.cost : ''}`); else if (p.x) setBtn(c.main, 'shovel', 'Убрать'); else if (p.g >= 1) setBtn(c.main, 'basket', `Собрать +${p.v}`); else setBtn(c.main, 'drop', 'Полить');
  c.main.disabled = !p && S.coins < seed.cost;
  c.fert.style.visibility = c.dig.style.visibility = grow ? 'visible' : 'hidden';
  if (grow) {
    setBtn(c.fert, 'bag', p.f ? `×${p.f.m}` : `Удобр. −${fert.cost}`); c.fert.disabled = !!p.f || S.coins < fert.cost;
    setBtn(c.dig, 'shovel', `Копать −${cat.rar[p.r].dig}`); c.dig.disabled = S.nursery.length >= S.nurseryCap || S.coins < cat.rar[p.r].dig;
  }
  cardStatus(i);
}
let toolbar = null;
function buildToolbar() {
  const ss = h('select', { 'aria-label': 'Какие семена сажать', onchange: () => { sel.seed = ss.value; ls.set('pg_sel', sel); render(); } }, cat.seeds.map(s => h('option', { value: s.id }, `${SHORT.seed[s.id]} · ${s.cost}`)));
  const sf = h('select', { 'aria-label': 'Какое удобрение использовать', onchange: () => { sel.fert = sf.value; ls.set('pg_sel', sel); render(); } }, cat.fert.map(f => h('option', { value: f.id }, `${SHORT.fert[f.id]} · ${f.cost}`)));
  const bw = h('button', { class: 'btn', 'aria-label': 'Полить все растения', onclick: () => bulk('water') }), bh = h('button', { class: 'btn', 'aria-label': 'Собрать все готовые', onclick: () => bulk('harvest') }), bp = h('button', { class: 'btn', 'aria-label': 'Посадить во все пустые грядки', onclick: () => bulk('plant') });
  const el = h('div', { id: 'toolbar', class: 'panel' }, h('label', null, 'Сажаем', ss), h('label', null, 'Удобряем', sf), h('div', { class: 'acts' }, bw, bh, bp));
  return { el, ss, sf, bw, bh, bp };
}
function updToolbar() {
  toolbar.ss.value = sel.seed; toolbar.sf.value = sel.fert;
  const ready = S.plants.filter(p => p && !p.x && p.g >= 1).length, empty = S.plants.filter(p => !p).length, thirsty = S.plants.some(p => p && !p.x);
  const cost = (cat.seeds.find(x => x.id === sel.seed) || cat.seeds[0]).cost;
  setBtn(toolbar.bw, 'drop', 'Полить'); toolbar.bw.disabled = !thirsty;
  setBtn(toolbar.bh, 'basket', `Собрать${ready ? ' (' + ready + ')' : ''}`); toolbar.bh.disabled = !ready;
  setBtn(toolbar.bp, 'sprout', `Посадить${empty ? ' (' + empty + ')' : ''}`); toolbar.bp.disabled = !empty || S.coins < cost;
}
function banner() {
  return h('div', { class: 'panel note', id: 'legacy', hidden: !S || S.hasPass }, 'Ваш аккаунт без пароля: он пропадёт при очистке браузера. ', h('button', { class: 'btn alt sm', style: { width: 'auto', marginTop: '6px' }, onclick: () => openProfile() }, 'Защитить аккаунт'));
}
function renderCards() {
  if (cards.length !== S.slots) {
    toolbar = toolbar || buildToolbar();
    $('garden').replaceChildren(); cards = Array.from({ length: S.slots }, (_, i) => mkCard(i));
    $('garden').append(toolbar.el, banner(), ...cards.map(c => c.d));
    S.plants.forEach((p, i) => { if (p) { cards[i].rate = 0; cards[i].wrate = 0; } });
  }
  S.plants.forEach((_, i) => updCard(i)); updToolbar();
}

// ---------- боковая панель ----------
let shop = null, nurKey = '', nurRows = [], sub = 'seeds', installEv = null;
const odds = (w, luck) => { const x = w.map((v, i) => v * (1 + 0.08 * luck) ** i), s = x.reduce((a, b) => a + b); return x.map(v => v / s * 100); };
const pct = v => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)) + '%';
const SUBS = [['seeds', 'Семена'], ['fert', 'Удобр.'], ['upg', 'Улучш.'], ['pots', 'Горшки'], ['more', 'Ещё']];
function buildShop() {
  const s = { seeds: {}, ferts: {}, ups: {}, pots: [], sec: {} };
  const seedBox = h('div', { class: 'pick' }), fertBox = h('div', { class: 'pick' }), upBox = h('div'), potBox = h('div', { class: 'pots' });
  for (const sd of cat.seeds) {
    const price = h('b'), small = h('small'), r = h('button', { class: 'pk', onclick: () => { sel.seed = sd.id; ls.set('pg_sel', sel); render(); play('select'); } }, h('span', null, NAMES.seed[sd.id][0], small), price);
    seedBox.append(r); s.seeds[sd.id] = { r, price, small };
  }
  for (const f of cat.fert) {
    const r = h('button', { class: 'pk', onclick: () => { sel.fert = f.id; ls.set('pg_sel', sel); render(); play('select'); } }, h('span', null, NAMES.fert[f.id], h('small', null, `рост ×${f.m} на ${f.sec / 60} мин. Кнопка «Удобр.» на грядке`)), h('b', null, f.cost));
    fertBox.append(r); s.ferts[f.id] = r;
  }
  for (const k of Object.keys(NAMES.upg)) {
    const dots = Array.from({ length: cat.upg[k].max }, () => h('i')), b = h('button', { class: 'btn sm', onclick: () => doAct({ a: 'upgrade', kind: k }, 'win') });
    upBox.append(h('div', { class: 'up' }, h('div', { class: 'upn' }, NAMES.upg[k][0], h('small', null, ' — ' + NAMES.upg[k][1])), h('div', { class: 'pips' }, dots), b)); s.ups[k] = { dots, b };
  }
  cat.skins.forEach((cost, i) => {
    const cv = h('canvas', { width: 24, height: 18 }), c = cv.getContext('2d'), P = POTS[i];
    c.fillStyle = P[0]; c.fillRect(2, 3, 20, 4); c.fillStyle = P[1]; c.fillRect(2, 3, 20, 1); c.fillStyle = P[2]; c.fillRect(4, 7, 16, 8);
    const lab = h('span'), b = h('button', { class: 'pk pot', title: NAMES.pot[i], onclick: () => doAct({ a: 'skin', id: i }, 'win') }, cv, lab);
    potBox.append(b); s.pots.push({ b, lab });
  });
  s.nb = h('button', { class: 'btn alt', onclick: togglePush }); s.sb = h('button', { class: 'btn alt', onclick: () => { sound = !sound; ls.set('pg_sound', sound); updShop(); } });
  s.ib = h('button', { class: 'btn alt', onclick: async () => { if (installEv) { installEv.prompt(); installEv = null; updShop(); } else toast('Меню браузера → «Добавить на главный экран»'); } }, 'Установить как приложение');
  s.hint = h('p', { class: 'hint' });
  s.sec = { seeds: seedBox, fert: fertBox, upg: upBox, pots: potBox, more: h('div', null, s.nb, h('div', { style: { height: '6px' } }), s.sb, h('div', { style: { height: '6px' } }), s.ib, s.hint) };
  s.chips = SUBS.map(([k, l]) => h('button', { class: 'btn alt sm', onclick: () => { sub = k; renderSide(); } }, l));
  s.root = h('div', { class: 'fade' }, h('div', { class: 'sub' }, s.chips), Object.values(s.sec));
  return s;
}
function updShop() {
  SUBS.forEach(([k], i) => { shop.chips[i].classList.toggle('on', sub === k); shop.sec[k].hidden = sub !== k; });
  for (const sd of cat.seeds) {
    const o = shop.seeds[sd.id], od = odds(sd.w, S.lv.luck);
    o.r.classList.toggle('on', sel.seed === sd.id); o.price.textContent = sd.cost ? sd.cost : 'бесплатно';
    o.small.textContent = `редкое+ ${pct(od[2] + od[3] + od[4])}, эпик+ ${pct(od[3] + od[4])}`;
  }
  for (const f of cat.fert) shop.ferts[f.id].classList.toggle('on', sel.fert === f.id);
  for (const [k, u] of Object.entries(shop.ups)) {
    const meta = cat.upg[k], lv = S.lv[k], cost = lv >= meta.max ? null : meta.costs[lv - meta.from];
    u.dots.forEach((d, i) => { d.className = i < lv ? 'on' : ''; });
    u.b.textContent = cost == null ? 'Максимум' : `Купить ${cost}`; u.b.disabled = cost == null || S.coins < cost;
    if (k === 'lamp') u.b.title = `Ночью рост ×${Math.min(0.7, 0.2 + 0.1 * lv).toFixed(1)}`;
  }
  cat.skins.forEach((cost, i) => { const own = (S.skins >> i) & 1, p = shop.pots[i]; p.lab.textContent = S.pot === i ? 'надет' : own ? 'надеть' : cost; p.b.classList.toggle('on', S.pot === i); p.b.disabled = !own && S.coins < cost; });
  shop.nb.textContent = !canPush() ? 'Уведомления: нужен https' : S.push ? 'Уведомления: вкл' : 'Уведомлять о засыхании'; shop.nb.disabled = !canPush();
  shop.sb.textContent = sound ? 'Звук и вибрация: вкл' : 'Звук и вибрация: выкл';
  shop.ib.hidden = matchMedia('(display-mode: standalone)').matches;
  shop.hint.textContent = `Без воды растение засыхает через ${cat.grace / 60} мин (уведомление — за ${cat.warn / 60} мин). Ночью рост ×${Math.min(0.7, 0.2 + 0.1 * S.lv.lamp).toFixed(1)}, но воды уходит почти в 10 раз меньше.`;
}
function updNursery(root) {
  const key = JSON.stringify(S.nursery) + S.nurseryCap;
  if (key !== nurKey) {
    nurKey = key; nurRows = [];
    root.replaceChildren(h('div', { class: 'sec' }, `Питомник ${S.nursery.length}/${S.nurseryCap}`), h('p', { class: 'hint' }, 'Лопата убирает растение из горшка с сохранением роста (кнопка «Копать» на грядке). Цена зависит от редкости. Пересадить можно в любую свободную грядку.'));
    S.nursery.forEach((p, idx) => {
      const cv = h('canvas', { width: 48, height: 64 }), b = h('button', { class: 'btn alt sm', onclick: () => doAct({ a: 'replant', idx }, 'select') }, 'Посадить'), dr = h('button', { class: 'btn alt sm', onclick: () => doAct({ a: 'drop', idx }, 'click2') }, 'Выбросить');
      root.append(h('div', { class: 'nrow' }, cv, h('div', null, h('b', { style: { color: RC[p.r] } }, RN[p.r]), h('div', null, `${KINDS[gen(p.seed, p.r).kind]} · рост ${Math.floor(p.g * 100)}%`), h('div', { class: 'row2' }, b, dr))));
      nurRows.push({ cv, p, b }); drawStatic(cv, p, S.pot);
    });
    if (!S.nursery.length) root.append(h('p', { class: 'hint' }, 'Пока пусто.'));
  }
  nurRows.forEach(r => { r.b.disabled = !S.plants.some(p => !p); });
}
async function loadTop() {
  if (!token || banned) return;
  try { topData = await api('top', { k: topK }); if (tab === 'top') renderSide(); } catch { /* не критично */ }
}
function updTop(root) {
  const mk = (k, l) => h('button', { class: 'btn alt sm', style: { opacity: topK === k ? 1 : 0.6 }, onclick: () => { topK = k; topData = null; loadTop(); renderSide(); } }, l);
  root.replaceChildren(h('div', { class: 'row2' }, mk('earned', 'Заработок'), mk('harvests', 'Урожаи'), mk('rare', 'Редкие')), h('div', { class: 'sec' }, 'Лучшие игроки'));
  const ol = h('ul', { class: 'rank' });
  (topData ? topData.top : []).forEach((t, i) => ol.append(h('li', null, h('span', null, i + 1 + '.'), h('button', { onclick: () => openProfile(t.nick) }, t.nick), h('b', null, t.v))));
  if (!topData || !topData.top.length) ol.append(h('li', null, topData ? 'Пока никого — соберите урожай.' : 'Загрузка…'));
  root.append(ol);
  if (topData) root.append(h('p', { class: 'hint' }, `Игроков: ${topData.g.players} · урожаев: ${topData.g.harvests} · легендарных: ${topData.g.legend}`));
}
function renderSide() {
  const side = $('side');
  if (!side.firstChild) {
    side.replaceChildren(h('div', { class: 'tabs', id: 'tabs' }, ...[['shop', 'Лавка'], ['nursery', 'Питомник'], ['top', 'Топ']].map(([k, l]) => h('button', { class: 'btn', 'data-k': k, onclick: () => goTab(k) }, l))), h('div', { class: 'panel', id: 'pane' }));
    shop = buildShop();
  }
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.k === tab);
  const pane = $('pane');
  if (tab === 'shop') { if (pane.firstChild !== shop.root) pane.replaceChildren(shop.root); updShop(); }
  else if (tab === 'nursery') updNursery(pane);
  else updTop(pane);
}

// ---------- навигация (на телефоне — нижняя панель) ----------
const NAV = [['garden', 'sprout', 'Сад'], ['shop', 'shop', 'Лавка'], ['nursery', 'shovel', 'Питомник'], ['top', 'trophy', 'Топ'], ['me', 'user', 'Профиль']];
function buildNav() {
  $('nav').replaceChildren(...NAV.map(([k, ic, l]) => h('button', { 'data-k': k, onclick: () => { if (k === 'me') openProfile(); else if (k === 'garden') setView('garden'); else goTab(k); } }, h('i', { class: 'ico ' + ic }), h('span', null, l))));
}
function setView(v) { view = v; document.body.dataset.view = v; scrollTo({ top: 0 }); markNav(); }
function goTab(k) { tab = k; nurKey = ''; setView('side'); renderSide(); if (k === 'top') loadTop(); }
function markNav() {
  const ready = S ? S.plants.filter(p => p && !p.x && p.g >= 1).length : 0, warn = S ? S.plants.some((p, i) => p && !p.x && cards[i] && cards[i].warned) : false;
  for (const b of $('nav').children) {
    const k = b.dataset.k; b.classList.toggle('on', k === 'garden' ? view === 'garden' : k === tab && view === 'side');
    if (k === 'garden') b.lastChild.textContent = 'Сад' + (warn ? ' !' : ready ? ` ${ready}` : '');
  }
  document.title = (warn ? '⚠ ' : ready ? '✓ ' : '') + 'Pixel Garden';
}

// ---------- профиль-«книга» ----------
async function openProfile(nick) {
  let P;
  try { P = await api('profile', nick === undefined ? {} : { nick }); } catch (e) { return fail(e); }
  const st = P.stats, kv = (k, v) => h('div', { class: 'kv' }, h('span', null, k), h('b', null, v));
  const mini = pl => { const cv = h('canvas', { width: 48, height: 64 }); drawStatic(cv, pl, P.pot); return cv; };
  const lp = h('div', { class: 'page l' }, h('h2', null, P.nick || 'Без ника'), h('div', null, h('span', { class: 'dot' + (P.online ? ' on' : '') }), P.online ? 'сейчас в игре' : 'не в сети', ' · с ', new Date(P.since).toLocaleDateString('ru-RU')),
    h('h3', null, 'Статистика'), kv('Заработано', st.earned), kv('Урожаев', st.harvests), kv('Грядок', st.slots), kv('Потрачено', st.spent || 0), kv('Выкопано', st.dug || 0), kv('Засохло', st.wilt || 0),
    h('h3', null, 'Выращено'), ...RN.map((n, i) => h('div', { class: 'kv' }, h('span', { style: { color: RC[i] } }, n), h('b', null, st.hr[i]))),
    h('h3', null, 'Сад сейчас'), h('div', { class: 'mini' }, P.garden.map(pl => (pl ? mini(pl) : h('canvas', { width: 48, height: 64 })))));
  if (P.self) lp.append(accountForm());
  const gal = h('div', { class: 'gal' }, P.gallery.map(g => { const cv = h('canvas', { width: 48, height: 64 }); drawStatic(cv, { seed: g.seed, r: g.r, g: 1, x: false }, P.pot); return h('div', { class: 'win', title: `${RN[g.r]} · ${KINDS[gen(g.seed, g.r).kind]} · ${new Date(g.ts).toLocaleDateString('ru-RU')}`, style: { '--rc': RCL[g.r] } }, cv); }));
  const right = h('div', { class: 'page r' }, h('h2', null, `Галерея (${P.gallery.length})`), P.gallery.length ? gal : h('p', { class: 'hint' }, 'Здесь появятся выращенные растения.'));
  const x = h('button', { class: 'btn alt x', 'aria-label': 'Закрыть', onclick: closeOverlay }, '✕');
  const o = overlay(h('div', { class: 'book' }, lp, right, x)); o.onclick = e => { if (e.target === o) closeOverlay(); };
}
function accountForm() {
  const err = h('div', { class: 'err' });
  const old = h('input', { type: 'password', placeholder: 'Старый пароль', autocomplete: 'current-password', maxLength: 128 });
  const np = h('input', { type: 'password', placeholder: 'Новый пароль (от 8)', autocomplete: 'new-password', maxLength: 128 });
  const nk = S.nick ? null : h('input', { placeholder: 'Ник', maxLength: 16 });
  const btn = h('button', { class: 'btn alt', onclick: async () => {
    err.textContent = '';
    try { const had = S.hasPass; setState(await api(had ? 'passwd' : 'claim', had ? { old: old.value, pass: np.value } : { nick: nk ? nk.value : undefined, pass: np.value })); toast(had ? 'Пароль сохранён' : 'Аккаунт защищён', 'ok'); closeOverlay(); }
    catch (e) { err.textContent = e.message; }
  } }, S.hasPass ? 'Сменить пароль' : 'Защитить аккаунт');
  return h('div', null, h('h3', null, 'Аккаунт'), S.hasPass ? old : nk, np, err, btn,
    h('button', { class: 'btn alt', style: { marginTop: '6px' }, onclick: async () => { try { await api('logout'); } catch { /* */ } setToken(null); S = null; cards = []; toolbar = null; $('garden').replaceChildren(); $('side').replaceChildren(); shop = null; closeOverlay(); showAuth(); } }, 'Выйти'));
}

// ---------- уведомления ----------
const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
let pushBusy = false;
async function togglePush() {
  if (pushBusy) return; pushBusy = true;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
    if (S.push) { const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); setState(await api('push/off')); toast('Уведомления выключены', 'ok'); }
    else {
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Разрешите уведомления для сайта в настройках браузера');
      const { key } = await api('push/key'); let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) });
      setState(await api('push/on', { endpoint: sub.endpoint })); toast('Уведомления включены', 'ok');
    }
  } catch (e) { toast(e.message, 'err'); } finally { pushBusy = false; }
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEv = e; if (S && shop) updShop(); });

// ---------- кадровый цикл ----------
let shownCoins = 0;
function render() {
  const ph = S.ph;
  $('clock').replaceChildren(h('i', { class: 'ico ' + (ph.name === 'night' ? 'moon' : 'sun') }), NAMES.phase[ph.name], h('span', { class: 'long' }, ` · рост ×${ph.gm} · вода ×${ph.wm}`), h('span', { class: 'short' }, ` ×${ph.gm}`));
  const lg = $('legacy'); if (lg) lg.hidden = S.hasPass;
  renderCards(); renderSide(); markNav();
}
let lastF = 0, lastTint = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (document.hidden || !S || ts - lastF < 33) return; // ~30 кадров/с, на скрытой вкладке не рисуем
  lastF = ts;
  const tm = Date.now(), hr = hourNow();
  renderBg(BG.getContext('2d'), hr, tm);
  S.plants.forEach((p, i) => {
    const c = cards[i]; if (!c || !c.vis) return;
    const x = c.ctx, dw = p && !p.x ? dispW(c, p) : 0.4;
    x.drawImage(BG, 0, 0); x.fillStyle = css(mix([112, 78, 46], [48, 32, 24], dw)); x.fillRect(12, 53, 24, 1);
    if (p) {
      const dg = dispG(c, p), g = gen(p.seed, p.r), L = left(p);
      if (g.aura && !p.x && dg > 0.5) { x.globalAlpha = 0.75 + 0.25 * Math.sin(tm / 450); x.drawImage(auraCv(g.aura), 0, 0); x.globalAlpha = 1; }
      drawSway(x, getSprite(c, p, dg, p.x || L == null ? 0 : Math.min(0.55, 0.55 * (1 - L / cat.grace))), tm, p.x || dg < 0.12 ? 0 : Math.min(1, (dg - 0.12) * 3));
      if (!p.x && p.g >= 1) for (const s of g.sp) if ((((tm / 350) | 0) + s.o) % 3 === 0) {
        const k = RCL[p.r]; x.fillStyle = k; x.fillRect(s.x, s.y, 1, 1);
        if (p.r >= 3) { x.fillRect(s.x - 1, s.y, 1, 1); x.fillRect(s.x + 1, s.y, 1, 1); x.fillRect(s.x, s.y - 1, 1, 1); x.fillRect(s.x, s.y + 1, 1, 1); }
      }
    }
    const wob = c.wob && tm - c.wob < 360 ? ((((tm - c.wob) / 60) | 0) % 2 ? 1 : -1) : 0;
    potDraw(x, 0, S.pot, tm, wob);
    if (p && !p.x && p.g < 1 && (frame.n = (frame.n || 0) + 1) % 4 === 0) { c.bg.style.width = Math.min(1, dispG(c, p) + (c.rate || 0) * 2) * 100 + '%'; }
  });
  if (shownCoins !== S.coins) { const d = S.coins - shownCoins, step = Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * 0.18)); const prev = shownCoins; shownCoins = Math.abs(d) <= Math.abs(step) ? S.coins : shownCoins + step; $('coins').lastChild.textContent = shownCoins; if (shownCoins > prev && !reduced) { const cn = $('coins'); cn.classList.remove('bump'); void cn.offsetWidth; cn.classList.add('bump'); } }
  if (ts - lastTint > 3000) { lastTint = ts; const t = nightF(hr); document.body.style.setProperty('--bgc', css(mix([58, 48, 80], [30, 22, 46], t))); }
}
async function refresh() {
  if (!token || banned) return;
  try { setState(await api('state')); } catch (e) { fail(e); }
}
async function boot() {
  logo($('logo')); buildNav();
  $('hud').append(h('span', { class: 'chip', id: 'coins' }, h('i', { class: 'ico coin' }), h('b', null, '0')), h('button', { class: 'btn hud-btn', onclick: () => openProfile() }, h('i', { class: 'ico user' }), 'Профиль'));
  try { cat = await api('catalog'); } catch { toast('Сервер недоступен', 'err'); return; }
  if (!token) showAuth(); else refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 2000); setInterval(() => { if (!document.hidden) loadTop(); }, 20000);
  setInterval(() => { if (S) { S.plants.forEach((_, i) => cards[i] && cardStatus(i)); markNav(); } }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  requestAnimationFrame(frame);
}
boot();
