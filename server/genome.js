'use strict';
const crypto = require('node:crypto');

// ---------- геном и селекция ----------
// Растение = rarity + геном: 12 «генов» по 4 бита, упакованы в целое число (< 2^48). Клиент строит внешний вид из генома,
// поэтому потомок при скрещивании визуально наследует форму, палитру и размер родителей. Старые семена (< 2^32) раскрываются в гены так же, как в gen.js.
const GN = 12, PAL_BY_R = [[0, 0, 0, 1], [0, 1, 1, 2], [2, 3, 2, 1], [4, 5, 3, 2], [6, 7, 8, 5]], KINDN = 14, PALN = 9;
const enc = g => g.reduce((s, v, i) => s + v * 16 ** i, 0);
const dec = x => Array.from({ length: GN }, (_, i) => Math.floor(x / 16 ** i) % 16);
const rng = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function genesOf(seed, r) { // обязано совпадать с genesOf в site/gen.js
  if (seed >= 4294967296) return dec(seed);
  const R = rng(seed), g = []; for (let i = 0; i < GN; i++) g.push((R() * 16) | 0);
  g[0] = (R() * KINDN) | 0; g[1] = PAL_BY_R[r][(R() * 4) | 0]; g[11] = Math.max(1, g[11]); return g;
}
function makeGenome(r) {
  const g = Array.from({ length: GN }, () => crypto.randomInt(16));
  g[0] = crypto.randomInt(KINDN); g[1] = PAL_BY_R[r][crypto.randomInt(4)]; g[11] = 1 + crypto.randomInt(15); return enc(g);
}
function crossGenome(a, ra, b, rb) {
  const A = genesOf(a, ra), B = genesOf(b, rb), c = [];
  for (let i = 0; i < GN; i++) {
    const roll = crypto.randomInt(100);
    if (roll < 6) c.push(crypto.randomInt(16)); // мутация
    else if (roll < 24 && [2, 3, 4, 6, 8].includes(i)) c.push(Math.round((A[i] + B[i]) / 2)); // плавные признаки смешиваются
    else c.push(crypto.randomInt(2) ? A[i] : B[i]);
  }
  c[0] %= KINDN; c[1] %= PALN; c[11] = Math.max(1, c[11]); return enc(c);
}
function crossRarity(ra, rb) {
  const avg = (ra + rb) / 2; let r = Math.floor(avg) + (avg % 1 ? crypto.randomInt(2) : 0);
  const roll = crypto.randomInt(100);
  if (roll < 14) r++; else if (roll < 30) r--; else if (ra === rb && roll < 36) r++;
  return Math.max(0, Math.min(4, r));
}

module.exports = { GN, KINDN, PALN, PAL_BY_R, enc, dec, rng, genesOf, makeGenome, crossGenome, crossRarity };
