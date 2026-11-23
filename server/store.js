'use strict';
// Хранилище на SQLite (встроенный node:sqlite). Игроки живут в памяти, на диск раз в 5 с пишутся только изменённые строки.
// Файл: <DATA_DIR>/garden.db — открывается любым SQLite-просмотрщиком.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const fail = m => { throw { user: m }; };
const NICK_RE = [/^[A-Za-z0-9_-]{3,16}$/, /^[А-Яа-яЁё0-9_-]{3,16}$/]; // латиница ИЛИ кириллица (защита от подмены букв)
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
    CREATE TABLE IF NOT EXISTS modlog (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, cmd TEXT NOT NULL, target TEXT, note TEXT);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, pid TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_pid ON sessions(pid);
    CREATE TABLE IF NOT EXISTS gallery (id INTEGER PRIMARY KEY AUTOINCREMENT, pid TEXT NOT NULL, seed INTEGER NOT NULL, r INTEGER NOT NULL, ts INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS gallery_pid ON gallery(pid);`);
  const have = db.prepare('PRAGMA table_info(players)').all().map(c => c.name);
  if (!have.includes('pass')) db.exec('ALTER TABLE players ADD COLUMN pass TEXT');
  if (!have.includes('extra')) db.exec('ALTER TABLE players ADD COLUMN extra TEXT');
  // игроки версий 1–3 входили по токену: id = sha256(токена). Оставляем их токены рабочими как сессии.
  db.exec('INSERT OR IGNORE INTO sessions (hash,pid,created) SELECT id,id,created FROM players WHERE length(id)=64');

  const players = new Map(), nickIndex = new Map(), dirty = new Set(), badwords = new Set(), sessions = new Map();
  const defStats = () => ({ hr: [0, 0, 0, 0, 0], wilt: 0, dug: 0, spent: 0, fert: 0, cross: 0, pg: 0 });
  const fromRow = r => {
    const x = r.extra ? JSON.parse(r.extra) : {};
    const P = {
      id: r.id, nick: r.nick, nickAt: r.nick_at, nickLock: r.nick_lock, coins: r.coins, earned: r.earned, harvests: r.harvests,
      tank: r.tank, luck: r.luck, plants: JSON.parse(r.plants), push: r.push, created: r.created, seen: r.seen,
      banned: r.banned, banReason: r.ban_reason, pass: r.pass,
      nurs: x.nurs | 0, lamp: x.lamp | 0, mulch: x.mulch | 0, bk: x.bk | 0, skins: x.skins | 1, slotPots: [],
      nursery: x.nursery || [], bank: x.bank || [], pets: x.pets || {}, stats: { ...defStats(), ...(x.stats || {}) },
    };
    P.slotPots = Array.isArray(x.slotPots) ? x.slotPots.slice(0, P.plants.length) : []; while (P.slotPots.length < P.plants.length) P.slotPots.push(0);
    return P;
  };
  const blank = (id, nick, pass) => {
    const now = Date.now();
    return { id, nick: null, nickAt: 0, nickLock: 0, coins: 20, earned: 0, harvests: 0, tank: 0, luck: 0, plants: [null, null], push: null,
      created: now, seen: now, banned: 0, banReason: null, pass: pass || null, nurs: 0, lamp: 0, mulch: 0, bk: 0, skins: 1, slotPots: [0, 0], nursery: [], bank: [], pets: {}, stats: defStats() };
  };
  for (const r of db.prepare('SELECT * FROM players').all()) {
    const P = fromRow(r); players.set(P.id, P);
    if (P.nick) nickIndex.set(P.nick.toLowerCase(), P.id);
  }
  for (const r of db.prepare('SELECT word FROM badwords').all()) badwords.add(r.word);
  for (const r of db.prepare('SELECT hash,pid FROM sessions').all()) sessions.set(r.hash, r.pid);

  const up = db.prepare(`INSERT INTO players (id,nick,nick_key,nick_at,nick_lock,coins,earned,harvests,tank,luck,plants,push,created,seen,banned,ban_reason,pass,extra)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET nick=excluded.nick, nick_key=excluded.nick_key, nick_at=excluded.nick_at, nick_lock=excluded.nick_lock,
      coins=excluded.coins, earned=excluded.earned, harvests=excluded.harvests, tank=excluded.tank, luck=excluded.luck, plants=excluded.plants,
      push=excluded.push, seen=excluded.seen, banned=excluded.banned, ban_reason=excluded.ban_reason, pass=excluded.pass, extra=excluded.extra`);
  const clr = db.prepare('UPDATE players SET nick_key=NULL WHERE id=?');
  const cols = P => [P.id, P.nick ?? null, P.nick ? P.nick.toLowerCase() : null, P.nickAt, P.nickLock, P.coins, P.earned, P.harvests,
    P.tank, P.luck, JSON.stringify(P.plants), P.push ?? null, P.created, P.seen, P.banned, P.banReason ?? null, P.pass ?? null,
    JSON.stringify({ nurs: P.nurs, lamp: P.lamp, mulch: P.mulch, bk: P.bk, skins: P.skins, slotPots: P.slotPots, nursery: P.nursery, bank: P.bank, pets: P.pets, stats: P.stats })];

  const touch = P => dirty.add(P.id);
  function flush() {
    if (!dirty.size) return;
    const ids = [...dirty]; dirty.clear();
    try {
      db.exec('BEGIN');
      for (const id of ids) clr.run(id); // освобождаем ники, чтобы обмен/перехват ника не ломал UNIQUE
      for (const id of ids) { const P = players.get(id); if (P) up.run(...cols(P)); }
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* */ }
      ids.forEach(i => dirty.add(i));
      console.error('Ошибка записи в БД:', e.message);
    }
  }
  const sDel = db.prepare('DELETE FROM sessions WHERE pid=?'), gDel = db.prepare('DELETE FROM gallery WHERE pid=?'), pDel = db.prepare('DELETE FROM players WHERE id=?');
  function remove(id) {
    const P = players.get(id); if (!P) return;
    if (P.nick) nickIndex.delete(P.nick.toLowerCase());
    for (const [h, pid] of sessions) if (pid === id) sessions.delete(h);
    players.delete(id); dirty.delete(id); sDel.run(id); gDel.run(id); pDel.run(id);
  }
  function create(nick, pass) { // новый аккаунт с ником и паролем
    const P = blank(crypto.randomBytes(16).toString('hex'), nick, pass);
    players.set(P.id, P); setNick(P, nick); return P;
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

  // ---- сессии (токен у игрока в браузере, у нас только его хеш) ----
  const sIns = db.prepare('INSERT OR REPLACE INTO sessions (hash,pid,created) VALUES (?,?,?)'), sOne = db.prepare('DELETE FROM sessions WHERE hash=?');
  const sOld = db.prepare('SELECT hash FROM sessions WHERE pid=? ORDER BY created DESC LIMIT -1 OFFSET 5');
  function sessionAdd(hash, pid) {
    sIns.run(hash, pid, Date.now()); sessions.set(hash, pid);
    for (const r of sOld.all(pid)) { sOne.run(r.hash); sessions.delete(r.hash); } // не больше 5 устройств
  }
  const sessionDel = hash => { sOne.run(hash); sessions.delete(hash); };
  function sessionsDelPid(pid, keep) {
    for (const [h, p] of [...sessions]) if (p === pid && h !== keep) { sOne.run(h); sessions.delete(h); }
  }
  const sessionCount = pid => [...sessions.values()].filter(p => p === pid).length;

  // ---- галерея выращенных растений ----
  const gIns = db.prepare('INSERT INTO gallery (pid,seed,r,ts) VALUES (?,?,?,?)');
  const gTrim = db.prepare('DELETE FROM gallery WHERE id IN (SELECT id FROM gallery WHERE pid=? ORDER BY r ASC, ts ASC LIMIT MAX(0,(SELECT COUNT(*) FROM gallery WHERE pid=?)-?))');
  const gGet = db.prepare('SELECT seed,r,ts FROM gallery WHERE pid=? ORDER BY r DESC, ts DESC LIMIT 100');
  const GALLERY_MAX = 100;
  const galleryAdd = (pid, seed, r) => { gIns.run(pid, seed, r, Date.now()); gTrim.run(pid, pid, GALLERY_MAX); };
  const gallery = pid => gGet.all(pid).map(x => ({ seed: x.seed, r: x.r, ts: x.ts }));

  // ---- стоп-слова и журнал модератора ----
  const insBad = db.prepare('INSERT OR IGNORE INTO badwords (word) VALUES (?)'), delBad = db.prepare('DELETE FROM badwords WHERE word=?');
  const addBad = w => { badwords.add(w); insBad.run(w); };
  const removeBad = w => { const had = badwords.delete(w); delBad.run(w); return had; };
  const insLog = db.prepare('INSERT INTO modlog (ts,cmd,target,note) VALUES (?,?,?,?)');
  const log = (cmd, target, note) => insLog.run(Date.now(), cmd, target ?? null, note ?? null);
  const recentLog = n => db.prepare('SELECT * FROM modlog ORDER BY id DESC LIMIT ?').all(n);

  // ---- одноразовый импорт из players.json (версия 1–2) ----
  const old = path.join(dir, 'players.json');
  if (!players.size && fs.existsSync(old)) {
    try {
      for (const [id, v] of Object.entries(JSON.parse(fs.readFileSync(old, 'utf8')))) {
        if (!/^[0-9a-f]{64}$/.test(id)) continue;
        const P = blank(id); Object.assign(P, { coins: v.coins | 0, tank: v.tank | 0, luck: v.luck | 0, plants: Array.isArray(v.plants) ? v.plants : [null, null], push: v.push || null, created: v.seen || P.created, seen: v.seen || P.seen });
        players.set(id, P); dirty.add(id); sessions.set(id, id); sIns.run(id, id, P.created);
      }
      flush(); fs.renameSync(old, old + '.migrated');
      console.log(`Импортировано игроков из players.json: ${players.size}`);
    } catch (e) { console.error('Импорт players.json не удался:', e.message); }
  }

  function backup() { // согласованный снимок базы без остановки сервера; хранится 10 последних
    flush();
    const f = path.join(bdir, 'garden-' + new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19) + '.db');
    db.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`);
    for (const n of fs.readdirSync(bdir).filter(n => /^garden-.*\.db$/.test(n)).sort().slice(0, -10)) fs.rmSync(path.join(bdir, n));
    return f;
  }

  return { players, nickIndex, badwords, sessions, touch, flush, remove, create, checkNick, setNick, clearNick,
    sessionAdd, sessionDel, sessionsDelPid, sessionCount, galleryAdd, gallery, addBad, removeBad, log, recentLog, backup, fail };
}
module.exports = openStore;
