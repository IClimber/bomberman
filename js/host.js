// host.js — обов'язки хоста: люди лоббі та їхні кольори, налаштування, «Готовий», старт раунду, крок раунду
// (боти, монстри, кінець), таблиця перемог, повернення в лоббі; розсилка lobby і world.
// Хост — net.hostId(); новий хост продовжує з останнього отриманого стану.
import { net, hooks, lobbyMembers, nameOf, seedOf, resultShown, SYNC_LAG } from './net.js';
import { S, COLORS, q8 } from './state.js';
import { SIZES, mulberry32 } from './sim.js';
import { SKINS } from './skins/index.js';
import { newRound, hostStep, COUNTDOWN_MS, MODE_VS, RES_WIN, RES_TEAM_WIN, KB_LEFT } from './round.js';

export const WORLD_EVERY = 100;      // хост розсилає стан раунду раз на стільки мс (і одразу при змінах)
const TICK_MS = 50;
const STALE_MS = 30000;              // кого стільки не чути, прибираємо з лоббі й раунду (як FORGET_MS у p2p-net)

export function createRoom() {
  if (S.room) return;
  S.room = { m: 0, s: 0, d: 1, b: true, v: 0, g: 0, pp: [], w: [] };
  S.waiting = false;
  addMember(net.id);
  net.announce();                                                  // тепер у нас є гра
  hooks.room();
}

function addMember(id) {
  if (!S.room || S.room.pp.some(p => p.i === id)) return false;
  const used = new Set(S.room.pp.map(p => p.c));
  const free = COLORS.map((_, k) => k).filter(k => !used.has(k));
  const pool = free.length ? free : COLORS.map((_, k) => k);
  S.room.pp.push({ i: id, c: pool[Math.floor(Math.random() * pool.length)], r: false, rt: 0 });
  return true;
}
export function touchMember(id) {
  if (!S.gone.has(id) && addMember(id)) { sendLobby(); hooks.room(); }
}
export function memberGone(id) {
  if (!S.room) return;
  S.room.pp = S.room.pp.filter(p => p.i !== id);
  const R = S.R;
  if (R && R.p === 0) {
    const s = R.sl.find(e => !e.b && e.i === id && e.a);
    if (s) { s.a = false; s.dt = net.sharedNow(); s.kb = KB_LEFT; s.pruned = true; hooks.death(s.o); sendWorld(); }
  }
  sendLobby();
  hooks.room();
}

export function setCfg(d) {
  if (!S.room || S.room.g) return;
  if (d.m <= 1) S.room.m = d.m;
  if (d.s < SIZES.length) S.room.s = d.s;
  if (d.d <= 2) S.room.d = d.d;
  if (d.v < SKINS.length) S.room.v = d.v;
  S.room.b = !!d.b;
  sendLobby();
  hooks.room();
}
// У лоббі — «Старт», на підсумку раунду — «Грати»: щойно готових досить, раунд починається сам
export function setReady(id, r, t) {
  if (!S.room || (S.room.g && !resultShown())) return;
  addMember(id);
  const p = S.room.pp.find(e => e.i === id);
  p.r = !!r;
  p.rt = r ? t : 0;
  if (tryStart()) return;
  sendLobby();
  hooks.room();
}
// Після раунду — усіх у лоббі (підсумок висить, доки хтось не натисне «Вийти в лоббі» або всі — «Грати»)
export function toLobby() {
  if (resultShown()) backToLobby();
}

// Старт: готових («Старт» / «Грати») не менше, ніж min(учасників лоббі, 4); у раунд — перші 4 за часом натискання,
// боти — на вільні місця
export function tryStart() {
  if (!S.room || (S.room.g && !resultShown())) return false;
  const members = lobbyMembers(), need = Math.min(members.length, 4);
  const ready = members.filter(p => p.r).sort((a, b) => a.rt - b.rt || (a.i < b.i ? -1 : 1));
  if (!need || ready.length < need) return false;
  const humans = ready.slice(0, 4);
  let bots = S.room.b ? 4 - humans.length : 0;
  if (S.room.m === MODE_VS && humans.length === 1) bots = 3;      // з однією людиною боти обов'язкові
  const r = net.sharedNow(), seed = seedOf(r), rng = mulberry32(seed ^ 0x5bd1e995);
  const sl = humans.map(p => ({ i: p.i, b: false, c: p.c, n: nameOf(p.i) }));
  for (let k = 0; k < bots; k++) sl.push({ i: '', b: true, c: -1, n: `Бот ${k + 1}` });
  for (let k = sl.length - 1; k > 0; k--) {                        // кути старту — випадкові
    const j = Math.floor(rng() * (k + 1));
    [sl[k], sl[j]] = [sl[j], sl[k]];
  }
  const used = new Set();                                          // кольори в раунді не повторюються
  for (const e of sl) if (!e.b) { if (used.has(e.c)) e.c = -1; else used.add(e.c); }
  for (const e of sl) {
    if (e.c >= 0) continue;
    const free = COLORS.map((_, k) => k).filter(k => !used.has(k));
    e.c = free.length ? free[Math.floor(rng() * free.length)] : 0;
    used.add(e.c);
  }
  S.R = newRound({ r, seed, m: S.room.m, s: S.room.s, d: S.room.d, t0: r + COUNTDOWN_MS, sl });
  S.mySlot = S.R.sl.findIndex(s => !s.b && s.i === net.id);
  S.room.g = r;
  sendLobby();
  sendWorld();
  hooks.round();
  hooks.room();
  return true;
}

function score(R) {
  const row = (n) => {
    let w = S.room.w.find(e => e.n === n);
    if (!w) { w = { n, a: 0, c: 0 }; S.room.w.push(w); if (S.room.w.length > 256) S.room.w.shift(); }
    return w;
  };
  if (R.res === RES_WIN) { const s = R.sl[R.wn]; if (s && !s.b) row(s.n).a++; }
  else if (R.res === RES_TEAM_WIN) for (const s of R.sl) if (!s.b) row(s.n).c++;
}

export function backToLobby() {
  if (!S.room) return;
  S.room.g = 0;
  for (const p of S.room.pp) { p.r = false; p.rt = 0; }
  S.R = null;
  S.mySlot = -1;
  sendLobby();
  hooks.round();
  hooks.room();
}

export function sendLobby(to) {
  if (S.room) net.send('lobby', S.room, to);
}
let lastWorld = 0;
export function sendWorld(to) {
  const R = S.R;
  if (!R || !S.room || S.room.g !== R.r) return;
  if (!to) lastWorld = performance.now();
  const ts = Number.isFinite(R.board.T) ? R.board.T : 0, dg = R.board.digest(ts - SYNC_LAG);
  net.send('world', {
    r: R.r, p: R.p, m: R.m, s: R.s, d: R.d, t0: R.t0, ts, k: R.res, wn: R.wn, en: dg.n, eh: dg.h,
    sl: R.sl.map(s => ({
      i: s.i, b: s.b, c: s.c, n: s.n, a: s.a, kb: s.kb, x: q8(s.x), y: q8(s.y), dr: s.dr, mv: s.mv,
      nb: s.nb, fp: s.fp, sp: s.sp, ps: s.ps, rs: s.rs,
    })),
    mo: R.mons.map(m => ({ i: m.i, k: m.k, x: q8(m.x), y: q8(m.y), dr: m.d || 0, a: m.a, kb: m.kb })),
    g: R.board.snapshot(),
    bo: R.board.activeList(),
  }, to);
}

// Усі події раунду — учаснику, що розійшовся з хостом (див. checkSync у net.js)
export function sendEvents(to) {
  const R = S.R, B = R.board;
  net.send('evs', {
    r: R.r, bo: [...B.bombs.values()], pk: [...B.picks.values()],
    dd: R.sl.filter(s => !s.a).map(s => ({ o: s.o, t: s.dt, k: s.kb })),
  }, to);
}

// ---------- Крок хоста ----------
const EV = {
  bomb(b) { net.send('bomb', { r: S.R.r, ...b }); hooks.bomb(b); },
  pick(p) { net.send('pick', { r: S.R.r, ...p }); },
  dead(o, t, k) { net.send('dead', { r: S.R.r, o, t, k }); hooks.death(o); },
  monster(m) { hooks.monster?.(m); },
};
let wasHost = false, lastTick = 0;
function tick() {
  const pnow = performance.now(), dt = lastTick ? Math.min(0.2, (pnow - lastTick) / 1000) : TICK_MS / 1000;
  lastTick = pnow;
  if (!S.room || !net.isHost()) { wasHost = false; return; }
  const now = net.sharedNow();
  if (!wasHost) { wasHost = true; becameHost(now); }
  touchMember(net.id);                                             // і сам: став хостом, ще не бувши в лоббі (новачок, а єдиний гравець кімнати сховав вкладку)
  for (const p of net.peers()) touchMember(p.id);                  // чий hi ще не дійшов
  prune(pnow);
  // хтось сховав вкладку чи пішов — решта, можливо, вже всі готові
  if ((!S.room.g || resultShown()) && S.room.pp.some(p => p.r) && tryStart()) return;
  if (!S.room.g) return;
  const R = S.R;
  if (!R || R.r !== S.room.g) { backToLobby(); return; }          // раунду не знаємо — у лоббі
  const changed = hostStep(R, now, dt, EV);
  if (R.p === 1 && !R.scored) {                                   // кінець: таблиця, «Грати» — з чистого аркуша
    R.scored = true;
    score(R);
    for (const p of S.room.pp) { p.r = false; p.rt = 0; }
    sendLobby();
    hooks.round();
  }
  if (changed || pnow - lastWorld >= WORLD_EVERY) sendWorld();
}
// Хто вийшов або давно мовчить — геть із лоббі й раунду. Не лише за onPeerGone у самого хоста: хост міг змінитися
// (бачив вихід, ще не бувши хостом) або взагалі не знати того гравця (зайшов пізніше).
const quietSince = new Map();                                      // id → відколи не чути (performance.now)
function prune(pnow) {
  const ids = new Set(S.room.pp.map(p => p.i));
  if (S.R && S.room.g === S.R.r) for (const s of S.R.sl) if (!s.b && s.a) ids.add(s.i);
  for (const id of ids) {
    if (id === net.id) continue;
    if (net.isLive(id) && !S.gone.has(id)) { quietSince.delete(id); continue; }
    if (!quietSince.has(id)) quietSince.set(id, pnow);
    if (S.gone.has(id) || pnow - quietSince.get(id) > STALE_MS) { quietSince.delete(id); memberGone(id); }
  }
}

// Стали хостом: ботів і монстрів ведемо від останніх відомих позицій. «Відколи не чути» — з нуля: записи з минулого
// разу, коли були хостом, застарілі (інакше короткий обрив через пів хвилини одразу «прибирав» гравця, якого не чути)
function becameHost(now) {
  quietSince.clear();
  const R = S.R;
  if (!R) return;
  for (const s of R.sl) s.ai = null;
  for (const m of R.mons) { m.tx = null; m.ty = null; }
  R.endAt = 0;
  if (R.p === 1) R.scored = true;
}
export function startHostLoop() { setInterval(tick, TICK_MS); }
