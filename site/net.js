'use strict';
// Сеть без ожидания: действие игрока сразу применяется к локальному состоянию (Sim) и ставится в очередь,
// а в фоне уходит на сервер пачкой. Ответ сервера (авторитетный снимок) заменяет расчёт, а ещё не подтверждённые
// действия проигрываются поверх него заново — поэтому интерфейс не «прыгает». Обрыв связи не страшен:
// очередь хранится в localStorage и уходит позже; у пачки есть id, сервер не выполнит её дважды.
const Net = (() => {
  const MIN_GAP = 250, POLL_MS = 5000, BATCH = 16, KEEP_MS = 10 * 60 * 1000;
  let token = null, auth = null, S = null, cat = null;
  let queue = [], inflight = null, busy = false, wantPoll = false, timer = null, lastSend = 0, backoff = 0, skew = 0, skewSet = false, persistT = null, online = true;
  const net = { onChange() {}, onError() {}, onAuth() {}, onStatus() {} };
  const rid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const now = () => Date.now() + skew;
  const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } };
  const lsDel = k => { try { localStorage.removeItem(k); } catch { /* */ } };

  async function raw(path, body) {
    const hd = { 'Content-Type': 'application/json' }; if (token) hd.Authorization = 'Bearer ' + token;
    const ac = new AbortController(), to = setTimeout(() => ac.abort(), 12000);
    try {
      const r = await fetch('/api/' + path, { method: 'POST', headers: hd, body: JSON.stringify(body || {}), signal: ac.signal });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(j.error || 'Ошибка сети'); e.status = r.status; throw e; }
      return j;
    } finally { clearTimeout(to); }
  }

  // ---------- локальное состояние = снимок сервера + неподтверждённые действия ----------
  function rebuild() {
    if (!auth) return;
    const t = now();
    S = Sim.fromView(auth);
    for (const q of queue) Sim.apply(S, q.body, Math.min(t, Math.max(q.t, auth.now)));
    Sim.tick(S, t);
    net.onChange(S);
  }
  function setStatus() { net.onStatus({ online, pending: queue.length }); }
  function persist() {
    clearTimeout(persistT);
    persistT = setTimeout(() => { if (token && auth) lsSet('pg_snap', { k: token.slice(0, 16), auth, skew, queue: queue.map(q => ({ body: q.body, t: q.t })), inflight }); }, 200);
  }
  function adopt(v) {
    if (!skewSet && v.now) { skew = v.now - Date.now(); skewSet = true; }
    auth = v; rebuild(); persist();
  }
  function learnSkew(v, t1, t2) { // серверное время минус локальное, по середине запроса; сглаживаем, чтобы часы не дёргались
    if (!v.now || t2 - t1 > 2500) return;
    const sample = v.now - (t1 + t2) / 2;
    skew = skewSet ? skew * 0.6 + sample * 0.4 : sample; skewSet = true;
  }

  // ---------- отправка ----------
  function pump() {
    if (busy || !token) return;
    if (!queue.length && !wantPoll) return;
    const wait = Math.max(0, lastSend + MIN_GAP + backoff - Date.now());
    if (wait > 0) { if (!timer) timer = setTimeout(() => { timer = null; pump(); }, wait); return; }
    if (timer) { clearTimeout(timer); timer = null; }
    send();
  }
  async function send() {
    busy = true; lastSend = Date.now();
    const t1 = Date.now();
    try {
      let v;
      if (queue.length) {
        if (!inflight) inflight = { bid: rid(), n: Math.min(BATCH, queue.length) };
        const items = queue.slice(0, inflight.n);
        v = await raw('acts', { bid: inflight.bid, list: items.map(q => q.body) });
        queue.splice(0, inflight.n); inflight = null;
        (v.res || []).forEach(m => { if (m) net.onError(m); });
      } else { wantPoll = false; v = await raw('state'); }
      learnSkew(v, t1, Date.now());
      backoff = 0; if (!online) { online = true; } setStatus(); adopt(v);
    } catch (e) {
      if (e.status === 401 || e.status === 403) { queue = []; inflight = null; persist(); net.onAuth(e); }
      else if (e.status === 404 && inflight) { await legacy(); }
      else if (e.status && e.status < 500 && e.status !== 429) { // сервер отверг пачку целиком: выбрасываем её и берём правду с сервера
        if (inflight) { queue.splice(0, inflight.n); inflight = null; } net.onError(e.message); wantPoll = true; rebuild(); setStatus();
      } else { online = !!e.status; backoff = Math.min(10000, backoff ? backoff * 2 : 1000); setStatus(); } // нет связи или перегрузка: очередь сохраняется, повторим
    } finally {
      busy = false;
      if (queue.length || wantPoll) pump();
    }
  }
  async function legacy() { // сервер старой версии без /api/acts: отправляем по одному
    let v = null;
    for (const q of queue.splice(0, inflight.n)) { try { v = await raw('act', q.body); } catch (e) { net.onError(e.message); } }
    inflight = null; if (v) adopt(v); else { wantPoll = true; }
  }

  // ---------- внешний интерфейс ----------
  net.act = body => { // → null или текст ошибки; при успехе состояние уже изменено
    if (!S) return 'Загрузка…';
    const t = now(), err = Sim.apply(S, body, t);
    if (err) return err;
    if (Sim.isLocal(body.a)) { queue.push({ body, t }); Sim.tick(S, t); net.onChange(S); setStatus(); persist(); setTimeout(pump, 0); }
    else { raw('act', body).then(adopt, e => net.onError(e.message)); } // ник и прочее — только через сервер
    return null;
  };
  net.tick = () => { if (S) Sim.tick(S, now()); return S; };
  net.poll = () => { if (token) { wantPoll = true; pump(); } };
  net.adopt = adopt;
  net.api = raw;
  net.now = now;
  net.hasState = () => !!S;
  net.setCatalog = c => { cat = c; Sim.setCatalog(c); lsSet('pg_cat', c); if (auth) rebuild(); };
  net.cachedCatalog = () => { const c = lsGet('pg_cat'); if (c && c.rar) { cat = c; Sim.setCatalog(c); return c; } return null; };
  net.setToken = t => {
    token = t || null;
    try { if (t) localStorage.setItem('pg_token', t); else localStorage.removeItem('pg_token'); } catch { /* */ }
    if (!t) net.reset();
  };
  net.reset = () => { auth = null; S = null; queue = []; inflight = null; backoff = 0; lsDel('pg_snap'); };
  net.hasToken = () => !!token;
  net.pending = () => queue.length;
  Object.defineProperty(net, 'state', { get: () => S });
  // Мгновенный старт: показываем прошлое состояние (оно досчитается по часам) пока идёт первый запрос.
  net.restore = () => {
    const s = lsGet('pg_snap');
    if (!token || !s || s.k !== token.slice(0, 16) || !s.auth || !cat) return false;
    skew = s.skew || 0; skewSet = !!s.skew; auth = s.auth; inflight = s.inflight || null;
    queue = (s.queue || []).filter(q => Date.now() - q.t - skew < KEEP_MS);
    if (inflight && inflight.n > queue.length) inflight = null;
    rebuild(); return true;
  };
  net.start = () => {
    try { token = localStorage.getItem('pg_token'); } catch { token = null; }
    setInterval(() => { if (!document.hidden) net.poll(); }, POLL_MS);
    addEventListener('online', () => { backoff = 0; pump(); net.poll(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (S) Sim.tick(S, now()); net.poll(); } });
    addEventListener('pagehide', () => { clearTimeout(persistT); if (token && auth) lsSet('pg_snap', { k: token.slice(0, 16), auth, skew, queue: queue.map(q => ({ body: q.body, t: q.t })), inflight }); });
  };
  return net;
})();
