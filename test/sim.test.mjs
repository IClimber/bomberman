import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeMap, Board, moveActor, spiral, suddenDeath, canPlace,
  EMPTY, PILLAR, BLOCK, WALL, FUSE_MS, FLAME_MS, SIZES,
} from '../js/sim.js';

// Порожня карта 13×11 (лише рамка і стовпи) — щоб вибухи було легко передбачити
function emptyMap(sizeIdx = 0) {
  const m = makeMap(1, sizeIdx);
  for (let i = 0; i < m.cell.length; i++) if (m.cell[i] === BLOCK) { m.cell[i] = EMPTY; m.item[i] = 0; }
  return m;
}
const at = (m, x, y) => y * m.GW + x;

test('карта: однакова від зерна, рамка і стовпи, кути вільні, бонуси під блоками', () => {
  const a = makeMap(42, 0), b = makeMap(42, 0), c = makeMap(43, 0);
  assert.deepEqual(a.cell, b.cell);
  assert.deepEqual(a.item, b.item);
  assert.notDeepEqual(a.cell, c.cell);
  assert.equal(a.GW, 15); assert.equal(a.GH, 13);
  for (let x = 0; x < a.GW; x++) { assert.equal(a.cell[at(a, x, 0)], PILLAR); assert.equal(a.cell[at(a, x, a.GH - 1)], PILLAR); }
  assert.equal(a.cell[at(a, 2, 2)], PILLAR);
  assert.equal(a.cell[at(a, 3, 2)] === PILLAR, false);
  for (const [x, y] of a.spawns) {
    assert.equal(a.cell[at(a, x, y)], EMPTY);
    assert.equal(a.cell[at(a, x + (x === 1 ? 1 : -1), y)], EMPTY);
    assert.equal(a.cell[at(a, x, y + (y === 1 ? 1 : -1))], EMPTY);
  }
  let items = 0;
  for (let i = 0; i < a.cell.length; i++) if (a.item[i]) { items++; assert.equal(a.cell[i], BLOCK); }
  assert.ok(items >= 5);
  for (let s = 0; s < SIZES.length; s++) {
    const m = makeMap(7, s);
    assert.equal(m.w % 2, 1); assert.equal(m.h % 2, 1);
  }
});

test('карта «Команди»: монстри далеко від старту, звичайні — не в блоці', () => {
  for (let d = 0; d < 3; d++) {
    const m = makeMap(99, 0, true, d);
    assert.ok(m.mons.length >= 1);
    for (const mo of m.mons) {
      for (const [sx, sy] of m.spawns) assert.ok(Math.abs(sx - mo.x) + Math.abs(sy - mo.y) >= 5);
      const c = m.cell[at(m, mo.x, mo.y)];
      assert.notEqual(c, PILLAR);
      if (mo.k !== 2) assert.equal(c, EMPTY);
    }
  }
  assert.ok(makeMap(5, 0, true, 2).mons.length > makeMap(5, 0, true, 0).mons.length);
  assert.equal(makeMap(5, 0, true, 1).mons.length, 5);
});

test('вибух: хрест на дальність, стовп зупиняє, блок горить і зупиняє, бонус з\'являється після догоряння', () => {
  const m = emptyMap();
  m.cell[at(m, 5, 1)] = BLOCK; m.item[at(m, 5, 1)] = 2;
  const b = new Board(m, 0);
  b.addBomb({ o: 0, n: 1, x: 3, y: 1, t: 100, p: 3 });
  b.advance(100 + FUSE_MS - 1);
  assert.ok(b.bombAt(at(m, 3, 1)));
  b.advance(100 + FUSE_MS);
  assert.equal(b.bombAt(at(m, 3, 1)), null);
  const T = 100 + FUSE_MS;
  assert.ok(b.fireAt(at(m, 3, 1)));
  assert.ok(b.fireAt(at(m, 4, 1)));
  assert.ok(b.fireAt(at(m, 5, 1)));                 // блок горить
  assert.ok(!b.fireAt(at(m, 6, 1)));                // далі — ні
  assert.ok(b.fireAt(at(m, 2, 1)) && b.fireAt(at(m, 1, 1)));
  assert.ok(!b.fireAt(at(m, 3, 0)));                // рамка
  assert.ok(b.fireAt(at(m, 3, 4)) && !b.fireAt(at(m, 3, 5)));   // дальність 3 вниз
  assert.equal(b.cell[at(m, 5, 1)], BLOCK);
  b.advance(T + FLAME_MS);
  assert.equal(b.cell[at(m, 5, 1)], EMPTY);
  assert.equal(b.itemAt(at(m, 5, 1)), 2);
  assert.ok(!b.fireAt(at(m, 4, 1)));
});

test('ланцюжок: вогонь підриває іншу бомбу одразу; бонус згорає', () => {
  const m = emptyMap();
  const b = new Board(m, 0);
  b.addBomb({ o: 0, n: 1, x: 1, y: 1, t: 0, p: 2 });
  b.addBomb({ o: 1, n: 1, x: 3, y: 1, t: 1000, p: 2 });
  b.advance(FUSE_MS);
  assert.equal(b.active.size, 0);
  assert.ok(b.fireAt(at(m, 5, 1)));                 // друга вибухнула разом із першою
  b.advance(FUSE_MS + FLAME_MS + 10);
  // бонус на землі згорає від вогню
  b.shown[at(m, 3, 3)] = 1; b.item[at(m, 3, 3)] = 1;
  b.addBomb({ o: 0, n: 2, x: 3, y: 1, t: 4000, p: 4 });
  b.advance(4000 + FUSE_MS);
  assert.equal(b.itemAt(at(m, 3, 3)), 0);
  assert.ok(b.fireAt(at(m, 3, 3)) && !b.fireAt(at(m, 3, 4)));   // бонус зупиняє вогонь
});

test('пізня бомба: перерахунок дає той самий результат, що й вчасна', () => {
  const m = makeMap(7, 0);
  const evs = [
    { o: 0, n: 1, x: 1, y: 1, t: 0, p: 2 },
    { o: 1, n: 1, x: 1, y: 3, t: 500, p: 3 },
    { o: 2, n: 1, x: 3, y: 3, t: 900, p: 2 },
    { o: 0, n: 2, x: 2, y: 1, t: 2600, p: 2 },
  ];
  const a = new Board(m, 0);
  for (const e of evs) a.addBomb(e);
  a.advance(8000);
  const b = new Board(m, 0);
  b.addBomb(evs[0]); b.addBomb(evs[3]);
  b.advance(3000);
  b.addBomb(evs[1]); b.addBomb(evs[2]);             // прийшли пізно
  b.advance(8000);
  assert.deepEqual(b.cell, a.cell);
  assert.deepEqual(b.shown, a.shown);
  assert.deepEqual(b.snapshot(), a.snapshot());
});

test('дві бомби в одній клітинці: лишається раніша', () => {
  const m = emptyMap();
  const b = new Board(m, 0);
  b.addBomb({ o: 1, n: 1, x: 3, y: 3, t: 200, p: 1 });
  b.addBomb({ o: 0, n: 1, x: 3, y: 3, t: 100, p: 2 });
  b.advance(150);
  assert.equal(b.bombAt(at(m, 3, 3)).o, 0);
  b.advance(300);
  assert.equal(b.bombAt(at(m, 3, 3)).o, 0);
  assert.equal(b.activeOf(1), 0);
  assert.equal(b.active.size, 1);
});

test('бомба у вогонь вибухає одразу', () => {
  const m = emptyMap();
  const b = new Board(m, 0);
  b.addBomb({ o: 0, n: 1, x: 1, y: 1, t: 0, p: 3 });
  b.advance(FUSE_MS + 100);
  b.addBomb({ o: 1, n: 1, x: 3, y: 1, t: FUSE_MS + 200, p: 1 });
  b.advance(FUSE_MS + 200);
  assert.equal(b.active.size, 0);
  assert.ok(b.fireAt(at(m, 4, 1)));
});

test('підбір прибирає бонус; пізній підбір — перерахунок', () => {
  const m = emptyMap();
  const b = new Board(m, 0);
  b.shown = new Uint8Array(m.cell.length);
  b.base.shown[at(m, 5, 5)] = 1; b.base.item = Uint8Array.from(m.item); b.base.item[at(m, 5, 5)] = 3;
  b.reset();
  b.advance(1000);
  assert.equal(b.itemAt(at(m, 5, 5)), 3);
  b.addPick({ o: 2, x: 5, y: 5, t: 500 });
  b.advance(1100);
  assert.equal(b.itemAt(at(m, 5, 5)), 0);
});

test('раптова смерть: спіраль без стовпів, стіни падають за розкладом і чавлять бомби', () => {
  const m = emptyMap();
  const sp = spiral(m);
  assert.equal(sp.length, 13 * 11 - 30);
  assert.equal(new Set(sp).size, sp.length);
  assert.equal(sp[0], at(m, 1, 1));
  assert.equal(sp[1], at(m, 2, 1));
  const sd = suddenDeath(m);
  assert.equal(sd.after, 180000);
  assert.ok(Math.abs(suddenDeath(makeMap(1, 4)).after - 180000 * Math.sqrt(651 / 143)) < 1);
  const b = new Board(m, 1000);
  b.addBomb({ o: 0, n: 1, x: 2, y: 1, t: 1000 + sd.after - 100, p: 1 });
  b.advance(1000 + sd.after);
  assert.equal(b.cell[at(m, 1, 1)], WALL);
  assert.equal(b.cell[at(m, 2, 1)], EMPTY);
  b.advance(1000 + sd.after + sd.step);
  assert.equal(b.cell[at(m, 2, 1)], WALL);
  assert.equal(b.active.size, 0);                    // бомбу розчавило
  b.advance(1000 + sd.after + sd.step * sp.length);
  for (const i of sp) assert.equal(b.cell[i], WALL);
});

test('знімок для глядача: поле з знімка й подальші події дають той самий стан', () => {
  const m = makeMap(11, 1);
  const host = new Board(m, 0);
  host.addBomb({ o: 0, n: 1, x: 1, y: 1, t: 0, p: 2 });
  host.addBomb({ o: 1, n: 1, x: m.w, y: m.h, t: 1500, p: 3 });
  host.advance(3000);
  const snap = host.snapshot(), act = host.activeList();
  const late = new Board(m, 0);
  assert.ok(late.setBase(snap, act, 3000));
  late.advance(3000);
  for (const bd of [host, late]) bd.addBomb({ o: 2, n: 1, x: m.w, y: 1, t: 3500, p: 2 });
  host.advance(9000); late.advance(9000);
  assert.deepEqual(late.snapshot(), host.snapshot());
});

test('небезпека: клітинки під вибухом і ланцюжком, решта безпечні', () => {
  const m = emptyMap();
  const b = new Board(m, 0);
  b.addBomb({ o: 0, n: 1, x: 1, y: 1, t: 0, p: 2 });
  b.addBomb({ o: 0, n: 2, x: 3, y: 1, t: 50, p: 2 });
  b.advance(100);
  const d = b.danger();
  assert.equal(d[at(m, 2, 1)], FUSE_MS);
  assert.equal(d[at(m, 5, 1)], FUSE_MS);             // через ланцюжок
  assert.equal(d[at(m, 3, 3)], FUSE_MS);
  assert.equal(d[at(m, 6, 1)], Infinity);
  assert.equal(b.active.size, 2);                    // саме поле не змінилось
});

test('рух: по коридору, зупинка перед стіною, доворот у прохід, зійти зі своєї бомби', () => {
  const m = emptyMap();
  const b = new Board(m, 0);
  const solid = (x, y) => b.solid(x, y);
  const p = { x: 1, y: 1 };
  moveActor(p, 2, 0.7, solid);
  assert.deepEqual(p, { x: 1.7, y: 1 });
  moveActor(p, 3, 0.2, solid);                        // униз між стовпами не можна: вирівнюємось до x = 1
  // з x = 1.7 найближча колонка — 2 (стовп під нею в ряду 2), доворот у колонку 1, де прохід є
  assert.equal(p.y, 1);
  assert.ok(Math.abs(p.x - 1.5) < 1e-6);
  moveActor(p, 3, 1, solid);
  assert.equal(p.x, 1);
  assert.ok(Math.abs(p.y - 1.5) < 1e-6);
  // уздовж ряду до стовпа: зупиняємось у центрі клітинки
  const q = { x: 2, y: 1 };
  moveActor(q, 1, 3, solid);
  assert.deepEqual(q, { x: 2, y: 1 });
  // бомба під собою не заважає зійти, але назад не пускає
  b.addBomb({ o: 0, n: 1, x: 3, y: 1, t: 0, p: 1 });
  b.advance(1);
  const r = { x: 3, y: 1 };
  moveActor(r, 2, 1, solid);
  assert.deepEqual(r, { x: 4, y: 1 });
  moveActor(r, 4, 1, solid);
  assert.deepEqual(r, { x: 4, y: 1 });
  assert.ok(!canPlace(b, 3, 1) && canPlace(b, 4, 1));
});
