// retro.js — «Ретро 8-біт»: усе — піксель-арт 16×16, як на NES: зелене поле, бетонні стовпи, червона цегла,
// бомбермен кольору гравця, кулька, синій злюка, привид. Спрайти кешуються під розмір клітинки.
import { IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, IT_REMOTE } from '../sim.js';
import { makeCanvas, pix, rnd, shade, ellipse, bombBeat, bombFlash } from './common.js';

const N = 16;
const FLOOR = '#2f8a32', FLOOR_SH = '#1d6420';

// Спрайти під розмір клітинки: ключ → canvas s×s
const cache = new Map();
let cacheS = 0;
function spr(key, s, draw) {
  if (s !== cacheS) { cache.clear(); cacheS = s; }
  let c = cache.get(key);
  if (!c) { c = makeCanvas(s, s); draw(c.getContext('2d')); cache.set(key, c); }
  return c;
}
const gen = (fn) => Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => fn(c, r)).join(''));

// Тло — піксельна ніч, як на NES: зорі, хмари, пагорби й кущі, труба, цегляна земля
function backdrop(g, W, H, dpr) {
  const u = Math.max(2, Math.round(H / 200));                      // «піксель» тла
  const px = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x / u) * u, Math.round(y / u) * u, w * u, h * u); };
  for (let j = 0; j < 140; j++) px(rnd(j, 1) * W, rnd(j, 2) * H * 0.75, 1, 1, rnd(j, 3) < 0.25 ? '#3cbcfc' : rnd(j, 3) < 0.4 ? '#fcd800' : '#a4a4a4');
  const ground = Math.floor(H / u) * u - 8 * u;
  const hill = (cx, r, h) => {                                     // ступінчастий пагорб з очима
    for (let j = 0; j <= h; j++) {
      const w = Math.round(r * Math.sqrt(Math.max(0, 1 - (j / (h + 1)) ** 2)));
      px(cx * W - (w + 1) * u, ground - j * u, 2 * w + 2, 1, '#005800');
      if (j < h) px(cx * W - w * u, ground - j * u, 2 * w, 1, '#00a800');
    }
    px(cx * W - 3 * u, ground - h * 0.6 * u, 1, 3, '#005800'); px(cx * W + 2 * u, ground - h * 0.6 * u, 1, 3, '#005800');
  };
  const puff = (x, y, n, fill, edge) => {                          // хмара чи кущ — кілька горбиків
    for (let k = 0; k < n; k++) {
      const cx = x + k * 7 * u;
      for (let j = 0; j < 5; j++) {
        const w = [4, 4, 4, 3, 2][j];
        px(cx - (w + 1) * u, y - j * u, 2 * w + 2, 1, edge);
        px(cx - w * u, y - j * u, 2 * w, 1, fill);
      }
    }
    px(x - 5 * u, y, (n - 1) * 7 + 10, 2, fill);
  };
  hill(0.06, 22, 18); hill(0.16, 13, 10); hill(0.95, 26, 22);
  puff(0.02 * W, ground, 3, '#58d854', '#00a800'); puff(0.9 * W, ground, 2, '#58d854', '#00a800');
  puff(0.04 * W, H * 0.18, 3, '#fcfcfc', '#3cbcfc'); puff(0.88 * W, H * 0.12, 2, '#fcfcfc', '#3cbcfc'); puff(0.9 * W, H * 0.4, 1, '#fcfcfc', '#3cbcfc');
  const tx = Math.round(0.86 * W / u) * u;                        // труба
  px(tx - 6 * u, ground - 14 * u, 14, 14, '#00a800'); px(tx - 7 * u, ground - 18 * u, 16, 5, '#00a800');
  px(tx - 4 * u, ground - 14 * u, 2, 14, '#b8f818'); px(tx - 5 * u, ground - 18 * u, 2, 5, '#b8f818');
  px(tx + 5 * u, ground - 14 * u, 2, 14, '#005800'); px(tx + 6 * u, ground - 18 * u, 2, 5, '#005800');
  const cols = Math.ceil(W / u) + 1;
  for (let r = 0; r < 2; r++) {                                    // цегла
    const y = ground + u + r * 4 * u;
    px(0, y, cols, 4, '#c84c0c'); px(0, y, cols, 1, '#fc9838'); px(0, y + 3 * u, cols, 1, '#3c1000');
    for (let x = (r % 2) * 4 * u; x < W; x += 8 * u) px(x, y, 1, 4, '#3c1000');
  }
}

function floor(g, px, py, s, x, y, map) {
  g.fillStyle = FLOOR;
  g.fillRect(px, py, s, s);
  const i = y * map.GW + x, u = (k) => Math.round(s * k / N);
  g.fillStyle = FLOOR_SH;
  if (map.cell[i - map.GW] === 1) g.fillRect(px, py, s, u(3));
  if (map.cell[i - 1] === 1) g.fillRect(px, py, u(2), s);
}

// Бетонний блок: світлий верх-ліво, темний низ-право, утоплена середина
const STONE = gen((c, r) => {
  if (r === N - 1 || c === N - 1) return 'D';
  if (r === 0 || c === 0) return 'W';
  const inner = c >= 3 && c <= 12 && r >= 3 && r <= 12;
  if (!inner) return 'L';
  if (r === 3 || c === 3) return 'D';
  if (r === 12 || c === 12) return 'W';
  return 'L';
});
function stone(g, x, y, s, border) {
  pix(g, x, y, s, STONE, border ? { W: '#d8d8d8', L: '#8c8c8c', D: '#3c3c3c' } : { W: '#fcfcfc', L: '#b4b4b4', D: '#5c5c5c' });
}

// Цегла: ряди по 4 пікселі, шви зі зсувом через ряд
const BRICK = gen((c, r) => {
  if (r % 4 === 3) return 'K';
  if ((c + (Math.floor(r / 4) % 2) * 4) % 8 === 7) return 'K';
  return r % 4 === 0 ? 'H' : 'F';
});
function block(g, s) { pix(g, 0, 0, s, BRICK, { K: '#3c1000', H: '#fc9838', F: '#c84c0c' }); }

const WALL = gen((c, r) => {
  if (r === 0 || c === 0 || r === N - 1 || c === N - 1) return 'K';
  if ((c === 3 || c === 12) && (r === 3 || r === 12)) return 'W';
  if (r === 1 || c === 1) return 'B';
  return (c + r) % 4 === 0 ? 'b' : 'N';
});
function wall(g, s) { pix(g, 0, 0, s, WALL, { K: '#000000', W: '#fcfcfc', B: '#6888fc', N: '#2038a8', b: '#183088' }); }

// Бонуси: рамка-панель і піктограма 10×10
const ICON = {
  [IT_BOMB]: ['bg', '#3cbcfc', [
    '......YW..',
    '.....F..Y.',
    '....F.....',
    '..KKKK....',
    '.KWKKKK...',
    'KWKKKKKK..',
    'KKKKKKKK..',
    'KKKKKKKK..',
    '.KKKKKK...',
    '..KKKK....',
  ]],
  [IT_FIRE]: ['bg', '#0058f8', [
    '....R.....',
    '...RR..R..',
    '...RRR.RR.',
    '..RRYRRRR.',
    '.RRYYYRRR.',
    '.RYYWYYRR.',
    '.RYWWWYRR.',
    '.RYWWWYR..',
    '..RYYYR...',
    '...RRR....',
  ]],
  [IT_SPEED]: ['bg', '#00a800', [
    '..KKKK....',
    '..KWWK....',
    '..KWGK....',
    '..KWWK....',
    '..KWGKKK..',
    '..KWWWWWKK',
    '..KRRRRRRK',
    '..KKKKKKKK',
    '..KWK..KWK',
    '...K....K.',
  ]],
  [IT_PASS]: ['bg', '#6844fc', [
    '...WWWW...',
    '..WWWWWW..',
    '.WWWWWWWW.',
    '.WKKWWKKW.',
    '.WKKWWKKW.',
    '.WWWWWWWW.',
    '.WWWWWWWW.',
    '.WWWWWWWW.',
    '.WW.WW.WW.',
    '.W...W..W.',
  ]],
  [IT_REMOTE]: ['bg', '#f8b800', [
    '.......Y..',
    '......K...',
    '......K...',
    '..KKKKKK..',
    '..KGGGGK..',
    '..KGRRGK..',
    '..KGRRGK..',
    '..KGGGGK..',
    '..KGWWGK..',
    '..KKKKKK..',
  ]],
  [IT_RESIST]: ['bg', '#d82800', [
    'KKKKKKKKKK',
    'KYYYYYYYWK',
    'KYYYYYYWWK',
    'KYYYYYYYWK',
    'KYYYYYYYYK',
    '.KYYYYYYK.',
    '.KYYYYYYK.',
    '..KYYYYK..',
    '...KYYK...',
    '....KK....',
  ]],
};
const ICON_PAL = { K: '#000000', W: '#fcfcfc', Y: '#fcd800', F: '#a87c50', R: '#e40058', G: '#9c9c9c' };
function item(g, k, s) {
  const [, bg, icon] = ICON[k];
  const u = (v) => Math.round(s * v / N);
  g.fillStyle = '#000'; g.fillRect(u(1), u(1), u(15) - u(1), u(15) - u(1));
  g.fillStyle = '#fcfcfc'; g.fillRect(u(1), u(1), u(14) - u(1), u(14) - u(1));
  g.fillStyle = bg; g.fillRect(u(2), u(2), u(14) - u(2), u(14) - u(2));
  pix(g, u(3), u(3), u(13) - u(3), icon, k === IT_FIRE ? { ...ICON_PAL, R: '#f83800' } : ICON_PAL);
}

// Бомба: чорна з бліком; ґніт іскрить двома кадрами; перед вибухом червоніє
const BOMB = [
  '..........Y.W...',
  '.........F.Y....',
  '........F.......',
  '.......F........',
  '.....OOOOO......',
  '...OOKKKKKOO....',
  '..OKKWWKKKKKO...',
  '..OKWWKKKKKKO...',
  '.OKKWKKKKKKKKO..',
  '.OKKKKKKKKKKKO..',
  '.OKKKKKKKKKKKO..',
  '.OKKKKKKKKKKKO..',
  '..OKKKKKKKKKO...',
  '..OKKKKKKKKKO...',
  '...OOKKKKKOO....',
  '.....OOOOO......',
];
function bomb(g, x, y, s, k, T) {
  const f = Math.floor(T / 90) % 2, red = bombFlash(k, T);
  const c = spr(`b${f}${red ? 'r' : ''}`, s, (q) => pix(q, 0, 0, s, BOMB, {
    O: '#000000', K: red ? '#c81800' : '#202020', W: '#fcfcfc', F: '#a87c50', Y: f ? '#fcd800' : '#fc7400',
  }));
  const z = 1 + bombBeat(k, T) * 1.4, d = s * z;
  ellipse(g, x + s / 2, y + s * 0.9, s * 0.3, s * 0.07, 'rgba(0,0,0,0.3)');
  g.imageSmoothingEnabled = false;
  g.drawImage(c, x + (s - d) / 2, y + s - d, d, d);
  g.imageSmoothingEnabled = true;
}

// Гравець: шолом кольору гравця, рожеве обличчя, рожеві рукавиці й антена; спереду, ззаду, збоку; два кадри ходи
const HEAD = {
  front: [
    '.......PP.......',
    '.......PP.......',
    '........O.......',
    '.....OOOOOO.....',
    '....OHHHHHHO....',
    '...OHHHHHHHHO...',
    '...OHFFFFFFHO...',
    '...OHFEFFEFHO...',
    '...OHFEFFEFHO...',
    '...OhFFFFFFhO...',
    '....OhhhhhhO....',
  ],
  dead: [
    '.......PP.......',
    '.......PP.......',
    '........O.......',
    '.....OOOOOO.....',
    '....OHHHHHHO....',
    '...OHHHHHHHHO...',
    '...OHFFFFFFHO...',
    '...OHFFFFFFHO...',
    '...OHEEFFEEHO...',
    '...OhFFFFFFhO...',
    '....OhhhhhhO....',
  ],
  back: [
    '.......PP.......',
    '.......PP.......',
    '........O.......',
    '.....OOOOOO.....',
    '....OHHHHHHO....',
    '...OHHHHHHHHO...',
    '...OHHHHHHHHO...',
    '...OHHHHHHHHO...',
    '...OHHHHHHHHO...',
    '...OhHHHHHHhO...',
    '....OhhhhhhO....',
  ],
  side: [
    '......PP........',
    '......PP........',
    '.......O........',
    '.....OOOOOO.....',
    '....OHHHHHHO....',
    '...OHHHHHHHHO...',
    '...OHHHFFFFFO...',
    '...OHHHFFFEFO...',
    '...OHHHFFFEFO...',
    '...OhhHFFFFFO...',
    '....OhhhhhhO....',
  ],
};
const BODY = {
  front: [
    ['...PObbbbbbOP...', '...PObKKKKbOP...', '....ObbbbbbO....', '....SSS..SSS....', '....SSS..SSS....'],
    ['...PObbbbbbOP...', '...PObKKKKbOP...', '....ObbbbbbO....', '....SSS..SSS....', '.........SSS....'],
    ['...PObbbbbbOP...', '...PObKKKKbOP...', '....ObbbbbbO....', '....SSS..SSS....', '....SSS.........'],
  ],
  side: [
    ['....ObbbbbbOP...', '....ObKKKKbOP...', '....ObbbbbbO....', '.....SSS.SSS....', '.....SSS.SSS....'],
    ['...PObbbbbbO....', '...PObKKKKbO....', '....ObbbbbbO....', '....SSS...SSS...', '....SSS...SSS...'],
    ['....ObbbbbbOP...', '....ObKKKKbOP...', '....ObbbbbbO....', '......SSSSS.....', '......SSSSS.....'],
  ],
};
function player(g, p, s, T, { col, walk, dead }) {
  const view = dead ? 'dead' : p.dr === 1 ? 'back' : p.dr === 2 || p.dr === 4 ? 'side' : 'front';
  const fr = walk ? (walk > 0 ? 1 : 2) : 0, flip = p.dr === 4;
  const c = spr(`p${col}${view}${fr}${flip ? 'f' : ''}`, s, (q) => pix(q, 0, 0, s, [...HEAD[view], ...BODY[view === 'side' ? 'side' : 'front'][fr]], {
    O: '#000000', H: col, h: shade(col, -0.35), F: '#fcbcb0', E: '#000000', P: '#fc74b4',
    b: shade(col, -0.2), K: '#000000', S: '#a81000',
  }, flip));
  g.imageSmoothingEnabled = false;
  g.drawImage(c, -s / 2, -s / 2 - Math.round(Math.abs(walk) * s / N));
  g.imageSmoothingEnabled = true;
}

// Монстри: 0 — помаранчева кулька, 1 — синій злюка, 2 — привид (два кадри «хвоста»)
const MON = [
  [
    '................',
    '.....OOOOOO.....',
    '....OAAAAAAO....',
    '...OAAWAAAAAO...',
    '..OAAWWAAAAAAO..',
    '..OAAAAAAAAAAO..',
    '..OAAWWAAWWAAO..',
    '..OAAWKAAWKAAO..',
    '..OAAWKAAWKAAO..',
    '..OAAAAAAAAAAO..',
    '..OAAAAAAAAAAO..',
    '...OAAKKKKAAO...',
    '....OAAAAAAO....',
    '.....OOAAOO.....',
    '......OAAO......',
    '.......OO.......',
  ],
  [
    '................',
    '.......OO.......',
    '......OBBO......',
    '.....OBBBBO.....',
    '....OBBBBBBO....',
    '...OBBBBBBBBO...',
    '..OBKKBBBBKKBO..',
    '..OBBWKBBKWBBO..',
    '..OBBWKBBKWBBO..',
    '..OBBBBBBBBBBO..',
    '..OBBKKKKKKBBO..',
    '..OBBKWKWKWBBO..',
    '...OBBBBBBBBO...',
    '....OOBBBBOO....',
    '...OBO.OO.OBO...',
    '...OO......OO...',
  ],
  [
    '................',
    '.....OOOOOO.....',
    '....OGGGGGGO....',
    '...OGGGGGGGGO...',
    '..OGGGGGGGGGGO..',
    '..OGGKKGGKKGGO..',
    '..OGGKKGGKKGGO..',
    '..OGGGGGGGGGGO..',
    '..OGGGGGGGGGGO..',
    '..OGGGGKKGGGGO..',
    '..OGGGGGGGGGGO..',
    '..OGGGGGGGGGGO..',
    '..OGGGGGGGGGGO..',
    '..OGGOGGGGOGGO..',
    '..OGO.OGGO.OGO..',
    '..OO...OO...OO..',
  ],
];
const GHOST_TAIL = ['..OGGGOGGOGGGO..', '..OGGO.OO.OGGO..', '...OO......OO...'];
const MON_PAL = { O: '#000000', A: '#fc7400', W: '#fcfcfc', K: '#000000', B: '#3c78f8', G: '#e8f0fc' };
function monster(g, m, s, T) {
  const fr = Math.floor(T / 220 + m.i) % 2, flip = m.d === 4;
  const rows = m.k === 2 && fr ? [...MON[2].slice(0, 13), ...GHOST_TAIL] : MON[m.k];
  const c = spr(`m${m.k}${m.k === 2 ? fr : 0}${flip ? 'f' : ''}`, s, (q) => pix(q, 0, 0, s, rows, MON_PAL, flip));
  const hop = m.k === 0 ? Math.round(Math.abs(Math.sin(T / 160 + m.i)) * 2) * s / N : 0;
  g.imageSmoothingEnabled = false;
  g.drawImage(c, -s / 2, -s / 2 - hop);
  g.imageSmoothingEnabled = true;
}

export default {
  name: 'Ретро 8-біт',
  bg: '#000000',
  backdrop,
  emoji: { bomb: '💣', fire: '🔥', speed: '🛼', pass: '👻', resist: '🛡', remote: '🕹️' },
  fire: ['#f83800', '#fca044', '#fcfcfc'],
  burn: ['#f83800', 'rgba(252,160,68,0)'],
  pixel: true,
  floor, stone, block, wall, item, bomb, player, monster,
};
