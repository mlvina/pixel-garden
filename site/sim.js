'use strict';
// Локальная копия игровых правил — зеркало server/server.js (sim, phase, act, petInfo, value).
// Клиент применяет действия у себя сразу и не ждёт сервер; сервер остаётся главным: его ответ в любой момент
// перекрывает локальный расчёт. Случайное (редкость и геном нового растения/гибрида) клиент не угадывает —
// такие растения и семена помечены pend:1 и заполняются ответом сервера.
// Если меняете правила в server/server.js — меняйте и здесь (функции названы так же).
const Sim = (() => {
  const BOUNDS = [6, 8, 20, 22];
  let cat = null;
  const fail = m => { throw { user: m }; };
  const clone = o => JSON.parse(JSON.stringify(o));

  // ---------- время суток: клиент знает час на сервере в момент снимка и дальше считает сам ----------
  const hourAt = (L, ms) => ((((L.h0 + (ms - L.t0) / 3.6e6) % 24) + 24) % 24);
  function phaseAt(L, ms) {
    const s = hourAt(L, ms) * 3600, h = s / 3600, lamp = L.lv.lamp;
    let name, gm, wm;
    if (h >= 22 || h < 6) { name = 'night'; gm = Math.min(0.7, 0.2 + 0.1 * lamp); wm = 0.1; }
    else if (h < 8 || h >= 20) { name = 'dusk'; gm = Math.min(1, 0.6 + 0.05 * lamp); wm = 0.6; }
    else { name = 'day'; gm = 1; wm = 1; }
    const nb = BOUNDS.find(b => b * 3600 > s + 0.001);
    return { name, gm, wm, hour: h, until: ms + ((nb !== undefined ? nb * 3600 : 86400 + BOUNDS[0] * 3600) - s) * 1000 };
  }

  // ---------- параметры игрока ----------
  const capSec = L => 180 + 120 * L.lv.tank;
  const mulch = L => 1 - 0.07 * L.lv.mulch;
  const nurseryCap = L => 2 + L.lv.nurs;
  const bankCap = L => 4 + 2 * L.lv.bk;
  const potFx = (L, i) => cat.potFx[L.slotPots[i] || 0] || {};
  const graceOf = (L, i) => cat.grace * (potFx(L, i).grace || 1);
  const value = (L, i, p) => Math.round(cat.rar[p.r].val * (1 + ((p.seed % 21) - 10) / 50) * (potFx(L, i).value || 1));
  const lvl = (L, k) => (k === 'slot' ? L.plants.length : L.lv[k]);

  // ---------- рост растения: ленивая симуляция отрезками постоянной скорости ----------
  function simPlant(L, i, p, now) {
    if (p.dead || now <= p.t) return;
    const R = cat.rar[p.r], cap = capSec(L), pf = potFx(L, i), grace = cat.grace * (pf.grace || 1), mu = mulch(L);
    let t = p.t, guard = 0;
    while (t < now && !p.dead && p.g < 1 && guard++ < 500) {
      const ph = phaseAt(L, t);
      let e = Math.min(now, ph.until), fm = 1;
      if (p.fx) { if (t < p.fx.until) { fm = p.fx.m; e = Math.min(e, p.fx.until); } else p.fx = null; }
      const dt = (e - t) / 1000, drain = R.thirst * ph.wm * mu * (pf.drain || 1) / cap;
      const tw = drain > 0 ? Math.min(dt, p.w / drain) : dt;
      const rate = ph.gm * fm * (pf.growth || 1) / R.time;
      p.g = Math.min(1, p.g + Math.min(tw, (1 - p.g) / rate) * rate);
      p.w = Math.max(0, p.w - drain * dt); if (p.w < 1e-9) p.w = 0;
      if (p.g >= 1) p.d = 0;
      else if (p.w === 0) {
        if (!p.d) p.d = t + tw * 1000;
        if (e - p.d >= grace * 1000) p.dead = true;
      }
      t = e;
    }
    p.t = now;
  }

  function petInfo(L, id, now) {
    const d = cat.pets[id], pt = L.pets[id]; if (!pt) return null;
    const end = Math.min(now, pt.fe), every = d.every * 1000; let n = 0, base = pt.la;
    if (end > pt.la) { base = Math.max(pt.la, end - cat.giftCap * every); n = Math.min(cat.giftCap, Math.floor((end - base) / every)); }
    return { fed: Math.max(0, Math.ceil((pt.fe - now) / 1000)), gifts: n, base };
  }

  // Досчитать всё до момента now и обновить производные поля, которые читает интерфейс.
  function tick(L, now) {
    L.plants.forEach((p, i) => {
      if (!p) return;
      simPlant(L, i, p, now);
      p.x = !!p.dead; p.gr = graceOf(L, i); p.v = value(L, i, p);
      p.l = !p.dead && p.d ? Math.max(0, Math.ceil(p.gr - (now - p.d) / 1000)) : null;
      p.f = p.fx && p.fx.until > now ? { m: p.fx.m, l: Math.ceil((p.fx.until - now) / 1000) } : null;
    });
    for (const id of Object.keys(L.pets)) { const i = petInfo(L, id, now); Object.assign(L.pets[id], { fed: i.fed, gifts: i.gifts }); }
    const ph = phaseAt(L, now);
    L.ph = { name: ph.name, gm: +ph.gm.toFixed(2), wm: ph.wm, hour: ph.hour };
    L.slots = L.plants.length; L.lv.slot = L.plants.length; L.nurseryCap = nurseryCap(L); L.bankCap = bankCap(L); L.capSec = capSec(L);
    return L;
  }

  // Снимок сервера (ответ /api/state) → локальное состояние.
  function fromView(v) {
    const L = { ...v };
    L.t0 = v.now; L.h0 = v.ph.h != null ? v.ph.h : v.ph.hour;
    L.lv = { ...v.lv }; L.skins = v.skins; L.slotPots = v.slotPots.slice(); L.bank = clone(v.bank); L.nursery = v.nursery.map(n => ({ ...n, t: v.now, d: 0, fx: null }));
    L.pets = Object.fromEntries(Object.entries(v.pets).map(([id, x]) => [id, { ...x }]));
    L.plants = v.plants.map(p => p && { seed: p.seed, r: p.r, gn: p.gn, xd: p.xd ? 1 : 0, g: p.g, w: p.w, t: v.now, d: p.d || 0, fx: p.f ? { m: p.f.m, until: p.f.u != null ? p.f.u : v.now + p.f.l * 1000 } : null, dead: !!p.x });
    return L;
  }

  // ---------- действия: те же проверки и те же изменения, что на сервере ----------
  // Возвращает null при успехе или текст ошибки. При ошибке состояние не меняется.
  function apply(L, b, now) {
    try { run(L, b, now); return null; } catch (e) { if (e && e.user) return e.user; throw e; }
  }
  function run(L, b, now) {
    L.plants.forEach((p, i) => p && simPlant(L, i, p, now));
    const slot = (v = b.slot) => { if (!Number.isInteger(v) || v < 0 || v >= L.plants.length) fail('Нет такой грядки'); return v; };
    const nidx = () => { if (!Number.isInteger(b.idx) || b.idx < 0 || b.idx >= L.nursery.length) fail('Нет такого растения'); return b.idx; };
    const pay = c => { if (L.coins < c) fail('Не хватает монет'); L.coins -= c; };
    const pet = () => { if (typeof b.id !== 'string' || !Object.hasOwn(cat.pets, b.id)) fail('Нет такого питомца'); return b.id; };
    const waiting = () => fail('Подождите секунду: сервер ещё определяет растение');
    switch (b.a) {
      case 'plant': {
        const i = slot();
        if (L.plants[i]) fail('Грядка занята');
        if (b.bank !== undefined) {
          if (!Number.isInteger(b.bank) || b.bank < 0 || b.bank >= L.bank.length) fail('Нет такого семени');
          if (L.bank[b.bank].pend) waiting();
          const s = L.bank.splice(b.bank, 1)[0];
          L.plants[i] = { seed: s.seed, r: s.r, gn: s.gn | 0, g: 0, w: 1, t: now, d: 0, fx: null, xd: 0 }; break;
        }
        const pack = cat.seeds.find(s => s.id === b.seed);
        if (!pack) fail('Неизвестные семена');
        pay(pack.cost);
        L.plants[i] = { seed: 0, r: 0, gn: 0, g: 0, w: 1, t: now, d: 0, fx: null, xd: 0, pend: 1 }; // редкость и геном бросает сервер
        break;
      }
      case 'water': {
        const p = L.plants[slot()];
        if (!p) fail('Грядка пуста');
        if (p.dead) fail('Растение засохло, уберите его');
        p.w = 1; p.d = 0; break;
      }
      case 'waterall': L.plants.forEach(p => { if (p && !p.dead) { p.w = 1; p.d = 0; } }); break;
      case 'clear': {
        const i = slot();
        if (!L.plants[i] || !L.plants[i].dead) fail('Нечего убирать');
        L.plants[i] = null; break;
      }
      case 'harvest': {
        const i = slot(), p = L.plants[i];
        if (!p) fail('Грядка пуста');
        if (p.dead) fail('Растение засохло');
        if (p.g < 1) fail('Растение ещё не выросло');
        L.coins += value(L, i, p); L.plants[i] = null; break;
      }
      case 'cross': {
        const ia = slot(b.pa), ib = slot(b.pb), A = L.plants[ia], B = L.plants[ib];
        if (ia === ib) fail('Нужны два разных растения');
        for (const p of [A, B]) { if (!p || p.dead) fail('Нужны живые растения'); if (p.g < 1) fail('Растения должны созреть'); if (p.xd) fail('Это растение уже опыляли'); }
        if (L.bank.length >= bankCap(L)) fail('Банк семян заполнен');
        pay(20 * 2 ** Math.max(A.r, B.r));
        A.xd = B.xd = 1;
        L.bank.push({ seed: 0, r: 0, gn: Math.max(A.gn | 0, B.gn | 0) + 1, pend: 1 }); break; // геном потомка бросает сервер
      }
      case 'bankdrop': { if (!Number.isInteger(b.idx) || b.idx < 0 || b.idx >= L.bank.length) fail('Нет такого семени'); L.bank.splice(b.idx, 1); break; }
      case 'fert': {
        const p = L.plants[slot()], f = cat.fert.find(x => x.id === b.id);
        if (!f) fail('Неизвестное удобрение');
        if (!p || p.dead) fail('Нечего удобрять');
        if (p.g >= 1) fail('Растение уже выросло');
        if (p.fx && p.fx.until > now) fail('Уже удобрено');
        pay(f.cost); p.fx = { m: f.m, until: now + f.sec * 1000 }; break;
      }
      case 'dig': {
        const i = slot(), p = L.plants[i];
        if (!p || p.dead) fail('Нечего выкапывать');
        if (p.pend) waiting(); // цена зависит от редкости
        if (p.g >= 1) fail('Созревшее растение просто соберите');
        if (L.nursery.length >= nurseryCap(L)) fail('Питомник заполнен');
        pay(cat.rar[p.r].dig);
        L.nursery.push({ seed: p.seed, r: p.r, gn: p.gn | 0, g: p.g, w: p.w, t: now, d: 0, fx: null, xd: p.xd ? 1 : 0 }); L.plants[i] = null; break;
      }
      case 'replant': {
        const idx = nidx();
        const i = Number.isInteger(b.slot) && b.slot >= 0 && b.slot < L.plants.length && !L.plants[b.slot] ? b.slot : L.plants.findIndex(p => !p);
        if (i < 0) fail('Нет свободной грядки');
        const [p] = L.nursery.splice(idx, 1); p.t = now; L.plants[i] = p; break;
      }
      case 'drop': L.nursery.splice(nidx(), 1); break;
      case 'upgrade': {
        const k = b.kind, u = cat.upg[k];
        if (!u || !Object.hasOwn(cat.upg, k)) fail('Неизвестное улучшение');
        const n = lvl(L, k);
        if (n >= u.max) fail('Максимальный уровень');
        pay(u.costs[n - u.from]);
        if (k === 'slot') { L.plants.push(null); L.slotPots.push(0); } else L.lv[k]++;
        break;
      }
      case 'skin': {
        const id = b.id;
        if (!Number.isInteger(id) || id < 1 || id >= cat.skins.length) fail('Нет такого горшка');
        if ((L.skins >> id) & 1) fail('Уже куплен');
        pay(cat.skins[id]); L.skins |= 1 << id; break;
      }
      case 'setpot': {
        const i = slot(), id = b.id;
        if (!Number.isInteger(id) || id < 0 || id >= cat.skins.length || !((L.skins >> id) & 1)) fail('Этот горшок не куплен');
        L.slotPots[i] = id; break;
      }
      case 'buypet': { const id = pet(); if (L.pets[id]) fail('Уже есть'); pay(cat.pets[id].cost); L.pets[id] = { fe: 0, la: now, fed: 0, gifts: 0 }; break; }
      case 'feed': {
        const id = pet(), pt = L.pets[id]; if (!pt) fail('Сначала заведите питомца');
        const i = petInfo(L, id, now);
        if (i.fed > 6 * 3600) fail('Он сыт');
        pay(cat.pets[id].feed);
        if (pt.fe < now) pt.la = now; else pt.la = i.base;
        pt.fe = Math.max(pt.fe, now) + cat.feedMs; break;
      }
      case 'gift': {
        const id = pet(), pt = L.pets[id]; if (!pt) fail('Сначала заведите питомца');
        const i = petInfo(L, id, now);
        if (i.gifts < 1) fail('Подарка пока нет');
        L.coins += i.gifts * cat.pets[id].gift;
        pt.la = i.base + i.gifts * cat.pets[id].every * 1000; break;
      }
      default: break; // остальное (ник и т.п.) решает только сервер
    }
  }

  return {
    setCatalog(c) { cat = c; }, hourAt, phaseAt, tick, fromView, apply, value, petInfo,
    // действия, чей результат известен только серверу
    isLocal: a => ['plant', 'water', 'waterall', 'clear', 'harvest', 'cross', 'bankdrop', 'fert', 'dig', 'replant', 'drop', 'upgrade', 'skin', 'setpot', 'buypet', 'feed', 'gift'].includes(a),
  };
})();
