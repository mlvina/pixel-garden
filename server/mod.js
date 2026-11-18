'use strict';
// Команды модератора. Запускаются на сервере:  garden <команда>   (см. admin.js и deploy/garden.sh)
const crypto = require('node:crypto');
const auth = require('./auth');
const fail = m => { throw { user: m }; };
const pad = (a, n) => String(a).padEnd(n);
const short = P => P.id.slice(0, 8);
const ago = ms => {
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  return s < 60 ? s + 'с' : s < 3600 ? Math.floor(s / 60) + 'м' : s < 86400 ? Math.floor(s / 3600) + 'ч' : Math.floor(s / 86400) + 'д';
};
const when = ms => new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const HEAD = pad('id', 10) + pad('ник', 18) + pad('монеты', 9) + pad('заработал', 11) + pad('заход', 7);
const row = P => pad(short(P), 10) + pad(P.nick || '—', 18) + pad(P.coins, 9) + pad(P.earned, 11) + pad(ago(P.seen), 7) + (P.banned ? 'БАН' : '');
const HELP = `Команды (на сервере: garden <команда>):
  stats                         сводка
  list [N]                      последние по времени захода
  top [N]                       лучшие по заработку
  find <текст>                  поиск по нику или началу id
  info <ник|id>                 карточка игрока
  ban <ник|id> [причина]        заблокировать (игрок увидит причину)
  unban <ник|id>                разблокировать
  rename <ник|id> <новый ник>   сменить ник принудительно
  clearnick <ник|id>            убрать ник и запретить его менять
  allownick <ник|id>            снова разрешить менять ник
  give <ник|id> <число>         выдать монеты (минус — забрать)
  passwd <ник|id>               сбросить пароль (выдаст новый временный) и выйти со всех устройств
  delete <ник|id> yes           удалить аккаунт навсегда
  badword add|del|list [слово]  запрещённые слова в никах
  log [N]                       журнал действий модератора
  backup                        снимок базы в data/backups`;

module.exports = function run(a, store) {
  const { players, nickIndex, badwords } = store;
  const cmd = (a[0] || 'help').toLowerCase();
  const N = i => Math.min(100, Math.max(1, parseInt(a[i], 10) || 20));
  const who = P => `${short(P)} ${P.nick || ''}`.trim();
  const target = () => {
    const q = (a[1] || '').toLowerCase();
    if (!q) fail('Укажите ник или id (команда help покажет список)');
    const byNick = nickIndex.get(q);
    if (byNick) return players.get(byNick);
    if (/^[0-9a-f]{6,64}$/.test(q)) {
      const m = [...players.values()].filter(P => P.id.startsWith(q));
      if (m.length === 1) return m[0];
      if (m.length > 1) fail('Несколько совпадений — укажите больше символов id');
    }
    fail('Игрок не найден: ' + a[1]);
  };
  const table = list => [HEAD, ...list.map(row)].join('\n') + `\nВсего показано: ${list.length}`;
  const all = () => [...players.values()];

  switch (cmd) {
    case 'help': return HELP;
    case 'stats': {
      const now = Date.now(), L = all();
      return [`Игроков: ${L.length}`, `С ником: ${L.filter(P => P.nick).length}`, `Заблокировано: ${L.filter(P => P.banned).length}`,
        `Заходили за 24 ч: ${L.filter(P => now - P.seen < 864e5).length}`, `Онлайн (5 мин): ${L.filter(P => now - P.seen < 3e5).length}`,
        `Монет у всех: ${L.reduce((s, P) => s + P.coins, 0)}`, `Стоп-слов: ${badwords.size}`].join('\n');
    }
    case 'list': return table(all().sort((x, y) => y.seen - x.seen).slice(0, N(1)));
    case 'top': return table(all().sort((x, y) => y.earned - x.earned).slice(0, N(1)));
    case 'find': {
      const q = (a[1] || '').toLowerCase();
      if (!q) fail('Что искать?');
      return table(all().filter(P => (P.nick && P.nick.toLowerCase().includes(q)) || P.id.startsWith(q)).slice(0, 20));
    }
    case 'info': {
      const P = target(), pl = P.plants.filter(Boolean);
      return [`id:        ${P.id}`, `ник:       ${P.nick || '—'}${P.nick ? ` (менялся ${ago(P.nickAt)} назад)` : ''}${P.nickLock ? ' [смена запрещена]' : ''}`,
        `создан:    ${when(P.created)}`, `заходил:   ${ago(P.seen)} назад`,
        `монеты:    ${P.coins}   заработано: ${P.earned}   сборов: ${P.harvests}`,
        `грядок:    ${P.plants.length}   бак: ${P.tank}   удача: ${P.luck}`,
        `растения:  ${pl.length} (засохло: ${pl.filter(p => p.dead).length}), в питомнике: ${P.nursery.length}`,
        `урожаи:    ${P.stats.hr.join('/')} (обыч/необыч/ред/эпик/лега)   засохло: ${P.stats.wilt}   выкопано: ${P.stats.dug}   потрачено: ${P.stats.spent}`,
        `пароль:    ${P.pass ? 'задан' : 'НЕТ (старый анонимный аккаунт)'}   устройств: ${store.sessionCount(P.id)}`, `уведомления: ${P.push ? 'вкл' : 'выкл'}`,
        P.banned ? `СТАТУС:    ЗАБЛОКИРОВАН${P.banReason ? ' — ' + P.banReason : ''}` : 'статус:    активен'].join('\n');
    }
    case 'ban': {
      const P = target(); P.banned = 1; P.banReason = a.slice(2).join(' ').slice(0, 200) || null;
      store.touch(P); store.log('ban', who(P), P.banReason); return `Заблокирован: ${who(P)}`;
    }
    case 'unban': {
      const P = target(); P.banned = 0; P.banReason = null; store.touch(P); store.log('unban', who(P)); return `Разблокирован: ${who(P)}`;
    }
    case 'rename': {
      const P = target(), old = P.nick; if (!a[2]) fail('Укажите новый ник');
      store.setNick(P, store.checkNick(a[2], false)); store.log('rename', short(P), `${old || '—'} → ${P.nick}`);
      return `Ник изменён: ${old || '—'} → ${P.nick}`;
    }
    case 'clearnick': {
      const P = target(), old = P.nick; store.clearNick(P); P.nickLock = 1; store.touch(P);
      store.log('clearnick', short(P), old); return `Ник «${old || '—'}» убран, смена запрещена (разрешить: allownick)`;
    }
    case 'allownick': { const P = target(); P.nickLock = 0; store.touch(P); store.log('allownick', who(P)); return 'Смена ника разрешена: ' + who(P); }
    case 'give': {
      const P = target(), n = Number(a[2]);
      if (!Number.isInteger(n) || Math.abs(n) > 1e9) fail('Укажите целое число монет');
      P.coins = Math.max(0, P.coins + n); store.touch(P); store.log('give', who(P), String(n)); return `${who(P)}: теперь ${P.coins} монет`;
    }
    case 'passwd': {
      const P = target(), np = crypto.randomBytes(9).toString('base64url');
      P.pass = auth.hashSync(np); store.touch(P); store.sessionsDelPid(P.id); store.log('passwd', who(P));
      return `Новый временный пароль для ${who(P)}: ${np}\nПередайте его игроку — он сможет сменить пароль в игре.`;
    }
    case 'delete': {
      const P = target();
      if (a[2] !== 'yes') fail(`Удаление необратимо. Подтвердите: delete ${a[1]} yes`);
      store.log('delete', who(P), `монет ${P.coins}`); store.remove(P.id); return 'Удалён: ' + who(P);
    }
    case 'badword': {
      const sub = (a[1] || 'list').toLowerCase(), w = (a[2] || '').toLowerCase();
      if (sub === 'list') return badwords.size ? [...badwords].sort().join(', ') : 'Список пуст';
      if (!/^[a-zа-яё]{2,16}$/.test(w)) fail('Слово: 2–16 букв, латиница или кириллица');
      if (sub === 'add') {
        store.addBad(w); store.log('badword add', null, w);
        const hit = all().filter(P => P.nick && P.nick.toLowerCase().includes(w)).map(P => `${P.nick} (${short(P)})`);
        return `Добавлено: ${w}` + (hit.length ? `\nУже есть в никах: ${hit.join(', ')} — уберите командой clearnick` : '');
      }
      if (sub === 'del') { store.log('badword del', null, w); return store.removeBad(w) ? 'Удалено: ' + w : 'Такого слова нет'; }
      return fail('badword add|del|list [слово]');
    }
    case 'log': {
      const rows = store.recentLog(N(1));
      return rows.length ? rows.map(r => `${when(r.ts)}  ${pad(r.cmd, 12)}${pad(r.target || '', 22)}${r.note || ''}`).join('\n') : 'Журнал пуст';
    }
    case 'backup': return 'Снимок создан: ' + store.backup();
    default: return fail(`Неизвестная команда «${cmd}». Список: help`);
  }
};
