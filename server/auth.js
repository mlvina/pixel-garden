'use strict';
// Пароли: scrypt (встроенный в Node) с уникальной солью на каждого игрока. Хеширование ограничено по параллельности,
// чтобы поток запросов на вход не мог загрузить процессор.
const crypto = require('node:crypto');
const OPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, LEN = 32;
const DUMMY = crypto.randomBytes(16);
const COMMON = new Set(['12345678', '123456789', '1234567890', 'password', 'qwertyui', 'qwerty123', '11111111', '87654321', 'password1', 'йцукенгш', '123123123', 'abcd1234']);
let active = 0; const queue = [];
const take = () => new Promise((ok, no) => {
  if (active < 4) { active++; ok(); } else if (queue.length < 30) queue.push(ok); else no({ user: 'Сервер занят, попробуйте через минуту' });
});
const give = () => { const n = queue.shift(); if (n) n(); else active--; };
const scrypt = (pass, salt) => new Promise((ok, no) => crypto.scrypt(pass, salt, LEN, OPT, (e, k) => (e ? no(e) : ok(k))));

async function hash(pass) {
  await take();
  try { const salt = crypto.randomBytes(16); return `s1$${salt.toString('base64')}$${(await scrypt(pass, salt)).toString('base64')}`; } finally { give(); }
}
async function verify(pass, stored) { // для несуществующего игрока считаем «пустышку», чтобы время ответа не выдавало, есть ли такой ник
  await take();
  try {
    const [, s, h] = stored ? stored.split('$') : [];
    const k = await scrypt(pass, stored ? Buffer.from(s, 'base64') : DUMMY);
    if (!stored) return false;
    const want = Buffer.from(h, 'base64');
    return want.length === k.length && crypto.timingSafeEqual(want, k);
  } finally { give(); }
}
function hashSync(pass) {
  const salt = crypto.randomBytes(16);
  return `s1$${salt.toString('base64')}$${crypto.scryptSync(pass, salt, LEN, OPT).toString('base64')}`;
}
function check(pass, nick) {
  const fail = m => { throw { user: m }; };
  if (typeof pass !== 'string' || pass.length < 8 || pass.length > 128) fail('Пароль: от 8 до 128 символов');
  if (nick && pass.toLowerCase() === nick.toLowerCase()) fail('Пароль не должен совпадать с ником');
  if (COMMON.has(pass.toLowerCase())) fail('Слишком простой пароль');
}
module.exports = { hash, verify, hashSync, check };
