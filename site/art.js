'use strict';
// Пиксельная графика мастерской-теплицы: комната, горшки (5 видов), питомцы, аквариум. Всё рисуется кодом, без картинок.
const RW = 384, RH = 192; // логический размер сцены; на экране масштабируется целым числом
const mkc = (w, hh) => { const c = document.createElement('canvas'); c.width = w; c.height = hh; return c; };
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const rgbs = a => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
const hash = (x, y) => { let n = (x * 374761393 + y * 668265263) | 0; n = Math.imul(n ^ (n >> 13), 1274126177); return ((n ^ (n >> 16)) >>> 0) / 4294967296; };

// ---- расположение ----
const WIN = { x: 26, y: 20, w: 56, h: 62 };          // окно (небо рисуется динамически)
const TANK = { x: 12, y: 100, w: 88, h: 36 };        // стекло аквариума
const SLOTPOS = [[220, 122], [188, 122], [252, 122], [156, 122], [284, 122], [204, 84], [236, 84], [172, 84], [268, 84]]; // [x центра горшка, y земли]
const HOT = { tank: [8, 96, 96, 46], cat: [46, 62, 32, 24], dog: [296, 150, 36, 34], book: [106, 104, 30, 20], lab: [304, 98, 30, 24], shelf: [326, 38, 58, 62] };
const LANTERNS = [[122, 24], [316, 24]];

// ---- статика комнаты: рисуется один раз; в окне и стекле аквариума оставлены «дыры» ----
function buildStatic() {
  const cv = mkc(RW, RH), c = cv.getContext('2d'), R = (x, y, w, hh, col) => { c.fillStyle = col; c.fillRect(x, y, w, hh); };
  for (let x = 0; x < RW; x += 12) { // стена из вертикальных досок
    R(x, 0, 12, 140, (x / 12) % 2 ? '#6a4632' : '#74503a'); R(x, 0, 1, 140, '#43291d'); R(x + 11, 0, 1, 140, '#573826');
    for (let i = 0; i < 26; i++) { const yy = (hash(x, i) * 138) | 0, ln = 2 + ((hash(i, x) * 5) | 0); R(x + 2 + ((hash(x, i + 9) * 7) | 0), yy, 1, ln, hash(i, x + 3) > 0.5 ? '#80583f' : '#5c3b29'); }
  }
  for (let y = 0; y < 44; y++) R(0, y, RW, 1, `rgba(20,10,8,${0.38 * (1 - y / 44)})`); // тёмный верх
  R(0, 0, RW, 9, '#2e1c12'); R(0, 3, RW, 1, '#4b3021'); R(0, 9, RW, 2, '#22140c'); for (let x = 20; x < RW; x += 64) { R(x, 0, 4, 11, '#3a2418'); R(x, 0, 1, 11, '#4b3021'); }
  R(0, 112, RW, 28, '#4f3323'); R(0, 112, RW, 2, '#7a5238'); R(0, 114, RW, 1, '#2e1c12'); for (let x = 0; x < RW; x += 32) { R(x, 116, 1, 22, '#3a2418'); R(x + 1, 116, 1, 22, '#5e3f2d'); }
  for (let y = 140; y < RH; y += 8) { for (let x = 0; x < RW; x += 48) { const o = ((y / 8) % 2) * 24; R(x + o, y, 48, 8, ((x + y) / 8) % 2 ? '#5a3b28' : '#634230'); R(x + o, y, 1, 8, '#34201a'); } R(0, y, RW, 1, '#34201a'); }
  R(0, 138, RW, 4, '#2e1c12'); R(0, 138, RW, 1, '#6a4a34');
  for (let y = 142; y < RH; y++) R(0, y, RW, 1, `rgba(10,5,3,${0.35 * (y - 142) / 50})`);
  // окно: каменная арка, переплёт и подоконник
  const cx = WIN.x + WIN.w / 2, ar = WIN.w / 2;
  for (let y = WIN.y - 6; y < WIN.y + WIN.h + 6; y++) for (let x = WIN.x - 6; x < WIN.x + WIN.w + 6; x++) {
    const dx = x - cx, inArch = y < WIN.y + ar ? dx * dx + (y - (WIN.y + ar)) ** 2 <= (ar + 6) ** 2 : true;
    if (inArch && x >= WIN.x - 6 && x < WIN.x + WIN.w + 6 && y < WIN.y + WIN.h + 2) c.fillStyle = ((x * 3 + y * 5) % 7 < 2) ? '#7a6a58' : '#8a7a68', c.fillRect(x, y, 1, 1);
  }
  c.save(); c.globalCompositeOperation = 'destination-out';
  for (let y = WIN.y; y < WIN.y + WIN.h; y++) for (let x = WIN.x; x < WIN.x + WIN.w; x++) { const dx = x - cx; if (y >= WIN.y + ar || dx * dx + (y - (WIN.y + ar)) ** 2 <= ar * ar) c.fillRect(x, y, 1, 1); }
  c.restore();
  R(cx - 1, WIN.y, 3, WIN.h, '#4b3021'); R(WIN.x, WIN.y + 36, WIN.w, 3, '#4b3021'); R(cx - 1, WIN.y, 1, WIN.h, '#6a4a34');
  R(WIN.x - 8, WIN.y + WIN.h, WIN.w + 16, 7, '#9a8a76'); R(WIN.x - 8, WIN.y + WIN.h, WIN.w + 16, 1, '#c0b09a'); R(WIN.x - 8, WIN.y + WIN.h + 6, WIN.w + 16, 1, '#6a5c4c');
  // аквариум: шкаф, рама, подсветка
  R(6, 140, 100, 34, '#5b3d2a'); R(6, 140, 100, 2, '#7a5238'); R(6, 172, 100, 2, '#2e1c12'); R(10, 146, 44, 24, '#4a3020'); R(58, 146, 44, 24, '#4a3020');
  for (const x of [10, 58]) { R(x, 146, 44, 1, '#2e1c12'); R(x, 146, 1, 24, '#2e1c12'); R(x + 1, 147, 42, 1, '#6a4634'); }
  R(52, 156, 2, 5, '#c9a14a'); R(58, 156, 2, 5, '#c9a14a');
  R(4, 92, 104, 8, '#2a1a10'); R(4, 92, 104, 1, '#c9a14a'); R(14, 95, 84, 2, '#fff3b0'); R(14, 97, 84, 1, '#c9a14a');
  R(4, 100, 8, 40, '#2a1a10'); R(100, 100, 8, 40, '#2a1a10'); R(4, 136, 104, 6, '#2a1a10'); R(4, 136, 104, 1, '#c9a14a');
  for (const [x, y] of [[4, 92], [100, 92], [4, 136], [100, 136]]) R(x, y, 8, 3, '#c9a14a');
  // стол
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(110, 168, 230, 6);
  R(104, 122, 232, 8, '#7a5238'); R(104, 122, 232, 1, '#a07048'); R(104, 129, 232, 1, '#2e1c12'); R(104, 130, 232, 10, '#5b3d2a'); R(104, 130, 232, 1, '#6a4a34'); R(104, 139, 232, 1, '#2e1c12');
  for (const x of [112, 320]) { R(x, 140, 9, 32, '#4f3323'); R(x, 140, 1, 32, '#6a4a34'); R(x + 8, 140, 1, 32, '#2e1c12'); }
  R(121, 158, 199, 4, '#4f3323'); R(121, 158, 199, 1, '#6a4a34'); for (let x = 112; x < 330; x += 22) R(x + 6, 124 + ((hash(x, 1) * 4) | 0), 8 + ((hash(x, 2) * 8) | 0), 1, '#8a6040');
  // полка для задних горшков
  R(124, 84, 180, 4, '#7a5238'); R(124, 84, 180, 1, '#a07048'); R(124, 88, 180, 2, '#2e1c12');
  for (const x of [136, 288]) { R(x, 90, 2, 12, '#4f3323'); for (let i = 0; i < 8; i++) R(x + 2, 90 + i, 8 - i, 1, '#4f3323'); }
  // правые полки: банки и книги
  for (const y of [56, 94]) { R(326, y, 58, 4, '#7a5238'); R(326, y, 58, 1, '#a07048'); R(326, y + 4, 58, 2, '#2e1c12'); }
  const jar = (x, y, col, lid) => { R(x, y - 10, 8, 10, 'rgba(180,220,230,.55)'); R(x, y - 10, 1, 10, '#e8f6fa'); R(x + 1, y - 7, 6, 7, col); R(x + 1, y - 7, 6, 1, 'rgba(255,255,255,.35)'); R(x + 1, y - 12, 6, 2, lid); };
  jar(330, 56, '#8fd860', '#8a5a35'); jar(340, 56, '#e8b830', '#8a5a35'); jar(350, 56, '#d96a5a', '#6a4634');
  const book = (x, y, w, hh, col) => { R(x, y - hh, w, hh, col); R(x, y - hh, 1, hh, 'rgba(255,255,255,.25)'); R(x + w - 1, y - hh, 1, hh, 'rgba(0,0,0,.3)'); R(x, y - hh + 2, w, 1, '#d6b36a'); };
  book(362, 56, 5, 16, '#7a3a4a'); book(367, 56, 4, 13, '#3a5a7a'); book(371, 56, 5, 17, '#4a6a3a'); book(376, 56, 5, 14, '#8a5a2a');
  book(330, 94, 6, 14, '#5a3a7a'); book(336, 94, 5, 17, '#7a3a2a'); book(341, 94, 6, 12, '#2a5a5a'); jar(354, 94, '#a24bd0', '#6a4634'); jar(364, 94, '#7fc0ff', '#6a4634'); jar(374, 94, '#ffd071', '#6a4634');
  // сушёные травы, фонари, рамка
  for (const x of [134, 292]) { R(x, 11, 1, 6, '#2a1a10'); for (let i = 0; i < 7; i++) { R(x - 2 + (i % 3), 16 + i * 2, 1, 4, i % 2 ? '#6a8a3a' : '#8aa44a'); R(x + 2 - (i % 3), 17 + i * 2, 1, 3, '#7a6a3a'); } R(x - 3, 15, 8, 2, '#8a5a35'); }
  for (const [x, y] of LANTERNS) { R(x, 10, 1, y - 10, '#2a1a10'); R(x - 4, y, 9, 2, '#8a6a2a'); R(x - 5, y + 2, 11, 10, '#c9a14a'); R(x - 4, y + 3, 9, 8, '#3a2a14'); R(x - 3, y + 12, 7, 2, '#8a6a2a'); }
  R(188, 34, 30, 24, '#c9a14a'); R(190, 36, 26, 20, '#e8d4a8'); R(190, 36, 26, 1, '#fff0c8'); R(194, 40, 18, 12, '#6a8a3a'); R(200, 44, 6, 6, '#d96a5a'); R(197, 40, 2, 12, '#4a6a2a'); R(209, 40, 2, 12, '#4a6a2a');
  // ковёр, бочка, лейка
  R(130, 176, 196, 14, '#7a2a2a'); R(130, 176, 196, 1, '#a84a3a'); R(130, 189, 196, 1, '#4a1a1a'); for (let x = 134; x < 322; x += 8) { R(x, 179, 4, 2, '#d6b36a'); R(x + 2, 184, 4, 2, '#d6b36a'); } R(134, 177, 188, 1, '#d6b36a'); R(134, 188, 188, 1, '#d6b36a');
  R(344, 150, 28, 32, '#6a4630'); for (const y of [154, 172]) R(344, y, 28, 3, '#3a2a1c'); R(344, 150, 1, 32, '#8a6040'); R(371, 150, 1, 32, '#3a2418'); R(344, 150, 28, 2, '#8a6040');
  R(346, 140, 24, 10, '#8a6a3a'); R(346, 140, 24, 2, '#a88a52'); R(352, 134, 12, 6, '#d6b36a');
  // книга и лаборатория на столе
  R(108, 114, 24, 8, '#7a2a3a'); R(108, 114, 24, 1, '#b04a5a'); R(108, 121, 24, 1, '#3a1018'); R(110, 112, 20, 2, '#e8d4a8'); R(110, 112, 20, 1, '#fff0c8'); R(126, 114, 2, 8, '#c9a14a'); R(112, 117, 10, 1, '#c9a14a'); R(114, 118, 6, 1, '#c9a14a');
  R(310, 112, 10, 10, '#8a8a92'); R(310, 112, 10, 2, '#b0b0b8'); R(312, 110, 6, 2, '#6a6a72'); R(322, 104, 2, 18, '#c9a14a'); R(316, 104, 14, 2, '#c9a14a'); R(316, 106, 2, 3, '#c9a14a'); R(328, 106, 2, 3, '#c9a14a'); R(315, 109, 4, 2, '#d6b36a'); R(327, 109, 4, 2, '#d6b36a');
  R(298, 112, 7, 10, 'rgba(180,220,230,.6)'); R(299, 116, 5, 6, '#d96a5a'); R(299, 109, 5, 3, '#8a5a35'); R(300, 106, 3, 3, 'rgba(180,220,230,.6)');
  c.clearRect(TANK.x, TANK.y, TANK.w, TANK.h); // стекло аквариума: сквозь него видна динамическая вода
  return cv;
}

// ---- небо в окне (по серверному времени) ----
const SKYK = [[0, ['#0d0d2b', '#14143a', '#1c1b4a', '#26255c', '#302e6e', '#3a3880']], [5, ['#0d0d2b', '#14143a', '#1c1b4a', '#26255c', '#302e6e', '#3a3880']], [6.6, ['#4a3a7a', '#7a4a8a', '#b85a86', '#e87a7a', '#ff9a6b', '#ffc27a']], [8.6, ['#3c9be0', '#58b0ea', '#74c3f0', '#92d3f5', '#b0e1f8', '#cdeefb']], [17.5, ['#3c9be0', '#58b0ea', '#74c3f0', '#92d3f5', '#b0e1f8', '#cdeefb']], [20, ['#2f2a6a', '#523c88', '#8a4a8a', '#c9627e', '#f08a6a', '#ffb070']], [21.8, ['#0d0d2b', '#14143a', '#1c1b4a', '#26255c', '#302e6e', '#3a3880']], [24, ['#0d0d2b', '#14143a', '#1c1b4a', '#26255c', '#302e6e', '#3a3880']]].map(([h, b]) => [h, b.map(hex)]);
function skyBands(hr) {
  let i = 1; while (i < SKYK.length - 1 && hr >= SKYK[i][0]) i++;
  const [h0, b0] = SKYK[i - 1], [h1, b1] = SKYK[i], t = Math.min(1, Math.max(0, (hr - h0) / (h1 - h0)));
  return b0.map((c, k) => mixc(c, b1[k], t));
}
const nightF = hr => (hr >= 21.5 || hr < 5 ? 1 : hr < 7 ? (7 - hr) / 2 : hr >= 19.5 ? (hr - 19.5) / 2 : 0);
function drawSky(c, hr, tm) {
  const x0 = WIN.x, y0 = WIN.y, W = WIN.w, H = WIN.h, nf = nightF(hr), bands = skyBands(hr), f = (x, y, w, hh, col) => { c.fillStyle = col; c.fillRect(x0 + x, y0 + y, w, hh); };
  bands.forEach((b, i) => f(0, Math.floor(i * H / 6), W, Math.ceil(H / 6) + 1, rgbs(b)));
  if (nf > 0.05) { c.fillStyle = '#fff'; for (let i = 0; i < 18; i++) { c.globalAlpha = nf * ((Math.floor(tm / 600) + i) % 5 ? 1 : 0.35); c.fillRect(x0 + (i * 37 + 7) % W, y0 + (i * 23 + 5) % 34, 1, 1); } c.globalAlpha = 1; }
  if (hr >= 5.5 && hr < 20.7) { const t = Math.min(1, Math.max(0, (hr - 5.8) / 14.6)), sx = 6 + t * (W - 18), sy = 44 - Math.sin(Math.PI * t) * 34; f(sx - 1, sy - 1, 9, 9, `rgba(255,230,120,${0.22 + 0.08 * Math.sin(tm / 700)})`); f(sx, sy, 7, 7, '#ffe27a'); f(sx + 1, sy + 1, 5, 5, '#fff6c0'); }
  if (hr >= 19.5 || hr < 6.5) { const t = Math.min(1, ((hr - 19.5 + 24) % 24) / 11), mx = 6 + t * (W - 18), my = 44 - Math.sin(Math.PI * t) * 34; c.globalAlpha = Math.min(1, nf + 0.3); for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if ((x - 3.5) ** 2 + (y - 3.5) ** 2 <= 12 && (x - 5.5) ** 2 + (y - 2.5) ** 2 > 8) f(mx + x, my + y, 1, 1, '#f4f0c8'); c.globalAlpha = 1; }
  const cc = rgbs(mixc([255, 255, 255], [70, 70, 130], nf));
  [[0, 12, 12, 0.004], [1, 26, 9, 0.0027], [2, 36, 10, 0.0018]].forEach(([o, y, w, sp]) => { const x = (((tm * sp + o * 29) % (W + 24)) | 0) - 12; f(x, y, w, 3, cc); f(x + 2, y - 1, w - 4, 1, cc); });
  c.fillStyle = rgbs(mixc(bands[5], [52, 74, 86], 0.5 + 0.25 * nf)); for (let x = 0; x < W; x++) { const hh = Math.round(9 + 4 * Math.sin(x * 0.18 + 1) + 2 * Math.sin(x * 0.5)); c.fillRect(x0 + x, y0 + H - hh - 4, 1, hh + 4); }
  c.fillStyle = rgbs(mixc([63, 122, 74], [18, 34, 34], nf)); for (let x = 0; x < W; x++) { const hh = Math.round(4 + 2 * Math.sin(x * 0.3 + 2) + Math.sin(x * 0.7)); c.fillRect(x0 + x, y0 + H - hh, 1, hh); }
  const bt = (tm / 1000) % 20; if (nf < 0.3 && bt < 6) { const bx = Math.round(-4 + bt / 6 * (W + 8)), by = Math.round(16 + Math.sin(bt * 2) * 2), fl = Math.floor(tm / 180) % 2; f(bx, by + fl, 1, 1, '#33283a'); f(bx + 1, by + 1 - fl, 1, 1, '#33283a'); f(bx + 2, by + fl, 1, 1, '#33283a'); }
}

// ---- спрайты питомцев: рисуются формами, затем автоматически обводятся ----
function sprite(w, hh, fn) {
  const cv = mkc(w, hh), c = cv.getContext('2d'); fn(c, (x, y, ww, h2, col) => { c.fillStyle = col; c.fillRect(x, y, ww, h2); }, (cx, cy, rx, ry, col) => { c.fillStyle = col; for (let y = -ry; y <= ry; y++) { const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry)))); c.fillRect(cx - half, cy + y, half * 2 + 1, 1); } });
  const id = c.getImageData(0, 0, w, hh), d = id.data, out = c.createImageData(w, hh), o = out.data; o.set(d);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (d[i + 3] > 0) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && X < w && Y >= 0 && Y < hh && d[(Y * w + X) * 4 + 3] > 200) { o[i] = 43; o[i + 1] = 24; o[i + 2] = 25; o[i + 3] = 255; break; } } }
  c.putImageData(out, 0, 0); return cv;
}
const PET_SPR = {};
function buildPets() {
  const cat = (blink, tail, sad) => sprite(22, 22, (c, R, E) => {
    const tx = 15 + tail; R(tx - 1, 12, 3, 8, '#d9894a'); R(tx, 10 + (tail ? 1 : 0), 2, 3, '#d9894a'); R(tx, 18, 3, 2, '#a85a2a');
    E(9, 15, 5, 6, '#e0903f'); E(9, 16, 3, 4, '#f6d09a'); R(5, 19, 3, 2, '#f6d09a'); R(10, 19, 3, 2, '#f6d09a');
    E(9, 7, 6, 5, '#e0903f'); R(3, 1, 3, 4, '#e0903f'); R(4, 2, 1, 2, '#f09aa0'); R(12, 1, 3, 4, '#e0903f'); R(13, 2, 1, 2, '#f09aa0');
    R(8, 3, 1, 2, '#a85a2a'); R(10, 3, 1, 2, '#a85a2a'); R(6, 4, 1, 1, '#a85a2a'); R(12, 4, 1, 1, '#a85a2a');
    if (blink) { R(5, 7, 3, 1, '#2b1819'); R(11, 7, 3, 1, '#2b1819'); } else { R(5, 6, 3, 3, '#ffe066'); R(6, 6, 1, 3, '#2b1819'); R(11, 6, 3, 3, '#ffe066'); R(12, 6, 1, 3, '#2b1819'); }
    R(9, 9, 2, 1, '#f09aa0'); R(9, 10, 1, 1, '#2b1819'); R(10, 10, 1, 1, '#2b1819'); R(2, 9, 3, 1, '#f6e6d0'); R(14, 9, 3, 1, '#f6e6d0');
    if (sad) { R(5, 5, 3, 1, '#a85a2a'); R(12, 5, 3, 1, '#a85a2a'); }
  });
  const dog = (tongue, tail, sad) => sprite(26, 24, (c, R, E) => {
    R(20 + tail, 12, 3, 3, '#8a5a35'); R(22 + tail, 9 - (tail ? 1 : 0), 2, 4, '#8a5a35');
    E(12, 17, 6, 6, '#a8703a'); E(12, 18, 3, 5, '#f6e6d0'); R(7, 21, 3, 2, '#f6e6d0'); R(13, 21, 3, 2, '#f6e6d0');
    E(12, 8, 7, 6, '#a8703a'); R(3, 4, 4, 10, '#5a3418'); R(4, 13, 3, 2, '#5a3418'); R(18, 4, 4, 10, '#5a3418'); R(18, 13, 3, 2, '#5a3418');
    E(12, 10, 4, 4, '#f6e6d0'); R(10, 3, 4, 3, '#f6e6d0'); R(8, 7, 2, 2, '#fff'); R(8, 7, 2, 2, '#2b1819'); R(15, 7, 2, 2, '#2b1819'); R(9, 7, 1, 1, '#fff'); R(16, 7, 1, 1, '#fff');
    R(11, 10, 3, 2, '#2b1819'); R(12, 12, 1, 1, '#2b1819'); if (tongue) { R(11, 13, 3, 3, '#f09aa0'); R(12, 13, 1, 3, '#d9707a'); }
    if (sad) { R(8, 6, 3, 1, '#5a3418'); R(15, 6, 3, 1, '#5a3418'); }
  });
  const seal = flip => sprite(34, 18, (c, R, E) => {
    R(0, 9 + flip, 5, 3, '#6a7a8c'); R(1, 11 + flip, 4, 2, '#6a7a8c');
    E(15, 10, 14, 6, '#8a9aac'); E(15, 13, 11, 3, '#d6dfe8'); E(26, 6, 6, 5, '#8a9aac'); R(21, 13, 5, 3 + flip, '#6a7a8c'); R(10, 14, 4, 3, '#6a7a8c');
    R(26, 4, 2, 2, '#2b1819'); R(30, 4, 2, 2, '#2b1819'); R(27, 4, 1, 1, '#fff'); R(31, 4, 1, 1, '#fff'); R(29, 7, 3, 2, '#2b1819'); R(24, 8, 3, 1, '#d6dfe8'); R(32, 8, 3, 1, '#d6dfe8'); R(24, 10, 3, 1, '#d6dfe8'); R(32, 10, 3, 1, '#d6dfe8');
  });
  PET_SPR.cat = [cat(0, 0, 0), cat(1, 0, 0), cat(0, 1, 0), cat(0, 0, 1)]; PET_SPR.dog = [dog(0, 0, 0), dog(1, 1, 0), dog(0, 0, 1), dog(1, 0, 0)]; PET_SPR.seal = [seal(0), seal(1)];
  const fish = (a, b, tail) => sprite(12, 8, (c, R, E) => { E(5, 4, 4, 3, a); E(4, 4, 2, 2, b); R(8 + tail, 2, 3, 5, a); R(9, 3 + tail, 2, 3, b); R(2, 3, 1, 1, '#fff'); R(2, 3, 1, 1, '#2b1819'); R(5, 0, 3, 2, a); });
  PET_SPR.fish = [['#ff8a3a', '#ffd071'], ['#4aa8e0', '#bfe6ff'], ['#e8d030', '#fff6a0']].map(([a, b]) => [fish(a, b, 0), fish(a, b, 1)]);
}
const HEART = ['.oo.oo.', 'oRRoRRo', 'oRRRRRo', '.oRRRo.', '..oRo..', '...o...'];
function drawHeart(c, x, y, a) { c.globalAlpha = a; HEART.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') { c.fillStyle = ch === 'o' ? '#7a1a2a' : '#ff6a8a'; c.fillRect(x + i, y + j, 1, 1); } })); c.globalAlpha = 1; }

// ---- горшки: 0 глиняный, 1 медный котёл, 2 стеклянный террариум, 3 каменная ваза, 4 золотая урна ----
function drawSoil(c, cx, y, wet) { const col = rgbs(mixc([120, 84, 52], [52, 34, 26], wet)); c.fillStyle = col; c.fillRect(cx - 12, y, 25, 2); c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(cx - 12, y + 1, 25, 1); }
function drawPot(c, skin, cx, y, tm, wob) {
  const x0 = cx + wob, R = (x, yy, w, hh, col) => { c.fillStyle = col; c.fillRect(x0 + x, y + yy, w, hh); }, L = (rows, cols) => rows.forEach((r, j) => { c.fillStyle = cols[r[0]]; c.fillRect(x0 + r[1], y + j + 1, r[2], 1); });
  const V = (rows, cols, hi, sh) => { rows.forEach((r, j) => { c.fillStyle = cols[r[0]]; c.fillRect(x0 + r[1], y + j, r[2], 1); c.fillStyle = hi; c.fillRect(x0 + r[1] + 1, y + j, 2, 1); c.fillStyle = sh; c.fillRect(x0 + r[1] + r[2] - 3, y + j, 2, 1); }); c.fillStyle = '#2b1819'; c.fillRect(x0 + rows[0][1], y - 1, rows[0][2], 1); };
  if (skin === 1) { // медный котёл: широкое брюхо, ручки, заклёпки, ножки
    V([['a', -17, 35], ['a', -16, 33], ['b', -18, 37], ['b', -18, 37], ['b', -17, 35], ['b', -16, 33], ['b', -14, 29], ['d', -11, 23], ['d', -9, 19]], { a: '#f0a060', b: '#c8702e', d: '#8a4420' }, 'rgba(255,220,170,.55)', 'rgba(60,20,5,.35)');
    R(-21, 3, 4, 3, '#8a4420'); R(-22, 5, 3, 3, '#8a4420'); R(18, 3, 4, 3, '#8a4420'); R(19, 5, 3, 3, '#8a4420'); for (const xx of [-13, -5, 3, 11]) R(xx, 3, 2, 1, '#ffd0a0'); R(-7, 6, 4, 2, '#4fb094'); R(2, 7, 6, 2, '#4fb094'); R(-12, 9, 4, 4, '#6a3412'); R(9, 9, 4, 4, '#6a3412'); R(-12, 12, 4, 1, '#2b1819'); R(9, 12, 4, 1, '#2b1819');
  } else if (skin === 2) { // стеклянный террариум (поверх растения)
    c.fillStyle = 'rgba(170,225,240,.30)'; for (let j = 0; j < 14; j++) { const w = Math.round(26 - Math.abs(j - 6) * 0.9); c.fillRect(x0 - w / 2 - 2, y + j + 1, w + 5, 1); }
    R(-14, 1, 29, 2, 'rgba(210,240,250,.7)'); R(-15, 3, 1, 8, 'rgba(255,255,255,.75)'); R(-13, 4, 2, 6, 'rgba(255,255,255,.5)'); R(-10, 13, 21, 2, 'rgba(120,180,200,.55)'); R(-12, 11, 25, 2, 'rgba(150,200,220,.5)'); R(12, 4, 2, 7, 'rgba(120,180,200,.5)');
    R(-12, 9, 25, 4, '#7a5238'); R(-12, 9, 25, 1, '#a07048'); R(-6, 10, 2, 1, '#b9814f'); R(5, 11, 3, 1, '#b9814f'); R(-2, 10, 1, 1, '#8aa44a');
    R(-16, 0, 33, 1, '#a9d8e6'); R(-16, 15, 33, 1, '#6aa0b4');
  } else if (skin === 3) { // каменная ваза с мхом
    V([['a', -15, 31], ['b', -14, 29], ['b', -9, 19], ['b', -9, 19], ['b', -12, 25], ['b', -14, 29], ['b', -15, 31], ['b', -15, 31], ['b', -14, 29], ['d', -13, 27], ['d', -11, 23], ['d', -9, 19], ['d', -11, 23]], { a: '#c4c4cc', b: '#8a8a94', d: '#5a5a66' }, 'rgba(255,255,255,.35)', 'rgba(20,20,40,.35)');
    R(-9, 5, 19, 1, '#5a5a66'); R(-9, 6, 19, 1, '#b8b8c0'); for (let i = 0; i < 5; i++) R(-8 + i * 4, 5, 2, 1, '#44444e'); R(-13, 9, 6, 2, '#5a9a3a'); R(-14, 10, 4, 2, '#7ab84a'); R(8, 7, 5, 2, '#5a9a3a'); R(9, 8, 3, 2, '#7ab84a'); R(-6, 12, 3, 1, '#7ab84a');
  } else if (skin === 4) { // золотая урна с самоцветом
    V([['a', -15, 31], ['b', -14, 29], ['b', -9, 19], ['c', -9, 19], ['c', -12, 25], ['c', -14, 29], ['c', -15, 31], ['c', -15, 31], ['c', -14, 29], ['b', -13, 27], ['d', -11, 23], ['d', -9, 19], ['d', -11, 23]], { a: '#fff0a0', b: '#e8b830', c: '#f4d060', d: '#a8781c' }, 'rgba(255,255,230,.6)', 'rgba(110,60,0,.35)');
    R(-9, 6, 19, 1, '#fff0a0'); R(-2, 7, 5, 5, '#d9304a'); R(-1, 8, 2, 3, '#ff8a9a'); R(-19, 3, 4, 7, '#a8781c'); R(-19, 3, 1, 7, '#fff0a0'); R(16, 3, 4, 7, '#a8781c'); R(-15, 4, 2, 1, '#fff0a0'); R(11, 4, 2, 1, '#fff0a0'); if (Math.floor(tm / 500) % 3 === 0) R(-9, 8, 1, 1, '#fff');
  } else { // глиняный
    L([['a', -15, 31], ['b', -15, 31], ['b', -14, 29], ['c', -13, 27], ['c', -13, 27], ['c', -12, 25], ['c', -12, 25], ['c', -11, 23], ['c', -11, 23], ['d', -10, 21], ['d', -10, 21]], { a: '#e09a66', b: '#c97a4a', c: '#b3683c', d: '#8a4a24' });
    R(-14, 2, 2, 2, '#e8aa76'); R(-12, 5, 1, 4, '#d08a58'); R(8, 5, 4, 6, '#9a5a30'); R(-15, 0, 31, 1, '#2b1819'); R(-9, 11, 21, 1, '#2b1819'); R(-14, 4, 29, 1, '#8a4a24');
  }
}

// ---- аквариум: вода, песок, водоросли, пузырьки (рыбки и тюлень рисуются поверх) ----
function drawTank(c, tm, hr) {
  const x0 = TANK.x, y0 = TANK.y, W = TANK.w, H = TANK.h, nf = nightF(hr), top = mixc([70, 190, 200], [30, 90, 130], nf), bot = mixc([30, 110, 150], [10, 40, 80], nf);
  for (let y = 0; y < H; y++) { c.fillStyle = rgbs(mixc(top, bot, y / H)); c.fillRect(x0, y0 + y, W, 1); }
  for (let i = 0; i < 5; i++) { const sx = x0 + 6 + i * 18 + ((tm / 150 + i * 9) % 12), a = 0.08 + 0.04 * Math.sin(tm / 600 + i); c.fillStyle = `rgba(255,255,255,${a})`; for (let y = 0; y < H - 8; y += 1) c.fillRect(sx + (y >> 2), y0 + y, 2, 1); }
  c.fillStyle = '#d6b87a'; c.fillRect(x0, y0 + H - 6, W, 6); c.fillStyle = '#b89a5a'; for (let i = 0; i < 20; i++) c.fillRect(x0 + ((i * 17) % W), y0 + H - 5 + (i % 3), 2, 1);
  c.fillStyle = '#7a7a84'; c.fillRect(x0 + 52, y0 + H - 10, 14, 6); c.fillStyle = '#9a9aa4'; c.fillRect(x0 + 54, y0 + H - 11, 9, 2); c.fillStyle = '#5a5a64'; c.fillRect(x0 + 60, y0 + H - 7, 6, 3);
  c.fillStyle = '#d96a5a'; c.fillRect(x0 + 20, y0 + H - 11, 8, 5); c.fillStyle = '#f09a8a'; c.fillRect(x0 + 21, y0 + H - 12, 5, 2); c.fillStyle = '#fff'; c.fillRect(x0 + 22, y0 + H - 9, 2, 1);
  for (const [bx, hh, col] of [[8, 16, '#3f8d3c'], [12, 12, '#5fae3c'], [76, 18, '#3f8d3c'], [80, 13, '#5fae3c'], [34, 9, '#4f9d4c']]) for (let j = 0; j < hh; j++) { c.fillStyle = (j % 4 < 2) ? col : '#6fc04c'; c.fillRect(x0 + bx + Math.round(Math.sin(tm / 500 + j * 0.5 + bx) * (1 + j * 0.08)), y0 + H - 6 - j, 2, 1); }
  c.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 4; i++) { const t = ((tm / 1400 + i * 0.27) % 1); c.fillRect(x0 + 72 + i * 3 + Math.round(Math.sin(t * 9 + i) * 1.5), y0 + H - 8 - t * (H - 10), 1, 1); }
}

// ---- растения: спрайт кешируется и перерисовывается только при смене стадии; ветер сдвигает верхушку на 1–2 пикселя ----
const DEADC = ['#6b5a3a', '#5a4a30', '#7a6842'];
const ART = { st: null };
function plantSprite(slot, p, dg, tint) {
  const key = `${p.seed}|${p.r}|${Math.floor(dg * 120)}|${p.x ? 1 : 0}|${Math.round(tint * 10)}`;
  if (slot.sk !== key) {
    if (!slot.spr) slot.spr = mkc(48, 54);
    const s = slot.spr.getContext('2d'), g = gen(p.seed, p.r); s.clearRect(0, 0, 48, 54);
    for (const q of g.px) if (q.t <= dg) { s.fillStyle = p.x && q.l >= 0 ? DEADC[(q.x * 7 + q.y * 3) % 3] : q.c; s.fillRect(q.x, q.y, 1, 1); if (tint && q.l >= 0) { s.fillStyle = `rgba(170,120,40,${tint})`; s.fillRect(q.x, q.y, 1, 1); } }
    slot.sk = key;
  }
  return slot.spr;
}
const auraCache = {};
function auraCv(col) {
  if (auraCache[col]) return auraCache[col];
  const cv = mkc(48, 64), c = cv.getContext('2d'); c.fillStyle = col;
  for (const [r2, a] of [[440, 0.05], [270, 0.06], [130, 0.07]]) { c.globalAlpha = a; for (let y = 6; y < 58; y++) for (let x = 2; x < 46; x++) if ((x - 24) ** 2 + (y - 33) ** 2 < r2) c.fillRect(x, y, 1, 1); }
  return (auraCache[col] = cv);
}
function swayDraw(c, spr, x, y, tm, k, reduced) {
  if (k <= 0 || reduced) { c.drawImage(spr, x, y); return; }
  const wind = 0.6 + 0.4 * Math.sin(tm / 3500);
  for (let j = 0; j < 54; j++) { const lev = (53 - j) / 40, a = Math.min(2.2, 1.6 * lev * lev + lev * 0.4) * k * wind, sh = Math.round(Math.sin(tm / 1000 + j * 0.045) * a); c.drawImage(spr, 0, j, 48, 1, x + sh, y + j, 48, 1); }
}
function drawSlot(c, E, i) {
  const s = E.slots[i]; if (!s) return;
  const [cx, ty] = SLOTPOS[i], skin = E.pots[i] || 0, potTop = ty - 15, soilY = potTop + (skin === 2 ? 8 : 1), p = s.p, wob = s.wob && E.tm - s.wob < 360 ? (Math.floor((E.tm - s.wob) / 60) % 2 ? 1 : -1) : 0;
  if (skin !== 2) drawSoil(c, cx + wob, soilY, p && !p.x ? 1 - s.dw : 0.4);
  if (p) {
    const g = gen(p.seed, p.r);
    if (g.aura && !p.x && s.dg > 0.5) { c.globalAlpha = 0.75 + 0.25 * Math.sin(E.tm / 450); c.drawImage(auraCv(g.aura), cx - 24, soilY - 40); c.globalAlpha = 1; }
    swayDraw(c, plantSprite(s, p, s.dg, s.tint), cx - 24 + wob, soilY - 53, E.tm, p.x || s.dg < 0.12 ? 0 : Math.min(1, (s.dg - 0.12) * 3), E.reduced);
    if (!p.x && p.g >= 1) for (const sp of g.sp) if ((Math.floor(E.tm / 350) + sp.o) % 3 === 0) { c.fillStyle = RCL[p.r]; const x = cx - 24 + sp.x, y = soilY - 53 + sp.y; c.fillRect(x, y, 1, 1); if (p.r >= 3) { c.fillRect(x - 1, y, 1, 1); c.fillRect(x + 1, y, 1, 1); c.fillRect(x, y - 1, 1, 1); c.fillRect(x, y + 1, 1, 1); } }
  }
  drawPot(c, skin, cx, potTop, E.tm, wob);
}
function drawPetsTank(c, E) {
  const P = E.pets || {}, tm = E.tm, tri = (t, n) => { const u = (t / n) % 2; return u < 1 ? u : 2 - u; };
  if (P.fish) ART.fishCols.forEach((fr, i) => { const t = tm / 1000, x = TANK.x + 4 + tri(t + i * 5.1, 11 + i * 3) * (TANK.w - 20), dirR = ((t + i * 5.1) / (11 + i * 3)) % 2 < 1, y = TANK.y + 6 + i * 8 + Math.sin(t * 1.3 + i * 2) * 3; c.save(); if (!dirR) { c.translate(Math.round(x) + 12, 0); c.scale(-1, 1); c.drawImage(fr[Math.floor(tm / 220) % 2], 0, Math.round(y)); } else c.drawImage(fr[Math.floor(tm / 220) % 2], Math.round(x), Math.round(y)); c.restore(); });
  if (P.seal) { const t = tm / 1000, u = (t / 14) % 2, dirR = u < 1, x = TANK.x + 2 + (dirR ? u : 2 - u) * (TANK.w - 38), y = TANK.y + 8 + Math.sin(t * 0.9) * 4, fr = PET_SPR.seal[Math.floor(tm / 600) % 2]; c.save(); if (!dirR) { c.translate(Math.round(x) + 34, 0); c.scale(-1, 1); c.drawImage(fr, 0, Math.round(y)); } else c.drawImage(fr, Math.round(x), Math.round(y)); c.restore(); }
}
function drawPetsRoom(c, E, layer) {
  const P = E.pets || {}, tm = E.tm;
  if (layer === 'sill' && P.cat) { const hungry = !P.cat.fed, blink = (tm % 4200) < 160, tail = Math.floor(tm / (hungry ? 1200 : 420)) % 2; c.drawImage(PET_SPR.cat[hungry ? 3 : blink ? 1 : tail ? 2 : 0], 44, 60 + (hungry ? 1 : 0)); if (E.love && E.love.cat && tm - E.love.cat < 1600) drawHeart(c, 56, 52 - ((tm - E.love.cat) / 60 | 0), 1 - (tm - E.love.cat) / 1600); }
  if (layer === 'floor' && P.dog) { const hungry = !P.dog.fed, tail = Math.floor(tm / (hungry ? 900 : 180)) % 2, tongue = !hungry && Math.floor(tm / 700) % 3 === 0 || (E.love && E.love.dog && tm - E.love.dog < 1600); c.drawImage(PET_SPR.dog[hungry ? 2 : tongue ? 1 : tail ? 3 : 0], 300, 160); if (E.love && E.love.dog && tm - E.love.dog < 1600) drawHeart(c, 310, 150 - ((tm - E.love.dog) / 60 | 0), 1 - (tm - E.love.dog) / 1600); }
}
function initArt() { ART.static = buildStatic(); buildPets(); ART.fishCols = PET_SPR.fish; }
function renderRoom(c, E) {
  const nf = nightF(E.hr);
  c.clearRect(0, 0, RW, RH); drawSky(c, E.hr, E.tm); drawTank(c, E.tm, E.hr); drawPetsTank(c, E);
  c.drawImage(ART.static, 0, 0);
  c.fillStyle = nf < 0.5 ? '#fff6c0' : '#bcd0ff'; for (let y = 90; y < 168; y++) { c.globalAlpha = (nf < 0.5 ? 0.05 : 0.035) * (1 - Math.abs(y - 128) / 60); c.fillRect(30 + (y - 90) * 1.25, y, 44 - (y - 90) * 0.1, 1); } c.globalAlpha = 1;
  for (let i = 5; i < 9; i++) drawSlot(c, E, i);
  drawPetsRoom(c, E, 'sill');
  for (let i = 0; i < 5; i++) drawSlot(c, E, i);
  drawPetsRoom(c, E, 'floor');
  if (nf > 0) { c.fillStyle = `rgba(12,14,48,${0.4 * nf})`; c.fillRect(0, 0, RW, RH); }
  for (const [x, y] of LANTERNS) { const fl = 0.85 + 0.15 * Math.sin(E.tm / 130 + x), k = (0.45 + 0.55 * nf) * fl; c.fillStyle = '#ffb347'; for (const [r, a] of [[26, 0.06], [18, 0.08], [11, 0.12]]) { c.globalAlpha = a * k; for (let yy = -r; yy <= r; yy++) { const half = Math.floor(Math.sqrt(r * r - yy * yy)); c.fillRect(x - half, y + 7 + yy, half * 2 + 1, 1); } } c.globalAlpha = 1; c.fillStyle = `rgba(255,220,120,${0.6 + 0.4 * fl})`; c.fillRect(x - 3, y + 4, 7, 6); c.fillStyle = '#fff6c0'; c.fillRect(x - 1, y + 6, 3, 3); }
}
