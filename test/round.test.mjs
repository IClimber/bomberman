import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newRound, hostStep, outcome, checkEnd, kill, applyItem, deadlyAt, killerAt, orphanDets, KB_WALL, KB_MON, KB_NONE, COOP_BOTS,
  MODE_VS, MODE_COOP, RES_WIN, RES_DRAW, RES_NOBODY, RES_TEAM_WIN, RES_TEAM_LOSS, RES_GOING, END_GRACE_MS,
} from '../js/round.js';
import {
  IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, RESIST_MS, MAX_BOMBS, BLOCK, EMPTY, MON, FUSE_MS, FLAME_MS, makeMap, Board, cellOf,
} from '../js/sim.js';
import { monsterReach, TOUCH } from '../js/round.js';
import { monsterStep } from '../js/monsters.js';
import { botDanger } from '../js/bots.js';

const people = (n, bots = 0) => [
  ...Array.from({ length: n }, (_, k) => ({ i: 'player' + 'abcdefgh'[k] + '0000', b: false, c: k, n: 'P' + k })),
  ...Array.from({ length: bots }, (_, k) => ({ i: '', b: true, c: n + k, n: 'Бот ' + (k + 1) })),
];
const noop = { bomb() {}, pick() {}, dead() {}, det() {} };

test('слоти стартують у кутах з базовими бонусами', () => {
  const R = newRound({ r: 1, seed: 5, m: MODE_VS, s: 0, d: 1, t0: 0, sl: people(2, 2) });
  assert.deepEqual(R.sl.map(s => [s.x, s.y]), [[1, 1], [13, 11], [13, 1], [1, 11]]);
  for (const s of R.sl) { assert.equal(s.nb, 1); assert.equal(s.fp, 2); assert.ok(s.a); }
  assert.equal(R.mons.length, 0);
  assert.equal(newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 1, t0: 0, sl: people(1) }).mons.length, 5);
});

test('розум ботів: у «Один проти одного» — від складності, у «Команді» — завжди найкращий', () => {
  for (const d of [0, 1, 2]) {
    assert.equal(newRound({ r: 1, seed: 5, m: MODE_VS, s: 0, d, t0: 0, sl: people(1, 1) }).bd, d);
    assert.equal(newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d, t0: 0, sl: people(1, 1) }).bd, COOP_BOTS);
  }
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

test('підсумок «Команди»: усі монстри — перемога, уся команда (люди й боти) — поразка, усі — хто протримався довше', () => {
  const R = newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 1, t0: 0, sl: people(1, 1) });
  assert.deepEqual(outcome(R), [0, 255]);
  kill(R, 0, 0);                                        // людина загинула, бот живий — підсумок «гра продовжується»
  assert.deepEqual(outcome(R), [RES_GOING, 255]);
  for (const m of R.mons) m.a = false;
  assert.deepEqual(outcome(R), [RES_TEAM_WIN, 255]);    // бот дотягнув
  const Q = newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 1, t0: 0, sl: people(1, 1) });
  kill(Q, 0, 0); kill(Q, 1, 100);
  assert.deepEqual(outcome(Q), [RES_TEAM_LOSS, 255]);
  const all = (team, mon) => {                          // загинули всі: команда останньою — у team, останній монстр — у mon
    const Z = newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 1, t0: 0, sl: people(1, 1) });
    kill(Z, 0, 1000); kill(Z, 1, team);
    for (const m of Z.mons) { m.a = false; m.dt = 900; }
    Z.mons[0].dt = mon;
    return outcome(Z)[0];
  };
  assert.equal(all(5050, 5000), RES_TEAM_WIN);
  assert.equal(all(5000, 5000), RES_DRAW);
  assert.equal(all(5000, 5050), RES_DRAW);
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

test('хто вбив: вогонь — власник бомби (ланцюжок — бомба, що дала вогонь), стіна, монстр', () => {
  const R = newRound({ r: 1, seed: 5, m: MODE_VS, s: 0, d: 1, t0: 0, sl: people(2, 1) });
  const B = R.board;
  B.addBomb({ o: 1, n: 1, x: 1, y: 1, t: 0, p: 2 });
  B.addBomb({ o: 2, n: 1, x: 2, y: 1, t: 1000, p: 1 });       // підірве ланцюжком, її вогонь — на (3, 1)
  B.advance(2500);
  assert.equal(killerAt(R, 1, 2, 2500, 0), 1);
  assert.equal(killerAt(R, 3, 1, 2500, 0), 2);
  assert.equal(killerAt(R, 1, 4, 2500, 0), -1);
  assert.equal(killerAt(R, 1, 2, 2500, 9999), -1);              // стійкість
  assert.equal(killerAt(R, 5, 5, 2500, 0, [{ a: true, k: 1, x: 5, y: 5.4 }]), KB_MON + 1);
  B.advance(B.sdAt + 1);
  assert.equal(killerAt(R, 1, 1, B.sdAt + 1, 0), KB_WALL);
  assert.ok(kill(R, 0, 2500, 1) && R.sl[0].kb === 1);
  assert.equal(R.sl[1].kb, KB_NONE);
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

test('монстри «Важко»: переслідувач «чує» гравця за рогом, блукач повертає до гравця поруч, біля бомби — чекають поза вогнем', () => {
  const step = (m, diff, players, b = new Board(emptyMap(), 0), now = 0) => withRandom(0, () => {
    b.advance(now);
    monsterStep(m, 0.01, b, players, { now, t0: 0, diff, danger: () => b.danger() });
    return m.d;
  });
  const chaser = () => ({ i: 1, k: 1, x: 5, y: 5, d: 2, a: true });
  assert.equal(step(chaser(), 2, [{ x: 3, y: 3 }]), 1);   // не на одній лінії: найкоротшим шляхом (угору)
  assert.equal(step(chaser(), 1, [{ x: 3, y: 3 }]), 2);   // «Нормально» — іде, куди йшов
  const walker = () => ({ i: 1, k: 0, x: 5, y: 1, d: 2, a: true });
  assert.equal(step(walker(), 2, [{ x: 3, y: 1 }]), 4);
  assert.equal(step(walker(), 1, [{ x: 3, y: 1 }]), 2);
  const near = (diff) => {                                // бомба в (5, 1): вогонь (4..6, 1); монстр у (7, 1), гравець — у (1, 1)
    const b = new Board(emptyMap(), 0);
    b.addBomb({ o: 0, n: 1, x: 5, y: 1, t: 0, p: 1 });
    b.cell[b.idx(7, 2)] = BLOCK;                         // обхід униз закрито: геть від вогню — лише праворуч, від гравця
    const m = { i: 1, k: 0, x: 7, y: 1, d: 4, a: true };
    for (let t = 2000; t < FUSE_MS; t += 50) withRandom(0, () => { b.advance(t); monsterStep(m, 0.05, b, [{ x: 1, y: 1 }], { now: t, t0: 0, diff, danger: () => b.danger() }); });
    return [m.x, m.y];
  };
  assert.deepEqual(near(2), [7, 1]);                     // стоїть найближче до гравця, поза вогнем
  assert.notDeepEqual(near(1), [7, 1]);                  // «Нормально» — геть від вибуху
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

// Досяжність монстрів до Дейкстри (пошук у ширину по нинішньому полю) — для порівняння
function oldReach(R, now) {
  const B = R.board, { GW, GH } = B.map, n = GW * GH;
  const reach = new Float64Array(n).fill(Infinity), dist = new Float64Array(n);
  for (const m of R.mons) {
    if (!m.a) continue;
    const kind = MON[m.k], step = 1000 / kind.speed;
    const tx = m.tx ?? Math.round(m.x), ty = m.ty ?? Math.round(m.y), fx = Math.round(m.x), fy = Math.round(m.y);
    const seeds = [[tx, ty, Math.abs(m.x - tx) + Math.abs(m.y - ty)], [fx, fy, Math.abs(m.x - fx) + Math.abs(m.y - fy)]];
    seeds.sort((a, b) => a[2] - b[2]);
    dist.fill(Infinity);
    const q = [];
    for (const [x, y, d] of seeds) { const i = B.idx(x, y); if (d < dist[i]) { dist[i] = d; q.push(i); } }
    for (let h = 0; h < q.length; h++) {
      const i = q[h], t = now + (dist[i] - TOUCH) * step;
      if (t < reach[i]) reach[i] = t;
      if (dist[i] > 12) continue;
      const x = i % GW, y = (i - x) / GW;
      for (let d = 1; d <= 4; d++) {
        const nx = x + [0, 0, 1, 0, -1][d], ny = y + [0, -1, 0, 1, 0][d], j = ny * GW + nx;
        if (dist[j] !== Infinity || B.solid(nx, ny, !!kind.ghost)) continue;
        dist[j] = dist[i] + 1;
        q.push(j);
      }
    }
  }
  return reach;
}

test('досяжність монстрів без бомб — та сама, що й пошуком у ширину; з небезпекою — теж, бо нічого не відкривається', () => {
  for (const seed of [3, 7, 11, 19]) for (const s of [0, 2]) {
    const R = newRound({ r: 1, seed, m: MODE_COOP, s, d: 2, t0: 0, sl: people(1) });
    R.mons.forEach((m, k) => { if (k % 2) { m.x += 0.4; m.tx = Math.round(m.x) + 1; m.ty = Math.round(m.y); } });
    const a = oldReach(R, 500), b = monsterReach(R, 500), c = monsterReach(R, 500, R.board.danger());
    for (let i = 0; i < a.length; i++) {
      assert.ok(a[i] === b[i] || Math.abs(a[i] - b[i]) < 1e-6, `зерно ${seed}, клітинка ${i}: ${a[i]} ≠ ${b[i]}`);
      assert.ok(b[i] === c[i] || Math.abs(c[i] - b[i]) < 1e-6);
    }
  }
});

test('досяжність монстрів: блок у вогні бомби відкривається, коли згорить', () => {
  const b = new Board(emptyMap(), 0), GW = b.map.GW;
  b.cell[2 * GW + 1] = BLOCK;                         // блок у (1, 2) між монстром у (1, 3) і клітинкою (1, 1)
  b.cell[1 * GW + 3] = BLOCK;                         // і в (3, 1): обхід закрито
  b.addBomb({ o: 0, n: 1, x: 1, y: 1, t: 0, p: 1 });  // зачепить (1, 2) і (2, 1)
  b.advance(100);
  const R = { board: b, mons: [{ i: 1, k: 0, x: 1, y: 3, a: true }] };
  const at = b.idx(1, 2), step = 1000 / MON[0].speed;
  assert.equal(monsterReach(R, 100)[at], Infinity);
  const r = monsterReach(R, 100, b.danger())[at];
  assert.ok(Math.abs(r - (FUSE_MS + FLAME_MS + step - TOUCH * step)) < 1e-6, `${r}`);
});

test('бот на довгому шляху помічає нову бомбу й не заходить у її вогонь', () => withRandom(0.5, () => {
  const R = botRound(2, 1, 1), bot = R.sl[1], GW = R.board.map.GW;
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

test('«Один проти одного», «Легко»: без бомби «для тиску» і не більше однієї бомби за раз', () => {
  const pressed = (diff) => withRandom(0.5, () => {
    const R = botRound(diff, 6, 5);
    Object.assign(R.sl[0], { x: 5, y: 4 });            // людина за 2 клітинки, не на лінії вогню
    let n = 0;
    hostStep(R, 50, 0.05, { ...noop, bomb() { n++; } });
    return n;
  });
  assert.equal(pressed(2), 1);
  assert.equal(pressed(0), 0);
  const most = (diff) => withRandom(0.3, () => {      // звичайна карта, у бота три бомби: скільки найбільше стоїть разом
    const R = newRound({ r: 1, seed: 5, m: MODE_VS, s: 0, d: diff, t0: 0, sl: people(1, 1) });
    R.sl[1].nb = 3;
    let n = 0;
    for (let t = 50; t < 20000; t += 50) { hostStep(R, t, 0.05, noop); n = Math.max(n, R.board.activeOf(1)); }
    return n;
  });
  assert.equal(most(2), 3);
  assert.equal(most(0), 1);
});

test('детонатор: бот ставить бомбу, відходить і підриває її сам; загиблий бот — його бомби вибухають за запал', () => withRandom(0.5, () => {
  const R = twoBots(MODE_VS, 1, 1, 13, 11), bot = R.sl[0];
  bot.rc = true;
  R.board.cell[R.board.idx(3, 1)] = BLOCK;                         // є що підірвати
  let t = 0, placed = 0, det = 0;
  const ev = { ...noop, bomb(b) { if (!placed && b.o === 0) placed = t; }, det(e) { if (!det && e.o === 0) det = t; } };
  while (t < 8000 && !det) { t += 50; hostStep(R, t, 0.05, ev); }
  assert.ok(placed > 0 && det > placed, `поставив ${placed}, підірвав ${det}`);
  assert.ok(bot.a);
  for (let k = 0; k < 20; k++) { t += 50; hostStep(R, t, 0.05, noop); }
  assert.equal(R.board.cell[R.board.idx(3, 1)], EMPTY);

  const Q = twoBots(MODE_VS, 1, 1, 9, 9), B = Q.board;          // бот 1 замкнений у (9, 9): відкрито лише вгору, під вогонь
  for (const [x, y] of [[8, 9], [10, 9], [9, 10]]) B.cell[B.idx(x, y)] = BLOCK;
  B.addBomb({ o: 1, n: 1, x: 1, y: 11, t: 0, p: 1, rc: true });
  B.addBomb({ o: 0, n: 1, x: 9, y: 7, t: 0, p: 3 });
  B.advance(100);
  assert.deepEqual(orphanDets(Q, 1, 100), [{ o: 1, n: 1, b: 0, t: 100 + FUSE_MS }]);
  const dets = [];
  let tt = 0;
  while (tt < 2 * FUSE_MS + 200) { tt += 50; hostStep(Q, tt, 0.05, { ...noop, det(e) { dets.push(e); } }); }
  assert.ok(!Q.sl[1].a);
  assert.deepEqual(dets, [{ o: 1, n: 1, b: 0, t: Q.sl[1].dt + FUSE_MS }]);
  assert.equal(B.bombAt(B.idx(1, 11)), null);                      // вибухла
}));

test('детонатор: від чужої бомби бот тікає крізь вогонь своєї (її він підірве сам) і підриває її, вийшовши', () => {
  for (const diff of [0, 1, 2]) withRandom(0.5, () => {
    const R = botRound(diff, 5, 1), B = R.board, bot = R.sl[1];
    bot.rc = true;
    B.cell[B.idx(5, 2)] = BLOCK;                                   // з (5, 1) вихід лише ліворуч, крізь вогонь своєї
    B.addBomb({ o: 1, n: 1, x: 3, y: 2, t: 1000, p: 1, rc: true }); // своя: вогонь (3, 1), (3, 2), (3, 3)
    B.addBomb({ o: 0, n: 1, x: 7, y: 1, t: 1000, p: 3 });           // людина: вогонь (4..10, 1)
    let det = 0;
    for (let t = 1050; t <= 4500; t += 50) {
      hostStep(R, t, 0.05, { ...noop, det(e) { if (e.o === 1 && !det) det = t; } });
      if (det === t) assert.ok(![[3, 1], [3, 2], [3, 3]].some(([x, y]) => Math.round(bot.x) === x && Math.round(bot.y) === y));
    }
    assert.ok(bot.a, `рівень ${diff}`);
    assert.ok(det > 0, `рівень ${diff}: не підірвав`);
  });
});

test('«Один проти одного», «Легко»: частину чужих бомб бачить з меншою дальністю (rangeMiss); «Важко» — усі точно', () => {
  const end = (diff, n) => {                           // бот у (5, 1), у крайній клітинці променя бомби з (8, 1) дальністю 3
    const R = botRound(diff, 5, 1), B = R.board;
    B.addBomb({ o: 0, n, x: 8, y: 1, t: 0, p: 3 });
    B.advance(2000);                                   // уже помітив (react)
    return botDanger(R.sl[1], { board: B, now: 2000, diff, coop: false, danger: () => B.danger() })[B.idx(5, 1)];
  };
  const ns = Array.from({ length: 20 }, (_, k) => k + 1);
  assert.ok(ns.every(n => end(2, n) === FUSE_MS));
  const missed = ns.filter(n => end(0, n) === Infinity).length;
  assert.ok(missed >= 4 && missed <= 16, `не бачить ${missed} з 20`);
});

test('«Команда»: помилки рівня не діють — бот тікає від бомби товариша однаково на всіх рівнях', () => {
  const path = (bd) => withRandom(0.5, () => {
    const R = newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 0, t0: 0, sl: people(1, 1) });
    R.board = new Board(emptyMap(), 0);
    R.mons = [];
    R.bd = bd;
    Object.assign(R.sl[0], { x: 9, y: 1 });
    Object.assign(R.sl[1], { x: 5, y: 1 });
    R.board.addBomb({ o: 0, n: 1, x: 8, y: 1, t: 0, p: 3 });
    const cells = [];
    for (let t = 50; t <= FUSE_MS + 600; t += 50) { hostStep(R, t, 0.05, noop); cells.push(Math.round(R.sl[1].x) + ',' + Math.round(R.sl[1].y)); }
    assert.ok(R.sl[1].a);
    return cells.join(' ');
  });
  assert.equal(path(0), path(2));
});

test('«Команда»: затиснутий у коридорі між монстрами — бомба під себе, стоїть на ній, поки монстр поруч, і виходить до вибуху', () => withRandom(0.5, () => {
  const R = newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 1, t0: 0, sl: people(0, 1) });   // монстри «Нормально»: тікають далеко
  const B = R.board = new Board(emptyMap(), 0), bot = R.sl[0];
  for (const [x, y] of [[1, 2], [3, 2], [5, 2], [7, 2], [9, 2], [10, 1]]) B.cell[B.idx(x, y)] = BLOCK;   // коридор (1..9, 1)
  R.mons = [{ i: 1, k: 0, x: 1, y: 1, d: 0, a: true }, { i: 2, k: 0, x: 9, y: 1, d: 0, a: true }];
  Object.assign(bot, { x: 5, y: 1, fp: 1 });
  let bomb = null, stood = false;
  for (let t = 50; t <= 4500; t += 50) {
    hostStep(R, t, 0.05, { ...noop, bomb(b) { bomb = bomb || b; } });
    if (bomb && R.mons.some(m => Math.hypot(m.x - bot.x, m.y - bot.y) <= 1.05) && bot.x === 5 && bot.y === 1) stood = true;
    if (bomb && t === bomb.t + FUSE_MS) assert.ok(Math.abs(bot.x - 5) + Math.abs(bot.y - 1) > 1, 'у вогні своєї бомби');
  }
  assert.ok(bomb && bomb.o === 0 && bomb.x === 5 && bomb.y === 1, 'не поставив');
  assert.ok(stood, 'не стояв на бомбі, коли монстр поруч');
  assert.ok(bot.a);
}));

test('«Команда»: двоє ботів в одній клітинці, затиснуті монстрами, — бомба під себе (товариш ховається на ній теж)', () => withRandom(0.5, () => {
  const R = newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 1, t0: 0, sl: people(0, 2) });
  const B = R.board = new Board(emptyMap(), 0);
  for (const [x, y] of [[1, 2], [3, 2], [5, 2], [7, 2], [9, 2], [10, 1]]) B.cell[B.idx(x, y)] = BLOCK;
  R.mons = [{ i: 1, k: 0, x: 1, y: 1, d: 0, a: true }, { i: 2, k: 0, x: 9, y: 1, d: 0, a: true }];
  for (const s of R.sl) Object.assign(s, { x: 5, y: 1, fp: 1 });
  let bomb = null;
  for (let t = 50; t <= 4500; t += 50) hostStep(R, t, 0.05, { ...noop, bomb(b) { bomb = bomb || b; } });
  assert.ok(bomb && bomb.x === 5 && bomb.y === 1, 'не поставили');
  assert.ok(R.sl.every(s => s.a));
}));

test('«Команда»: стійкий до вогню бот на своїй бомбі з монстром поруч не тікає (вогонь уб\'є монстра, а не його)', () => withRandom(0.5, () => {
  const R = newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 1, t0: 0, sl: people(0, 1) });
  const B = R.board = new Board(emptyMap(), 0), bot = R.sl[0];
  for (const [x, y] of [[1, 2], [3, 2], [5, 2], [7, 2], [9, 2], [10, 1]]) B.cell[B.idx(x, y)] = BLOCK;
  R.mons = [{ i: 1, k: 0, x: 6, y: 1, d: 0, a: true }];
  Object.assign(bot, { x: 5, y: 1, fp: 2, rs: 10000 });
  B.addBomb({ o: 0, n: 1, x: 5, y: 1, t: 0, p: 2 });
  for (let t = 50; t <= FUSE_MS + 200; t += 50) {
    const near = R.mons.some(m => m.a && Math.abs(m.x - 5) + Math.abs(m.y - 1) <= 3);
    hostStep(R, t, 0.05, noop);
    if (near) assert.deepEqual([bot.x, bot.y], [5, 1], `${t}`);
  }
  assert.ok(bot.a);
}));

test('«Команда»: люди загинули, боти живі — одразу підсумок «гра продовжується», боти грають далі, потім — справжній результат', () => {
  const R = newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 0, t0: 0, sl: people(1, 1) });
  kill(R, 0, 100);
  let t = 0;
  while (R.p === 0) { t += 50; hostStep(R, t, 0.05, noop); }
  assert.equal(R.res, RES_GOING);
  assert.ok(t <= 100 + END_GRACE_MS + 50);
  const at = [R.sl[1].x, R.sl[1].y];
  for (let k = 0; k < 40; k++) { t += 50; hostStep(R, t, 0.05, noop); }
  assert.notDeepEqual([R.sl[1].x, R.sl[1].y], at);      // бот грає під підсумком
  for (const m of R.mons) { m.a = false; m.dt = t; }
  for (let k = 0; k < 20 && R.res === RES_GOING; k++) { t += 50; hostStep(R, t, 0.05, noop); }
  assert.deepEqual([R.p, R.res], [1, RES_TEAM_WIN]);
});

test('досяжність монстрів із бомбою-заслоном: за нею — не раніше, ніж вона догорить; монстрам, що туди не йдуть, — без змін', async () => {
  const { reachBlocked } = await import('../js/monsters.js');
  const R = newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 1, t0: 0, sl: people(1) });
  const B = R.board = new Board(emptyMap(), 0), GW = B.map.GW;
  for (const [x, y] of [[1, 2], [3, 2], [5, 2], [7, 2], [9, 2], [11, 2], [13, 2]]) B.cell[B.idx(x, y)] = BLOCK;   // коридор (1..13, 1)
  R.mons = [{ i: 1, k: 1, x: 9, y: 1, d: 0, a: true }, { i: 2, k: 0, x: 1, y: 11, d: 0, a: true }];
  const reach = monsterReach(R, 0), until = 3000;
  const b = reachBlocked(reach, B.idx(6, 1), until);
  assert.ok(reach[B.idx(4, 1)] < until);
  assert.ok(b[B.idx(4, 1)] > until, `${b[B.idx(4, 1)]}`);           // за бомбою — лише після неї
  assert.equal(b[B.idx(8, 1)], reach[B.idx(8, 1)]);                  // перед нею — як було
  assert.equal(b[B.idx(1, 10)], reach[B.idx(1, 10)]);                // інший монстр — як було
  assert.equal(reachBlocked(reach, B.idx(2, 2), until), reach);       // туди ніхто не доходить (стовп) — той самий масив
});

test('стійкий до вогню бот не ставить бомбу в клітинку, що горить (вибухнула б одразу — і так раз за разом)', () => withRandom(0.5, () => {
  const R = newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 1, t0: 0, sl: people(0, 1) });
  const B = R.board = new Board(emptyMap(), 0), bot = R.sl[0];
  for (const [x, y] of [[1, 2], [3, 2], [5, 2], [7, 2], [9, 2], [8, 1]]) B.cell[B.idx(x, y)] = BLOCK;
  R.mons = [{ i: 1, k: 0, x: 7, y: 1, d: 0, a: true }];        // замкнений у (7, 1): вийти — лише у вогонь (6, 1)
  Object.assign(bot, { x: 5, y: 1, fp: 2, rs: 20000, nb: 3 });
  B.addBomb({ o: 0, n: 1, x: 5, y: 1, t: 0, p: 1 });             // перша — дальністю 1: монстра не зачепить
  let inFire = 0;
  for (let t = 50; t <= 6000; t += 50) {
    hostStep(R, t, 0.05, { ...noop, bomb(b) { if (B.fireUntil[B.idx(b.x, b.y)] > t) inFire++; } });
  }
  assert.equal(inFire, 0);
  assert.ok(bot.a);
}));

test('«Один проти одного», «Легко»: крок навмання не веде у вогонь своєї бомби (у кишеню, яку вона закриває)', () => withRandom(0.05, () => {
  const R = botRound(0, 3, 1), B = R.board, bot = R.sl[1];
  B.cell[B.idx(4, 1)] = BLOCK;                                   // з (3, 1): униз — кишеня (3, 2) (знизу блок), ліворуч — вихід
  B.cell[B.idx(3, 3)] = BLOCK;
  B.addBomb({ o: 1, n: 1, x: 3, y: 1, t: 0, p: 1 });             // своя: вогонь (2, 1), (3, 2)
  for (let t = 50; t <= FUSE_MS + 600; t += 50) {
    hostStep(R, t, 0.05, noop);
    assert.notDeepEqual([Math.round(bot.x), Math.round(bot.y)], [3, 2], `${t}`);
  }
  assert.ok(bot.a);
}));

test('«Команда»: на своїй бомбі з детонатором бот ховається не довше, ніж горів би запал, — потім виходить і підриває', () => withRandom(0.5, () => {
  const R = newRound({ r: 1, seed: 5, m: MODE_COOP, s: 0, d: 1, t0: 0, sl: people(0, 1) });
  const B = R.board = new Board(emptyMap(), 0), bot = R.sl[0];
  for (const [x, y] of [[1, 2], [3, 2], [5, 2], [7, 2], [9, 2], [10, 1]]) B.cell[B.idx(x, y)] = BLOCK;
  R.mons = [{ i: 1, k: 0, x: 1, y: 1, d: 0, a: true }, { i: 2, k: 0, x: 9, y: 1, d: 0, a: true }];
  Object.assign(bot, { x: 5, y: 1, fp: 1, rc: true });
  let placed = 0, det = 0;
  for (let t = 50; t <= 12000 && !det; t += 50) hostStep(R, t, 0.05, { ...noop, bomb(b) { placed = placed || t; }, det() { det = t; } });
  assert.ok(placed > 0, 'не сховався');
  assert.ok(det > 0 || !bot.a, 'стоїть на ній вічно');
}));
