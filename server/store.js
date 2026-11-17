'use strict';
// Хранилище игроков на SQLite (встроенный node:sqlite, без зависимостей).
// Игроки живут в памяти; на диск раз в 5 с пишутся только изменённые строки.
// Файл базы: <DATA_DIR>/garden.db — открывается любым SQLite-просмотрщиком.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const fail = m => { throw { user: m }; };
const NICK_RE = [/^[A-Za-z0-9_-]{3,16}$/, /^[А-Яа-яЁё0-9_-]{3,16}$/]; // латиница ИЛИ кириллица, не вперемешку (защита от подмены букв)
const RESERVED = ['admin', 'administrator', 'moderator', 'mod', 'system', 'server', 'support', 'root', 'pixelgarden',
  'админ', 'администратор', 'модератор', 'система', 'сервер'];

function openStore(dir) {
  const bdir = path.join(dir, 'backups');
  fs.mkdirSync(bdir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'garden.db'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY;
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, nick TEXT, nick_key TEXT UNIQUE, nick_at INTEGER NOT NULL DEFAULT 0, nick_lock INTEGER NOT NULL DEFAULT 0,
      coins INTEGER NOT NULL, earned INTEGER NOT NULL DEFAULT 0, harvests INTEGER NOT NULL DEFAULT 0,
      tank INTEGER NOT NULL DEFAULT 0, luck INTEGER NOT NULL DEFAULT 0, plants TEXT NOT NULL, push TEXT,
      created INTEGER NOT NULL, seen INTEGER NOT NULL, banned INTEGER NOT NULL DEFAULT 0, ban_reason TEXT);
    CREATE TABLE IF NOT EXISTS badwords (word TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS modlog (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, cmd TEXT NOT NULL, target TEXT, note TEXT);`);

  const players = new Map(), nickIndex = new Map(), dirty = new Set(), badwords = new Set();
  const fromRow = r => ({
    id: r.id, nick: r.nick, nickAt: r.nick_at, nickLock: r.nick_lock, coins: r.coins, earned: r.earned, harvests: r.harvests,
    tank: r.tank, luck: r.luck, plants: JSON.parse(r.plants), push: r.push, created: r.created, seen: r.seen,
    banned: r.banned, banReason: r.ban_reason,
  });
  for (const r of db.prepare('SELECT * FROM players').all()) {
    const P = fromRow(r); players.set(P.id, P);
    if (P.nick) nickIndex.set(P.nick.toLowerCase(), P.id);
  }
  for (const r of db.prepare('SELECT word FROM badwords').all()) badwords.add(r.word);

  const up = db.prepare(`INSERT INTO players (id,nick,nick_key,nick_at,nick_lock,coins,earned,harvests,tank,luck,plants,push,created,seen,banned,ban_reason)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET nick=excluded.nick, nick_key=excluded.nick_key, nick_at=excluded.nick_at, nick_lock=excluded.nick_lock,
      coins=excluded.coins, earned=excluded.earned, harvests=excluded.harvests, tank=excluded.tank, luck=excluded.luck, plants=excluded.plants,
      push=excluded.push, seen=excluded.seen, banned=excluded.banned, ban_reason=excluded.ban_reason`);
  const clr = db.prepare('UPDATE players SET nick_key=NULL WHERE id=?');
  const del = db.prepare('DELETE FROM players WHERE id=?');
  const cols = P => [P.id, P.nick ?? null, P.nick ? P.nick.toLowerCase() : null, P.nickAt, P.nickLock, P.coins, P.earned, P.harvests,
    P.tank, P.luck, JSON.stringify(P.plants), P.push ?? null, P.created, P.seen, P.banned, P.banReason ?? null];

  const touch = P => dirty.add(P.id);
  function flush() {
    if (!dirty.size) return;
    const ids = [...dirty]; dirty.clear();
    try {
      db.exec('BEGIN');
      for (const id of ids) clr.run(id); // сначала освобождаем ники, чтобы обмен/перехват ника не ломал UNIQUE
      for (const id of ids) { const P = players.get(id); if (P) up.run(...cols(P)); }
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* */ }
      ids.forEach(i => dirty.add(i));
      console.error('Ошибка записи в БД:', e.message);
    }
  }
  function add(P) { players.set(P.id, P); dirty.add(P.id); }
  function remove(id) {
    const P = players.get(id); if (!P) return;
    if (P.nick) nickIndex.delete(P.nick.toLowerCase());
    players.delete(id); dirty.delete(id); del.run(id);
  }

  // ---- ники ----
  function checkNick(raw, strict = true) {
    if (typeof raw !== 'string') fail('Некорректный ник');
    const n = raw.normalize('NFKC').trim();
    if (!NICK_RE.some(r => r.test(n)) || !/[A-Za-zА-Яа-яЁё]/.test(n))
      fail('Ник: 3–16 символов, латиница или кириллица (не вперемешку), цифры, _ и -, хотя бы одна буква');
    const key = n.toLowerCase(), bare = key.replace(/[-_0-9]/g, '');
    if (strict && (RESERVED.includes(bare) || [...badwords].some(w => key.includes(w) || bare.includes(w)))) fail('Этот ник недоступен');
    return n;
  }
  function setNick(P, nick) {
    const key = nick.toLowerCase(), holder = nickIndex.get(key);
    if (holder && holder !== P.id) fail('Ник уже занят');
    if (P.nick) nickIndex.delete(P.nick.toLowerCase());
    P.nick = nick; P.nickAt = Date.now(); nickIndex.set(key, P.id); touch(P);
  }
  function clearNick(P) { if (P.nick) nickIndex.delete(P.nick.toLowerCase()); P.nick = null; touch(P); }

  // ---- стоп-слова и журнал модератора ----
  const insBad = db.prepare('INSERT OR IGNORE INTO badwords (word) VALUES (?)'), delBad = db.prepare('DELETE FROM badwords WHERE word=?');
  const addBad = w => { badwords.add(w); insBad.run(w); };
  const removeBad = w => { const had = badwords.delete(w); delBad.run(w); return had; };
  const insLog = db.prepare('INSERT INTO modlog (ts,cmd,target,note) VALUES (?,?,?,?)');
  const log = (cmd, target, note) => insLog.run(Date.now(), cmd, target ?? null, note ?? null);
  const recentLog = n => db.prepare('SELECT * FROM modlog ORDER BY id DESC LIMIT ?').all(n);

  // ---- одноразовый импорт из старого players.json ----
  const old = path.join(dir, 'players.json');
  if (!players.size && fs.existsSync(old)) {
    try {
      for (const [id, v] of Object.entries(JSON.parse(fs.readFileSync(old, 'utf8')))) {
        if (!/^[0-9a-f]{64}$/.test(id)) continue;
        add({
          id, nick: null, nickAt: 0, nickLock: 0, coins: v.coins | 0, earned: 0, harvests: 0, tank: v.tank | 0, luck: v.luck | 0,
          plants: Array.isArray(v.plants) ? v.plants : [null, null], push: v.push || null,
          created: v.seen || Date.now(), seen: v.seen || Date.now(), banned: 0, banReason: null,
        });
      }
      flush(); fs.renameSync(old, old + '.migrated');
      console.log(`Импортировано игроков из players.json: ${players.size}`);
    } catch (e) { console.error('Импорт players.json не удался:', e.message); }
  }

  function backup() { // согласованный снимок базы, пока сервер работает; хранится 10 последних
    flush();
    const f = path.join(bdir, 'garden-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19) + '.db');
    db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`);
    for (const n of fs.readdirSync(bdir).filter(n => /^garden-.*\.db$/.test(n)).sort().slice(0, -10)) fs.rmSync(path.join(bdir, n));
    return f;
  }

  return { players, nickIndex, badwords, touch, flush, add, remove, checkNick, setNick, clearNick, addBad, removeBad, log, recentLog, backup, fail };
}
module.exports = openStore;
