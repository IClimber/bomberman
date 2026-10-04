// round.js — раунд без DOM і мережі: слоти, поле, монстри; крок хоста (боти, монстри, смерті, кінець раунду).
// Слот { o (номер 0–3, місце старту), i (id людини; '' — бот), b (бот), c (колір), n (ім'я), a (живий), dt (коли загинув),
//   kb (хто вбив, див. KB_*), x, y, dr (напрям), mv (іде), nb (бомб), fp (дальність вогню), sp (бонусів швидкості),
//   ps (прохід крізь бомби), rs (стійкий до вогню до, спільний час), rc (детонатор), bn (лічильник своїх бомб) }
import {
  makeMap, Board, MON, WALL, PILLAR, BLOCK, FLAME_MS, Heap, RESIST_MS, MAX_BOMBS, MAX_FIRE, MAX_SPEED_UPS, FUSE_MS,
  IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, IT_REMOTE, DX, DY, cellOf,
} from './sim.js';
import { monsterStep } from './monsters.js';
import { botTick, botCanPlace, botDetonate } from './bots.js';

export const COUNTDOWN_MS = 3000;    // відлік перед раундом
export const END_GRACE_MS = 400;     // перед підсумком чекаємо dead від тих, хто загинув у тому самому вибуху
export const TOUCH = 0.6;            // монстр ближче — убиває
export const START_BOMBS = 1, START_FIRE = 2;
export const MODE_VS = 0, MODE_COOP = 1;
// Розум ботів (рівень LEVEL у bots.js): у «Один проти одного» — від складності, у «Команді» — завжди найкращий
// (вони товариші: складність там — кількість і розум монстрів)
export const COOP_BOTS = 2;
// Підсумок: 1 — переміг слот wn, 2 — нічия (загинули всі; у «Команді» — і монстри, причому останній — не раніше за команду),
// 3 — без переможця (люди загинули, боти живі), 4 — перемога команди, 5 — поразка команди
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
      nb: START_BOMBS, fp: START_FIRE, sp: 0, ps: false, rs: 0, rc: false, bn: 0,
    };
  });
  const mons = map.mons.map(mo => ({ i: mo.i, k: mo.k, x: mo.x, y: mo.y, d: 0, a: true, dt: 0, kb: KB_NONE }));
  return { r, seed, m, s, d, bd: coop ? COOP_BOTS : d, t0, coop, map, board, sl: slots, mons, p: 0, res: 0, wn: 255, endAt: 0 };
}

export function applyItem(s, kind, now) {
  if (kind === IT_BOMB) s.nb = Math.min(MAX_BOMBS, s.nb + 1);
  else if (kind === IT_FIRE) s.fp = Math.min(MAX_FIRE, s.fp + 1);
  else if (kind === IT_SPEED) s.sp = Math.min(MAX_SPEED_UPS, s.sp + 1);
  else if (kind === IT_PASS) s.ps = true;
  else if (kind === IT_RESIST) s.rs = now + RESIST_MS;
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
  const reach = R.coop && R.bd > 0 && R.sl.some(s => s.a && s.b) ? monsterReach(R, now, danger()) : null;   // лише коли є кому
  for (const s of R.sl) {
    if (!s.a || !s.b) continue;
    const others = R.sl.filter(e => e.a && e !== s);
    let mine = null;                                               // свої бомби з детонатором бот підірве сам (Board.danger)
    const own = B.remoteOf(s.o).length ? () => mine || (mine = B.danger(undefined, null, true, s.o)) : danger;
    const ctx = {
      board: B, now, diff: R.bd, coop: R.coop, danger: own, reach,
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

// Коли монстр найраніше може торкнутися того, хто стоїть у клітинці (спільний час): найгірший випадок — монстр іде
// просто туди найкоротшим за часом шляхом по прохідних для нього клітинках (привид — крізь блоки). Для ботів «Команди»:
// вони обходять клітинки, куди монстр устигне раніше за них, і не стоять там, куди він скоро дійде.
// danger (Board.danger) — що відкриється: блок у вогні, коли згорить, бомба, коли вибухне й догорить (інакше бот
// підривав блок, за яким монстр, чи ховався за бомбою, а за 2–3 с прохід відкривався — і монстр його затискав).
export function monsterReach(R, now, danger = null) {
  const B = R.board, { GW, GH } = B.map, n = GW * GH;
  const reach = new Float64Array(n).fill(Infinity), arr = new Float64Array(n), hops = new Float64Array(n);
  // з якого часу клітинка прохідна: openN — для звичайних монстрів, openG — для привида
  const openN = new Float64Array(n), openG = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = B.cell[i], later = danger && danger[i] !== Infinity ? danger[i] + FLAME_MS : Infinity;
    if (c === PILLAR || c === WALL) openN[i] = openG[i] = Infinity;
    else if (B.active.has(i)) openN[i] = openG[i] = later;
    else if (c === BLOCK) { openG[i] = -Infinity; openN[i] = B.burn.has(i) ? B.burn.get(i) : later; }
    else openN[i] = openG[i] = -Infinity;
  }
  const heap = new Heap();
  for (const m of R.mons) {
    if (!m.a) continue;
    const kind = MON[m.k], step = 1000 / kind.speed, open = kind.ghost ? openG : openN;
    const tx = m.tx ?? Math.round(m.x), ty = m.ty ?? Math.round(m.y), fx = Math.round(m.x), fy = Math.round(m.y);
    arr.fill(Infinity);
    for (const [x, y, d] of [[tx, ty, Math.abs(m.x - tx) + Math.abs(m.y - ty)], [fx, fy, Math.abs(m.x - fx) + Math.abs(m.y - fy)]]) {
      const i = B.idx(x, y), t = now + d * step;
      if (t < arr[i]) { arr[i] = t; hops[i] = d; heap.push(i, t); }
    }
    while (heap.size) {
      const t = heap.top(), i = heap.pop();
      if (t > arr[i]) continue;
      if (t - TOUCH * step < reach[i]) reach[i] = t - TOUCH * step;
      if (hops[i] > 12) continue;                                  // далі — не загроза
      const x = i % GW, y = (i - x) / GW;
      for (let d = 1; d <= 4; d++) {
        const j = (y + DY[d]) * GW + x + DX[d], o = open[j];
        if (o === Infinity) continue;
        const tj = (o > t ? o : t) + step;
        if (tj < arr[j]) { arr[j] = tj; hops[j] = hops[i] + 1; heap.push(j, tj); }
      }
    }
  }
  return reach;
}

// Підсумок за поточним станом (0 — раунд триває)
export function outcome(R) {
  const alive = R.sl.filter(s => s.a), people = alive.filter(s => !s.b);
  if (R.coop) {                      // команда — люди й боти разом: поки живий хоч хтось із них, раунд іде
    const mons = R.mons.some(m => m.a);
    if (alive.length && mons) return [0, 255];
    if (alive.length) return [RES_TEAM_WIN, 255];
    if (mons) return [RES_TEAM_LOSS, 255];
    // загинули всі (раптова смерть): команда протрималась довше за останнього монстра — перемога, інакше — нічия
    const last = (list) => list.reduce((t, e) => Math.max(t, e.dt), -Infinity);
    return [last(R.sl) > last(R.mons) ? RES_TEAM_WIN : RES_DRAW, 255];
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

