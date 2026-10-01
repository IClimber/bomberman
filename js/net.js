// net.js — мережа гри: p2p-net (сервер сигналізації лише знайомить, гра йде напряму між браузерами),
// схеми повідомлень, прийом і перевірка, дії гравця (налаштування, «Готовий», «Старт»).
// Стан кімнати й раунду авторитетний у хоста (див. host.js); рух, бомби, смерть і підбір — у власника.
import { createNet } from 'https://iclimber.github.io/p2p-net/v1/net.js';
import { S, ID_RE, COLORS, cleanName, uq8 } from './state.js';
import { SIZES, FUSE_MS, bombKey, pickKey } from './sim.js';
import { newRound, kill, MODE_VS } from './round.js';
import * as host from './host.js';

export const SIGNAL_URL = 'wss://144-172-110-72.sslip.io/ws';
export const GRACE_MS = 3000;        // сервер сигналізації не відповів за стільки — граємо самі
export const JOIN_WAIT_MS = 8000;    // у кімнаті хтось є — стільки чекаємо стану від хоста
export const SYNC_LAG = 1500;        // події, молодші за стільки, ще можуть бути в дорозі — у контрольну суму не входять
const SYNC_EVERY = 2000;             // просити в хоста список подій не частіше

// Колбеки для інтерфейсу (заповнює main.js)
export const hooks = {
  room() {}, round() {}, hud() {}, warn() {},
  blast() {}, death() {}, pickup() {}, bomb() {},
};

const SLOT = { i: 'str', b: 'bool', c: 'u8', n: 'str', a: 'bool', x: 'u16', y: 'u16', dr: 'u8', mv: 'bool', nb: 'u8', fp: 'u8', sp: 'u8', ps: 'bool', rs: 'f64' };
const BOMB = { o: 'u8', n: 'u16', x: 'u8', y: 'u8', t: 'f64', p: 'u8' };

export const net = createNet({
  url: SIGNAL_URL, game: 'bomberman', room: S.roomId,
  messages: {
    hi: { broadcast: true, schema: { n: 'str' } },                   // ім'я
    // стан кімнати від хоста: налаштування, люди лоббі, таблиця перемог, раунд, що йде
    lobby: {
      broadcast: true, schema: {
        m: 'u8', s: 'u8', d: 'u8', b: 'bool', g: 'f64',
        pp: [{ i: 'str', c: 'u8', r: 'bool', rt: 'f64' }],
        w: [{ n: 'str', a: 'u16', c: 'u16' }],
      },
    },
    cfg: { schema: { m: 'u8', s: 'u8', d: 'u8', b: 'bool' } },        // → хост: змінити налаштування
    ready: { schema: { r: 'bool', t: 'f64' } },                       // → хост: «Готовий» і коли натиснуто
    start: { schema: {} },                                            // → хост: «Старт»
    back: { schema: {} },                                             // → хост: після раунду — усіх у лоббі
    // стан раунду від хоста (~10 Гц і одразу при змінах, повний): підсумок, слоти (боти — з позиціями),
    // монстри, знімок клітинок і активні бомби (для тих, хто дивиться з середини раунду)
    world: {
      broadcast: true, unreliable: true, schema: {
        r: 'f64', p: 'u8', m: 'u8', s: 'u8', d: 'u8', t0: 'f64', ts: 'f64', k: 'u8', wn: 'u8',
        sl: [SLOT],
        mo: [{ i: 'u16', k: 'u8', x: 'u16', y: 'u16', dr: 'u8', a: 'bool' }],
        g: 'bytes',
        bo: [BOMB],
        en: 'u16', eh: 'u32',                                         // контрольна сума подій з часом ≤ ts − SYNC_LAG
      },
    },
    // Учасник пропустив події (зв'язок рвався, сторінку заморожено): звіряємося з хостом
    sync: { schema: { r: 'f64' } },                                   // → хост: надішли всі події раунду
    evs: { schema: { r: 'f64', bo: [BOMB], pk: [{ o: 'u8', x: 'u8', y: 'u8', t: 'f64' }], dd: [{ o: 'u8', t: 'f64' }] } },
    // власна поза кожного учасника раунду (~20 Гц): координати, напрям, рух, бонуси
    pos: { broadcast: true, unreliable: true, schema: { r: 'f64', x: 'u16', y: 'u16', dr: 'u8', mv: 'bool', nb: 'u8', fp: 'u8', sp: 'u8', ps: 'bool', rs: 'bool' } },
    bomb: { broadcast: true, schema: { r: 'f64', ...BOMB } },          // поставив власник (бота — хост)
    dead: { broadcast: true, schema: { r: 'f64', o: 'u8', t: 'f64' } },   // загинув (вирішує сам; бота — хост)
    pick: { broadcast: true, schema: { r: 'f64', o: 'u8', x: 'u8', y: 'u8', t: 'f64' } },   // підібрав бонус
  },
  hasGame: () => !!S.room,
  onMessage: (kind, d, from) => ON[kind](d, from),
  onPeerOpen(id) {
    net.send('hi', { n: S.myName }, id);
    if (net.isHost()) { host.sendLobby(id); host.sendWorld(id); }
    hooks.hud();
  },
  onPeerGone(id) {
    S.pos.delete(id);
    S.gone.add(id);
    if (net.isHost()) host.memberGone(id);
    hooks.hud();
  },
  onWelcome(others) {
    if (S.room) return;
    if (!others) host.createRoom();
    else {
      S.waiting = true;
      setTimeout(() => { if (!S.room) { S.waitLong = true; hooks.room(); } }, JOIN_WAIT_MS);
    }
    hooks.room();
  },
  onVisibility(hidden) {
    hooks.hidden?.(hidden);
    if (hidden && net.isHost()) { host.sendLobby(); host.sendWorld(); }   // наступний хост отримає свіжий стан
  },
  onWarn: (code) => hooks.warn(code),
  onChange: () => hooks.hud(),
});

// ---------- Перевірка вхідних даних (типи вже перевірено за схемою) ----------
function parseLobby(d) {
  if (d.m > 1 || d.s >= SIZES.length || d.d > 2 || d.pp.length > 64 || d.w.length > 256) return null;
  for (const p of d.pp) if (!ID_RE.test(p.i) || p.c >= COLORS.length) return null;
  for (const w of d.w) w.n = cleanName(w.n);
  return d;
}
function parseWorld(d) {
  if (d.r <= 0 || d.p > 1 || d.m > 1 || d.s >= SIZES.length || d.d > 2 || d.k > 5) return null;
  if (!d.sl.length || d.sl.length > 4 || d.mo.length > 256 || d.bo.length > 512) return null;
  for (const s of d.sl) {
    if ((s.i && !ID_RE.test(s.i)) || (!s.i && !s.b) || s.c >= COLORS.length || s.dr > 4) return null;
    s.n = cleanName(s.n);
  }
  for (const m of d.mo) if (m.k > 2 || m.dr > 4) return null;
  return d;
}
const seedOf = (r) => hashRoom(S.roomId + ':' + r);
function hashRoom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export { seedOf };

// Подія раунду від гравця: свій слот — лише від нього самого, слот бота — від будь-кого (його шле хост;
// розбіжності після зміни хоста вирівнює звіряння подій, див. checkSync)
function slotOk(R, o, from) {
  const s = R.sl[o];
  return !!s && (s.b || s.i === from);
}
const inField = (R, x, y) => x >= 1 && y >= 1 && x <= R.map.w && y <= R.map.h;

// ---------- Обробники ----------
const ON = {
  hi(d, id) {
    const n = cleanName(d.n) || 'Гравець';
    const was = S.names.get(id);
    S.names.set(id, n);
    S.gone.delete(id);                                             // повернувся з тим самим id (сторінку розморозили)
    if (net.isHost()) host.touchMember(id);
    if (was !== n) hooks.room();
  },
  lobby(d, id) {
    if (S.room && id !== net.hostId()) return;                    // стан кімнати — лише від хоста
    const room = parseLobby(d);
    if (!room) return;
    const first = !S.room;
    S.room = room;
    S.waiting = false;
    if (first) net.restamp();                                      // приєдналися до чужої кімнати — у кінець черги на хоста
    if (!room.g && S.R) { S.R = null; S.mySlot = -1; hooks.round(); }
    hooks.room();
  },
  world(d, id) {
    if (id !== net.hostId()) return;
    const w = parseWorld(d);
    if (!w || !S.room || S.room.g !== w.r) return;
    applyWorld(w);
  },
  pos(d, id) {
    const p = { ...d, x: uq8(d.x), y: uq8(d.y), at: performance.now() };
    S.pos.set(id, p);
    const R = S.R;
    if (!R || d.r !== R.r) return;
    const s = R.sl.find(e => !e.b && e.i === id);
    if (!s || !s.a) return;
    s.x = p.x; s.y = p.y; s.dr = d.dr; s.mv = d.mv;
    s.nb = d.nb; s.fp = d.fp; s.sp = d.sp; s.ps = d.ps; s.rsOn = d.rs;
  },
  bomb(d, id) {
    const R = S.R;
    if (!R || d.r !== R.r || !slotOk(R, d.o, id) || !inField(R, d.x, d.y) || d.p < 1 || d.p > 16) return;
    if (R.board.addBomb(d)) hooks.bomb(d);
  },
  dead(d, id) {
    const R = S.R;
    if (!R || d.r !== R.r || !slotOk(R, d.o, id) || (R.sl[d.o].b && id !== net.hostId())) return;   // бота — лише від хоста
    if (kill(R, d.o, d.t)) hooks.death(d.o);
  },
  pick(d, id) {
    const R = S.R;
    if (!R || d.r !== R.r || !slotOk(R, d.o, id) || !inField(R, d.x, d.y)) return;
    R.board.addPick(d);
  },
  sync(d, id) { if (net.isHost() && S.R && d.r === S.R.r) host.sendEvents(id); },
  // Усі події раунду від хоста: додаємо, яких бракує (поле перерахується); свої, яких бракує хосту, — розсилаємо знову
  evs(d, id) {
    const R = S.R;
    if (!R || d.r !== R.r || id !== net.hostId() || d.bo.length > 8000 || d.pk.length > 4000) return;
    const now = net.sharedNow();
    // події ботів — як у хоста: свої «бомби ботів» з часу, коли ми були відрізані й самі вели ботів, — геть
    const hb = new Set(d.bo.map(bombKey)), hp = new Set(d.pk.map(pickKey));
    const own = (o) => !R.sl[o] || !R.sl[o].b;
    R.board.dropEvents((b) => own(b.o) || hb.has(bombKey(b)), (p) => own(p.o) || hp.has(pickKey(p)));
    for (const b of d.bo) if (R.sl[b.o] && inField(R, b.x, b.y) && b.p >= 1 && b.p <= 16) R.board.addBomb(b, b.t + FUSE_MS < now - 300);
    for (const p of d.pk) if (R.sl[p.o] && inField(R, p.x, p.y)) R.board.addPick(p);
    for (const e of d.dd) if (kill(R, e.o, e.t)) hooks.death(e.o);
    if (S.mySlot < 0) return;
    for (const b of R.board.bombs.values()) if (b.o === S.mySlot && !hb.has(bombKey(b))) net.send('bomb', { r: R.r, ...b });
    for (const p of R.board.picks.values()) if (p.o === S.mySlot && !hp.has(pickKey(p))) net.send('pick', { r: R.r, ...p });
  },
  cfg(d) { if (net.isHost()) host.setCfg(d); },
  ready(d, id) { if (net.isHost()) host.setReady(id, d.r, d.t); },
  start() { if (net.isHost()) host.tryStart(); },
  back() { if (net.isHost()) host.toLobby(); },
};

// Стан раунду від хоста. Новий раунд — будуємо карту від зерна; глядач бере поле зі знімка.
function applyWorld(w) {
  let R = S.R;
  if (!R || R.r !== w.r) {
    R = newRound({ r: w.r, seed: seedOf(w.r), m: w.m, s: w.s, d: w.d, t0: w.t0, sl: w.sl.map(e => ({ i: e.i, b: e.b, c: e.c, n: e.n })) });
    if (R.mons.length !== w.mo.length) R.mons = w.mo.map(m => ({ i: m.i, k: m.k, x: uq8(m.x), y: uq8(m.y), d: m.dr, a: m.a, dt: 0 }));
    S.R = R;
    S.mySlot = R.sl.findIndex(s => !s.b && s.i === net.id);
    hooks.round();
  }
  const now = net.sharedNow();
  R.worldAt = performance.now();
  R.p = w.p; R.res = w.k; R.wn = w.wn;
  w.sl.forEach((e, k) => {
    const s = R.sl[k];
    if (!s) return;
    if (!e.a && s.a && kill(R, k, now)) hooks.death(k);
    if (s.b && e.a && !s.a) { s.a = true; s.dt = 0; }              // бот живий у хоста (ми, відрізані, «убили» його самі)
    if (!s.b || !s.a) return;
    s.x = uq8(e.x); s.y = uq8(e.y); s.dr = e.dr; s.mv = e.mv;
    s.nb = e.nb; s.fp = e.fp; s.sp = e.sp; s.ps = e.ps; s.rs = e.rs;
  });
  for (const e of w.mo) {
    const m = R.mons.find(x => x.i === e.i);
    if (!m) continue;
    if (!e.a && m.a) { m.a = false; m.dt = now; }
    if (e.a && !m.a) { m.a = true; m.dt = 0; m.popped = false; }   // так само з монстрами
    if (!m.a) continue;
    m.x = uq8(e.x); m.y = uq8(e.y); m.d = e.dr;
  }
  if (S.mySlot < 0) R.board.setBase(w.g, w.bo, w.ts);              // глядач: поле як у хоста
  else checkSync(R, w);
}
// Учасник рахує поле сам з подій, тож пропущена подія (зв'язок рвався) розсинхронізувала б його назавжди.
// Звіряємо контрольну суму подій з хостом; не збіглась двічі поспіль — просимо всі події.
// Свою смерть, якої хост не знає, надсилаємо знову.
function checkSync(R, w) {
  const t = performance.now(), me = R.sl[S.mySlot];
  if (me && !me.a && w.sl[S.mySlot]?.a && t - (R.deadSent || 0) > 1000) {
    R.deadSent = t;
    net.send('dead', { r: R.r, o: me.o, t: me.dt });
  }
  const cut = w.ts - SYNC_LAG;
  if (cut <= R.t0) return;
  const dg = R.board.digest(cut);
  if (dg.n === w.en && dg.h === w.eh) { R.syncMiss = 0; return; }
  if (++R.syncMiss < 2 || t - (R.syncAsked || 0) < SYNC_EVERY) return;
  R.syncAsked = t;
  net.send('sync', { r: R.r }, net.hostId());
}

// ---------- Дії гравця (хост виконує сам, інші просять хоста) ----------
export const act = {
  cfg(c) {                                                         // c — лише змінені поля
    if (!S.room || S.room.g) return;
    Object.assign(S.room, c);
    const full = { m: S.room.m, s: S.room.s, d: S.room.d, b: S.room.b };
    if (net.isHost()) host.setCfg(full);
    else net.send('cfg', full, net.hostId());
    hooks.room();
  },
  ready(r) {                                                       // у лоббі — «Я готовий», після раунду — «Грати»
    if (!S.room || (S.room.g && !resultShown())) return;
    const t = net.sharedNow();
    const me = S.room.pp.find(p => p.i === net.id);
    if (me) { me.r = r; me.rt = r ? t : 0; }
    if (net.isHost()) host.setReady(net.id, r, t);
    else net.send('ready', { r, t }, net.hostId());
    hooks.room();
  },
  start() {
    if (!S.room || S.room.g) return;
    if (net.isHost()) host.tryStart();
    else net.send('start', {}, net.hostId());
  },
  back() {
    if (!resultShown()) return;
    if (net.isHost()) host.toLobby();
    else net.send('back', {}, net.hostId());
  },
  name(n) {
    net.send('hi', { n });
  },
};
// Показуємо підсумок раунду (між раундом і лоббі)
export const resultShown = () => !!S.room && !!S.R && S.room.g === S.R.r && S.R.p === 1;

// Учасники лоббі: живі гравці кімнати без прихованої вкладки
export function lobbyMembers() {
  if (!S.room) return [];
  return S.room.pp.filter(p => p.i === net.id ? !document.hidden : net.isLive(p.i) && !net.isAway(p.i));
}
// Скільки готових треба для старту і скільки є
export function startNeed() {
  const m = lobbyMembers();
  return { need: Math.min(m.length, 4), ready: m.filter(p => p.r).length, members: m.length };
}
// З однією людиною в «Один проти одного» вимкнути ботів не можна
export const botsForced = () => !!S.room && S.room.m === MODE_VS && startNeed().need <= 1;

export const nameOf = (id) => id === net.id ? S.myName : S.names.get(id) || 'Гравець';
