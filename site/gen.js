'use strict';
// Процедурная генерация растений: по seed (его выдаёт сервер) строится набор пикселей с «временем появления» t∈[0,1].
// Зрелость g открывает пиксели по порядку — растение растёт на глазах. 9 видов × палитры по редкости × случайные параметры.
const RN = ['Обычное', 'Необычное', 'Редкое', 'Эпическое', 'Легендарное'];
const RC = ['#8a7a6a', '#4f9a3c', '#3a7bd5', '#a24bd0', '#e08a00']; // цвета редкости (читаются на светлой бумаге)
const RCL = ['#c8b8a8', '#8fdc6a', '#7fc0ff', '#d58cff', '#ffd071']; // светлые версии — для искр и свечения
const KINDS = ['Дерево', 'Цветок', 'Кактус', 'Гриб', 'Папоротник', 'Пальма', 'Бамбук', 'Суккулент', 'Куст'];
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hsl = (h, s, l) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s)}% ${Math.round(l)}%)`;
const cache = new Map();

function makePalette(R, rar) { // палитра зависит от редкости: чем реже, тем необычнее цвета
  const pick = a => a[(R() * a.length) | 0], g = 70 + R() * 80, wood = hsl(22 + R() * 10, 35, 26 + R() * 8);
  const name = pick([['green'], ['green', 'autumn'], ['frost', 'blossom', 'green'], ['neon', 'ember', 'frost'], ['gold', 'cosmic', 'prism']][rar]);
  const P = { name, stem: hsl(g, 45, 28), L: hsl(g + R() * 30 - 15, 55, 38), L2: hsl(g + R() * 30 - 15, 60, 50), A: hsl(R() * 360, 75, 60), A2: hsl(40 + R() * 20, 90, 55), wood, aura: null, rainbow: false };
  if (name === 'autumn') { const h = 8 + R() * 35; Object.assign(P, { stem: hsl(30, 40, 28), L: hsl(h, 72, 44), L2: hsl(h + 18, 80, 58), A: hsl(h + 200, 50, 60) }); }
  if (name === 'frost') { const h = 170 + R() * 30; Object.assign(P, { stem: hsl(h, 35, 32), L: hsl(h, 55, 48), L2: hsl(h + 10, 60, 72), A: hsl(h + 30, 40, 88), A2: '#ffffff' }); }
  if (name === 'blossom') { const h = 320 + R() * 30; Object.assign(P, { stem: hsl(100, 35, 30), L: hsl(h, 60, 62), L2: hsl(h + 8, 75, 78), A: hsl(h - 20, 80, 70), A2: '#fff4c2' }); }
  if (name === 'neon') { const h = 265 + R() * 60; Object.assign(P, { stem: hsl(h, 40, 25), L: hsl(h, 80, 50), L2: hsl(h + 40, 90, 62), A: hsl(h + 140, 95, 62), A2: '#7ffcff', aura: RCL[3] }); }
  if (name === 'ember') { Object.assign(P, { stem: hsl(10, 40, 20), L: hsl(8 + R() * 14, 80, 40), L2: hsl(30 + R() * 14, 95, 55), A: '#ffd05a', A2: '#fff0a8', aura: '#ff8a4a' }); }
  if (name === 'gold') { Object.assign(P, { stem: hsl(36, 55, 32), L: hsl(42, 85, 50), L2: hsl(50, 95, 68), A: '#fff6c8', A2: '#ffffff', aura: RCL[4] }); }
  if (name === 'cosmic') { Object.assign(P, { stem: hsl(250, 45, 22), L: hsl(255 + R() * 30, 70, 38), L2: hsl(300 + R() * 30, 80, 55), A: '#9fe8ff', A2: '#ffffff', aura: '#b99cff' }); }
  if (name === 'prism') { P.rainbow = true; P.aura = '#ffffff'; P.stem = hsl(R() * 360, 40, 35); }
  P.leaf = () => (P.rainbow ? hsl(R() * 360, 80, 58) : R() < 0.5 ? P.L : P.L2);
  return P;
}

function gen(seed, rar) {
  const key = seed + '|' + rar;
  if (cache.has(key)) return cache.get(key);
  const R = rng(seed), px = [], W = 48, B = 53, pal = makePalette(R, rar);
  const put = (x, y, c, t, l = 0) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y <= B) px.push({ x, y, c, t, l }); };
  const line = (x0, y0, x1, y1, c, t0, t1, l = 0) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) { const k = i / n; put(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, c, t0 + (t1 - t0) * k, l); }
  };
  const blob = (cx, cy, rad, c, t, l = 1) => {
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++)
      if (x * x + y * y <= rad * rad + rad * 0.5) put(cx + x, cy + y, c, t + R() * 0.05, l);
  };
  const arc = (x0, y0, ang, len, droop, c, t0, t1, leaflets, lc) => { // дуга-лист (папоротник, пальма)
    let px0 = x0, py0 = y0; const N = Math.ceil(len);
    for (let i = 1; i <= N; i++) {
      const s = i / N, x = x0 + Math.sin(ang) * len * s, y = y0 - Math.cos(ang) * len * s + droop * s * s;
      line(px0, py0, x, y, c, t0 + (t1 - t0) * (i - 1) / N, t0 + (t1 - t0) * s, 1);
      if (leaflets && i % 2 === 0 && s < 0.97) { const k = 1 + (1 - s) * leaflets; put(x + k, y + 1, lc(), t0 + (t1 - t0) * s, 1); put(x - k, y + 1, lc(), t0 + (t1 - t0) * s, 1); }
      px0 = x; py0 = y;
    }
    return [px0, py0];
  };
  const kind = (R() * KINDS.length) | 0, sc = 0.95 + R() * 0.35;

  if (kind === 0) { // дерево
    const D = 3 + ((R() * 2) | 0), sp = 0.35 + R() * 0.45, fruit = R() < 0.4, cr = 2 + ((R() * 2) | 0);
    const br = (x, y, a, len, d) => {
      const t0 = d * 0.8 / (D + 1), t1 = (d + 1) * 0.8 / (D + 1), x1 = x + Math.sin(a) * len, y1 = y - Math.cos(a) * len;
      line(x, y, x1, y1, pal.wood, t0, t1); if (d === 0) line(x + 1, y, x1 + 1, y1, pal.wood, t0, t1);
      if (d >= D - 1) { blob(x1, y1, d === D ? cr + 1 : cr, pal.leaf(), 0.8 + R() * 0.15); if (fruit && d === D) put(x1 + 1, y1 + 2, pal.A, 0.95, 2); }
      if (d < D) { const n = 2 + (R() < 0.3 ? 1 : 0); for (let i = 0; i < n; i++) br(x1, y1, a + (i - (n - 1) / 2) * sp * 2 + (R() - 0.5) * 0.3, len * 0.76, d + 1); }
    };
    br(24, B, (R() - 0.5) * 0.2, (9 + R() * 3) * sc, 0);
  } else if (kind === 1) { // цветок (иногда подсолнух)
    const h = (22 + R() * 18) * sc, amp = (R() - 0.5) * 10, fr = 1 + R() * 1.5, N = Math.ceil(h), sun = R() < 0.3;
    const sx = k => 24 + amp * Math.sin(k * fr * Math.PI / 2);
    let x0 = 24, y0 = B;
    for (let i = 1; i <= N; i++) { const k = i / N, x = sx(k), y = B - i; line(x0, y0, x, y, pal.stem, (k - 1 / N) * 0.6, k * 0.6); x0 = x; y0 = y; }
    const nl = 2 + ((R() * 2) | 0);
    for (let j = 0; j < nl; j++) {
      const k = 0.2 + 0.6 * (j + 1) / (nl + 1), y = B - h * k, x = sx(k), s = j % 2 ? 1 : -1, ln = 5 + R() * 4;
      line(x, y, x + s * ln, y - ln * 0.5, pal.L, k * 0.6, k * 0.6 + 0.1, 1); blob(x + s * ln, y - ln * 0.5, 1, pal.L2, k * 0.6 + 0.1);
    }
    const n = sun ? 12 : 5 + ((R() * 5) | 0), pl = sun ? 6 : 4 + R() * 4, rot = R() * 6.28, pc = sun ? pal.A2 : pal.A;
    for (let i = 0; i < n; i++) { const a = rot + i * 6.283 / n; blob(x0 + Math.cos(a) * pl * 0.8, y0 + Math.sin(a) * pl * 0.8, pl > 6 || sun ? 2 : 1, pc, 0.6 + R() * 0.3, 2); }
    blob(x0, y0, sun ? 4 : 2, sun ? '#5a3a1c' : pal.A2, 0.95, 3);
  } else if (kind === 2) { // кактус
    const w = 3 + ((R() * 2) | 0), h = (16 + R() * 16) * sc, mid = w >> 1, col = pal.rainbow ? hsl(R() * 360, 60, 45) : pal.L, dk = pal.stem;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(24 - mid + x, B - y, x === mid ? dk : col, y / h * 0.6);
    const na = 1 + ((R() * 2) | 0);
    for (let a = 0; a < na; a++) {
      const s = a ? 1 : -1, y0 = B - ((h * (0.3 + R() * 0.3)) | 0), out = 4 + ((R() * 4) | 0), up = 5 + ((R() * 8) | 0), x0 = 24 + s * (mid + 1);
      for (let i = 0; i <= out; i++) for (let d = 0; d < 2; d++) put(x0 + s * i, y0 - d, col, 0.6 + i / out * 0.1);
      for (let i = 0; i <= up; i++) for (let d = 0; d < 2; d++) put(x0 + s * out - s * d, y0 - i, col, 0.7 + i / up * 0.15);
    }
    for (let i = 0; i < 10; i++) put(24 - mid + ((R() * w) | 0), B - ((R() * h) | 0), '#e8f0c8', 0.6 + R() * 0.3, 2);
    blob(24, B - h - 1, 2, pal.A, 0.9, 2);
  } else if (kind === 3) { // грибы
    const n = 1 + ((R() * 3) | 0), stemC = R() < 0.5 ? '#f0e6d0' : pal.A2;
    for (let m = 0; m < n; m++) {
      const cx = n === 1 ? 24 : 24 + (m - (n - 1) / 2) * 11 + (R() - 0.5) * 4, h = (11 + R() * 12) * sc * (m ? 0.8 : 1), w = 3 + ((R() * 2) | 0);
      const rx = 7 + R() * 6, ry = 5 + R() * 5, tb = m * 0.12, cap = m % 2 ? pal.A : pal.L2, capDark = pal.L;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(cx - (w >> 1) + x, B - y, x === 0 ? '#d8cbb0' : stemC, tb + y / h * 0.45);
      const top = B - h;
      for (let y = -ry; y <= 0; y++) { const half = Math.round(rx * Math.sqrt(1 - (y * y) / (ry * ry))); for (let x = -half; x <= half; x++) put(cx + x, top + y, y > -2 || x > half - 2 ? capDark : cap, tb + 0.5 + R() * 0.1, 1); }
      for (let x = -rx; x <= rx; x++) put(cx + x, top + 1, '#3a2a2a', tb + 0.55, 1);
      for (let i = 0; i < 4 + ((R() * 4) | 0); i++) { const a = R() * Math.PI, rr = R() * 0.7; put(cx - Math.cos(a) * rx * rr, top - Math.sin(a) * ry * rr - 1, '#fff6e8', tb + 0.7 + R() * 0.25, 2); }
    }
  } else if (kind === 4) { // папоротник
    const n = 6 + ((R() * 3) | 0), len = (20 + R() * 12) * sc;
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * 2.2 + (R() - 0.5) * 0.3, t0 = 0.05 + 0.65 * (i / n);
      arc(24, B, a, len * (1 - Math.abs(a) * 0.18), 6 + R() * 8, pal.stem, t0, t0 + 0.3, 2.2, pal.leaf);
    }
    if (R() < 0.5) for (let i = 0; i < 3; i++) put(24 + (R() * 10 - 5), B - R() * 4, pal.A, 0.9, 2);
  } else if (kind === 5) { // пальма
    const h = (24 + R() * 10) * sc, lean = (R() - 0.5) * 14;
    let x0 = 24, y0 = B;
    for (let i = 1; i <= h; i++) { const k = i / h, x = 24 + lean * k * k, y = B - i; line(x0, y0, x, y, i % 4 < 1 ? pal.stem : pal.wood, (k - 1 / h) * 0.5, k * 0.5); put(x + 1, y, pal.wood, k * 0.5); x0 = x; y0 = y; }
    const n = 6 + ((R() * 3) | 0);
    for (let i = 0; i < n; i++) arc(x0, y0, (i / (n - 1) - 0.5) * 3.4, 10 + R() * 6, 8 + R() * 8, pal.leaf(), 0.5 + i * 0.04, 0.8 + i * 0.02, 1.6, pal.leaf);
    for (let i = 0; i < 2 + ((R() * 3) | 0); i++) blob(x0 + (i - 1) * 2, y0 + 2 + (i % 2), 1, pal.A2, 0.95, 3);
  } else if (kind === 6) { // бамбук
    const n = 2 + ((R() * 3) | 0), stalk = R() < 0.3 ? pal.L2 : pal.L;
    for (let s = 0; s < n; s++) {
      const x = 24 + (s - (n - 1) / 2) * 6 + (R() - 0.5) * 2, h = (24 + R() * 18) * sc, seg = 6 + ((R() * 3) | 0), tb = s * 0.08;
      for (let y = 0; y < h; y++) { const node = y % seg === seg - 1; put(x, B - y, node ? pal.stem : stalk, tb + y / h * 0.6); put(x + 1, B - y, node ? pal.stem : pal.L2, tb + y / h * 0.6); if (node) { put(x - 1, B - y, pal.stem, tb + y / h * 0.6); put(x + 2, B - y, pal.stem, tb + y / h * 0.6); } }
      for (let y = seg; y < h; y += seg) { const d = (y / seg) % 2 ? 1 : -1; line(x, B - y, x + d * (4 + R() * 3), B - y - 2 - R() * 2, pal.leaf(), 0.65 + R() * 0.3, 0.9 + R() * 0.1, 1); }
    }
  } else if (kind === 7) { // суккулент-розетка
    const n = 8 + ((R() * 5) | 0), ll = (10 + R() * 8) * sc, tip = R() < 0.5 ? pal.A : pal.L2;
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(a / (n - 1) - 0.5) - Math.abs(b / (n - 1) - 0.5)).reverse();
    order.forEach((i, o) => {
      const a = (i / (n - 1) - 0.5) * 2.7, len = ll * (1 - Math.abs(a) * 0.12), t0 = 0.05 + o * 0.5 / n, tx = 24 + Math.sin(a) * len, ty = B - 2 - Math.cos(a) * len * 0.9;
      line(24, B - 1, tx, ty, o % 2 ? pal.L : pal.L2, t0, t0 + 0.2, 1 + (o % 3)); line(24 + (tx > 24 ? 1 : -1), B - 1, tx, ty, pal.L, t0, t0 + 0.2, 1 + (o % 3)); put(tx, ty, tip, t0 + 0.2, 4);
    });
    if (rar >= 2 || R() < 0.4) { const h = 12 + R() * 10; line(24, B - 3, 24 + (R() - 0.5) * 4, B - 3 - h, pal.stem, 0.7, 0.9, 5); for (let i = 0; i < 4; i++) blob(24 + (R() - 0.5) * 4, B - 3 - h + i * 1.5, 1, pal.A, 0.9 + i * 0.02, 6); }
  } else { // куст с ягодами
    const rad = (9 + R() * 4) * sc, cy = B - rad * 0.8;
    for (let i = 0; i < 4; i++) line(24 + (i - 1.5) * 3, B, 24 + (i - 1.5) * 4, B - 5, pal.wood, i * 0.05, 0.2 + i * 0.05);
    for (let i = 0; i < 14; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * rad * 0.7; blob(24 + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 3 + ((R() * 3) | 0), (Math.sin(a) < -0.2) ? pal.L2 : (Math.sin(a) > 0.4 ? pal.stem : pal.L), 0.2 + R() * 0.65, 1); }
    for (let i = 0; i < 6 + ((R() * 8) | 0); i++) { const a = R() * 6.28, d = R() * rad * 0.85, x = 24 + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8; put(x, y, pal.A, 0.8 + R() * 0.2, 3); if (R() < 0.5) put(x + 1, y, pal.A, 0.85, 3); }
  }

  px.sort((a, b) => a.l - b.l);
  const sp = []; // искры у редких растений
  if (rar >= 2) for (let i = 0; i < (rar - 1) * 3; i++) { const q = px[(R() * px.length) | 0]; sp.push({ x: q.x + ((R() * 9 - 4) | 0), y: q.y + ((R() * 9 - 4) | 0), o: (R() * 3) | 0 }); }
  // контур: тёмная обводка (читаемость на любом небе); появляется вместе с ближайшим пикселем растения
  const occ = new Map(), outl = new Map();
  for (const q of px) { const k = q.x * 100 + q.y; occ.set(k, Math.min(occ.has(k) ? occ.get(k) : 9, q.t)); }
  for (const q of px) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = q.x + dx, y = q.y + dy, k = x * 100 + y;
    if (x < 0 || x >= W || y < 0 || y > B || occ.has(k)) continue;
    const o = outl.get(k); if (!o || q.t < o.t) outl.set(k, { x, y, c: 'rgba(43,24,25,.6)', t: q.t, l: -1 });
  }
  px.unshift(...outl.values());
  const res = { px, sp, kind, aura: pal.aura, pal: pal.name };
  cache.set(key, res);
  return res;
}
if (typeof module !== 'undefined') module.exports = { gen, rng, RN, RC, RCL, KINDS };
