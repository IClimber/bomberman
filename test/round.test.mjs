import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newRound, hostStep, outcome, checkEnd, kill, applyItem, deadlyAt,
  MODE_VS, MODE_COOP, RES_WIN, RES_DRAW, RES_NOBODY, RES_TEAM_WIN, RES_TEAM_LOSS, END_GRACE_MS,
} from '../js/round.js';
import {
  IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, RESIST_MS, MAX_BOMBS, BLOCK, EMPTY, MON, FUSE_MS, makeMap, Board, cellOf,
} from '../js/sim.js';
import { monsterReach, TOUCH } from '../js/round.js';
import { monsterStep } from '../js/monsters.js';

const people = (n, bots = 0) => [
  ...Array.from({ length: n }, (_, k) => ({ i: 'player' + 'abcdefgh'[k] + '0000', b: false, c: k, n: 'P' + k })),
  ...Array.from({ length: bots }, (_, k) => ({ i: '', b: true, c: n + k, n: 'Бот ' + (k + 1) })),
];
const noop = { bomb() {}, pick() {}, dead() {} };

test('слоти стартують у кутах з базовими бонусами', () => {
  const R = newRound({ r: 1, seed: 5, m: MODE_VS, s: 0, d: 1, t0: 0, sl: people(2, 2) });
  assert.deepEqual(R.sl.map(s => [s.x, s.y]), [[1, 1], [13, 11], [13, 1], [1, 11]]);
  for (const s of R.sl) { assert.equal(s.nb, 1); assert.equal(s.fp, 2); assert.ok(s.a); }
  assert.equal(R.mons.length, 0);
  assert.equal(newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 1, t0: 0, sl: people(1) }).mons.length, 5);
});

test('підсумок «Один проти одного»: останній живий, нічия, без переможця', () => {
  const R = newRound({ r: 1, seed: 5, m: MODE_VS, s: 0, d: 1, t0: 0, sl: people(2, 1) });
  assert.deepEqual(outcome(R), [0, 255]);
  kill(R, 2, 0);                                        // бот
  assert.deepEqual(outcome(R), [0, 255]);
  kill(R, 1, 0);
  assert.deepEqual(outcome(R), [RES_WIN, 0]);
  kill(R, 0, 0);
  assert.deepEqual(outcome(R), [RES_DRAW, 255]);
  const Q = newRound({ r: 1, seed: 5, m: MODE_VS, s: 0, d: 1, t0: 0, sl: people(2, 2) });
  kill(Q, 0, 0); kill(Q, 1, 0);                         // люди загинули, боти живі
  assert.deepEqual(outcome(Q), [RES_NOBODY, 255]);
  const Z = newRound({ r: 1, seed: 5, m: MODE_VS, s: 0, d: 1, t0: 0, sl: people(1, 1) });
  kill(Z, 0, 0);                                        // лишився сам бот — теж без переможця
  assert.deepEqual(outcome(Z), [RES_NOBODY, 255]);
});

test('підсумок «Команди»: усі монстри — перемога, усі люди — поразка', () => {
  const R = newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 1, t0: 0, sl: people(1, 1) });
  assert.deepEqual(outcome(R), [0, 255]);
  for (const m of R.mons) m.a = false;
  assert.deepEqual(outcome(R), [RES_TEAM_WIN, 255]);
  const Q = newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 1, t0: 0, sl: people(1, 1) });
  kill(Q, 0, 0);
  assert.deepEqual(outcome(Q), [RES_TEAM_LOSS, 255]);
});

test('кінець раунду — після END_GRACE_MS, з підсумком на той момент', () => {
  const R = newRound({ r: 1, seed: 5, m: MODE_VS, s: 0, d: 1, t0: 0, sl: people(2) });
  kill(R, 1, 1000);
  assert.equal(checkEnd(R, 1000), false);
  kill(R, 0, 1100);                                     // загинув у тому самому вибуху, dead прийшов пізніше
  assert.equal(checkEnd(R, 1000 + END_GRACE_MS - 1), false);
  assert.equal(checkEnd(R, 1000 + END_GRACE_MS), true);
  assert.equal(R.p, 1);
  assert.equal(R.res, RES_DRAW);
});

test('бонуси і смертельні клітинки', () => {
  const R = newRound({ r: 1, seed: 5, m: MODE_VS, s: 0, d: 1, t0: 0, sl: people(1, 1) });
  const s = R.sl[0];
  for (let k = 0; k < 20; k++) applyItem(s, IT_BOMB, 0);
  applyItem(s, IT_FIRE, 0); applyItem(s, IT_SPEED, 0); applyItem(s, IT_PASS, 0); applyItem(s, IT_RESIST, 500);
  assert.deepEqual([s.nb, s.fp, s.sp, s.ps, s.rs], [MAX_BOMBS, 3, 1, true, 500 + RESIST_MS]);
  R.board.addBomb({ o: 1, n: 1, x: 1, y: 1, t: 0, p: 2 });
  R.board.advance(2500);
  assert.ok(deadlyAt(R, 1, 2, 2500, 0));
  assert.ok(!deadlyAt(R, 1, 2, 2500, 9999));            // стійкість
  assert.ok(!deadlyAt(R, 1, 4, 2500, 0));
  const mon = [{ a: true, x: 5, y: 5.5 }];
  assert.ok(deadlyAt(R, 5, 5, 2500, 9999, mon));        // монстр убиває й зі стійкістю
});

test('крок хоста: боти ставлять бомби, руйнують блоки; монстри рухаються; раунд закінчується', () => {
  for (const [m, d] of [[MODE_VS, 2], [MODE_COOP, 1]]) {
    const R = newRound({ r: 1, seed: 77, m, s: 0, d, t0: 0, sl: people(0, 4) });
    R.sl[0].b = false;                                  // «людина», що стоїть на місці й не гине від вогню
    R.sl[0].rs = Infinity;
    const blocks0 = R.board.cell.filter(c => c === BLOCK).length;
    const mons0 = R.mons.map(x => [x.x, x.y]).join();
    let bombs = 0, t = 0;
    const ev = { ...noop, bomb() { bombs++; } };
    while (t < 60000 && R.p === 0) { t += 50; hostStep(R, t, 0.05, ev); }
    assert.ok(bombs > 3, `бомб: ${bombs}`);
    assert.ok(R.board.cell.filter(c => c === BLOCK).length < blocks0);
    if (m === MODE_COOP) assert.notEqual(R.mons.map(x => [x.x, x.y]).join(), mons0);
  }
});

test('після кінця раунду: живих людей немає — боти грають далі, підсумок той самий; людина жива — усе стоїть', () => {
  const R = newRound({ r: 1, seed: 77, m: MODE_VS, s: 0, d: 1, t0: 0, sl: people(1, 3) });
  kill(R, 0, 100);
  let t = 0, bombs = 0;
  const ev = { ...noop, bomb() { bombs++; } };
  while (R.p === 0) { t += 50; hostStep(R, t, 0.05, ev); }
  assert.equal(R.res, RES_NOBODY);
  const where = () => R.sl.map(s => `${s.x},${s.y}`).join(';');
  const was = where();
  bombs = 0;
  for (let k = 0; k < 200; k++) { t += 50; hostStep(R, t, 0.05, ev); }
  assert.ok(bombs > 0, `бомб: ${bombs}`);
  assert.notEqual(where(), was);
  assert.deepEqual([R.p, R.res], [1, RES_NOBODY]);

  const Q = newRound({ r: 1, seed: 77, m: MODE_COOP, s: 0, d: 1, t0: 0, sl: people(1, 1) });
  for (const m of Q.mons) m.a = false;
  t = 0;
  while (Q.p === 0) { t += 50; hostStep(Q, t, 0.05, noop); }
  assert.equal(Q.res, RES_TEAM_WIN);
  const bot = Q.sl[1], at = [bot.x, bot.y];
  for (let k = 0; k < 100; k++) { t += 50; assert.equal(hostStep(Q, t, 0.05, noop), false); }
  assert.deepEqual([bot.x, bot.y], at);
});

// Порожня карта 13×11 (лише рамка і стовпи)
function emptyMap() {
  const m = makeMap(1, 0);
  for (let i = 0; i < m.cell.length; i++) if (m.cell[i] === BLOCK) { m.cell[i] = EMPTY; m.item[i] = 0; }
  return m;
}
// Math.random на час f — щоб рішення монстрів були передбачувані
function withRandom(v, f) {
  const r = Math.random;
  Math.random = () => v;
  try { return f(); } finally { Math.random = r; }
}

test('монстр і бомба: на «Легко» йде під вибух, на «Нормально» й «Важко» — тікає', () => {
  const survived = (diff) => withRandom(0, () => {
    const b = new Board(emptyMap(), 0);
    b.addBomb({ o: 0, n: 1, x: 5, y: 1, t: 0, p: 2 });   // вогонь — від (3, 1) до (7, 1)
    const m = { i: 1, k: 0, x: 3, y: 1, d: 2, a: true };
    const ctx = { now: 0, t0: 0, diff, danger: () => b.danger() };
    for (let t = 2000; t <= FUSE_MS + 400; t += 50) {   // до вибуху 0,5 с — монстр «бачить» його на всіх рівнях, крім «Легко»
      b.advance(t);
      ctx.now = t;
      monsterStep(m, 0.05, b, [], ctx);
      if (b.fireAt(cellOf(b.map, m.x, m.y), t)) return false;
    }
    return true;
  });
  assert.equal(survived(0), false);
  assert.equal(survived(1), true);
  assert.equal(survived(2), true);
});

test('привид не полює перші 20 с раунду і далі, ніж за кілька клітинок', () => {
  const dir = (now, tx, ty) => withRandom(0, () => {
    const b = new Board(emptyMap(), 0);
    b.advance(now);
    const g = { i: 1, k: 2, x: 5, y: 5, d: 2, a: true };
    monsterStep(g, 0.01, b, [{ x: tx, y: ty }], { now, t0: 0, diff: 1, danger: () => b.danger() });
    return g.d;
  });
  assert.equal(dir(1000, 5, 1), 2);                  // спокій — іде, куди йшов
  assert.equal(dir(25000, 5, 1), 1);                 // полює — угору до гравця
  assert.equal(dir(25000, 13, 11), 2);               // гравець надто далеко
});

test('досяжність монстрів: шляхом по прохідних для нього клітинках, привид — крізь блоки', () => {
  const b = new Board(emptyMap(), 0);
  b.cell[1 * b.map.GW + 1 + b.map.GW] = BLOCK;        // блок у (1, 2): між (1, 1) і (1, 3)
  const reach = (k) => monsterReach({ board: b, mons: [{ i: 1, k, x: 1, y: 3, a: true }] }, 0)[b.idx(1, 1)];
  const v = MON[0].speed, gv = MON[2].speed;
  assert.ok(Math.abs(reach(0) - (6 - TOUCH) / v * 1000) < 1e-6);   // в обхід стовпа: шість кроків
  assert.ok(Math.abs(reach(2) - (2 - TOUCH) / gv * 1000) < 1e-6);  // крізь блок: два
});

// Раунд «Один проти одного» на порожній карті: слот 0 — людина в (1, 11), слот 1 — бот рівня diff у (x, y)
function botRound(diff, x, y) {
  const R = newRound({ r: 1, seed: 5, m: MODE_VS, s: 0, d: diff, t0: 0, sl: people(1, 1) });
  R.board = new Board(emptyMap(), 0);
  Object.assign(R.sl[0], { x: 1, y: 11 });
  Object.assign(R.sl[1], { x, y });
  return R;
}

test('бот на довгому шляху помічає нову бомбу й не заходить у її вогонь', () => withRandom(0.5, () => {
  const R = botRound(1, 1, 1), bot = R.sl[1], GW = R.board.map.GW;
  bot.sp = 1;                                         // 3,7 клітинки за секунду: кінець тіку не потрапляє в центр клітинки
  const path = [];
  for (let x = 2; x <= 11; x++) path.push(GW + x);
  for (let y = 2; y <= 9; y++) path.push(y * GW + 11);
  bot.ai = { next: Infinity, seen: 0, path, bomb: false, tx: 1, ty: 1, goal: -1, allyWait: 0, tabu: new Map() };
  // вибухне, коли бот, ідучи далі за шляхом, був би в (11, 5)
  const ms = 1000 / 3.7, te = 14 * ms, tb = Math.round((te - FUSE_MS) / 50) * 50;
  let t = 0;
  while (t < te + 1000) {
    t += 50;
    if (t === tb) R.board.addBomb({ o: 0, n: 1, x: 9, y: 5, t: tb, p: 2 });
    hostStep(R, t, 0.05, noop);
  }
  assert.ok(bot.a);
}));

test('бот тікає з-під вибуху й тоді, коли на запас spare часу вже немає', () => withRandom(0.5, () => {
  const R = botRound(1, 4, 1), bot = R.sl[1];        // (4, 1): угору й униз стовпи — два кроки до безпечної клітинки
  R.board.addBomb({ o: 0, n: 1, x: 6, y: 1, t: 0, p: 3 });
  let t = 1750;                                       // до вибуху 0,75 с
  while (t < FUSE_MS + 600) { t += 50; hostStep(R, t, 0.05, noop); }
  assert.ok(bot.a);
}));

// Два боти на порожній карті без монстрів; m — режим, бот 0 у (x0, y0), бот 1 у (x1, y1)
function twoBots(m, x0, y0, x1, y1) {
  const R = newRound({ r: 1, seed: 5, m, s: 0, d: 1, t0: 0, sl: people(0, 2) });
  R.board = new Board(emptyMap(), 0);
  R.mons = [];
  Object.assign(R.sl[0], { x: x0, y: y0 });
  Object.assign(R.sl[1], { x: x1, y: y1 });
  return R;
}
const firstBomb = (R, until) => {
  let t = 0, first = 0;
  const ev = { ...noop, bomb() { if (!first) first = t; } };
  while (t < until && !first) { t += 50; hostStep(R, t, 0.05, ev); }
  return first;
};

test('«Один проти одного» без блоків: двоє ботів сходяться й ставлять бомбу, а не міняються місцями', () => withRandom(0.5, () => {
  assert.ok(firstBomb(twoBots(MODE_VS, 6, 1, 6, 5), 15000) > 0);
}));

test('«Команда»: двоє ботів у одній клітинці, кожен на лінії вогню іншого, — один відходить, другий ставить бомбу', () => withRandom(0.5, () => {
  const R = twoBots(MODE_COOP, 1, 1, 1, 1);
  R.board.cell[R.board.idx(3, 1)] = BLOCK;
  assert.ok(firstBomb(R, 15000) > 0);
}));

test('«Один проти одного»: на «Легко» й «Нормально» бот помічає чужу бомбу не одразу, на «Важко» — одразу', () => withRandom(0.5, () => {
  // бот стоїть у (5, 1) і думає лише через нову бомбу; поруч, у (6, 1), людина ставить бомбу
  const run = (diff, ms) => {
    const R = botRound(diff, 5, 1), bot = R.sl[1];
    bot.ai = { next: Infinity, seen: 0, path: [], bomb: false, tx: 5, ty: 1, goal: -1, roam: false, allyWait: 0, tabu: new Map() };
    R.board.addBomb({ o: 0, n: 1, x: 6, y: 1, t: 1000, p: 2 });
    for (let t = 1050; t <= 1000 + ms; t += 50) hostStep(R, t, 0.05, noop);
    return { moved: bot.x !== 5 || bot.y !== 1, alive: bot.a };
  };
  assert.equal(run(2, 300).moved, true);
  assert.equal(run(1, 300).moved, false);
  assert.equal(run(0, 1000).moved, false);
  assert.deepEqual(run(0, FUSE_MS + 600), { moved: true, alive: true });   // помітив — утік (униз, у (5, 2))
}));
