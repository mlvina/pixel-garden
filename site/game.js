'use strict';
// Клиент: только отрисовка и отправка намерений. Всё остальное (рост, вода, цены, редкость, ники, пароли) решает сервер.
const $ = id => document.getElementById(id);
function h(tag, props, ...kids) { // маленький помощник для DOM; текст всегда через textNode (никакого innerHTML)
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
const NAMES = {
  seed: { basic: ['Садовое семя', 'всегда бесплатно'], select: ['Отборное семя', ''], rare: ['Редкое семя', ''], royal: ['Королевское семя', ''], myth: ['Мифическое семя', ''] },
  fert: { compost: 'Компост', bio: 'Био-удобрение', nectar: 'Нектар роста' },
  upg: { slot: ['Грядки', 'больше горшков'], tank: ['Бак', 'воды хватает дольше'], luck: ['Удача', 'чаще редкие семена'], nurs: ['Питомник', 'места для выкопанных'], lamp: ['Лампа роста', 'ночью растёт быстрее'], mulch: ['Мульча', 'меньше расход воды'] },
  pot: ['Глиняный', 'Синяя глазурь', 'Золотой', 'Кристальный'], phase: { night: 'Ночь', dusk: 'Сумерки', day: 'День' },
};
const POTS = [['#c97a4a', '#e09a66', '#a85f38'], ['#4f86c6', '#7fb0e8', '#3b6aa0'], ['#e8b830', '#fff0a0', '#c08a18'], ['#6fd6e8', '#d8fbff', '#3aa5c0']];

// ---------- звук ----------
const SFX = {}; let sound = ls.get('pg_sound', true);
for (const n of ['click', 'click2', 'coin', 'select', 'notify', 'win']) { const a = new Audio('sfx/' + n + '.mp3'); a.preload = 'auto'; a.volume = 0.35; SFX[n] = a; }
const play = n => { if (!sound || !SFX[n]) return; try { SFX[n].currentTime = 0; SFX[n].play().catch(() => {}); } catch { /* */ } };
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button')) play('click'); });

// ---------- логотип: свой пиксельный шрифт 5×7 ----------
const FONT = { P: [30, 17, 17, 30, 16, 16, 16], I: [14, 4, 4, 4, 4, 4, 14], X: [17, 17, 10, 4, 10, 17, 17], E: [31, 16, 16, 30, 16, 16, 31], L: [16, 16, 16, 16, 16, 16, 31], G: [14, 17, 16, 19, 17, 17, 14], A: [14, 17, 17, 31, 17, 17, 17], R: [30, 17, 17, 30, 20, 18, 17], D: [30, 17, 17, 17, 17, 17, 30], N: [17, 25, 21, 19, 17, 17, 17], ' ': [0, 0, 0, 0, 0, 0, 0] };
function logo(cv, dark) { // dark — для светлой бумаги: тёмные буквы с золотой тенью
  const t = 'PIXEL GARDEN', cols = dark ? ['#b75b5f', '#493333', '#9c4351', '#493333'] : ['#ffd071', '#ffd7a8', '#e5b67f', '#ffd7a8'];
  cv.width = t.length * 6 + 1; cv.height = 8;
  const c = cv.getContext('2d');
  for (let pass = 1; pass >= 0; pass--) [...t].forEach((ch, i) => FONT[ch].forEach((row, y) => {
    for (let x = 0; x < 5; x++) if ((row >> (4 - x)) & 1) { c.fillStyle = pass ? (dark ? '#ffb347' : '#1d1424') : (y < 3 || dark ? cols[i % 4] : '#e5b67f'); c.fillRect(i * 6 + x + pass, y + pass, 1, 1); }
  }));
}

// ---------- сцена: небо по серверному времени суток ----------
function sky(hr) {
  if (hr >= 22 || hr < 6) return { n: 1, b: ['#0d0d2b', '#14143a', '#1c1b4a', '#26255c', '#302e6e', '#3a3880'] };
  if (hr < 8) return { b: ['#4a3a7a', '#7a4a8a', '#b85a86', '#e87a7a', '#ff9a6b', '#ffc27a'] };
  if (hr >= 20) return { b: ['#2f2a6a', '#523c88', '#8a4a8a', '#c9627e', '#f08a6a', '#ffb070'] };
  return { b: ['#3c9be0', '#58b0ea', '#74c3f0', '#92d3f5', '#b0e1f8', '#cdeefb'] };
}
function drawWin(cv, p, tm, hr, pot) {
  const c = cv.getContext('2d'), f = (x, y, w, hh, col) => { c.fillStyle = col; c.fillRect(x, y, w, hh); }, pal = sky(hr);
  pal.b.forEach((col, i) => f(0, i * 9, 48, 9, col));
  if (pal.n) {
    for (let i = 0; i < 14; i++) if ((((tm / 700) | 0) + i) % 5) f((i * 37 + 11) % 48, (i * 23 + 5) % 38, 1, 1, '#fff');
    const t = (((hr + 4) % 24) / 10), mx = 4 + t * 40, my = 26 - Math.sin(Math.PI * t) * 18; for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if ((x - 2.5) ** 2 + (y - 2.5) ** 2 <= 7 && (x - 4) ** 2 + (y - 1.5) ** 2 > 5.5) f(mx + x, my + y, 1, 1, '#f4f0c8');
  } else { const t = Math.min(1, Math.max(0, (hr - 6) / 14)), sx = 4 + t * 40, sy = 26 - Math.sin(Math.PI * t) * 18; f(sx - 1, sy - 1, 7, 7, 'rgba(255,230,120,.35)'); f(sx, sy, 5, 5, '#ffe27a'); f(sx + 1, sy + 1, 3, 3, '#fff6c0'); }
  const cc = pal.n ? '#2c2c66' : '#ffffff';
  [[0, 10, 9], [1, 24, 7], [2, 36, 8]].forEach(([o, y, w]) => { const x = (((tm / 1400 + o * 21) % 64) | 0) - 12; f(x, y, w, 2, cc); f(x + 2, y - 1, w - 4, 1, cc); });
  f(12, 53, 24, 1, '#3b2a1c');
  if (p) {
    const g = gen(p.seed, p.r), L = left(p), tint = p.x || L == null ? 0 : Math.min(0.55, 0.55 * (1 - L / cat.grace));
    if (g.aura && !p.x && p.g > 0.5) { c.fillStyle = g.aura; for (const [r2, a] of [[440, 0.05], [270, 0.06], [130, 0.07]]) { c.globalAlpha = a + 0.02 * Math.sin(tm / 450); for (let y = 6; y < 58; y++) for (let x = 2; x < 46; x++) if ((x - 24) ** 2 + (y - 33) ** 2 < r2) c.fillRect(x, y, 1, 1); } c.globalAlpha = 1; }
    for (const q of g.px) if (q.t <= p.g) {
      f(q.x, q.y, 1, 1, p.x ? ['#6b5a3a', '#5a4a30', '#7a6842'][(q.x * 7 + q.y * 3) % 3] : q.c);
      if (tint) f(q.x, q.y, 1, 1, `rgba(170,120,40,${tint})`);
    }
    if (!p.x && p.g >= 1) for (const s of g.sp) if ((((tm / 350) | 0) + s.o) % 3 === 0) {
      const k = RCL[p.r]; f(s.x, s.y, 1, 1, k);
      if (p.r >= 3) { f(s.x - 1, s.y, 1, 1, k); f(s.x + 1, s.y, 1, 1, k); f(s.x, s.y - 1, 1, 1, k); f(s.x, s.y + 1, 1, 1, k); }
    }
  }
  const P = POTS[pot] || POTS[0];
  f(11, 54, 26, 3, P[0]); f(11, 54, 26, 1, P[1]); f(13, 57, 22, 4, P[2]);
  if (pot === 3 && (((tm / 400) | 0) % 2)) { f(16, 58, 1, 1, '#fff'); f(30, 56, 1, 1, '#fff'); }
  f(0, 61, 48, 3, '#5b3d2a'); f(0, 61, 48, 1, '#7a5238');
}

// ---------- сеть ----------
let token = null, cat = null, S = null, topData = null, topK = 'earned', tab = 'shop', banned = false;
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
const left = p => (p && p.l != null ? Math.max(0, p.l - (Date.now() - S.at) / 1000) : null);
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const hourNow = () => (S ? (S.ph.hour + (Date.now() - S.at) / 3.6e6) % 24 : 12);
let toastT;
function toast(m, kind) { const t = $('toast'); t.textContent = m; t.className = kind || ''; t.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => { t.style.display = 'none'; }, 2600); }
function overlay(content) { const o = $('overlay'); o.replaceChildren(content); o.hidden = false; return o; }
function closeOverlay() { $('overlay').hidden = true; $('overlay').replaceChildren(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape' && token) closeOverlay(); });
function fail(e) { if (e.status === 401) { setToken(null); S = null; showAuth('Войдите снова'); } else if (e.status === 403) ban(e.message); else toast(e.message, 'err'); }
function ban(msg) { banned = true; S = null; overlay(h('div', { class: 'panel auth' }, h('h2', null, 'Доступ закрыт'), h('p', null, msg))); }

// ---------- вход и регистрация ----------
function showAuth(msg) {
  let mode = 'login';
  const nick = h('input', { placeholder: 'Ник', maxLength: 16, autocomplete: 'username', 'aria-label': 'Ник' });
  const pass = h('input', { type: 'password', placeholder: 'Пароль (от 8 символов)', maxLength: 128, autocomplete: 'current-password', 'aria-label': 'Пароль' });
  const err = h('div', { class: 'err' }, msg || ''), go = h('button', { class: 'btn', type: 'submit' }, 'Войти');
  const tLogin = h('button', { class: 'btn alt on', type: 'button' }, 'Вход'), tReg = h('button', { class: 'btn alt', type: 'button' }, 'Регистрация');
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

// ---------- сад ----------
let cards = [];
function mkCard(i) {
  const cv = h('canvas', { class: 'plot', width: 48, height: 64 }), win = h('div', { class: 'win' }, cv), nm = h('div', { class: 'nm' }), st = h('div', { class: 'st' });
  const bw = h('div', { class: 'bar water' }, h('i')), bg = h('div', { class: 'bar grow' }, h('i'));
  const main = h('button', { class: 'btn', onclick: () => onMain(i) }), fert = h('button', { class: 'btn alt sm', onclick: () => doAct({ a: 'fert', slot: i, id: sel.fert }, 'select') }), dig = h('button', { class: 'btn alt sm', onclick: () => doAct({ a: 'dig', slot: i }, 'click2') });
  const d = h('div', { class: 'card panel' }, win, nm, st, h('div', { class: 'bars' }, bw, bg), main, h('div', { class: 'row2' }, fert, dig));
  return { d, cv, win, nm, st, bw: bw.firstChild, bg: bg.firstChild, main, fert, dig };
}
function onMain(i) {
  const p = S.plants[i];
  if (!p) return doAct({ a: 'plant', slot: i, seed: sel.seed }, 'select');
  if (p.x) return doAct({ a: 'clear', slot: i }, 'click2');
  if (p.g >= 1) return doAct({ a: 'harvest', slot: i }, 'coin', `+${p.v} монет`);
  return doAct({ a: 'water', slot: i }, 'click');
}
async function doAct(body, snd, msg) {
  try { S = await api('act', body); render(); play(snd); if (msg) toast(msg, 'ok'); return true; }
  catch (e) { fail(e); return false; }
}
function cardStatus(i) {
  const p = S.plants[i], c = cards[i], L = left(p);
  let t = 'Пустая грядка', cls = '';
  if (p) {
    if (p.x) { t = 'Засохло'; cls = 'bad'; }
    else if (p.g >= 1) { t = 'Готово! Можно собирать'; cls = 'ok'; }
    else if (L != null) { t = L <= cat.warn ? `Скоро засохнет · ${mmss(L)}` : `Хочет пить · ${mmss(L)}`; cls = L <= cat.warn ? 'bad' : 'mid'; }
    else t = `Растёт · ${Math.floor(p.g * 100)}%`;
    if (p.f && !p.x) t += ` · удобрено ×${p.f.m} (${mmss(p.f.l)})`;
  }
  if (c.st.textContent !== t) c.st.textContent = t;
  c.st.className = 'st ' + cls;
  const w = !!p && !p.x && L != null && L <= cat.warn;
  if (w && !c.warned && document.visibilityState === 'visible') play('notify');
  c.warned = w;
  c.d.classList.toggle('warn', w);
}
function renderCards() {
  if (cards.length !== S.slots) { $('garden').replaceChildren(); cards = Array.from({ length: S.slots }, (_, i) => mkCard(i)); $('garden').append(banner(), ...cards.map(c => c.d)); }
  const seed = cat.seeds.find(x => x.id === sel.seed) || cat.seeds[0], fert = cat.fert.find(x => x.id === sel.fert) || cat.fert[0];
  S.plants.forEach((p, i) => {
    const c = cards[i], grow = !!p && !p.x && p.g < 1;
    c.nm.textContent = p ? RN[p.r] : '—'; c.nm.style.color = p ? RC[p.r] : '';
    c.win.style.setProperty('--rc', p ? RCL[p.r] : 'transparent'); c.d.classList.toggle('glow', !!p && p.r >= 3 && !p.x);
    c.bw.style.width = (p && !p.x ? p.w * 100 : 0) + '%'; c.bg.style.width = (p ? p.g * 100 : 0) + '%';
    c.main.textContent = !p ? `Посадить${seed.cost ? ' −' + seed.cost : ''}` : p.x ? 'Убрать' : p.g >= 1 ? `Собрать +${p.v}` : 'Полить';
    c.main.disabled = !p && S.coins < seed.cost;
    c.fert.style.visibility = c.dig.style.visibility = grow ? 'visible' : 'hidden';
    if (grow) {
      c.fert.textContent = p.f ? `Удобрено ×${p.f.m}` : `Удобрить −${fert.cost}`; c.fert.disabled = !!p.f || S.coins < fert.cost;
      c.dig.textContent = `Выкопать −${cat.rar[p.r].dig}`; c.dig.disabled = S.nursery.length >= S.nurseryCap || S.coins < cat.rar[p.r].dig;
    }
    cardStatus(i);
  });
}
function banner() {
  const b = h('div', { class: 'panel note', id: 'legacy', hidden: !S || S.hasPass, style: { gridColumn: '1/-1' } }, 'Ваш аккаунт без пароля: он пропадёт при очистке браузера. ', h('button', { class: 'btn alt sm', style: { width: 'auto', marginTop: '6px' }, onclick: () => openProfile() }, 'Защитить аккаунт'));
  return b;
}

// ---------- боковая панель ----------
let shop = null, nurKey = '', nurRows = [];
const odds = (w, luck) => { const x = w.map((v, i) => v * (1 + 0.08 * luck) ** i), s = x.reduce((a, b) => a + b); return x.map(v => v / s * 100); };
const pct = v => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)) + '%';
function buildShop() {
  const s = { seeds: {}, ferts: {}, ups: {}, pots: [] };
  s.all = h('button', { class: 'btn', onclick: () => doAct({ a: 'waterall' }, 'click2') }, 'Полить всё');
  const seedBox = h('div', { class: 'pick' }), fertBox = h('div', { class: 'pick' }), upBox = h('div'), potBox = h('div', { class: 'pots' });
  for (const sd of cat.seeds) {
    const price = h('b'), sub = h('small'), r = h('button', { class: 'pk', onclick: () => { sel.seed = sd.id; ls.set('pg_sel', sel); render(); play('select'); } }, h('span', null, NAMES.seed[sd.id][0], sub), price);
    seedBox.append(r); s.seeds[sd.id] = { r, price, sub };
  }
  for (const f of cat.fert) {
    const r = h('button', { class: 'pk', onclick: () => { sel.fert = f.id; ls.set('pg_sel', sel); render(); play('select'); } }, h('span', null, NAMES.fert[f.id], h('small', null, `рост ×${f.m} на ${f.sec / 60} мин`)), h('b', null, f.cost));
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
  s.hint = h('p', { class: 'hint' });
  s.root = h('div', null, s.all, h('div', { class: 'sec' }, 'Что сажать'), seedBox, h('div', { class: 'sec' }, 'Удобрение (кнопка на грядке)'), fertBox, h('div', { class: 'sec' }, 'Улучшения'), upBox, h('div', { class: 'sec' }, 'Горшки'), potBox, h('div', { class: 'sec' }, 'Настройки'), s.nb, h('div', { style: { height: '6px' } }), s.sb, s.hint);
  return s;
}
function updShop() {
  for (const sd of cat.seeds) {
    const o = shop.seeds[sd.id], od = odds(sd.w, S.lv.luck);
    o.r.classList.toggle('on', sel.seed === sd.id); o.price.textContent = sd.cost ? sd.cost : 'бесплатно';
    o.sub.textContent = sd.cost ? `редкое+ ${pct(od[2] + od[3] + od[4])}, эпик+ ${pct(od[3] + od[4])}` : `редкое+ ${pct(od[2] + od[3] + od[4])} · всегда бесплатно`; o.r.disabled = S.coins < sd.cost && false;
  }
  for (const f of cat.fert) shop.ferts[f.id].classList.toggle('on', sel.fert === f.id);
  for (const [k, u] of Object.entries(shop.ups)) {
    const meta = cat.upg[k], lv = S.lv[k], cost = lv >= meta.max ? null : meta.costs[lv - meta.from];
    u.dots.forEach((d, i) => { d.className = i < lv - (k === 'slot' ? 0 : 0) ? 'on' : ''; });
    u.b.textContent = cost == null ? 'Максимум' : `Купить ${cost}`; u.b.disabled = cost == null || S.coins < cost;
    if (k === 'lamp') u.b.title = `Ночью рост ×${Math.min(0.7, 0.2 + 0.1 * lv).toFixed(1)}`;
  }
  cat.skins.forEach((cost, i) => { const own = (S.skins >> i) & 1, p = shop.pots[i]; p.lab.textContent = S.pot === i ? 'надет' : own ? 'надеть' : cost; p.b.classList.toggle('on', S.pot === i); p.b.disabled = !own && S.coins < cost; });
  shop.nb.textContent = !canPush() ? 'Уведомления: нужен https' : S.push ? 'Уведомления: вкл' : 'Уведомлять о засыхании'; shop.nb.disabled = !canPush();
  shop.sb.textContent = sound ? 'Звук: вкл' : 'Звук: выкл';
  shop.hint.textContent = `Без воды растение засыхает через ${cat.grace / 60} мин (уведомление — за ${cat.warn / 60} мин). Ночью рост ×${S.ph.name === 'night' ? S.ph.gm : Math.min(0.7, 0.2 + 0.1 * S.lv.lamp).toFixed(1)}, но воды уходит почти в 10 раз меньше.`;
}
function updNursery(root) {
  const key = JSON.stringify(S.nursery) + S.nurseryCap;
  if (key !== nurKey) {
    nurKey = key; nurRows = [];
    root.replaceChildren(h('div', { class: 'sec' }, `Питомник ${S.nursery.length}/${S.nurseryCap}`), h('p', { class: 'hint' }, 'Лопата убирает растение из горшка с сохранением роста. Цена зависит от редкости. Пересадить можно в любую свободную грядку.'));
    S.nursery.forEach((p, idx) => {
      const cv = h('canvas', { width: 48, height: 64 }), b = h('button', { class: 'btn alt sm', onclick: () => doAct({ a: 'replant', idx }, 'select') }, 'Посадить'), dr = h('button', { class: 'btn alt sm', onclick: () => doAct({ a: 'drop', idx }, 'click2') }, 'Выбросить');
      root.append(h('div', { class: 'nrow' }, cv, h('div', null, h('b', { style: { color: RC[p.r] } }, RN[p.r]), h('div', null, `рост ${Math.floor(p.g * 100)}%`), h('div', { class: 'row2' }, b, dr))));
      nurRows.push({ cv, p, b });
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
    side.replaceChildren(h('div', { class: 'tabs', id: 'tabs' }, ...[['shop', 'Лавка'], ['nursery', 'Питомник'], ['top', 'Топ']].map(([k, l]) => h('button', { class: 'btn', 'data-k': k, onclick: () => { tab = k; nurKey = ''; renderSide(); if (k === 'top') loadTop(); } }, l))), h('div', { class: 'panel', id: 'pane' }));
    shop = buildShop();
  }
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.k === tab);
  const pane = $('pane');
  if (tab === 'shop') { if (pane.firstChild !== shop.root) pane.replaceChildren(shop.root); updShop(); }
  else if (tab === 'nursery') updNursery(pane);
  else updTop(pane);
}

// ---------- профиль-«книга» ----------
async function openProfile(nick) {
  let P;
  try { P = await api('profile', nick === undefined ? {} : { nick }); } catch (e) { return fail(e); }
  const st = P.stats, kv = (k, v) => h('div', { class: 'kv' }, h('span', null, k), h('b', null, v));
  const mini = (pl, size) => { const cv = h('canvas', { width: 48, height: 64 }); drawWin(cv, pl, 0, 12, P.pot); return cv; };
  const lp = h('div', { class: 'page l' }, h('h2', null, P.nick || 'Без ника'), h('div', null, h('span', { class: 'dot' + (P.online ? ' on' : '') }), P.online ? 'сейчас в игре' : 'не в сети', ' · с ', new Date(P.since).toLocaleDateString('ru-RU')),
    h('h3', null, 'Статистика'), kv('Заработано', st.earned), kv('Урожаев', st.harvests), kv('Грядок', st.slots), kv('Потрачено', st.spent || 0), kv('Выкопано', st.dug || 0), kv('Засохло', st.wilt || 0),
    h('h3', null, 'Выращено'), ...RN.map((n, i) => h('div', { class: 'kv' }, h('span', { style: { color: RC[i] } }, n), h('b', null, st.hr[i]))),
    h('h3', null, 'Сад сейчас'), h('div', { class: 'mini' }, P.garden.map(pl => (pl ? mini(pl) : h('canvas', { width: 48, height: 64 })))));
  if (P.self) lp.append(accountForm());
  const gal = h('div', { class: 'gal' }, P.gallery.map(g => { const cv = h('canvas', { width: 48, height: 64 }); drawWin(cv, { seed: g.seed, r: g.r, g: 1, x: false }, 0, 12, P.pot); return h('div', { class: 'win', title: `${RN[g.r]} · ${new Date(g.ts).toLocaleDateString('ru-RU')}`, style: { '--rc': RCL[g.r] } }, cv); }));
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
    try { S = await api(S.hasPass ? 'passwd' : 'claim', S.hasPass ? { old: old.value, pass: np.value } : { nick: nk ? nk.value : undefined, pass: np.value }); render(); toast(S.hasPass ? 'Пароль сохранён' : 'Аккаунт защищён', 'ok'); closeOverlay(); }
    catch (e) { err.textContent = e.message; }
  } }, S.hasPass ? 'Сменить пароль' : 'Защитить аккаунт');
  return h('div', null, h('h3', null, 'Аккаунт'), S.hasPass ? old : nk, np, err, btn,
    h('button', { class: 'btn alt', style: { marginTop: '6px' }, onclick: async () => { try { await api('logout'); } catch { /* */ } setToken(null); S = null; cards = []; $('garden').replaceChildren(); $('side').replaceChildren(); shop = null; closeOverlay(); showAuth(); } }, 'Выйти'));
}

// ---------- уведомления ----------
const canPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0));
let pushBusy = false;
async function togglePush() {
  if (pushBusy) return; pushBusy = true;
  try {
    const reg = await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready;
    if (S.push) { const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); S = await api('push/off'); toast('Уведомления выключены', 'ok'); }
    else {
      if ((await Notification.requestPermission()) !== 'granted') throw new Error('Разрешите уведомления для сайта в настройках браузера');
      const { key } = await api('push/key'); let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(key) });
      S = await api('push/on', { endpoint: sub.endpoint }); toast('Уведомления включены', 'ok');
    }
    render();
  } catch (e) { toast(e.message, 'err'); } finally { pushBusy = false; }
}

// ---------- общий цикл ----------
function render() {
  $('coins').lastChild.textContent = S.coins;
  const ph = S.ph; $('clock').textContent = `${NAMES.phase[ph.name]} · рост ×${ph.gm} · вода ×${ph.wm}`;
  const lg = $('legacy'); if (lg) lg.hidden = S.hasPass;
  renderCards(); renderSide();
}
async function refresh() {
  if (!token || banned) return;
  try { S = await api('state'); render(); } catch (e) { fail(e); }
}
async function boot() {
  logo($('logo'));
  $('hud').append(h('span', { class: 'chip', id: 'coins' }, h('i', { class: 'ic' }), h('b', null, '0')),
    h('button', { class: 'btn hud-btn', onclick: () => openProfile() }, 'Профиль'));
  try { cat = await api('catalog'); } catch { toast('Сервер недоступен', 'err'); return; }
  if (!token) showAuth(); else refresh();
  setInterval(refresh, 2000); setInterval(loadTop, 20000);
  setInterval(() => { if (!S) return; const hr = hourNow(), tm = Date.now(); S.plants.forEach((p, i) => cards[i] && drawWin(cards[i].cv, p, tm, hr, S.pot)); }, 200);
  setInterval(() => { if (!S) return; S.plants.forEach((_, i) => cards[i] && cardStatus(i)); nurRows.forEach(r => drawWin(r.cv, r.p, 0, hourNow(), S.pot)); }, 1000);
}
boot();
