import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, parseDrum, freq, compile, INSTRUMENTS, DRUMS } from '../js/music.js';
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

test('музика: мелодія на кожен стиль, у тому ж порядку; кожен такт — рівно `bar` кроків; інструменти й ударні відомі', async () => {
  const files = ['classic', 'cyber', 'retro', 'winter', 'space', 'halloween', 'hawaii', 'notebook', 'village', 'egypt', 'west', 'candy', 'ocean'];
  const names = await Promise.all(files.map(async f => (await import(`../js/skins/${f}.js`)).default.name));
  assert.deepEqual(TUNES.map(t => t.name), names);
  for (const t of TUNES)
    for (const tr of t.tracks) {
      const what = `${t.name}: ${tr.i || tr.d}`;
      if (tr.d) {
        assert.ok(DRUMS.includes(tr.d), what);
        for (const bar of tr.p.split('|')) assert.equal(parseDrum(bar).length, t.bar, what);
      } else {
        assert.ok(INSTRUMENTS.includes(tr.i), what);
        tr.n.split('|').forEach((bar, k) => assert.equal(parse(bar, tr.len).L, t.bar, `${what}, такт ${k + 1}`));
      }
    }
});
