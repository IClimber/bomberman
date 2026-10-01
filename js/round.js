// round.js — раунд без DOM і мережі: слоти, поле, монстри; крок хоста (боти, монстри, смерті, кінець раунду).
// Слот { o (номер 0–3, місце старту), i (id людини; '' — бот), b (бот), c (колір), n (ім'я), a (живий), dt (коли загинув),
//   x, y, dr (напрям), mv (іде), nb (бомб), fp (дальність вогню), sp (бонусів швидкості), ps (прохід крізь бомби),
//   rs (стійкий до вогню до, спільний час), bn (лічильник своїх бомб) }
import {
  makeMap, Board, MON, WALL, RESIST_MS, MAX_BOMBS, MAX_FIRE, MAX_SPEED_UPS,
  IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, cellOf,
} from './sim.js';
import { monsterStep } from './monsters.js';
import { botTick, botCanPlace } from './bots.js';

export const COUNTDOWN_MS = 3000;    // відлік перед раундом
export const END_GRACE_MS = 400;     // перед підсумком чекаємо dead від тих, хто загинув у тому самому вибуху
export const TOUCH = 0.6;            // монстр ближче — убиває
export const START_BOMBS = 1, START_FIRE = 2;
export const MODE_VS = 0, MODE_COOP = 1;
// Підсумок: 1 — переміг слот wn, 2 — нічия (загинули всі), 3 — без переможця (люди загинули, боти живі),
// 4 — перемога команди, 5 — поразка команди
export const RES_WIN = 1, RES_DRAW = 2, RES_NOBODY = 3, RES_TEAM_WIN = 4, RES_TEAM_LOSS = 5;

// sl: [{ i, b, c, n }] у порядку слотів
export function newRound({ r, seed, m, s, d, t0, sl }) {
  const coop = m === MODE_COOP;
  const map = makeMap(seed, s, coop, d);
  const board = new Board(map, t0);
  const slots = sl.map((e, k) => {
    const [x, y] = map.spawns[k];
    return {
      o: k, i: e.i, b: !!e.b, c: e.c, n: e.n, a: true, dt: 0, x, y, dr: 3, mv: false,
      nb: START_BOMBS, fp: START_FIRE, sp: 0, ps: false, rs: 0, bn: 0,
    };
  });
  const mons = map.mons.map(mo => ({ i: mo.i, k: mo.k, x: mo.x, y: mo.y, d: 0, a: true, dt: 0 }));
  return { r, seed, m, s, d, t0, coop, map, board, sl: slots, mons, p: 0, res: 0, wn: 255, endAt: 0 };
}

export function applyItem(s, kind, now) {
  if (kind === IT_BOMB) s.nb = Math.min(MAX_BOMBS, s.nb + 1);
  else if (kind === IT_FIRE) s.fp = Math.min(MAX_FIRE, s.fp + 1);
  else if (kind === IT_SPEED) s.sp = Math.min(MAX_SPEED_UPS, s.sp + 1);
  else if (kind === IT_PASS) s.ps = true;
  else if (kind === IT_RESIST) s.rs = now + RESIST_MS;
}

// Чи загинув би хтось у точці (x, y): стіна, вогонь (без стійкості), дотик монстра (mons — як їх видно)
export function deadlyAt(R, x, y, now, resistUntil, mons = R.mons) {
  const B = R.board, i = cellOf(B.map, x, y);
  if (B.cell[i] === WALL) return true;
  if (B.fireAt(i, now) && !(resistUntil > now)) return true;
  for (const m of mons) if (m.a && Math.hypot(m.x - x, m.y - y) < TOUCH) return true;
  return false;
}

export function kill(R, o, t) {
  const s = R.sl[o];
  if (!s || !s.a) return false;
  s.a = false;
  s.dt = t;
  return true;
}

// Крок хоста. ev: { bomb(b), pick(p), dead(o, t), monster(m) } — що розіслати. Повертає true, якщо щось змінилось.
export function hostStep(R, now, dt, ev) {
  if (R.p !== 0 || now < R.t0) return false;
  const B = R.board;
  B.advance(now);
  let changed = false;
  const targets = R.sl.filter(s => s.a);
  for (const m of R.mons) {
    if (!m.a) continue;
    monsterStep(m, dt, B, targets);
    const i = cellOf(B.map, m.x, m.y);
    if (B.cell[i] === WALL || B.fireAt(i, now)) { m.a = false; m.dt = now; changed = true; if (ev.monster) ev.monster(m); }
  }
  let dangerCache = null;
  const danger = () => dangerCache || (dangerCache = B.danger());
  let threat = null;
  if (R.coop) {
    threat = new Uint8Array(B.map.GW * B.map.GH);
    for (const m of R.mons) {
      if (!m.a) continue;
      const r = MON[m.k].sight ? 3 : 2;
      for (const [px, py] of [[m.x, m.y], [m.tx ?? m.x, m.ty ?? m.y]]) {
        const cx = Math.round(px), cy = Math.round(py);
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const x = cx + dx, y = cy + dy;
            if (Math.abs(dx) + Math.abs(dy) <= r && B.inside(x, y)) threat[B.idx(x, y)] = 1;
          }
        }
      }
    }
  }
  for (const s of R.sl) {
    if (!s.a || !s.b) continue;
    const others = R.sl.filter(e => e.a && e !== s);
    const ctx = {
      board: B, now, diff: R.d, coop: R.coop, danger, threat,
      enemies: R.coop ? R.mons.filter(m => m.a) : others, allies: R.coop ? others : [],
      monsters: R.coop ? R.mons.filter(m => m.a) : null,
    };
    if (botTick(s, dt, ctx) && botCanPlace(s, B)) {
      const b = { o: s.o, n: ++s.bn, x: Math.round(s.x), y: Math.round(s.y), t: now, p: s.fp };
      B.addBomb(b);
      B.advance(now);
      dangerCache = null;
      ev.bomb(b);
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
    if (deadlyAt(R, s.x, s.y, now, s.rs) && kill(R, s.o, now)) { ev.dead(s.o, now); changed = true; }
  }
  return checkEnd(R, now) || changed;
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

