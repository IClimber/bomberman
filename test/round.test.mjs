import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newRound, hostStep, outcome, checkEnd, kill, applyItem, deadlyAt,
  MODE_VS, MODE_COOP, RES_WIN, RES_DRAW, RES_NOBODY, RES_TEAM_WIN, RES_TEAM_LOSS, END_GRACE_MS,
} from '../js/round.js';
import { IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, RESIST_MS, MAX_BOMBS, BLOCK } from '../js/sim.js';

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
