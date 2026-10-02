// round.js — раунд без DOM і мережі: слоти, поле, монстри; крок хоста (боти, монстри, смерті, кінець раунду).
// Слот { o (номер 0–3, місце старту), i (id людини; '' — бот), b (бот), c (колір), n (ім'я), a (живий), dt (коли загинув),
//   kb (хто вбив, див. KB_*), x, y, dr (напрям), mv (іде), nb (бомб), fp (дальність вогню), sp (бонусів швидкості),
//   ps (прохід крізь бомби), rs (стійкий до вогню до, спільний час), kk (штурхає бомби), rc (детонатор),
//   bn (лічильник своїх бомб) }
import {
  makeMap, Board, MON, WALL, RESIST_MS, MAX_BOMBS, MAX_FIRE, MAX_SPEED_UPS, FUSE_MS,
  IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, IT_KICK, IT_REMOTE, DX, DY, cellOf,
} from './sim.js';
import { monsterStep } from './monsters.js';
import { botTick, botCanPlace, botDetonate } from './bots.js';

export const COUNTDOWN_MS = 3000;    // відлік перед раундом
export const END_GRACE_MS = 400;     // перед підсумком чекаємо dead від тих, хто загинув у тому самому вибуху
export const TOUCH = 0.6;            // монстр ближче — убиває
export const START_BOMBS = 1, START_FIRE = 2;
export const MODE_VS = 0, MODE_COOP = 1;
// Підсумок: 1 — переміг слот wn, 2 — нічия (загинули всі), 3 — без переможця (люди загинули, боти живі),
// 4 — перемога команди, 5 — поразка команди
export const RES_WIN = 1, RES_DRAW = 2, RES_NOBODY = 3, RES_TEAM_WIN = 4, RES_TEAM_LOSS = 5;
// Хто вбив (kb слоту чи монстра): 0–3 — вогонь бомби цього слоту (свій — сам себе), KB_WALL — стіна раптової смерті,
// KB_MON + вид — монстр, KB_LEFT — вийшов з гри, KB_NONE — невідомо
export const KB_WALL = 10, KB_MON = 20, KB_LEFT = 30, KB_NONE = 255;

// sl: [{ i, b, c, n }] у порядку слотів
export function newRound({ r, seed, m, s, d, t0, sl }) {
  const coop = m === MODE_COOP;
  const map = makeMap(seed, s, coop, d);
  const board = new Board(map, t0);
  const slots = sl.map((e, k) => {
    const [x, y] = map.spawns[k];
    return {
      o: k, i: e.i, b: !!e.b, c: e.c, n: e.n, a: true, dt: 0, kb: KB_NONE, x, y, dr: 3, mv: false,
      nb: START_BOMBS, fp: START_FIRE, sp: 0, ps: false, rs: 0, kk: false, rc: false, bn: 0,
    };
  });
  const mons = map.mons.map(mo => ({ i: mo.i, k: mo.k, x: mo.x, y: mo.y, d: 0, a: true, dt: 0, kb: KB_NONE }));
  return { r, seed, m, s, d, t0, coop, map, board, sl: slots, mons, p: 0, res: 0, wn: 255, endAt: 0 };
}

export function applyItem(s, kind, now) {
  if (kind === IT_BOMB) s.nb = Math.min(MAX_BOMBS, s.nb + 1);
  else if (kind === IT_FIRE) s.fp = Math.min(MAX_FIRE, s.fp + 1);
  else if (kind === IT_SPEED) s.sp = Math.min(MAX_SPEED_UPS, s.sp + 1);
  else if (kind === IT_PASS) s.ps = true;
  else if (kind === IT_RESIST) s.rs = now + RESIST_MS;
  else if (kind === IT_KICK) s.kk = true;
  else if (kind === IT_REMOTE) s.rc = true;
}

// Детонатор: загиблий (чи той, хто вийшов) — його бомби, ще не підірвані, вибухнуть за FUSE_MS від смерті.
// Події det для розсилки (їх шле сам загиблий, за бота чи того, хто вийшов, — хост)
export function orphanDets(R, o, t) {
  return R.board.remoteOf(o).map(a => ({ o, n: a.b.n, b: a.b.t, t: t + FUSE_MS }));
}

// Що вбило б того, хто в точці (x, y): стіна, вогонь (без стійкості), дотик монстра (mons — як їх видно).
// Повертає kb (див. KB_*) або -1 — живий
export function killerAt(R, x, y, now, resistUntil, mons = R.mons) {
  const B = R.board, i = cellOf(B.map, x, y);
  if (B.cell[i] === WALL) return KB_WALL;
  if (B.fireAt(i, now) && !(resistUntil > now)) { const o = B.fireBy(i, now); return o >= 0 ? o : KB_NONE; }
  for (const m of mons) if (m.a && Math.hypot(m.x - x, m.y - y) < TOUCH) return KB_MON + (m.k || 0);
  return -1;
}
export const deadlyAt = (...a) => killerAt(...a) >= 0;

export function kill(R, o, t, kb = KB_NONE) {
  const s = R.sl[o];
  if (!s || !s.a) return false;
  s.a = false;
  s.dt = t;
  s.kb = kb;
  return true;
}

// Крок хоста. ev: { bomb(b), pick(p), dead(o, t, kb), det(e), monster(m) } — що розіслати. Повертає true, якщо щось змінилось.
// Раунд скінчився, а живих людей немає (усі загинули, боти лишились) — боти й монстри грають далі, поки висить підсумок
// (він уже не змінюється); інакше після кінця все стоїть.
export function hostStep(R, now, dt, ev) {
  if (now < R.t0 || (R.p !== 0 && R.sl.some(s => s.a && !s.b))) return false;
  const B = R.board;
  B.advance(now);
  let changed = false;
  const targets = R.sl.filter(s => s.a);
  let dangerCache = null, monDanger = null;
  const danger = () => dangerCache || (dangerCache = B.danger());
  // монстри не знають, коли підірвуть бомбу з детонатором (див. Board.danger)
  const mctx = { now, t0: R.t0, diff: R.d, danger: () => monDanger || (monDanger = B.danger(undefined, null, false)) };
  for (const m of R.mons) {
    if (!m.a) continue;
    monsterStep(m, dt, B, targets, mctx);
    const i = cellOf(B.map, m.x, m.y);
    if (B.cell[i] === WALL || B.fireAt(i, now)) {
      const o = B.fireBy(i, now);
      m.a = false; m.dt = now; m.kb = B.cell[i] === WALL ? KB_WALL : o >= 0 ? o : KB_NONE;
      changed = true;
      if (ev.monster) ev.monster(m);
    }
  }
  const threat = R.coop && R.d === 0 ? threatMap(R) : null;
  const reach = R.coop && R.d > 0 ? monsterReach(R, now) : null;
  for (const s of R.sl) {
    if (!s.a || !s.b) continue;
    const others = R.sl.filter(e => e.a && e !== s);
    const ctx = {
      board: B, now, diff: R.d, coop: R.coop, danger, threat, reach,
      enemies: R.coop ? R.mons.filter(m => m.a) : others, allies: R.coop ? others : [],
      monsters: R.coop ? R.mons.filter(m => m.a) : null,
    };
    if (botTick(s, dt, ctx) && botCanPlace(s, B)) {
      s.bn = Math.max(s.bn, B.maxN[s.o] || 0) + 1;                // новий хост продовжує нумерацію
      const b = { o: s.o, n: s.bn, x: Math.round(s.x), y: Math.round(s.y), t: now, p: s.fp, rc: s.rc };
      B.addBomb(b);
      B.advance(now);
      dangerCache = null;
      ev.bomb(b);
      changed = true;
    }
    const a = s.rc && botDetonate(s, ctx);
    if (a) {
      const e = { o: s.o, n: a.b.n, b: a.b.t, t: now };
      B.addDet(e);
      B.advance(now);
      dangerCache = null; monDanger = null;
      ev.det(e);
      changed = true;
    }
    const cx = Math.round(s.x), cy = Math.round(s.y), it = B.itemAt(B.idx(cx, cy));
    if (it && Math.abs(s.x - cx) + Math.abs(s.y - cy) < 0.5) {
      const p = { o: s.o, x: cx, y: cy, t: now };
      B.addPick(p);
      B.advance(now);
      applyItem(s, it, now);
      ev.pick(p);
      changed = true;
    }
    const kb = killerAt(R, s.x, s.y, now, s.rs);
    if (kb >= 0 && kill(R, s.o, now, kb)) {
      ev.dead(s.o, now, kb);
      for (const e of orphanDets(R, s.o, now)) { B.addDet(e); ev.det(e); }
      changed = true;
    }
  }
  return checkEnd(R, now) || changed;
}

// «Легко»: клітинки, куди монстр дійде за кілька кроків (переслідувач — за 3, решта — за 2): боти туди не йдуть і там не стоять.
// Рахуємо шляхом по клітинках, прохідних для цього монстра (привид — крізь блоки), а не відстанню крізь стіни:
// інакше монстр за стіною «забирав» у бота сховок від власної бомби, і бот не ставив бомб, тупцяючи на місці.
export function threatMap(R) {
  const B = R.board, { GW, GH } = B.map, n = GW * GH;
  const threat = new Uint8Array(n), dist = new Int8Array(n);
  for (const m of R.mons) {
    if (!m.a) continue;
    const kind = MON[m.k], r = kind.sight ? 3 : 2;
    dist.fill(-1);
    const q = [];
    for (const [px, py] of [[m.x, m.y], [m.tx ?? m.x, m.ty ?? m.y]]) {
      const i = B.idx(Math.round(px), Math.round(py));
      if (dist[i] < 0) { dist[i] = 0; q.push(i); }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      threat[i] = 1;
      if (dist[i] >= r) continue;
      const x = i % GW, y = (i - x) / GW;
      for (let d = 1; d <= 4; d++) {
        const nx = x + DX[d], ny = y + DY[d], j = ny * GW + nx;
        if (dist[j] >= 0 || B.solid(nx, ny, !!kind.ghost)) continue;
        dist[j] = dist[i] + 1;
        q.push(j);
      }
    }
  }
  return threat;
}

// Коли монстр найраніше може торкнутися того, хто стоїть у клітинці (спільний час): найгірший випадок — монстр іде
// просто туди найкоротшим шляхом по прохідних для нього клітинках (привид — крізь блоки). Для ботів на «Нормально»
// і «Важко»: вони обходять клітинки, куди монстр устигне раніше за них, і не стоять там, куди він скоро дійде.
export function monsterReach(R, now) {
  const B = R.board, { GW, GH } = B.map, n = GW * GH;
  const reach = new Float64Array(n).fill(Infinity), dist = new Float64Array(n);
  for (const m of R.mons) {
    if (!m.a) continue;
    const kind = MON[m.k], step = 1000 / kind.speed;
    const tx = m.tx ?? Math.round(m.x), ty = m.ty ?? Math.round(m.y), fx = Math.round(m.x), fy = Math.round(m.y);
    const seeds = [[tx, ty, Math.abs(m.x - tx) + Math.abs(m.y - ty)], [fx, fy, Math.abs(m.x - fx) + Math.abs(m.y - fy)]];
    seeds.sort((a, b) => a[2] - b[2]);                             // черга лишається впорядкованою за відстанню
    dist.fill(Infinity);
    const q = [];
    for (const [x, y, d] of seeds) {
      const i = B.idx(x, y);
      if (d < dist[i]) { dist[i] = d; q.push(i); }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], t = now + (dist[i] - TOUCH) * step;
      if (t < reach[i]) reach[i] = t;
      if (dist[i] > 12) continue;                                  // далі — не загроза
      const x = i % GW, y = (i - x) / GW;
      for (let d = 1; d <= 4; d++) {
        const nx = x + DX[d], ny = y + DY[d], j = ny * GW + nx;
        if (dist[j] !== Infinity || B.solid(nx, ny, !!kind.ghost)) continue;
        dist[j] = dist[i] + 1;
        q.push(j);
      }
    }
  }
  return reach;
}

// Підсумок за поточним станом (0 — раунд триває)
export function outcome(R) {
  const alive = R.sl.filter(s => s.a), people = alive.filter(s => !s.b);
  if (R.coop) {
    if (!people.length) return [RES_TEAM_LOSS, 255];
    if (!R.mons.some(m => m.a)) return [RES_TEAM_WIN, 255];
    return [0, 255];
  }
  if (alive.length === 0) return [RES_DRAW, 255];
  if (alive.length === 1 && !alive[0].b) return [RES_WIN, alive[0].o];
  if (!people.length) return [RES_NOBODY, 255];
  return [0, 255];
}

// Кінець раунду — із затримкою END_GRACE_MS. true — раунд щойно закінчився.
export function checkEnd(R, now) {
  if (R.p !== 0) return false;
  const [res, wn] = outcome(R);
  if (!res) { R.endAt = 0; return false; }
  if (!R.endAt) { R.endAt = now + END_GRACE_MS; return false; }
  if (now < R.endAt) return false;
  R.p = 1; R.res = res; R.wn = wn;
  return true;
}

