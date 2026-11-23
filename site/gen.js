'use strict';
// Процедурная генерация растений из ГЕНОМА. Растение = редкость + геном (12 генов по 4 бита, число < 2^48), его выдаёт сервер.
// Из генов выводятся вид (14 форм), подвид, размер, густота, наклон, симметрия, палитра, цвет акцента, узор и свечение —
// поэтому при скрещивании потомок визуально наследует признаки родителей. Пиксели появляются по времени t∈[0,1] (рост).
const RN = ['Обычное', 'Необычное', 'Редкое', 'Эпическое', 'Легендарное'];
const RC = ['#8a7a6a', '#4f9a3c', '#3a7bd5', '#a24bd0', '#e08a00'];
const RCL = ['#c8b8a8', '#8fdc6a', '#7fc0ff', '#d58cff', '#ffd071'];
const KINDS = ['Дерево', 'Ель', 'Цветок', 'Кактус', 'Гриб', 'Папоротник', 'Пальма', 'Бамбук', 'Суккулент', 'Куст', 'Ива', 'Венерина мухоловка', 'Кристалл', 'Бонсай'];
const PALS = ['Зелёное', 'Осеннее', 'Морозное', 'Цветущее', 'Неоновое', 'Огненное', 'Золотое', 'Космическое', 'Радужное'];
const GN = 12, KINDN = 14, PALN = 9, PAL_BY_R = [[0, 0, 0, 1], [0, 1, 1, 2], [2, 3, 2, 1], [4, 5, 3, 2], [6, 7, 8, 5]];
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hsl = (h, s, l) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s)}% ${Math.round(l)}%)`;
const cache = new Map();

function genesOf(seed, r) { // обязано совпадать с genesOf в server/genome.js
  if (seed >= 4294967296) return Array.from({ length: GN }, (_, i) => Math.floor(seed / 16 ** i) % 16);
  const R = rng(seed), g = []; for (let i = 0; i < GN; i++) g.push((R() * 16) | 0);
  g[0] = (R() * KINDN) | 0; g[1] = PAL_BY_R[r][(R() * 4) | 0]; g[11] = Math.max(1, g[11]); return g;
}
function makePalette(R, g) {
  const name = g[1] % PALN, hs = g[2], base = 70 + hs * 5;
  const P = { name, stem: hsl(base, 45, 28), L: hsl(base + R() * 30 - 15, 55, 38), L2: hsl(base + R() * 30 - 15, 60, 50), A: hsl(g[6] * 22.5, 75, 60), A2: hsl(40 + hs * 3, 90, 55), wood: hsl(20 + g[10] * 2, 35, 26 + g[4] * 0.6), aura: null, rainbow: false };
  if (name === 1) { const h = 8 + hs * 2.4; Object.assign(P, { stem: hsl(30, 40, 28), L: hsl(h, 72, 44), L2: hsl(h + 18, 80, 58), A: hsl(h + 200, 50, 60) }); }
  if (name === 2) { const h = 165 + hs * 2; Object.assign(P, { stem: hsl(h, 35, 32), L: hsl(h, 55, 48), L2: hsl(h + 10, 60, 72), A: hsl(h + 30, 40, 88), A2: '#ffffff' }); }
  if (name === 3) { const h = 320 + hs * 2; Object.assign(P, { stem: hsl(100, 35, 30), L: hsl(h, 60, 62), L2: hsl(h + 8, 75, 78), A: hsl(h - 20, 80, 70), A2: '#fff4c2' }); }
  if (name === 4) { const h = 265 + hs * 4; Object.assign(P, { stem: hsl(h, 40, 25), L: hsl(h, 80, 50), L2: hsl(h + 40, 90, 62), A: hsl(h + 140, 95, 62), A2: '#7ffcff', aura: RCL[3] }); }
  if (name === 5) Object.assign(P, { stem: hsl(10, 40, 20), L: hsl(8 + hs, 80, 40), L2: hsl(30 + hs, 95, 55), A: '#ffd05a', A2: '#fff0a8', aura: '#ff8a4a' });
  if (name === 6) Object.assign(P, { stem: hsl(36, 55, 32), L: hsl(42, 85, 50), L2: hsl(50, 95, 68), A: '#fff6c8', A2: '#ffffff', aura: RCL[4] });
  if (name === 7) Object.assign(P, { stem: hsl(250, 45, 22), L: hsl(255 + hs * 2, 70, 38), L2: hsl(300 + hs * 2, 80, 55), A: '#9fe8ff', A2: '#ffffff', aura: '#b99cff' });
  if (name === 8) { P.rainbow = true; P.aura = '#ffffff'; P.stem = hsl(hs * 22, 40, 35); }
  if (g[9] >= 13 && !P.aura) P.aura = hsl(g[6] * 22.5, 90, 72); // ген «свечение»
  P.leaf = () => (P.rainbow ? hsl(R() * 360, 80, 58) : R() < 0.5 ? P.L : P.L2);
  return P;
}

function gen(seed, rar) {
  const key = seed + '|' + rar;
  if (cache.has(key)) return cache.get(key);
  const g = genesOf(seed, rar), R = rng((seed % 4294967296) ^ (Math.floor(seed / 4294967296) * 2654435761)), px = [], W = 48, B = 53, pal = makePalette(R, g);
  const q = { sc: 0.95 + g[3] / 15 * 0.55, dn: g[4] / 15, v: g[5], cnt: g[7], lean: (g[8] - 7.5) / 7.5, pat: g[10], sym: g[11] / 15 };
  const put = (x, y, c, t, l = 0) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && x < W && y >= 0 && y <= B) px.push({ x, y, c, t, l }); };
  const line = (x0, y0, x1, y1, c, t0, t1, l = 0) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) { const k = i / n; put(x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, c, t0 + (t1 - t0) * k, l); } };
  const blob = (cx, cy, rad, c, t, l = 1) => { for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad + rad * 0.5) put(cx + x, cy + y, c, t + R() * 0.05, l); };
  const ell = (cx, cy, rx, ry, cf, t0, t1, l = 1) => { for (let y = -ry; y <= ry; y++) { const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); for (let x = -half; x <= half; x++) put(cx + x, cy + y, typeof cf === 'function' ? cf(x, y) : cf, t0 + (t1 - t0) * R(), l); } };
  const arc = (x0, y0, ang, len, droop, c, t0, t1, leaflets, lc) => {
    let px0 = x0, py0 = y0; const N = Math.ceil(len);
    for (let i = 1; i <= N; i++) {
      const s = i / N, x = x0 + Math.sin(ang) * len * s, y = y0 - Math.cos(ang) * len * s + droop * s * s;
      line(px0, py0, x, y, c, t0 + (t1 - t0) * (i - 1) / N, t0 + (t1 - t0) * s, 1);
      if (leaflets && i % 2 === 0 && s < 0.97) { const k = 1 + (1 - s) * leaflets; put(x + k, y + 1, lc(), t0 + (t1 - t0) * s, 1); put(x - k, y + 1, lc(), t0 + (t1 - t0) * s, 1); }
      px0 = x; py0 = y;
    }
    return [px0, py0];
  };
  const stemTo = (h, amp, fr, c, t1) => { // изогнутый стебель, возвращает вершину и функцию x(k)
    const N = Math.ceil(h), sx = k => 24 + amp * Math.sin(k * fr * Math.PI / 2); let x0 = 24, y0 = B;
    for (let i = 1; i <= N; i++) { const k = i / N, x = sx(k), y = B - i; line(x0, y0, x, y, c, (k - 1 / N) * t1, k * t1); x0 = x; y0 = y; }
    return { x: x0, y: y0, sx, N };
  };
  const kind = g[0] % KINDN, v = q.v, sc = q.sc, dn = q.dn;

  if (kind === 0) { // дерево: 4 формы кроны
    const sub = v % 4, ln = (9 + dn * 4) * sc;
    if (sub === 2) { // акация: прямой ствол и плоская кроны
      const h = (20 + dn * 8) * sc, tp = stemTo(h, q.lean * 6, 1, pal.wood, 0.5); line(tp.x + 1, tp.y + 3, tp.x + 1, B, pal.wood, 0.1, 0.4);
      for (let i = 0; i < 3 + (q.cnt % 3); i++) ell(tp.x + (i - 2) * 6 + (R() - 0.5) * 3, tp.y - 2 + (i % 2) * 2, 8 + R() * 3, 4, pal.leaf, 0.6, 0.95);
    } else if (sub === 1) { // тополь: высокий овал
      const h = 13 * sc, tp = stemTo(h, q.lean * 3, 1, pal.wood, 0.4);
      ell(tp.x, tp.y - 9, 6 + dn * 3, 12 * sc, (x, y) => (y < -3 ? pal.L2 : y > 4 ? pal.stem : pal.L), 0.4, 0.95);
      for (let i = 0; i < q.cnt % 6; i++) put(tp.x + R() * 10 - 5, tp.y - 8 + R() * 14 - 7, pal.A, 0.95, 3);
    } else { // классическое ветвистое
      const D = 3 + (dn > 0.5 ? 1 : 0) + (sub === 3 ? 1 : 0), sp = 0.35 + (1 - q.sym) * 0.3 + R() * 0.2, cr = 2 + ((q.cnt % 2) | 0);
      const br = (x, y, a, len, d) => {
        const t0 = d * 0.8 / (D + 1), t1 = (d + 1) * 0.8 / (D + 1), x1 = x + Math.sin(a) * len, y1 = y - Math.cos(a) * len;
        line(x, y, x1, y1, pal.wood, t0, t1); if (d === 0) line(x + 1, y, x1 + 1, y1, pal.wood, t0, t1);
        if (d >= D - 1 && (sub !== 3 || R() < 0.4)) { blob(x1, y1, d === D ? cr + 1 : cr, pal.leaf(), 0.8 + R() * 0.15); if (q.cnt > 8 && d === D) put(x1 + 1, y1 + 2, pal.A, 0.95, 3); }
        if (d < D) { const n = 2 + (R() < 0.3 ? 1 : 0); for (let i = 0; i < n; i++) br(x1, y1, a + (i - (n - 1) / 2) * sp * 2 + (R() - 0.5) * 0.3 * (1 + q.sym), len * 0.76, d + 1); }
      };
      br(24, B, q.lean * 0.25, ln, 0);
    }
  } else if (kind === 1) { // ель, сосна, пихта
    const sub = v % 3, n = 4 + Math.floor(dn * 4) + (sub === 1 ? 1 : 0), th = Math.max(5, Math.round(7 * sc * (sub === 1 ? 0.85 : 1))), wmax = (sub === 1 ? 6 : 8) * sc + dn * 3;
    line(24, B, 24, B - 6, pal.wood, 0, 0.25); line(25, B, 25, B - 6, pal.wood, 0, 0.25);
    for (let i = 0; i < n; i++) {
      const top = B - 6 - (i + 1) * th * 0.72 - th * 0.3, w = wmax * (1 - i / (n + 0.6)) + 2, t0 = 0.2 + i * 0.6 / n;
      for (let y = 0; y < th; y++) { const half = Math.round(w * (y + 1) / th); for (let x = -half; x <= half; x++) put(24 + x + (sub === 0 && i % 2 ? 1 : 0), top + y, (x + y) % 7 === 0 ? pal.L2 : (y > th * 0.75 ? pal.stem : pal.L), t0 + y / th * 0.12, 1); }
      if (sub === 2) for (let k = 0; k < 2; k++) put(24 + Math.round((R() - 0.5) * w * 1.4), top + th - 2 - k, pal.A, 0.92, 3);
      if (pal.name === 2) for (let x = -2; x <= 2; x++) put(24 + x, top + 1, pal.A2, t0 + 0.1, 3);
    }
    const ty = B - 6 - n * th * 0.72 - th * 0.55; if (sub !== 1) { put(24, ty - 1, pal.A2, 0.97, 4); put(23, ty, pal.A2, 0.97, 4); put(25, ty, pal.A2, 0.97, 4); put(24, ty, pal.A2, 0.97, 4); }
  } else if (kind === 2) { // цветы: ромашка, тюльпан, колокольчик, орхидея, подсолнух
    const sub = v % 5, h = (24 + dn * 14 + (sub === 4 ? 6 : 0)) * sc, tp = stemTo(h, q.lean * 9, 1 + q.sym, pal.stem, 0.6);
    const nl = 2 + (q.cnt % 3);
    for (let j = 0; j < nl; j++) { const k = 0.2 + 0.6 * (j + 1) / (nl + 1), y = B - h * k, x = tp.sx(k), s = j % 2 ? 1 : -1, ln = (4 + R() * 4) * (sub === 1 ? 1.4 : 1); line(x, y, x + s * ln, y - ln * (sub === 1 ? 1.2 : 0.5), pal.L, k * 0.6, k * 0.6 + 0.1, 1); blob(x + s * ln, y - ln * (sub === 1 ? 1.2 : 0.5), 1, pal.L2, k * 0.6 + 0.1); }
    const hx = tp.x, hy = tp.y;
    if (sub === 0 || sub === 4) { const n = sub === 4 ? 12 : 5 + (q.cnt % 5), pl = sub === 4 ? 8 : 6 + R() * 4, rot = R() * 6.28, pc = sub === 4 ? pal.A2 : pal.A; for (let i = 0; i < n; i++) { const a = rot + i * 6.283 / n; blob(hx + Math.cos(a) * pl * 0.8, hy + Math.sin(a) * pl * 0.8, pl > 7 || sub === 4 ? 3 : 2, pc, 0.6 + R() * 0.3, 2); } blob(hx, hy, sub === 4 ? 5 : 3, sub === 4 ? '#5a3a1c' : pal.A2, 0.95, 3); }
    else if (sub === 1) { for (let i = -1; i <= 1; i++) for (let y = 0; y < 11; y++) { const w = y < 2 ? 2 : 3; for (let x = 0; x < w; x++) put(hx + i * 4 + x, hy - y + 3 - Math.abs(i) * 2, i ? pal.A : pal.A2, 0.7 + y * 0.03 + (i + 1) * 0.04, 2); } }
    else if (sub === 2) { const nb = 4 + (q.cnt % 4); for (let i = 0; i < nb; i++) { const k = 0.45 + 0.5 * i / nb, x = tp.sx(k) + (i % 2 ? 3 : -3), y = B - h * k + 3; line(tp.sx(k), B - h * k, x, y, pal.stem, 0.6 + i * 0.04, 0.65 + i * 0.04, 1); ell(x, y + 3, 3, 4, (xx, yy) => (yy > 1 ? pal.A2 : pal.A), 0.75 + i * 0.03, 0.8 + i * 0.03, 2); } }
    else { for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.7, rr = 6 + R() * 3; for (let k = 0; k < 4; k++) put(hx + Math.cos(a) * rr * k / 3, hy + Math.sin(a) * rr * k / 3 * 0.8, k < 2 ? pal.A : pal.A2, 0.8 + i * 0.03, 2); } blob(hx, hy, 1, pal.A2, 0.95, 3); }
  } else if (kind === 3) { // кактусы: столбчатый, бочонок, опунция
    const sub = v % 3, col = pal.rainbow ? hsl(R() * 360, 60, 45) : pal.L, dk = pal.stem;
    if (sub === 1) { const rx = (8 + dn * 3) * sc, ry = (9 + dn * 3) * sc; ell(24, B - ry, rx, ry, (x, y) => (Math.abs(x) % 4 === 0 ? dk : col), 0.05, 0.7); for (let i = 0; i < 8; i++) put(24 + (R() * 2 - 1) * rx * 0.8, B - ry + (R() * 2 - 1) * ry * 0.8, '#e8f0c8', 0.7 + R() * 0.2, 2); blob(24, B - 2 * ry - 1, 2, pal.A, 0.95, 3); }
    else if (sub === 2) { let cx = 24, cy = B - 4; for (let i = 0; i < 2 + (q.cnt % 3); i++) { const rx = (8 - i) * sc, ry = (6.5 - i * 0.8) * sc; ell(cx, cy - ry, Math.max(3, rx), Math.max(3, ry), (x, y) => ((x + y) % 5 === 0 ? dk : col), 0.1 + i * 0.2, 0.25 + i * 0.2); for (let k = 0; k < 3; k++) put(cx + (R() - 0.5) * rx, cy - ry + (R() - 0.5) * ry, '#e8f0c8', 0.5 + i * 0.1, 2); if (i > 0) blob(cx + rx - 1, cy - ry * 2 - 1, 1, pal.A, 0.9, 3); cx += (R() < 0.5 ? -1 : 1) * 4; cy -= ry * 1.7; } }
    else { const w = 3 + ((q.cnt % 2) | 0), h = (16 + dn * 16) * sc, mid = w >> 1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(24 - mid + x, B - y, x === mid ? dk : col, y / h * 0.6);
      const na = 1 + (q.cnt % 3) % 3; for (let a = 0; a < na; a++) { const s = a % 2 ? 1 : -1, y0 = B - ((h * (0.3 + R() * 0.3)) | 0), out = 4 + ((R() * 4) | 0), up = 5 + ((R() * 8) | 0), x0 = 24 + s * (mid + 1); for (let i = 0; i <= out; i++) for (let d = 0; d < 2; d++) put(x0 + s * i, y0 - d, col, 0.6 + i / out * 0.1); for (let i = 0; i <= up; i++) for (let d = 0; d < 2; d++) put(x0 + s * out - s * d, y0 - i, col, 0.7 + i / up * 0.15); }
      for (let i = 0; i < 10; i++) put(24 - mid + ((R() * w) | 0), B - ((R() * h) | 0), '#e8f0c8', 0.6 + R() * 0.3, 2); blob(24, B - h - 1, 2, pal.A, 0.9, 2); }
  } else if (kind === 4) { // грибы: купол, плоская шляпка, конус, колокол
    const n = 1 + (q.cnt % 3), stemC = R() < 0.5 ? '#f0e6d0' : pal.A2, sub = v % 4;
    for (let m = 0; m < n; m++) {
      const cx = n === 1 ? 24 : 24 + (m - (n - 1) / 2) * 12 + (R() - 0.5) * 3, h = (15 + dn * 10) * sc * (m ? 0.8 : 1), w = 4 + ((q.cnt % 2) | 0), tb = m * 0.12, cap = m % 2 ? pal.A : pal.L2, capDark = pal.L;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(cx - (w >> 1) + x, B - y, x === 0 ? '#d8cbb0' : stemC, tb + y / h * 0.45);
      const top = B - h, rx = (sub === 1 ? 14 : sub === 2 ? 8 : 10) * (0.9 + R() * 0.3), ry = sub === 1 ? 4 : sub === 2 ? 11 : sub === 3 ? 10 : 8;
      for (let y = -ry; y <= (sub === 3 ? 2 : 0); y++) { const half = sub === 2 ? Math.round(rx * (y + ry) / ry) : Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); for (let x = -half; x <= half; x++) put(cx + x, top + y, y > -2 || x > half - 2 ? capDark : (q.pat % 3 === 0 && (x * 3 + y) % 7 === 0 ? pal.A2 : cap), tb + 0.5 + R() * 0.1, 1); }
      for (let x = -rx; x <= rx; x++) put(cx + x, top + (sub === 3 ? 3 : 1), '#3a2a2a', tb + 0.55, 1);
      for (let i = 0; i < 3 + (q.pat % 4); i++) { const a = R() * Math.PI, rr = R() * 0.7; put(cx - Math.cos(a) * rx * rr, top - Math.sin(a) * ry * rr - 1, '#fff6e8', tb + 0.7 + R() * 0.25, 2); }
    }
  } else if (kind === 5) { // папоротник
    const n = 7 + Math.round(dn * 3), len = (28 + dn * 12) * sc;
    for (let i = 0; i < n; i++) { const a = (i / (n - 1) - 0.5) * (2 + q.lean * 0.3) + (R() - 0.5) * 0.3 * (1 + q.sym) + q.lean * 0.15, t0 = 0.05 + 0.65 * (i / n); const e = arc(24, B, a, len * (1 - Math.abs(a) * 0.12), 4 + R() * 6, pal.stem, t0, t0 + 0.3, 2.2 + (v % 3) * 0.6, pal.leaf); if (v % 2) blob(e[0], e[1] + 1, 1, pal.A, t0 + 0.32, 2); }
  } else if (kind === 6) { // пальма
    const h = (24 + dn * 10) * sc, lean = q.lean * 14; let x0 = 24, y0 = B;
    for (let i = 1; i <= h; i++) { const k = i / h, x = 24 + lean * k * k, y = B - i; line(x0, y0, x, y, i % 4 < 1 ? pal.stem : pal.wood, (k - 1 / h) * 0.5, k * 0.5); put(x + 1, y, pal.wood, k * 0.5); x0 = x; y0 = y; }
    const n = 6 + (q.cnt % 3);
    for (let i = 0; i < n; i++) arc(x0, y0, (i / (n - 1) - 0.5) * 3.2 + q.lean * 0.2, 15 + R() * 7, 6 + R() * 7, pal.leaf(), 0.5 + i * 0.04, 0.8 + i * 0.02, 1.6, pal.leaf);
    for (let i = 0; i < 2 + (q.cnt % 3); i++) blob(x0 + (i - 1) * 2, y0 + 2 + (i % 2), 1, pal.A2, 0.95, 3);
  } else if (kind === 7) { // бамбук или камыш
    const n = 2 + (q.cnt % 3), reed = v % 2 === 1, stalk = R() < 0.3 ? pal.L2 : pal.L;
    for (let s = 0; s < n; s++) {
      const x = 24 + (s - (n - 1) / 2) * 6 + (R() - 0.5) * 2, h = (24 + dn * 18) * sc, seg = 6 + ((R() * 3) | 0), tb = s * 0.08;
      for (let y = 0; y < h; y++) { const node = !reed && y % seg === seg - 1; put(x, B - y, node ? pal.stem : stalk, tb + y / h * 0.6); if (!reed) { put(x + 1, B - y, node ? pal.stem : pal.L2, tb + y / h * 0.6); if (node) { put(x - 1, B - y, pal.stem, tb + y / h * 0.6); put(x + 2, B - y, pal.stem, tb + y / h * 0.6); } } }
      if (reed) { for (let y = 0; y < 6; y++) { put(x, B - h + y, '#6b4a2b', 0.7 + y * 0.02, 2); put(x + 1, B - h + y, '#8a6238', 0.7 + y * 0.02, 2); } line(x, B - 6, x - 5 - R() * 3, B - 14, pal.L, 0.3, 0.5, 1); line(x, B - 4, x + 5 + R() * 3, B - 12, pal.L2, 0.3, 0.5, 1); }
      else for (let y = seg; y < h; y += seg) { const d = (y / seg) % 2 ? 1 : -1; line(x, B - y, x + d * (4 + R() * 3), B - y - 2 - R() * 2, pal.leaf(), 0.65 + R() * 0.3, 0.9 + R() * 0.1, 1); }
    }
  } else if (kind === 8) { // суккулент: агава-розетка или алоэ
    if (v % 2 === 0) {
      const n = 8 + (q.cnt % 5), ll = (14 + dn * 10) * sc, tip = R() < 0.5 ? pal.A : pal.L2;
      const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => Math.abs(a / (n - 1) - 0.5) - Math.abs(b / (n - 1) - 0.5)).reverse();
      order.forEach((i, o) => { const a = (i / (n - 1) - 0.5) * 2.7, len = ll * (1 - Math.abs(a) * 0.12), t0 = 0.05 + o * 0.5 / n, tx = 24 + Math.sin(a) * len, ty = B - 2 - Math.cos(a) * len * 0.9; line(24, B - 1, tx, ty, o % 2 ? pal.L : pal.L2, t0, t0 + 0.2, 1 + (o % 3)); line(24 + (tx > 24 ? 1 : -1), B - 1, tx, ty, pal.L, t0, t0 + 0.2, 1 + (o % 3)); put(tx, ty, tip, t0 + 0.2, 4); });
    } else { // алоэ: острые вертикальные листья с зубчиками
      const n = 5 + (q.cnt % 4); for (let i = 0; i < n; i++) { const a = (i / (n - 1) - 0.5) * 1.6, len = (20 + dn * 10 + R() * 5) * sc, t0 = 0.08 + i * 0.07; let px0 = 24, py0 = B; for (let k = 1; k <= len; k++) { const s = k / len, x = 24 + Math.sin(a) * len * s * 0.7 + Math.sin(s * 3 + i) * 1.2, y = B - k; line(px0, py0, x, y, i % 2 ? pal.L : pal.L2, t0 + s * 0.3, t0 + s * 0.3 + 0.01, 1 + (i % 2)); put(x + 1, y, pal.L, t0 + s * 0.3, 1 + (i % 2)); if (k % 4 === 2) put(x + 2, y, pal.A2, t0 + s * 0.3, 3); px0 = x; py0 = y; } }
    }
    if (rar >= 2 || q.cnt > 8) { const h = 12 + R() * 10; line(24, B - 3, 24 + (R() - 0.5) * 4, B - 3 - h, pal.stem, 0.7, 0.9, 5); for (let i = 0; i < 4; i++) blob(24 + (R() - 0.5) * 4, B - 3 - h + i * 1.5, 1, pal.A, 0.9 + i * 0.02, 6); }
  } else if (kind === 9) { // куст: ягоды, цветы или топиарий-шар
    const sub = v % 3, rad = (9 + dn * 4) * sc, cy = B - rad * 0.8;
    if (sub === 2) { line(24, B, 24, B - rad * 0.9, pal.wood, 0, 0.3); line(25, B, 25, B - rad * 0.9, pal.wood, 0, 0.3); ell(24, B - rad * 1.7, rad, rad, (x, y) => ((x + y) % 4 === 0 ? pal.L2 : y > rad * 0.4 ? pal.stem : pal.L), 0.3, 0.9); }
    else {
      for (let i = 0; i < 4; i++) line(24 + (i - 1.5) * 3, B, 24 + (i - 1.5) * 4, B - 5, pal.wood, i * 0.05, 0.2 + i * 0.05);
      for (let i = 0; i < 14; i++) { const a = R() * 6.28, d = Math.sqrt(R()) * rad * 0.7; blob(24 + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 3 + ((R() * 3) | 0), Math.sin(a) < -0.2 ? pal.L2 : (Math.sin(a) > 0.4 ? pal.stem : pal.L), 0.2 + R() * 0.65, 1); }
      for (let i = 0; i < 6 + (q.cnt % 8); i++) { const a = R() * 6.28, d = R() * rad * 0.85, x = 24 + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.8; if (sub === 1) blob(x, y, 1, pal.A, 0.8 + R() * 0.2, 3); else { put(x, y, pal.A, 0.8 + R() * 0.2, 3); if (R() < 0.5) put(x + 1, y, pal.A, 0.85, 3); } }
    }
  } else if (kind === 10) { // ива: изогнутый ствол и свисающие плети
    const h = (16 + dn * 8) * sc, tp = stemTo(h, q.lean * 6, 1, pal.wood, 0.4); line(tp.x + 1, tp.y + 4, tp.x + 1, B, pal.wood, 0.1, 0.3);
    ell(tp.x, tp.y - 2, 9 + dn * 2, 5, pal.leaf, 0.4, 0.7);
    const nv = 10 + (q.cnt % 6) + Math.round(dn * 4), vl = (14 + v % 4 * 3) * sc;
    for (let i = 0; i < nv; i++) { const x = tp.x - 10 + (i * 20) / nv + R() * 2, y = tp.y + 1, L = vl * (0.6 + R() * 0.5) * (1 - Math.abs(x - tp.x) / 24); line(x, y, x + (R() - 0.5) * 2, Math.min(B - 2, y + L), R() < 0.5 ? pal.L : pal.L2, 0.65 + R() * 0.1, 0.85 + R() * 0.1, 1); }
  } else if (kind === 11) { // венерина мухоловка
    const n = 2 + (q.cnt % 3);
    for (let s = 0; s < n; s++) {
      const bx = 24 + (s - (n - 1) / 2) * 9, h = (16 + dn * 12 + R() * 4) * sc, lean = (s - (n - 1) / 2) * 3 + q.lean * 3, t0 = s * 0.1;
      let x0 = bx, y0 = B; const N = Math.ceil(h); for (let i = 1; i <= N; i++) { const k = i / N, x = bx + lean * k * k, y = B - i; line(x0, y0, x, y, pal.stem, t0 + (k - 1 / N) * 0.5, t0 + k * 0.5); x0 = x; y0 = y; }
      const open = (v + s) % 3 !== 0, hw = 7 * (0.8 + dn * 0.5);
      for (let k = 0; k <= hw; k++) { const yy = y0 - (open ? k * 0.9 : k * 0.3); line(x0, y0, x0 - k, yy - (open ? 2 : 0), pal.L, t0 + 0.5, t0 + 0.6, 1); line(x0, y0, x0 + k, yy - (open ? 2 : 0), pal.L2, t0 + 0.5, t0 + 0.6, 1); }
      for (let k = 1; k < hw; k += 2) { put(x0 - k, y0 - (open ? k * 0.9 : k * 0.3) - 3, pal.A, t0 + 0.7, 3); put(x0 + k, y0 - (open ? k * 0.9 : k * 0.3) - 3, pal.A, t0 + 0.7, 3); }
      blob(x0, y0 - 1, 1, pal.A2, t0 + 0.8, 3);
    }
  } else if (kind === 12) { // кристаллы
    const n = 3 + (q.cnt % 4), base = pal.name === 8 ? null : pal.L2;
    for (let i = 0; i < n; i++) {
      const cx = 24 + (i - (n - 1) / 2) * 6 + (R() - 0.5) * 3, h = (10 + dn * 16 + R() * 10) * sc * (1 - Math.abs(i - (n - 1) / 2) * 0.12), w = 2 + ((R() * 2) | 0), tb = i * 0.08, hue = pal.rainbow ? R() * 360 : 0;
      for (let y = 0; y < h; y++) for (let x = -w; x <= w; x++) { const taper = y > h - w * 2 ? Math.max(0, h - y) / (w * 2) : 1; if (Math.abs(x) > w * taper) continue; const c = pal.rainbow ? hsl(hue + x * 8, 70, 62 - x * 2) : (x < 0 ? pal.L2 : x === 0 ? pal.A : pal.L); put(cx + x, B - y, (y > h - 3 && x === 0) ? '#ffffff' : (base ? c : c), tb + y / h * 0.7, 1); }
      put(cx - 1, B - h * 0.5, '#ffffff', tb + 0.7, 3);
    }
    if (!pal.aura) pal.aura = hsl(g[6] * 22.5, 85, 70);
  } else { // бонсай: S-образный ствол, «облака» листвы и камешек
    const h = (14 + dn * 6) * sc; let x0 = 24, y0 = B;
    for (let i = 1; i <= h; i++) { const k = i / h, x = 24 + Math.sin(k * 5 + q.lean * 2) * (3 + q.sym * 3), y = B - i; line(x0, y0, x, y, pal.wood, (k - 1 / h) * 0.5, k * 0.5); put(x + 1, y, pal.wood, k * 0.5); x0 = x; y0 = y; }
    ell(x0, y0 - 2, 9 + dn * 3, 4, pal.leaf, 0.5, 0.9); ell(x0 - 8 + q.lean * 3, y0 + 7, 6, 3, pal.leaf, 0.6, 0.9); ell(x0 + 8, y0 + 11, 5, 2, pal.leaf, 0.65, 0.95);
    line(x0 - 3, y0 + 3, x0 - 8, y0 + 6, pal.wood, 0.5, 0.6); line(x0 + 3, y0 + 4, x0 + 8, y0 + 9, pal.wood, 0.5, 0.6);
    blob(24 + 9, B - 1, 2, '#8a8a92', 0.1, 0); if (q.cnt > 7) for (let i = 0; i < 4; i++) put(x0 + (R() - 0.5) * 16, y0 - 3 + R() * 4, pal.A, 0.95, 3);
  }

  px.sort((a, b) => a.l - b.l);
  const sp = []; // искры у редких растений
  if (rar >= 2 || g[9] >= 13) for (let i = 0; i < Math.max(3, (rar - 1) * 3); i++) { const p = px[(R() * px.length) | 0]; sp.push({ x: p.x + ((R() * 9 - 4) | 0), y: p.y + ((R() * 9 - 4) | 0), o: (R() * 3) | 0 }); }
  const occ = new Map(), outl = new Map(); // тёмный контур: появляется вместе с ближайшим пикселем растения
  for (const p of px) { const k = p.x * 100 + p.y; occ.set(k, Math.min(occ.has(k) ? occ.get(k) : 9, p.t)); }
  for (const p of px) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const x = p.x + dx, y = p.y + dy, k = x * 100 + y;
    if (x < 0 || x >= W || y < 0 || y > B || occ.has(k)) continue;
    const o = outl.get(k); if (!o || p.t < o.t) outl.set(k, { x, y, c: 'rgba(43,24,25,.6)', t: p.t, l: -1 });
  }
  px.unshift(...outl.values());
  const res = { px, sp, kind, aura: pal.aura, pal: PALS[pal.name], genes: g, sub: v };
  cache.set(key, res);
  return res;
}
if (typeof module !== 'undefined') module.exports = { gen, rng, genesOf, RN, RC, RCL, KINDS, PALS };
