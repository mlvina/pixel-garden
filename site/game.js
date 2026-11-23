'use strict';
// Клиент: сцена-мастерская, меню и книга. Рост, вода, цены, редкость, геном, питомцы и пароли решает сервер.
const $ = id => document.getElementById(id);
function h(tag, props, ...kids) { // текст всегда через textNode — никакого innerHTML
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e[k] = v; else if (k === 'style') Object.assign(e.style, v); else if (k in e) e[k] = v; else e.setAttribute(k, v);
  }
  const add = c => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else e.append(c instanceof Node ? c : document.createTextNode(String(c))); };
  kids.forEach(add); return e;
}
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } } };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const NAMES = {
  seed: { basic: ['Садовое семя', 'всегда бесплатно'], select: ['Отборное семя', ''], rare: ['Редкое семя', ''], royal: ['Королевское семя', ''], myth: ['Мифическое семя', ''] },
  fert: { compost: 'Компост', bio: 'Био-удобрение', nectar: 'Нектар роста' },
  upg: { slot: ['Грядки', 'больше горшков'], tank: ['Бак', 'воды хватает дольше'], luck: ['Удача', 'чаще редкие семена'], nurs: ['Питомник', 'места для выкопанных'], lamp: ['Лампа роста', 'ночью растёт быстрее'], mulch: ['Мульча', 'меньше расход воды'], bk: ['Банк семян', '+2 места для гибридов'] },
  phase: { night: 'Ночь', dusk: 'Сумерки', day: 'День' },
};
const SHORT = { seed: { basic: 'Садовое', select: 'Отборное', rare: 'Редкое', royal: 'Королев.', myth: 'Мифич.' } };
const POTN = ['Глиняный горшок', 'Медный котёл', 'Стеклянный террариум', 'Каменная ваза', 'Золотая урна'];
const POTD = ['Без бонусов', 'Воды уходит на 15% меньше', 'Растёт на 10% быстрее', 'Терпит засуху на 50% дольше', 'Урожай дороже на 10%'];
const PETN = { fish: ['Рыбки', 'живут в аквариуме'], cat: ['Кошка', 'дремлет на окне'], dog: ['Собака', 'сторожит ковёр'], seal: ['Тюлень', 'плавает в аквариуме'] };
const PETO = ['fish', 'cat', 'dog', 'seal'];
const HOTS = { tank: [8, 96, 96, 46], cat: [44, 60, 22, 22], dog: [300, 160, 26, 24], book: [106, 104, 30, 20], lab: [304, 98, 30, 24], shelf: [326, 38, 58, 62] };

// ---------- звук и вибрация ----------
const SFX = {}; let sound = ls.get('pg_sound', true);
for (const n of ['click', 'click2', 'coin', 'select', 'notify', 'win']) { const a = new Audio('sfx/' + n + '.mp3'); a.preload = 'auto'; a.volume = 0.35; SFX[n] = a; }
const play = n => { if (!sound || !SFX[n]) return; try { SFX[n].currentTime = 0; SFX[n].play().catch(() => {}); } catch { /* */ } };
const vib = ms => { if (sound) try { navigator.vibrate && navigator.vibrate(ms); } catch { /* */ } };
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button')) { play('click'); vib(8); } });

// ---------- логотип ----------
const FONT = { P: [30, 17, 17, 30, 16, 16, 16], I: [14, 4, 4, 4, 4, 4, 14], X: [17, 17, 10, 4, 10, 17, 17], E: [31, 16, 16, 30, 16, 16, 31], L: [16, 16, 16, 16, 16, 16, 31], G: [14, 17, 16, 19, 17, 17, 14], A: [14, 17, 17, 31, 17, 17, 17], R: [30, 17, 17, 30, 20, 18, 17], D: [30, 17, 17, 17, 17, 17, 30], N: [17, 25, 21, 19, 17, 17, 17], ' ': [0, 0, 0, 0, 0, 0, 0] };
function logo(cv, dark) {
  const t = 'PIXEL GARDEN', cols = dark ? ['#b75b5f', '#493333', '#9c4351', '#493333'] : ['#ffd071', '#ffd7a8', '#e5b67f', '#ffd7a8'];
  cv.width = t.length * 6 + 1; cv.height = 8; const c = cv.getContext('2d');
  for (let pass = 1; pass >= 0; pass--) [...t].forEach((ch, i) => FONT[ch].forEach((row, y) => { for (let x = 0; x < 5; x++) if ((row >> (4 - x)) & 1) { c.fillStyle = pass ? (dark ? '#ffb347' : '#1d1424') : (y < 3 || dark ? cols[i % 4] : '#e5b67f'); c.fillRect(i * 6 + x + pass, y + pass, 1, 1); } }));
}

// ---------- сеть и состояние ----------
let token = null, cat = null, S = null, topData = null, topK = 'earned', banned = false, busy = false, SC = 3;
try { token = localStorage.getItem('pg_token'); } catch { /* приватный режим */ }
const sel = ls.get('pg_sel', { seed: 'basic', fert: 'compost' });
async function api(path, body) {
  const hd = { 'Content-Type': 'application/json' }; if (token) hd.Authorization = 'Bearer ' + token;
  const r = await fetch('/api/' + path, { method: 'POST', headers: hd, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Ошибка сети'); e.status = r.status; throw e; }
  j.at = Date.now(); return j;
}
function setToken(t) { token = t; try { if (t) localStorage.setItem('pg_token', t); else localStorage.removeItem('pg_token'); } catch { /* */ } }
const hourNow = () => (S ? (S.ph.hour + (Date.now() - S.at) / 3.6e6) % 24 : 12);
const left = p => (p && p.l != null ? Math.max(0, p.l - (Date.now() - S.at) / 1000) : null);
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let toastT;
function toast(m, kind) { const t = $('toast'); t.textContent = m; t.className = kind || ''; t.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => { t.style.display = 'none'; }, 2600); }
function overlay(content) { const o = $('overlay'); o.replaceChildren(content); o.hidden = false; return o; }
function closeOverlay() { $('overlay').hidden = true; $('overlay').replaceChildren(); document.removeEventListener('keydown', albumKeys); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && token) { if (!$('overlay').hidden) closeOverlay(); else closeSheet(); } });
function fail(e) { if (e.status === 401) { setToken(null); S = null; showAuth('Войдите снова'); } else if (e.status === 403) ban(e.message); else toast(e.message, 'err'); }
function ban(msg) { banned = true; S = null; overlay(h('div', { class: 'panel auth' }, h('h2', null, 'Доступ закрыт'), h('p', null, msg))); }

// Сервер присылает состояние раз в 2 с. Между ответами рост и воду «дорисовываем» по скорости с прошлого интервала.
let slotObj = [];
function setState(ns) {
  const old = S; S = ns;
  while (slotObj.length < ns.slots) slotObj.push({ rate: 0, wrate: 0, dg: 0, dw: 0, tint: 0 });
  ns.plants.forEach((p, i) => {
    const c = slotObj[i], o = old && old.plants[i], dt = old ? (ns.at - old.at) / 1000 : 0;
    if (!p || !o || o.seed !== p.seed) { c.rate = 0; c.wrate = 0; }
    else if (dt >= 0.8) { c.rate = p.g >= 1 ? 0 : Math.max(0, (p.g - o.g) / dt); c.wrate = p.w <= 0 ? 0 : Math.min(0, (p.w - o.w) / dt); }
  });
  render();
}
const dispG = (c, p) => (p.g >= 1 ? 1 : Math.min(0.9999, p.g + (c.rate || 0) * (Date.now() - S.at) / 1000));
const dispW = (c, p) => (p.w <= 0 ? 0 : Math.max(0, p.w + (c.wrate || 0) * (Date.now() - S.at) / 1000));

// ---------- миниатюры растений (для меню, лаборатории, альбома) ----------
const SKYT = ['#6cb4ea', '#86c6f0', '#a0d4f4', '#b8e0f8', '#cdeefb', '#dff2fb'];
function thumb(cv, p, skin = 0) {
  cv.width = 48; cv.height = 68; const c = cv.getContext('2d'), g = gen(p.seed, p.r), lim = p.g == null ? 1 : p.g;
  SKYT.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * 12, 48, 13); });
  c.fillStyle = '#7aa88a'; for (let x = 0; x < 48; x++) c.fillRect(x, 44 - Math.round(5 + 3 * Math.sin(x * 0.2 + 1)), 1, 12); c.fillStyle = '#4a8a52'; for (let x = 0; x < 48; x++) c.fillRect(x, 52 - Math.round(2 + Math.sin(x * 0.3)), 1, 4);
  c.fillStyle = '#6b4a2b'; c.fillRect(12, 53, 24, 2);
  for (const q of g.px) if (q.t <= lim) { c.fillStyle = p.x && q.l >= 0 ? DEADC[(q.x * 7 + q.y * 3) % 3] : q.c; c.fillRect(q.x, q.y, 1, 1); }
  drawPot(c, skin, 24, 52, 0, 0);
}
const kindOf = p => KINDS[gen(p.seed, p.r).kind];
const seedLabel = s => `${s.gn ? `Гибрид п.${s.gn}` : 'Семя'} · ${RN[s.r]} · ${kindOf(s)}`;

// ---------- эффекты: пиксельные частицы поверх сцены ----------
function fxAt(x, y, type, arg, rar) {
  if (reduced) return; const L = $('fxl'), k = SC / 3;
  const add = (cls, st, txt) => { const e = h('i', { class: cls }, txt || null); e.style.setProperty('--x', x + (st.ox || 0)); e.style.setProperty('--y', y + (st.oy || 0)); for (const [kk, v] of Object.entries(st)) if (kk[0] === '-') e.style.setProperty(kk, v); L.append(e); e.addEventListener('animationend', () => e.remove(), { once: true }); setTimeout(() => e.remove(), 1700); };
  const R = (a, b) => a + Math.random() * (b - a), burst = (n, cols, up, spread) => { for (let i = 0; i < n; i++) add('fp', { ox: R(-6, 6), '--c': cols[i % cols.length], '--dx': R(-spread, spread) * k + 'px', '--dy': -R(up * 0.4, up) * k + 'px', '--d': R(500, 900) + 'ms' }); };
  if (type === 'water') for (let i = 0; i < 10; i++) add('fp', { ox: R(-12, 12), oy: -24, '--c': i % 3 ? '#7fb8ff' : '#cfe8ff', '--dx': R(-6, 6) * k + 'px', '--dy': R(40, 70) * k + 'px', '--d': R(450, 800) + 'ms' });
  else if (type === 'plant') burst(9, ['#8fd860', '#5fae3c', '#b4f090'], 40, 18);
  else if (type === 'fert') burst(12, ['#ffd071', '#fff0a0', '#8fd860'], 50, 24);
  else if (type === 'dig') burst(10, ['#8a5a35', '#b9814f', '#5b3d2a'], 30, 22);
  else if (type === 'cross') burst(16, ['#ff9ac8', '#ffd071', '#9fe8ff', '#fff'], 60, 30);
  else if (type === 'coin') { add('ft', {}, `+${arg}`); burst(8, ['#ffd071', '#fff0a0', '#e8b830'], 44, 22); if (rar >= 2) for (let i = 0; i < 12 + rar * 4; i++) add('fp', { '--c': i % 2 ? RCL[rar] : '#fff', '--dx': R(-50, 50) * k + 'px', '--dy': R(-60, 20) * k + 'px', '--d': R(700, 1200) + 'ms' }); }
  else if (type === 'love') for (let i = 0; i < 5; i++) add('fp', { ox: R(-8, 8), '--c': '#ff6a8a', '--dx': R(-14, 14) * k + 'px', '--dy': -R(18, 40) * k + 'px', '--d': R(700, 1100) + 'ms' });
}
const slotXY = i => [SLOTPOS[i][0], SLOTPOS[i][1] - 40];

// ---------- сцена, интерактивные зоны, кадровый цикл ----------
let ctx = null, E = { hr: 12, tm: 0, reduced, slots: [], pots: [], pets: {}, love: {} }, hotEls = {}, slotHot = [], lastF = 0, shownCoins = 0;
function fitScale() {
  const vw = innerWidth, vh = innerHeight, mob = vw <= 760;
  SC = mob ? 2 : Math.max(2, Math.min(4, Math.floor(Math.min((vw - 30) / RW, (vh - 170) / RH))));
  document.documentElement.style.setProperty('--s', SC);
  if (mob && !fitScale.done) { fitScale.done = 1; $('stage').scrollLeft = Math.max(0, SLOTPOS[0][0] * SC - vw / 2); }
}
function buildHots() {
  const hots = $('hots'); hots.replaceChildren(); slotHot = []; hotEls = {};
  const mk = (cls, [x, y, w, hh], label, fn) => { const b = h('button', { class: 'hot ' + cls, 'aria-label': label, title: label, onclick: fn }, h('i', { class: 'badge', hidden: true })); for (const [k, v] of Object.entries({ x, y, w, h: hh })) b.style.setProperty('--' + k, v); hots.append(b); return b; };
  for (const i of [...Array(S.slots).keys()].sort((a, b) => SLOTPOS[a][1] - SLOTPOS[b][1])) { const [cx, ty] = SLOTPOS[i]; slotHot[i] = mk('slot', [cx - 24, ty - 67, 48, 70], 'Грядка ' + (i + 1), () => openPotMenu(i)); }
  hotEls.tank = mk('pethot', HOTS.tank, 'Аквариум', () => openPets()); hotEls.cat = mk('pethot', HOTS.cat, 'Кошка', () => petTap('cat')); hotEls.dog = mk('pethot', HOTS.dog, 'Собака', () => petTap('dog'));
  hotEls.book = mk('', HOTS.book, 'Книга растений', () => openBook()); hotEls.lab = mk('', HOTS.lab, 'Лаборатория селекции', () => openLab()); hotEls.shelf = mk('', HOTS.shelf, 'Лавка', () => openShop());
}
function badge(el, cls, text) { const b = el.firstChild; b.hidden = !cls; b.className = 'badge ' + (cls || ''); if (text) el.title = text; }
function updHots() {
  S.plants.forEach((p, i) => {
    const el = slotHot[i]; if (!el) return; const L = left(p), warn = !!p && !p.x && L != null && L <= cat.warn;
    badge(el, !p ? 'sprout' : p.x ? 'shovel' : p.g >= 1 ? 'basket' : warn ? 'drop warn' : L != null ? 'drop' : '', !p ? `Грядка ${i + 1}: пусто` : `${RN[p.r]} · ${kindOf(p)}`);
  });
  const gifts = id => (S.pets[id] ? S.pets[id].gifts : 0);
  badge(hotEls.cat, gifts('cat') ? 'coin' : (S.pets.cat && !S.pets.cat.fed ? 'bag warn' : ''), 'Кошка'); badge(hotEls.dog, gifts('dog') ? 'coin' : (S.pets.dog && !S.pets.dog.fed ? 'bag warn' : ''), 'Собака');
  badge(hotEls.tank, gifts('fish') + gifts('seal') ? 'coin' : '', 'Аквариум');
  hotEls.cat.style.display = S.pets.cat ? '' : 'none'; hotEls.dog.style.display = S.pets.dog ? '' : 'none';
}
function petEnv() { const o = {}; for (const id of PETO) if (S.pets[id]) o[id] = { fed: S.pets[id].fed > 0 }; return o; }
function frame(ts) {
  requestAnimationFrame(frame);
  if (document.hidden || !S || ts - lastF < 33) return; lastF = ts;
  const tm = Date.now(); E.hr = hourNow(); E.tm = tm; E.pots = S.slotPots; E.pets = petEnv();
  E.slots = slotObj.slice(0, S.slots).map((s, i) => { const p = S.plants[i]; s.p = p; if (p) { s.dg = dispG(s, p); s.dw = dispW(s, p); const L = left(p); s.tint = p.x || L == null ? 0 : Math.min(0.55, 0.55 * (1 - L / p.gr)); } return s; });
  renderRoom(ctx, E);
  if (shownCoins !== S.coins) { const d = S.coins - shownCoins, step = Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * 0.18)), prev = shownCoins; shownCoins = Math.abs(d) <= Math.abs(step) ? S.coins : shownCoins + step; $('coins').lastChild.textContent = shownCoins; if (shownCoins > prev && !reduced) { const cn = $('coins'); cn.classList.remove('bump'); void cn.offsetWidth; cn.classList.add('bump'); } }
}

// ---------- действия ----------
async function doAct(body, snd, msg, o = {}) {
  const prev = S && body.slot != null ? S.plants[body.slot] : null;
  try {
    setState(await api('act', body));
    if (snd && !o.quiet) play(snd);
    if (!o.nofx && body.slot != null) { const [x, y] = slotXY(body.slot); if (body.a === 'plant') fxAt(x, y, 'plant'); else if (body.a === 'water') { fxAt(x, y, 'water'); slotObj[body.slot].wob = Date.now(); } else if (body.a === 'harvest' && prev) { fxAt(x, y, 'coin', prev.v, prev.r); if (prev.r >= 3) play('win'); vib(25); } else if (body.a === 'fert') fxAt(x, y, 'fert'); else if (body.a === 'dig') fxAt(x, y, 'dig'); }
    if (msg && !o.quiet) toast(msg, 'ok'); return true;
  } catch (e) { fail(e); refresh(); return false; }
}
function waterNow(i) { const p = S.plants[i]; p.w = 1; p.l = null; slotObj[i].wrate = 0; slotObj[i].wob = Date.now(); const [x, y] = slotXY(i); fxAt(x, y, 'water'); render(); return doAct({ a: 'water', slot: i }, 'click2', null, { nofx: true }); }
async function bulk(kind) {
  if (busy || !S) return; busy = true;
  try {
    let n = 0, sum = 0;
    if (kind === 'water') { if (await doAct({ a: 'waterall' }, 'click2', null, { quiet: true })) { S.plants.forEach((p, i) => { if (p && !p.x) { const [x, y] = slotXY(i); fxAt(x, y, 'water'); slotObj[i].wob = Date.now(); } }); toast('Всё полито', 'ok'); } }
    else if (kind === 'harvest') {
      for (let i = 0; i < S.slots; i++) { const p = S.plants[i]; if (p && !p.x && p.g >= 1) { const v = p.v, r = p.r; if (await doAct({ a: 'harvest', slot: i }, null, null, { quiet: true, nofx: true })) { n++; sum += v; const [x, y] = slotXY(i); fxAt(x, y, 'coin', v, r); } else break; } }
      if (n) { play('coin'); vib(30); toast(`Собрано: ${n}, +${sum} монет`, 'ok'); } else toast('Пока нечего собирать');
    } else if (kind === 'plant') {
      const cost = (cat.seeds.find(x => x.id === sel.seed) || cat.seeds[0]).cost;
      for (let i = 0; i < S.slots; i++) if (!S.plants[i]) { if (S.coins < cost) { toast('Не хватило монет', 'err'); break; } if (await doAct({ a: 'plant', slot: i, seed: sel.seed }, null, null, { quiet: true, nofx: true })) { n++; const [x, y] = slotXY(i); fxAt(x, y, 'plant'); } else break; }
      if (n) { play('select'); toast(`Посажено: ${n}`, 'ok'); }
    }
  } finally { busy = false; }
}
function petTap(id) {
  const info = S.pets[id]; if (!info) return openPets();
  if (info.gifts > 0) return doAct({ a: 'gift', id }, 'coin', null, { nofx: true }).then(ok => { if (ok) { fxAt(HOTS[id][0] + 11, HOTS[id][1] - 6, 'coin', PETSG(id) * info.gifts, 0); } });
  if (!info.fed) { toast(`${PETN[id][0]} голодна — покормите её`, 'err'); return openPets(); }
  E.love[id] = Date.now(); fxAt(HOTS[id][0] + 11, HOTS[id][1], 'love'); play('select'); vib(15);
}
const PETSG = id => (cat.pets[id] ? cat.pets[id].gift : 0);

// ---------- панель справа / снизу ----------
let sheet = null;
function openSheet(id, title, build, extra = {}) { sheet = { id, title, build, key: null, ...extra }; $('sheet').hidden = false; markDock(); renderSheet(true); }
function closeSheet() { sheet = null; $('sheet').hidden = true; markDock(); }
function renderSheet(force) {
  if (!sheet || !S) return; const b = sheet.build(); if (!force && b.key === sheet.key) return; sheet.key = b.key;
  const sh = $('sheet'), old = sh.querySelector('.sh-body'), st = old ? old.scrollTop : 0;
  const body = h('div', { class: 'sh-body' }, b.nodes);
  sh.replaceChildren(h('div', { class: 'sh-head' }, h('h2', null, typeof sheet.title === 'function' ? sheet.title() : sheet.title), h('button', { class: 'btn alt', 'aria-label': 'Закрыть', onclick: closeSheet }, '✕')), body); body.scrollTop = st; tickSheet();
}
function tickSheet() { // таймеры и полоски внутри открытого меню грядки обновляются раз в секунду
  if (!sheet || sheet.id.slice(0, 3) !== 'pot') return; const i = sheet.slot, p = S.plants[i], c = slotObj[i], sh = $('sheet'); if (!p) return;
  const g = sh.querySelector('[data-bar=g]'), w = sh.querySelector('[data-bar=w]'), st = sh.querySelector('[data-st]'); if (!g) return;
  g.style.width = dispG(c, p) * 100 + '%'; w.style.width = (p.x ? 0 : dispW(c, p)) * 100 + '%';
  const L = left(p); let t, cls = ''; if (p.x) { t = 'Засохло'; cls = 'bad'; } else if (p.g >= 1) { t = 'Созрело! Можно собирать' + (p.xd ? ' (уже опыляли)' : ' или скрещивать'); cls = 'ok'; } else if (L != null) { t = `${L <= cat.warn ? 'Скоро засохнет' : 'Хочет пить'} · ${mmss(L)}`; cls = L <= cat.warn ? 'bad' : 'mid'; } else t = `Растёт · ${Math.floor(dispG(c, p) * 100)}%`;
  if (p.f && !p.x) t += ` · удобрено ×${p.f.m} (${mmss(Math.max(0, p.f.l - (Date.now() - S.at) / 1000))})`; st.textContent = t; st.className = 'st ' + cls;
}
const subTabs = (list, cur, set) => h('div', { class: 'sub' }, list.map(([k, l]) => h('button', { class: 'btn alt sm' + (cur === k ? ' on' : ''), onclick: () => { set(k); renderSheet(true); } }, l)));
const potIcon = skin => { const cv = h('canvas', { width: 44, height: 34 }), c = cv.getContext('2d'); c.translate(5, 2); drawPot(c, skin, 17, 4, 0, 0); return cv; };

// --- меню грядки ---
function openPotMenu(i) { openSheet('pot' + i, `Грядка ${i + 1}`, () => potMenu(i), { slot: i }); }
function potMenu(i) {
  const p = S.plants[i], skin = S.slotPots[i] || 0, fert = cat.fert.find(x => x.id === sel.fert) || cat.fert[0];
  const key = ['pot', i, S.coins, skin, S.skins, S.bank.length, S.nursery.length, S.nurseryCap, sel.fert, p ? [p.seed, p.g >= 1, p.x, p.l != null, p.xd, !!p.f, p.w > 0].join('|') : 'e'].join();
  const nodes = [];
  if (p) {
    const cv = h('canvas'), g = gen(p.seed, p.r); thumb(cv, p, skin);
    nodes.push(h('div', { class: 'pothead' }, cv, h('div', null, h('h3', { style: { color: RC[p.r] } }, `${RN[p.r]} · ${KINDS[g.kind]}`), h('small', null, `Палитра: ${g.pal}`), h('small', null, p.gn ? `Гибрид, поколение ${p.gn}` : 'Выращено из магазинного семени'), h('div', { class: 'bar grow' }, h('i', { 'data-bar': 'g' })), h('div', { class: 'bar water' }, h('i', { 'data-bar': 'w' })), h('div', { class: 'st', 'data-st': '1' }))));
    const A = [];
    if (p.x) A.push(h('button', { class: 'btn', onclick: () => doAct({ a: 'clear', slot: i }, 'click2') }, h('i', { class: 'ico shovel' }), 'Убрать'));
    else if (p.g >= 1) { A.push(h('button', { class: 'btn', onclick: () => doAct({ a: 'harvest', slot: i }, 'coin') }, h('i', { class: 'ico basket' }), `Собрать +${p.v}`)); A.push(h('button', { class: 'btn', disabled: !!p.xd, onclick: () => { labA = i; labB = -1; openLab(); } }, h('i', { class: 'ico flask' }), 'Скрестить')); }
    else {
      A.push(h('button', { class: 'btn', onclick: () => waterNow(i) }, h('i', { class: 'ico drop' }), 'Полить'));
      A.push(h('button', { class: 'btn', disabled: !!p.f || S.coins < fert.cost, onclick: () => doAct({ a: 'fert', slot: i, id: sel.fert }, 'select') }, h('i', { class: 'ico bag' }), p.f ? `Удобрено ×${p.f.m}` : `Удобрить −${fert.cost}`));
      A.push(h('button', { class: 'btn', disabled: S.nursery.length >= S.nurseryCap || S.coins < cat.rar[p.r].dig, onclick: () => doAct({ a: 'dig', slot: i }, 'click2') }, h('i', { class: 'ico shovel' }), `Выкопать −${cat.rar[p.r].dig}`));
      A.push(h('select', { 'aria-label': 'Удобрение', onchange: e => { sel.fert = e.target.value; ls.set('pg_sel', sel); renderSheet(true); } }, cat.fert.map(f => h('option', { value: f.id, selected: f.id === sel.fert }, `${NAMES.fert[f.id]} · ${f.cost}`))));
    }
    nodes.push(h('div', { class: 'acts' }, A));
  } else {
    nodes.push(h('div', { class: 'sec' }, 'Что посадить'));
    const list = h('div', { class: 'pick' });
    for (const sd of cat.seeds) { const od = oddsOf(sd.w, S.lv.luck); list.append(h('button', { class: 'pk', disabled: S.coins < sd.cost, onclick: () => { sel.seed = sd.id; ls.set('pg_sel', sel); doAct({ a: 'plant', slot: i, seed: sd.id }, 'select'); } }, h('span', null, NAMES.seed[sd.id][0], h('small', null, `редкое+ ${pctOf(od[2] + od[3] + od[4])}, эпик+ ${pctOf(od[3] + od[4])}`)), h('b', null, sd.cost || 'бесплатно'))); }
    S.bank.forEach((s, idx) => list.append(h('button', { class: 'pk', onclick: () => doAct({ a: 'plant', slot: i, bank: idx }, 'win') }, h('span', null, seedLabel(s), h('small', null, 'из банка семян')), h('b', null, 'бесплатно'))));
    nodes.push(list);
    if (S.nursery.length) { nodes.push(h('div', { class: 'sec' }, 'Из питомника')); S.nursery.forEach((n, idx) => nodes.push(h('button', { class: 'pk', onclick: () => doAct({ a: 'replant', idx, slot: i }, 'select') }, h('span', null, `${RN[n.r]} · ${kindOf(n)}`, h('small', null, `рост ${Math.floor(n.g * 100)}%`)), h('b', null, 'пересадить')))); }
  }
  nodes.push(h('div', { class: 'sec' }, `Горшок: ${POTN[skin]}`), h('p', { class: 'hint' }, POTD[skin]));
  const pots = h('div', { class: 'pots' });
  cat.skins.forEach((cost, id) => { const own = (S.skins >> id) & 1; pots.append(h('button', { class: 'pk pot' + (skin === id ? ' on' : ''), title: POTN[id] + ' — ' + POTD[id], disabled: !own && S.coins < cost, onclick: async () => { if (!own && !(await doAct({ a: 'skin', id }, 'win'))) return; doAct({ a: 'setpot', slot: i, id }, 'select'); } }, potIcon(id), h('span', null, skin === id ? 'надет' : own ? 'надеть' : cost))); });
  nodes.push(pots);
  return { key, nodes };
}
const oddsOf = (w, luck) => { const x = w.map((v, i) => v * (1 + 0.08 * luck) ** i), s = x.reduce((a, b) => a + b); return x.map(v => v / s * 100); };
const pctOf = v => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)) + '%';

// --- лавка ---
let shopSub = 'seeds';
function openShop() { openSheet('shop', 'Лавка', shopMenu); }
function shopMenu() {
  const key = ['shop', shopSub, S.coins, sel.seed, sel.fert, JSON.stringify(S.lv), S.skins, S.slots].join(), nodes = [subTabs([['seeds', 'Семена'], ['fert', 'Удобр.'], ['upg', 'Улучш.'], ['pots', 'Горшки']], shopSub, k => { shopSub = k; })];
  if (shopSub === 'seeds') {
    const box = h('div', { class: 'pick fade' });
    for (const sd of cat.seeds) { const od = oddsOf(sd.w, S.lv.luck); box.append(h('button', { class: 'pk' + (sel.seed === sd.id ? ' on' : ''), onclick: () => { sel.seed = sd.id; ls.set('pg_sel', sel); renderSheet(true); play('select'); } }, h('span', null, NAMES.seed[sd.id][0], h('small', null, `редкое+ ${pctOf(od[2] + od[3] + od[4])}, эпик+ ${pctOf(od[3] + od[4])}`)), h('b', null, sd.cost || 'бесплатно'))); }
    nodes.push(box, h('p', { class: 'hint' }, 'Выбранные семена сажает кнопка «Посадить» на панели. В пустой грядке можно выбрать любые. Редкие растения живут дольше, пьют меньше и стоят дороже, а ещё лучше подходят для селекции.'));
  } else if (shopSub === 'fert') {
    const box = h('div', { class: 'pick fade' });
    for (const f of cat.fert) box.append(h('button', { class: 'pk' + (sel.fert === f.id ? ' on' : ''), onclick: () => { sel.fert = f.id; ls.set('pg_sel', sel); renderSheet(true); play('select'); } }, h('span', null, NAMES.fert[f.id], h('small', null, `рост ×${f.m} на ${f.sec / 60} мин`)), h('b', null, f.cost)));
    nodes.push(box, h('p', { class: 'hint' }, 'Удобряют растение в меню грядки. Пока удобрение действует, второе применить нельзя.'));
  } else if (shopSub === 'upg') {
    const box = h('div', { class: 'fade' });
    for (const k of Object.keys(NAMES.upg)) { const meta = cat.upg[k], lv = S.lv[k], cost = lv >= meta.max ? null : meta.costs[lv - meta.from]; box.append(h('div', { class: 'up' }, h('div', { class: 'upn' }, NAMES.upg[k][0], h('small', null, ' — ' + NAMES.upg[k][1])), h('div', { class: 'pips' }, Array.from({ length: meta.max }, (_, i) => h('i', { class: i < lv ? 'on' : '' }))), h('button', { class: 'btn sm', disabled: cost == null || S.coins < cost, onclick: () => doAct({ a: 'upgrade', kind: k }, 'win') }, cost == null ? 'Максимум' : `Купить ${cost}`))); }
    nodes.push(box);
  } else {
    const box = h('div', { class: 'pick fade' });
    cat.skins.forEach((cost, id) => { const own = (S.skins >> id) & 1; box.append(h('button', { class: 'pk', disabled: own || S.coins < cost, onclick: () => doAct({ a: 'skin', id }, 'win') }, h('span', null, POTN[id], h('small', null, POTD[id])), h('b', null, own ? 'есть' : cost))); });
    nodes.push(box, h('p', { class: 'hint' }, 'Горшок надевают в меню грядки: у каждой грядки свой.'));
  }
  return { key, nodes };
}

// --- лаборатория селекции ---
let labA = -1, labB = -1;
function openLab() { openSheet('lab', 'Лаборатория селекции', labMenu); }
function labMenu() {
  const elig = S.plants.map((p, i) => (p && !p.x && p.g >= 1 && !p.xd ? i : -1)).filter(i => i >= 0);
  if (!elig.includes(labA)) labA = -1; if (!elig.includes(labB) || labB === labA) labB = -1;
  const key = ['lab', labA, labB, S.coins, JSON.stringify(S.bank), S.lv.bk, S.bankCap, elig.map(i => S.plants[i].seed).join(), S.slots, S.plants.filter(p => !p).length].join(), nodes = [];
  nodes.push(h('p', { class: 'hint' }, 'Скрестите два созревших растения (не собирайте их сразу): потомок унаследует форму, цвет и размер родителей, а иногда мутирует. Родители остаются в горшках, но опылять их можно только один раз.'));
  nodes.push(h('div', { class: 'sec' }, 'Выберите двух родителей'));
  const grid = h('div', { class: 'grid' });
  for (const i of elig) { const p = S.plants[i], cv = h('canvas'); thumb(cv, p, S.slotPots[i]); grid.append(h('button', { class: 'card' + (i === labA || i === labB ? ' on' : ''), onclick: () => { if (labA === i) labA = -1; else if (labB === i) labB = -1; else if (labA < 0) labA = i; else labB = i; renderSheet(true); play('select'); } }, cv, h('b', { style: { color: RC[p.r] } }, RN[p.r]), h('div', null, kindOf(p)), h('div', { class: 'hint' }, i === labA ? 'родитель A' : i === labB ? 'родитель B' : `грядка ${i + 1}`))); }
  nodes.push(elig.length ? grid : h('p', { class: 'hint' }, 'Пока нет созревших растений без опыления. Дождитесь роста и зайдите сюда снова.'));
  if (labA >= 0 && labB >= 0) {
    const A = S.plants[labA], B = S.plants[labB], cost = 20 * 2 ** Math.max(A.r, B.r), avg = (A.r + B.r) / 2;
    nodes.push(h('div', { class: 'sec' }, 'Скрещивание'), h('p', { class: 'hint' }, `Родители: ${RN[A.r]} × ${RN[B.r]}. Редкость потомка около «${RN[Math.max(0, Math.min(4, Math.round(avg)))]}»: бывает на ступень выше или ниже.`),
      h('button', { class: 'btn', disabled: S.coins < cost || S.bank.length >= S.bankCap, onclick: async () => { const [a, b] = [labA, labB]; if (await doAct({ a: 'cross', pa: a, pb: b }, 'win', 'Гибридное семя в банке!', { nofx: true })) { const [x, y] = slotXY(a); fxAt(x, y, 'cross'); const [x2, y2] = slotXY(b); fxAt(x2, y2, 'cross'); labA = labB = -1; renderSheet(true); } } }, h('i', { class: 'ico flask' }), `Скрестить −${cost}`));
  }
  nodes.push(h('div', { class: 'sec' }, `Банк семян ${S.bank.length}/${S.bankCap}`));
  if (!S.bank.length) nodes.push(h('p', { class: 'hint' }, 'Здесь появятся гибридные семена. Их можно посадить бесплатно в любую пустую грядку.'));
  const free = S.plants.findIndex(p => !p);
  S.bank.forEach((s, idx) => { const cv = h('canvas'); thumb(cv, { seed: s.seed, r: s.r, g: 1 }, 0); nodes.push(h('div', { class: 'row' }, cv, h('div', null, h('b', { style: { color: RC[s.r] } }, `${RN[s.r]} · ${kindOf(s)}`), h('div', null, `Гибрид, поколение ${s.gn}`, ` · ${gen(s.seed, s.r).pal}`), h('div', { class: 'btns' }, h('button', { class: 'btn alt sm', disabled: free < 0, onclick: () => doAct({ a: 'plant', slot: free, bank: idx }, 'win') }, free < 0 ? 'Нет места' : 'Посадить'), h('button', { class: 'btn alt sm', onclick: () => doAct({ a: 'bankdrop', idx }, 'click2') }, 'Выбросить'))))); });
  const bmeta = cat.upg.bk, bl = S.lv.bk, bcost = bl >= bmeta.max ? null : bmeta.costs[bl];
  nodes.push(h('button', { class: 'btn alt', style: { marginTop: '8px' }, disabled: bcost == null || S.coins < bcost, onclick: () => doAct({ a: 'upgrade', kind: 'bk' }, 'win') }, bcost == null ? 'Банк на максимуме' : `Расширить банк +2 места −${bcost}`));
  return { key, nodes };
}

// --- питомцы ---
function openPets() { openSheet('pets', 'Питомцы', petsMenu); }
function petsMenu() {
  const key = ['pets', S.coins, JSON.stringify(Object.fromEntries(Object.entries(S.pets).map(([k, v]) => [k, [v.fed > 0, v.gifts]])))].join(), nodes = [h('p', { class: 'hint' }, 'Питомцев нужно кормить. Пока они сыты, раз в несколько минут приносят монеты (копится до трёх подарков). Нажмите на кошку, собаку или аквариум в мастерской.')];
  for (const id of PETO) {
    const d = cat.pets[id], own = S.pets[id], cv = h('canvas', { class: 'petcv', width: 56, height: 48 }), c = cv.getContext('2d'), fr = id === 'fish' ? PET_SPR.fish[0][0] : PET_SPR[id][0];
    c.imageSmoothingEnabled = false; const k = Math.max(1, Math.floor(Math.min(54 / fr.width, 46 / fr.height))); c.drawImage(fr, Math.floor((56 - fr.width * k) / 2), Math.floor((48 - fr.height * k) / 2), fr.width * k, fr.height * k);
    const btns = h('div', { class: 'btns' });
    if (!own) btns.append(h('button', { class: 'btn alt sm', disabled: S.coins < d.cost, onclick: () => doAct({ a: 'buypet', id }, 'win') }, `Завести −${d.cost}`));
    else { btns.append(h('button', { class: 'btn alt sm', disabled: own.fed > 6 * 3600 || S.coins < d.feed, onclick: () => doAct({ a: 'feed', id }, 'select') }, `Покормить −${d.feed}`), h('button', { class: 'btn alt sm', disabled: !own.gifts, onclick: () => doAct({ a: 'gift', id }, 'coin', `+${own.gifts * d.gift} монет`) }, own.gifts ? `Подарок +${own.gifts * d.gift}` : 'Подарка нет')); }
    nodes.push(h('div', { class: 'row' }, cv, h('div', null, h('b', null, PETN[id][0]), h('div', null, own ? (own.fed > 0 ? `Сыт ещё ${Math.floor(own.fed / 3600)} ч ${Math.floor(own.fed % 3600 / 60)} мин` : 'Голоден') : PETN[id][1]), h('div', { class: 'hint' }, `Подарок: +${d.gift} монет раз в ${Math.round(d.every / 60)} мин`), btns)));
  }
  return { key, nodes };
}

// --- топ ---
function openTop() { openSheet('top', 'Лучшие садоводы', topMenu); loadTop(); }
function topMenu() {
  const key = ['top', topK, JSON.stringify(topData)].join(), nodes = [subTabs([['earned', 'Заработок'], ['harvests', 'Урожаи'], ['rare', 'Редкие']], topK, k => { topK = k; topData = null; loadTop(); })];
  const ol = h('ul', { class: 'rank fade' });
  (topData ? topData.top : []).forEach((t, i) => ol.append(h('li', null, h('span', null, i + 1 + '.'), h('button', { onclick: () => openBook(t.nick) }, t.nick), h('b', null, t.v))));
  if (!topData || !topData.top.length) ol.append(h('li', null, topData ? 'Пока никого — соберите урожай.' : 'Загрузка…'));
  nodes.push(ol); if (topData) nodes.push(h('p', { class: 'hint' }, `Игроков: ${topData.g.players} · урожаев: ${topData.g.harvests} · легендарных: ${topData.g.legend}`));
  return { key, nodes };
}
async function loadTop() { if (!token || banned) return; try { topData = await api('top', { k: topK }); if (sheet && sheet.id === 'top') renderSheet(); } catch { /* не критично */ } }

// --- настройки и аккаунт ---
let deferredInstall = null;
const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
let pushBusy = false;
async function togglePush() {
  if (pushBusy) return; pushBusy = true;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
    if (S.push) { const sb = await reg.pushManager.getSubscription(); if (sb) await sb.unsubscribe(); setState(await api('push/off')); toast('Уведомления выключены', 'ok'); }
    else { if ((await Notification.requestPermission()) !== 'granted') throw new Error('Разрешите уведомления для сайта в настройках браузера'); const { key } = await api('push/key'); let sb = await reg.pushManager.getSubscription(); if (!sb) sb = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) }); setState(await api('push/on', { endpoint: sb.endpoint })); toast('Уведомления включены', 'ok'); }
  } catch (e) { toast(e.message, 'err'); } finally { pushBusy = false; }
}
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; if (sheet && sheet.id === 'settings') renderSheet(true); });
function openSettings() { openSheet('settings', 'Меню', settingsMenu); }
function settingsMenu() {
  const key = ['set', sound, S.push, S.hasPass, !!deferredInstall, S.nick].join(), nodes = [], err = h('div', { class: 'err' });
  nodes.push(h('button', { class: 'btn alt', onclick: () => { sound = !sound; ls.set('pg_sound', sound); renderSheet(true); } }, sound ? 'Звук и вибрация: вкл' : 'Звук и вибрация: выкл'), h('div', { style: { height: '6px' } }),
    h('button', { class: 'btn alt', disabled: !canPush(), onclick: togglePush }, !canPush() ? 'Уведомления: нужен https' : S.push ? 'Уведомления: вкл' : 'Уведомлять о засыхании'));
  if (!matchMedia('(display-mode: standalone)').matches) nodes.push(h('div', { style: { height: '6px' } }), h('button', { class: 'btn alt', onclick: () => { if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; } else toast('Меню браузера → «Добавить на главный экран»'); } }, 'Установить как приложение'));
  nodes.push(h('div', { class: 'sec' }, S.hasPass ? 'Смена пароля' : 'Защитите аккаунт'));
  const old = h('input', { type: 'password', placeholder: 'Старый пароль', autocomplete: 'current-password', maxLength: 128 }), np = h('input', { type: 'password', placeholder: 'Пароль (от 8 символов)', autocomplete: 'new-password', maxLength: 128 }), nk = S.nick ? null : h('input', { placeholder: 'Ник', maxLength: 16 });
  nodes.push(h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, S.hasPass ? old : nk, np, err, h('button', { class: 'btn alt', onclick: async () => { err.textContent = ''; const had = S.hasPass; try { setState(await api(had ? 'passwd' : 'claim', had ? { old: old.value, pass: np.value } : { nick: nk ? nk.value : undefined, pass: np.value })); toast(had ? 'Пароль сохранён' : 'Аккаунт защищён', 'ok'); } catch (e) { err.textContent = e.message; } } }, S.hasPass ? 'Сменить пароль' : 'Защитить аккаунт')));
  nodes.push(h('div', { style: { height: '10px' } }), h('button', { class: 'btn alt', onclick: async () => { try { await api('logout'); } catch { /* */ } setToken(null); S = null; slotObj = []; closeSheet(); showAuth(); } }, 'Выйти из аккаунта'));
  return { key, nodes };
}

// ---------- книга-альбом с перелистыванием ----------
async function openBook(nick) {
  let P; try { P = await api('profile', nick === undefined ? {} : { nick }); } catch (e) { return fail(e); }
  closeSheet(); const single = innerWidth <= 760, st = P.stats, kv = (k, v) => h('div', { class: 'kv' }, h('span', null, k), h('b', null, v));
  const num = (n, t) => h('div', { class: 'num' }, `— ${n} / ${t} —`);
  const left1 = () => h('div', { class: 'pg l' }, h('h2', null, P.nick || 'Без ника'), h('div', null, h('span', { class: 'dotp' + (P.online ? ' on' : '') }), P.online ? 'сейчас в игре' : 'не в сети', ' · с ', new Date(P.since).toLocaleDateString('ru-RU')), h('h3', null, 'Статистика'), kv('Заработано', st.earned), kv('Урожаев', st.harvests), kv('Грядок', st.slots), kv('Потрачено', st.spent || 0), kv('Выкопано', st.dug || 0), kv('Засохло', st.wilt || 0), kv('Скрещиваний', st.cross || 0));
  const right1 = () => h('div', { class: 'pg r' }, h('h3', null, 'Выращено'), ...RN.map((n, i) => h('div', { class: 'kv' }, h('span', { style: { color: RC[i] } }, n), h('b', null, st.hr[i]))), h('h3', null, 'Сад сейчас'), h('div', { class: 'mini' }, P.garden.map((pl, i) => { const cv = h('canvas'); if (pl) thumb(cv, pl, P.slotPots[i] || 0); return pl ? cv : null; })), h('h3', null, 'Питомцы'), h('div', null, P.pets.length ? P.pets.map(id => PETN[id][0]).join(', ') : 'пока никого'));
  const photoPage = (items, side, from) => () => h('div', { class: 'pg ' + side }, h('h2', null, from === 0 || (single && from === 0) ? 'Гербарий' : ' '), h('div', { class: 'photos' }, items.map((g, k) => { const cv = h('canvas'); thumb(cv, { seed: g.seed, r: g.r, g: 1 }, 0); const rot = (((g.seed % 7) - 3) * 0.6).toFixed(1) + 'deg'; return h('div', { class: 'pol', style: { '--rot': rot } }, cv, h('div', { class: 'cap' }, `${RN[g.r]} · ${KINDS[gen(g.seed, g.r).kind]}`, h('br'), new Date(g.ts).toLocaleDateString('ru-RU'))); })));
  const empty = side => () => h('div', { class: 'pg ' + side }, h('div', { class: 'blank' }, side === 'l' ? 'Здесь появятся выращенные растения' : ''));
  const per = 6, G = P.gallery, spreads = [{ l: left1, r: right1 }];
  for (let i = 0; i < G.length; i += per * 2) spreads.push({ l: photoPage(G.slice(i, i + per), 'l', i + 1), r: G.length > i + per ? photoPage(G.slice(i + per, i + per * 2), 'r', i + per + 1) : empty('r') });
  if (!G.length) spreads.push({ l: empty('l'), r: empty('r') });
  const pages = single ? spreads.flatMap(s => [s.l, s.r]) : spreads, total = pages.length;
  const album = h('div', { class: 'album' + (single ? ' single' : '') }), withNum = (fn, n, t) => () => { const e = fn(); e.append(num(n, t)); return e; };
  let idx = 0, flipping = false;
  const pageNode = (i, side) => { const sp = pages[i]; if (!sp) return h('div', { class: 'pg ' + (side || 'r') }); const n = single ? i + 1 : (side === 'l' ? i * 2 + 1 : i * 2 + 2); return (single ? withNum(sp, n, total) : withNum(sp[side], n, total * 2))(); };
  const baseL = h('div', { class: 'base l' }), baseR = h('div', { class: 'base r' });
  const show = () => { if (single) { baseL.replaceChildren(pageNode(idx)); album.replaceChildren(baseL); } else { baseL.replaceChildren(pageNode(idx, 'l')); baseR.replaceChildren(pageNode(idx, 'r')); album.replaceChildren(baseL, baseR); } counter.textContent = `${idx + 1} / ${total}`; prevB.disabled = idx === 0; nextB.disabled = idx === total - 1; };
  const flip = dir => {
    const to = idx + dir; if (flipping || to < 0 || to >= total) return; flipping = true; play('select');
    const leaf = h('div', { class: 'leaf ' + (dir > 0 ? 'next' : 'prev') }), face = (cls, node) => h('div', { class: 'face ' + cls }, node);
    if (single) { baseL.replaceChildren(pageNode(dir > 0 ? to : idx)); leaf.append(face('front', pageNode(dir > 0 ? idx : to)), face('back', h('div', { class: 'pg l' }))); album.replaceChildren(baseL, leaf); if (dir < 0) { leaf.style.transition = 'none'; leaf.style.transform = 'rotateY(-180deg)'; void leaf.offsetWidth; leaf.style.transition = ''; requestAnimationFrame(() => { leaf.style.transform = 'rotateY(0deg)'; }); } else requestAnimationFrame(() => { leaf.style.transform = 'rotateY(-180deg)'; }); }
    else if (dir > 0) { baseR.replaceChildren(pageNode(to, 'r')); leaf.append(face('front', pageNode(idx, 'r')), face('back', pageNode(to, 'l'))); album.append(leaf); requestAnimationFrame(() => { leaf.style.transform = 'rotateY(-180deg)'; }); }
    else { baseL.replaceChildren(pageNode(to, 'l')); leaf.append(face('front', pageNode(idx, 'l')), face('back', pageNode(to, 'r'))); album.append(leaf); requestAnimationFrame(() => { leaf.style.transform = 'rotateY(180deg)'; }); }
    setTimeout(() => { idx = to; flipping = false; show(); }, reduced ? 30 : 880);
  };
  const prevB = h('button', { class: 'btn', 'aria-label': 'Назад', onclick: () => flip(-1) }, '◀'), nextB = h('button', { class: 'btn', 'aria-label': 'Вперёд', onclick: () => flip(1) }, '▶'), counter = h('span');
  let sx = null; album.addEventListener('pointerdown', e => { sx = e.clientX; }); album.addEventListener('pointerup', e => { if (sx != null && Math.abs(e.clientX - sx) > 40) flip(e.clientX < sx ? 1 : -1); sx = null; });
  albumKeys.fn = e => { if (e.key === 'ArrowRight') flip(1); else if (e.key === 'ArrowLeft') flip(-1); }; document.addEventListener('keydown', albumKeys);
  show();
  const o = overlay(h('div', { class: 'bookwrap' }, album, h('div', { class: 'bookbar' }, prevB, counter, nextB), h('button', { class: 'btn alt x', 'aria-label': 'Закрыть', onclick: closeOverlay }, '✕'))); o.onclick = e => { if (e.target === o) closeOverlay(); };
}
function albumKeys(e) { albumKeys.fn && albumKeys.fn(e); }

// ---------- вход ----------
function showAuth(msg) {
  let mode = 'login';
  const nick = h('input', { placeholder: 'Ник', maxLength: 16, autocomplete: 'username', autocapitalize: 'off', spellcheck: false, 'aria-label': 'Ник' }), pass = h('input', { type: 'password', placeholder: 'Пароль (от 8 символов)', maxLength: 128, autocomplete: 'current-password', 'aria-label': 'Пароль' });
  const err = h('div', { class: 'err' }, msg || ''), go = h('button', { class: 'btn', type: 'submit' }, 'Войти'), tLogin = h('button', { class: 'btn alt', type: 'button' }, 'Вход'), tReg = h('button', { class: 'btn alt', type: 'button' }, 'Регистрация');
  const setMode = m => { mode = m; go.textContent = m === 'login' ? 'Войти' : 'Создать аккаунт'; pass.autocomplete = m === 'login' ? 'current-password' : 'new-password'; tLogin.style.opacity = m === 'login' ? 1 : 0.6; tReg.style.opacity = m === 'reg' ? 1 : 0.6; err.textContent = ''; };
  tLogin.onclick = () => setMode('login'); tReg.onclick = () => setMode('reg'); setMode('login');
  const cv = h('canvas'); logo(cv, true);
  const form = h('form', { onsubmit: async e => { e.preventDefault(); err.textContent = ''; go.disabled = true; try { setToken((await api(mode === 'login' ? 'login' : 'signup', { nick: nick.value, pass: pass.value })).token); closeOverlay(); banned = false; await refresh(); play('win'); } catch (x) { err.textContent = x.message; } finally { go.disabled = false; } } },
    h('div', { class: 'row2' }, tLogin, tReg), nick, pass, err, go, h('p', { class: 'hint' }, 'Пароль нельзя восстановить автоматически: если забудете, попросите администратора сбросить его.'));
  overlay(h('div', { class: 'panel auth' }, cv, form)); nick.focus();
}

// ---------- нижняя панель, быстрые действия, список для телефона ----------
const DOCK = [['shop', 'shop', 'Лавка', openShop], ['lab', 'flask', 'Селекция', openLab], ['pets', 'paw', 'Питомцы', openPets], ['book', 'book', 'Книга', () => openBook()], ['top', 'trophy', 'Топ', openTop], ['set', 'gear', 'Меню', openSettings]];
function buildDock() { $('dock').replaceChildren(...DOCK.map(([k, ic, l, fn]) => h('button', { 'data-k': k, onclick: () => { if (sheet && (sheet.id === k || (k === 'set' && sheet.id === 'settings'))) closeSheet(); else fn(); } }, h('i', { class: 'ico ' + ic }), l))); }
function markDock() { const id = sheet ? sheet.id : ''; for (const b of $('dock').children) b.classList.toggle('on', b.dataset.k === id || (b.dataset.k === 'set' && id === 'settings') || (b.dataset.k === 'pets' && id === 'pets')); }
let quickSets = [];
function mkQuick() { const bw = h('button', { class: 'btn', onclick: () => bulk('water') }), bh = h('button', { class: 'btn', onclick: () => bulk('harvest') }), bp = h('button', { class: 'btn', onclick: () => bulk('plant') }); const el = h('div', { class: 'row2' }, bw, bh, bp); quickSets.push({ bw, bh, bp }); return el; }
function updQuick() {
  const ready = S.plants.filter(p => p && !p.x && p.g >= 1).length, empty = S.plants.filter(p => !p).length, thirsty = S.plants.some(p => p && !p.x), cost = (cat.seeds.find(x => x.id === sel.seed) || cat.seeds[0]).cost;
  const setB = (btn, ic, t) => { const k = ic + t; if (btn._k !== k) { btn._k = k; btn.replaceChildren(h('i', { class: 'ico ' + ic }), t); } };
  for (const q of quickSets) { setB(q.bw, 'drop', 'Полить'); q.bw.disabled = !thirsty; setB(q.bh, 'basket', `Собрать${ready ? ' ' + ready : ''}`); q.bh.disabled = !ready; setB(q.bp, 'sprout', `Посадить${empty ? ' ' + empty : ''}`); q.bp.disabled = !empty || S.coins < cost; }
}
let trayRows = [];
function updTray() {
  const tray = $('tray'); if (!tray.firstChild) { tray.append(h('div', { id: 'trayq' })); $('trayq').append(mkQuick()); }
  if (trayRows.length !== S.slots) { trayRows.forEach(r => r.el.remove()); trayRows = Array.from({ length: S.slots }, (_, i) => { const cv = h('canvas', { width: 48, height: 68 }), t1 = h('b'), t2 = h('div'), btn = h('button', { class: 'btn alt sm', onclick: () => trayMain(i) }), more = h('button', { class: 'btn alt sm', onclick: () => openPotMenu(i) }, 'Меню'), el = h('div', { class: 'row panel' }, cv, h('div', null, t1, t2, h('div', { class: 'btns' }, btn, more))); tray.append(el); return { el, cv, t1, t2, btn, sk: '' }; }); }
  S.plants.forEach((p, i) => { const r = trayRows[i], L = left(p), sk = p ? `${p.seed}|${Math.floor(p.g * 20)}|${p.x}` : 'e'; if (r.sk !== sk) { r.sk = sk; if (p) thumb(r.cv, p, S.slotPots[i]); else { r.cv.getContext('2d').clearRect(0, 0, 48, 68); } }
    r.t1.textContent = p ? `${RN[p.r]} · ${kindOf(p)}` : `Грядка ${i + 1}: пусто`; r.t1.style.color = p ? RC[p.r] : ''; r.t2.textContent = !p ? 'Посадите семя' : p.x ? 'Засохло' : p.g >= 1 ? 'Готово!' : L != null ? `Хочет пить · ${mmss(L)}` : `Растёт ${Math.floor(dispG(slotObj[i], p) * 100)}%`;
    const k = !p ? 'Посадить' : p.x ? 'Убрать' : p.g >= 1 ? `Собрать +${p.v}` : 'Полить'; if (r.btn.textContent !== k) r.btn.textContent = k; r.btn.disabled = !p && S.coins < (cat.seeds.find(x => x.id === sel.seed) || cat.seeds[0]).cost; });
}
function trayMain(i) { const p = S.plants[i]; if (!p) return doAct({ a: 'plant', slot: i, seed: sel.seed }, 'select'); if (p.x) return doAct({ a: 'clear', slot: i }, 'click2'); if (p.g >= 1) return doAct({ a: 'harvest', slot: i }, 'coin'); return waterNow(i); }

// ---------- цикл ----------
function render() {
  const ph = S.ph;
  $('clock').replaceChildren(h('i', { class: 'ico ' + (ph.name === 'night' ? 'moon' : 'sun') }), NAMES.phase[ph.name], h('span', { class: 'long' }, ` · рост ×${ph.gm} · вода ×${ph.wm}`), h('span', { class: 'short' }, ` ×${ph.gm}`));
  if (!slotHot.length || slotHot.length !== S.slots) buildHots();
  updHots(); updQuick(); updTray(); renderSheet();
  const ready = S.plants.filter(p => p && !p.x && p.g >= 1).length, warn = S.plants.some(p => p && !p.x && left(p) != null && left(p) <= cat.warn); document.title = (warn ? '⚠ ' : ready ? '✓ ' : '') + 'Pixel Garden';
  if (S.plants.every(p => !p) && !ls.get('pg_hint', false)) { ls.set('pg_hint', true); setTimeout(() => toast(innerWidth <= 760 ? 'Нажмите на пустую грядку. Сцену можно листать пальцем.' : 'Нажмите на пустой горшок на столе, чтобы посадить растение', 'ok'), 800); }
  if (!S.hasPass && !render.noted) { render.noted = 1; setTimeout(() => toast('Аккаунт без пароля: защитите его в меню', 'err'), 1500); }
}
async function refresh() { if (!token || banned) return; try { setState(await api('state')); } catch (e) { fail(e); } }
async function boot() {
  logo($('logo')); initArt(); ctx = $('roomcv').getContext('2d'); fitScale(); addEventListener('resize', fitScale); addEventListener('orientationchange', fitScale);
  $('hud').append(h('span', { class: 'chip', id: 'coins' }, h('i', { class: 'ico coin' }), h('b', null, '0')));
  buildDock(); quickSets = []; $('quick').append(mkQuick());
  try { cat = await api('catalog'); } catch { toast('Сервер недоступен', 'err'); return; }
  if (!token) showAuth(); else refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 2000); setInterval(() => { if (!document.hidden && sheet && sheet.id === 'top') loadTop(); }, 20000); setInterval(() => { if (S) { tickSheet(); updHots(); } }, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  requestAnimationFrame(frame);
}
boot();
