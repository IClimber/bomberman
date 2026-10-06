import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseDrum, freq, compile } from '../js/music.js';
import { TUNES } from '../js/tunes.js';

test('музика: ноти й розбір доріжки', () => {
  assert.equal(freq('A4'), 440);
  assert.ok(Math.abs(freq('C4') - 261.63) < 0.01);
  assert.equal(freq('F#4'), freq('Gb4'));
  assert.throws(() => freq('H4'));
  const { ev, L } = parse('C5 - . E5+G5_4 | - . A4', 2);
  assert.equal(L, 16);
  assert.deepEqual(ev.map(e => [e.s, e.l, e.f.length]), [[0, 4, 1], [6, 6, 2], [14, 2, 1]]);
  assert.equal(parse('. - C4').ev[0].s, 2);                         // '-' після паузи — теж пауза
  assert.deepEqual(parseDrum('x.X o|'), [1, 0, 1.35, 0.5]);
});

test('музика: кожна мелодія розбирається, доріжки — цілі такти й укладаються в цикл', () => {
  for (const t of TUNES) {
    if (!t) continue;
    const c = compile(t), max = Math.max(...c.tracks.map(tr => tr.L));
    for (const tr of c.tracks) {
      assert.equal(tr.L % t.bar, 0, `${t.name}: доріжка ${tr.i || tr.d} — ${tr.L} кроків, не цілі такти`);
      assert.equal(max % tr.L, 0, `${t.name}: доріжка ${tr.i || tr.d} не вкладається в цикл ${max}`);
      if (!tr.d) assert.ok(tr.w, `${t.name}: невідомий інструмент ${tr.i}`);
    }
  }
});
