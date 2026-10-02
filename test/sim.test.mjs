import test from 'node:test';
import assert from 'node:assert/strict';
import {
  makeMap, Board, moveActor, spiral, suddenDeath, canPlace, mulberry32,
  EMPTY, PILLAR, BLOCK, WALL, FUSE_MS, FLAME_MS, REMOTE_ESCAPE, SIZES,
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
      for (const [sx, sy] of m.spawns) assert.ok(Math.abs(sx - mo.x) + Math.abs(sy - mo.y) >= (mo.k === 2 ? 8 : 5));
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

test('небезпека: клітинка, що горить зараз, — з часом наступного вибуху в ній', () => {
  const m = emptyMap();
  const b = new Board(m, 0);
  b.addBomb({ o: 0, n: 1, x: 3, y: 1, t: 0, p: 2 });
  b.addBomb({ o: 1, n: 1, x: 6, y: 1, t: 1500, p: 2 });   // поза вогнем першої — не ланцюжок
  b.advance(FUSE_MS + 100);                          // перша вибухнула, (4, 1) горить
  assert.ok(b.fireAt(at(m, 4, 1)));
  const d = b.danger();
  assert.equal(d[at(m, 4, 1)], 1500 + FUSE_MS);      // друга зачепить її знову
  assert.equal(d[at(m, 2, 1)], Infinity);            // горить, але більше не зачепить
});

test('небезпека: дві бомби зачеплять клітинку в різний час — перший вибух і останній (d.last)', () => {
  const m = emptyMap();
  const b = new Board(m, 0);
  b.addBomb({ o: 0, n: 1, x: 1, y: 1, t: 0, p: 2 });
  b.addBomb({ o: 1, n: 1, x: 5, y: 1, t: 500, p: 2 });    // не ланцюжок: вогні лише сходяться в (3, 1)
  b.advance(600);
  const d = b.danger();
  assert.equal(d[at(m, 3, 1)], FUSE_MS);
  assert.equal(d.last[at(m, 3, 1)], 500 + FUSE_MS);
  assert.equal(d.last[at(m, 2, 1)], FUSE_MS);
  assert.equal(d.last[at(m, 9, 1)], -Infinity);
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

test('детермінізм: багато подій у випадковому порядку надходження — те саме поле, що й за порядком часу', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const rnd = mulberry32(seed * 7919);
    const m = makeMap(seed, seed % 3);
    const evs = [];
    for (let k = 0; k < 60; k++) {
      const x = 1 + Math.floor(rnd() * m.w), y = 1 + Math.floor(rnd() * m.h);
      if (m.cell[at(m, x, y)] !== EMPTY) continue;
      evs.push({ kind: 'b', e: { o: k % 4, n: k + 1, x, y, t: Math.floor(rnd() * 40000), p: 1 + Math.floor(rnd() * 4) } });
    }
    for (let k = 0; k < 20; k++) {
      const x = 1 + Math.floor(rnd() * m.w), y = 1 + Math.floor(rnd() * m.h);
      evs.push({ kind: 'p', e: { o: k % 4, x, y, t: Math.floor(rnd() * 40000) } });
    }
    for (let k = 0; k < 15; k++) {                                // детонатор
      const b = evs[Math.floor(rnd() * 20)].e;
      b.rc = true;
      evs.push({ kind: 'd', e: { o: b.o, n: b.n, b: b.t, t: b.t + Math.floor(rnd() * 3000) } });
    }
    const add = (bd, ev) => ev.kind === 'b' ? bd.addBomb(ev.e) : ev.kind === 'p' ? bd.addPick(ev.e) : bd.addDet(ev.e);
    const ref = new Board(m, 0);
    for (const ev of [...evs].sort((a, b) => a.e.t - b.e.t)) { ref.advance(ev.e.t - 1); add(ref, ev); }
    ref.advance(60000);
    const all = new Board(m, 0);                                  // усе одразу — перерахунок з початку
    for (const ev of evs) add(all, ev);
    all.advance(60000);
    const late = new Board(m, 0);                                 // події приходять у випадковому порядку, поле тим часом іде
    const order = [...evs].sort(() => rnd() - 0.5);
    let T = 0;
    for (const ev of order) { T += 700; late.advance(T); add(late, ev); }
    late.advance(60000);
    assert.deepEqual(all.snapshot(), ref.snapshot(), `seed ${seed}: усе одразу`);
    assert.deepEqual(late.snapshot(), ref.snapshot(), `seed ${seed}: із запізненням`);
  }
});

test('бомби з тим самим номером, але різним часом — різні бомби; dropEvents прибирає й перераховує', () => {
  const m = emptyMap();
  const b = new Board(m, 0);
  assert.ok(b.addBomb({ o: 2, n: 1, x: 1, y: 1, t: 100, p: 1 }));
  assert.ok(b.addBomb({ o: 2, n: 1, x: 5, y: 5, t: 300, p: 1 }));   // інший хост, той самий номер
  assert.ok(!b.addBomb({ o: 2, n: 1, x: 5, y: 5, t: 300, p: 1 }));
  assert.equal(b.maxN[2], 1);
  b.advance(400);
  assert.equal(b.active.size, 2);
  b.dropEvents((e) => e.t !== 300, () => true);
  b.advance(500);
  assert.equal(b.active.size, 1);
  assert.equal(b.digest(1000).n, 1);
});

test('детонатор: бомба не вибухає сама, лише від підриву (зокрема майбутнього) чи чужого вогню', () => {
  const m = emptyMap();
  const b = new Board(m, 0);
  b.addBomb({ o: 0, n: 1, x: 3, y: 1, t: 0, p: 2, rc: true });
  b.addBomb({ o: 0, n: 2, x: 7, y: 1, t: 100, p: 1, rc: true });
  b.addBomb({ o: 0, n: 3, x: 1, y: 9, t: 100, p: 1, rc: true });
  b.advance(10000);
  assert.equal(b.active.size, 3);
  assert.deepEqual(b.remoteOf(0).map(a => a.b.n), [1, 2, 3]);
  b.addDet({ o: 0, n: 2, b: 100, t: 10000 });
  b.advance(10000);
  assert.ok(b.fireAt(at(m, 7, 1)) && b.fireAt(at(m, 6, 1)) && !b.fireAt(at(m, 4, 1)));
  b.addBomb({ o: 1, n: 1, x: 3, y: 3, t: 11000, p: 2 });        // звичайна підірве бомбу з детонатором
  b.advance(11000 + FUSE_MS);
  assert.ok(!b.bombAt(at(m, 3, 1)) && b.fireAt(at(m, 5, 1)));
  b.addDet({ o: 0, n: 3, b: 100, t: 20000 });                   // загинув — вибухне за запал від смерті
  b.advance(19999);
  assert.ok(b.bombAt(at(m, 1, 9)));
  b.advance(20000);
  assert.ok(!b.bombAt(at(m, 1, 9)));
  assert.equal(b.digest(30000).n, 6);
  const late = new Board(m, 0);                                 // підрив, що прийшов пізно, — перерахунок
  late.addBomb({ o: 0, n: 1, x: 3, y: 1, t: 0, p: 2, rc: true });
  late.advance(5000);
  late.addDet({ o: 0, n: 1, b: 0, t: 4000 });
  late.advance(5000);
  assert.ok(!late.bombAt(at(m, 3, 1)) && late.cell[at(m, 3, 1)] === EMPTY);
});

test('небезпека й детонатор: для ботів — будь-якої миті (з часом, щоб вибратися), для монстрів — ні', () => {
  const m = emptyMap();
  const b = new Board(m, 0);
  b.addBomb({ o: 0, n: 1, x: 3, y: 1, t: 0, p: 2, rc: true });
  b.advance(500);
  let d = b.danger();
  assert.equal(d[at(m, 4, 1)], FUSE_MS);                         // поки не минув би запал — як звичайна
  assert.equal(d.last[at(m, 4, 1)], Infinity);                  // «після вогню» не пройти
  assert.ok(d.any[at(m, 4, 1)] && d.any[at(m, 3, 1)] && !d.any[at(m, 6, 1)]);
  b.advance(6000);
  d = b.danger();
  assert.equal(d[at(m, 4, 1)], 6000 + REMOTE_ESCAPE);
  assert.equal(b.danger(undefined, null, false)[at(m, 4, 1)], Infinity);
  b.addDet({ o: 0, n: 1, b: 0, t: 7000 });
  assert.equal(b.danger(undefined, null, false)[at(m, 4, 1)], 7000);
  assert.equal(b.active.size, 1);
});

test('знімок для глядача: бомба з детонатором', () => {
  const m = emptyMap();
  const host = new Board(m, 0);
  host.addBomb({ o: 0, n: 1, x: 1, y: 1, t: 0, p: 2 });
  host.addBomb({ o: 1, n: 1, x: 1, y: 5, t: 0, p: 1, rc: true });
  host.advance(1000);
  const late = new Board(m, 0);
  assert.ok(late.setBase(host.snapshot(), host.activeList(), host.T));
  const e = { o: 1, n: 1, b: 0, t: 5000 };
  host.addDet(e); late.addDet(e);
  for (const T of [1500, 2600, 5000, 6000]) {
    host.advance(T); late.advance(T);
    assert.deepEqual([...late.active.keys()], [...host.active.keys()], `T ${T}`);
    assert.deepEqual(late.snapshot(), host.snapshot(), `T ${T}`);
  }
  assert.equal(late.fireUntil[at(m, 1, 6)], host.fireUntil[at(m, 1, 6)]);
});
