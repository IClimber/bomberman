// cyber.js — «Кіберпанк»: темна підлога з неоновою сіткою й доріжками мікросхем, стовпи з рожевим неоном,
// ящики-голограми й сервери, «файрвол» замість стін; гравці в шоломах з візором, дрони, павуки-боти, глітч-привиди.
import { DX, IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST } from '../sim.js';
import { TAU, rr, bevel, rgba, rnd, luma, shade, circle, ellipse, line, poly, bombShape, bombBeat, bombFlash, pillarShade, pix, ghostPath } from './common.js';

const CY = '#2bf3ff', MG = '#ff2bd6', RED = '#ff2b4a';

function floor(g, px, py, s, x, y, map) {
  g.fillStyle = (x + y) % 2 ? '#141029' : '#110d24';
  g.fillRect(px, py, s, s);
  g.fillStyle = rgba(CY, 0.12);                                    // неонова сітка
  g.fillRect(px, py, s, Math.max(1, s * 0.03));
  g.fillRect(px, py, Math.max(1, s * 0.03), s);
  const r = rnd(y * map.GW + x, 3);
  if (r < 0.34) {                                                  // доріжка мікросхеми, повернута як випаде
    g.save();
    g.translate(px + s / 2, py + s / 2);
    g.rotate(Math.floor(r * 12) * Math.PI / 2);
    const c = r < 0.12 ? MG : CY;
    g.strokeStyle = rgba(c, 0.28); g.lineWidth = Math.max(1, s * 0.035); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-s * 0.5, s * 0.22); g.lineTo(-s * 0.1, s * 0.22); g.lineTo(s * 0.1, 0); g.lineTo(s * 0.1, -s * 0.22); g.stroke();
    circle(g, s * 0.1, -s * 0.22, s * 0.05, rgba(c, 0.45));
    g.restore();
  }
  pillarShade(g, map, x, y, px, py, s, 'rgba(0,0,0,0.4)');
}

function stone(g, x, y, s, border) {
  const d = Math.max(1, Math.round(s * 0.08));
  if (border) {
    bevel(g, x, y, s, '#1b1733', '#2c2650', '#0a0816', d);
    g.fillStyle = rgba(CY, 0.45);
    g.fillRect(x + d, y + s * 0.47, s - 2 * d, Math.max(1, s * 0.05));
    return;
  }
  bevel(g, x, y, s, '#241e40', '#3b3366', '#0f0c1f', d);
  g.shadowColor = MG; g.shadowBlur = s * 0.25;                     // у кеші, тож сяйво можна
  g.strokeStyle = MG; g.lineWidth = Math.max(1, s * 0.05);
  rr(g, x + s * 0.22, y + s * 0.22, s * 0.56, s * 0.56, s * 0.08); g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = rgba(MG, 0.14);
  rr(g, x + s * 0.22, y + s * 0.22, s * 0.56, s * 0.56, s * 0.08); g.fill();
}

// Блоки: 0 — ящик-голограма, 1 — серверна стійка
function block(g, s, v) {
  const d = Math.max(1, Math.round(s * 0.07));
  if (v === 0) {
    bevel(g, 0, 0, s, '#2b2152', '#4a3a85', '#160f2e', d);
    g.shadowColor = CY; g.shadowBlur = s * 0.15;
    g.strokeStyle = CY; g.lineWidth = Math.max(1, s * 0.045);
    g.strokeRect(s * 0.17, s * 0.17, s * 0.66, s * 0.66);
    g.beginPath(); g.moveTo(s * 0.17, s * 0.17); g.lineTo(s * 0.83, s * 0.83); g.moveTo(s * 0.83, s * 0.17); g.lineTo(s * 0.17, s * 0.83); g.stroke();
    g.shadowBlur = 0;
    return;
  }
  bevel(g, 0, 0, s, '#1c2238', '#34406a', '#0b0e1c', d);
  const leds = [CY, '#3dff8a', MG, CY];
  for (let r = 0; r < 4; r++) {
    const yy = s * (0.15 + r * 0.18);
    g.fillStyle = '#080b16'; g.fillRect(s * 0.13, yy, s * 0.74, s * 0.12);
    circle(g, s * 0.22, yy + s * 0.06, s * 0.03, leds[r]);
    circle(g, s * 0.31, yy + s * 0.06, s * 0.03, leds[(r + 2) % 4]);
    g.fillStyle = rgba(CY, 0.4); g.fillRect(s * 0.42, yy + s * 0.045, s * (0.16 + 0.07 * ((r * 3) % 4)), s * 0.03);
  }
}

// Стіна раптової смерті — червоний «файрвол»
function wall(g, s) {
  const d = Math.max(1, Math.round(s * 0.09));
  bevel(g, 0, 0, s, '#3a0b18', '#5c1428', '#1a040b', d);
  g.save();
  g.beginPath(); g.rect(d, d, s - 2 * d, s - 2 * d); g.clip();
  g.shadowColor = RED; g.shadowBlur = s * 0.2;
  g.strokeStyle = RED; g.lineWidth = Math.max(1, s * 0.07);
  for (let k = -1; k <= 2; k++) { g.beginPath(); g.moveTo(k * s * 0.4, s); g.lineTo(k * s * 0.4 + s, 0); g.stroke(); }
  g.restore();
  g.strokeStyle = rgba(RED, 0.8); g.lineWidth = Math.max(1, s * 0.04);
  g.strokeRect(d * 1.5, d * 1.5, s - 3 * d, s - 3 * d);
}

// Бонуси: темна плитка з неоновою рамкою і неоновою піктограмою
const NEON = { [IT_BOMB]: CY, [IT_FIRE]: '#ff8a2b', [IT_SPEED]: '#ffe23d', [IT_PASS]: '#3dff8a', [IT_RESIST]: '#6b9bff' };
const INVADER = [
  '..K.....K..',
  '...K...K...',
  '..KKKKKKK..',
  '.KK.KKK.KK.',
  'KKKKKKKKKKK',
  'K.KKKKKKK.K',
  'K.K.....K.K',
  '...KK.KK...',
];
function item(g, k, s) {
  const c = NEON[k], p = s * 0.1, cx = s / 2, cy = s / 2;
  g.fillStyle = '#0d0a1c';
  rr(g, p, p, s - 2 * p, s - 2 * p, s * 0.12); g.fill();
  g.shadowColor = c; g.shadowBlur = s * 0.18;
  g.strokeStyle = c; g.lineWidth = Math.max(1, s * 0.05);
  rr(g, p, p, s - 2 * p, s - 2 * p, s * 0.12); g.stroke();
  g.lineWidth = Math.max(1, s * 0.06); g.lineJoin = 'round'; g.lineCap = 'round';
  g.fillStyle = rgba(c, 0.18);
  if (k === IT_BOMB) {
    g.beginPath(); g.arc(cx - s * 0.03, cy + s * 0.05, s * 0.19, 0, TAU); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(cx + s * 0.08, cy - s * 0.1); g.quadraticCurveTo(cx + s * 0.15, cy - s * 0.25, cx + s * 0.25, cy - s * 0.22); g.stroke();
    circle(g, cx + s * 0.25, cy - s * 0.22, s * 0.04, '#fff');
  } else if (k === IT_FIRE) {
    const r = s * 0.27;
    g.beginPath();
    g.moveTo(cx, cy - r * 1.1);
    g.bezierCurveTo(cx + r * 0.9, cy - r * 0.2, cx + r * 0.9, cy + r * 0.9, cx, cy + r * 0.9);
    g.bezierCurveTo(cx - r * 0.9, cy + r * 0.9, cx - r * 0.9, cy - r * 0.2, cx, cy - r * 1.1);
    g.fill(); g.stroke();
    g.beginPath(); g.moveTo(cx, cy - r * 0.1); g.quadraticCurveTo(cx + r * 0.4, cy + r * 0.4, cx, cy + r * 0.65);
    g.quadraticCurveTo(cx - r * 0.4, cy + r * 0.4, cx, cy - r * 0.1); g.stroke();
  } else if (k === IT_SPEED) {
    g.beginPath();
    g.moveTo(cx + s * 0.06, cy - s * 0.29); g.lineTo(cx - s * 0.16, cy + s * 0.04); g.lineTo(cx, cy + s * 0.04);
    g.lineTo(cx - s * 0.07, cy + s * 0.29); g.lineTo(cx + s * 0.17, cy - s * 0.06); g.lineTo(cx + s * 0.01, cy - s * 0.06);
    g.closePath(); g.fill(); g.stroke();
  } else if (k === IT_PASS) {
    pix(g, cx - s * 0.3, cy - s * 0.22, s * 0.6, INVADER, { K: c });
  } else if (k === IT_RESIST) {
    g.beginPath();
    g.moveTo(cx, cy - s * 0.27); g.lineTo(cx + s * 0.22, cy - s * 0.17); g.quadraticCurveTo(cx + s * 0.2, cy + s * 0.15, cx, cy + s * 0.28);
    g.quadraticCurveTo(cx - s * 0.2, cy + s * 0.15, cx - s * 0.22, cy - s * 0.17); g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(cx - s * 0.08, cy); g.lineTo(cx - s * 0.01, cy + s * 0.08); g.lineTo(cx + s * 0.1, cy - s * 0.07); g.stroke();
  }
  g.shadowBlur = 0;
}

// Бомба: темна сфера з неоновим кільцем (блакитне → рожеве → червоне) і антеною з вогником
function bomb(g, x, y, s, k, T) {
  const r = s * (0.31 + bombBeat(k, T)), cx = x + s / 2, cy = y + s * 0.56;
  ellipse(g, cx, y + s * 0.87, s * 0.28, s * 0.08, 'rgba(0,0,0,0.35)');
  line(g, cx + r * 0.3, cy - r * 0.8, cx + r * 0.55, cy - r * 1.4, s * 0.04, '#8a8fb0');
  bombShape(g, cx, cy, r, '#6b7399', '#151726', null);
  ellipse(g, cx - r * 0.35, cy - r * 0.45, r * 0.22, r * 0.12, 'rgba(255,255,255,0.35)', -0.6);
  const ring = k > 0.7 ? RED : k > 0.4 ? MG : CY;
  g.strokeStyle = rgba(ring, 0.3); g.lineWidth = s * 0.13;
  g.beginPath(); g.ellipse(cx, cy, r, r * 0.34, 0, 0, TAU); g.stroke();
  g.strokeStyle = ring; g.lineWidth = Math.max(1, s * 0.045);
  g.beginPath(); g.ellipse(cx, cy, r, r * 0.34, 0, 0, TAU); g.stroke();
  const on = Math.floor(T / (240 - 190 * k)) % 2 === 0;
  if (on) circle(g, cx + r * 0.55, cy - r * 1.4, s * 0.1, rgba(ring, 0.35));
  circle(g, cx + r * 0.55, cy - r * 1.4, s * 0.055, on ? ring : '#3a3f55');
  if (bombFlash(k, T)) circle(g, cx, cy, r, 'rgba(255,40,70,0.35)');
}

// Гравець: темний костюм з неоновим поясом, шолом кольору гравця з ірокезом і світним візором
function player(g, p, s, T, { col, walk, bob, dead }) {
  const rim = luma(col) < 0.35 ? '#c8c8ff' : 'rgba(0,0,0,0.45)', lit = luma(col) < 0.35 ? shade(col, 0.45) : col;
  for (const [sx, w] of [[-1, walk], [1, -walk]]) {
    ellipse(g, sx * s * 0.13, s * 0.36 + w * s * 0.05, s * 0.1, s * 0.07, '#1a1a2a');
    g.fillStyle = lit; g.fillRect(sx * s * 0.13 - s * 0.08, s * 0.4 + w * s * 0.05, s * 0.16, Math.max(1, s * 0.025));
  }
  g.fillStyle = '#282640';
  rr(g, -s * 0.2, s * 0.04 - bob, s * 0.4, s * 0.3, s * 0.1); g.fill();
  g.fillStyle = lit;
  g.fillRect(-s * 0.2, s * 0.16 - bob, s * 0.4, Math.max(1, s * 0.045));
  for (const sx of [-1, 1]) {
    const ay = s * 0.16 - bob - sx * walk * s * 0.04;
    circle(g, sx * s * 0.25, ay, s * 0.075, '#282640');
    circle(g, sx * s * 0.25, ay, s * 0.035, lit);
  }
  const hy = -s * 0.14 - bob;
  for (const j of [-1, 0, 1]) {                                     // ірокез
    poly(g, [[j * s * 0.09 - s * 0.05, hy - s * 0.2], [j * s * 0.09 + s * 0.05, hy - s * 0.2], [j * s * 0.11, hy - s * 0.43 + Math.abs(j) * s * 0.05]], shade(lit, -0.3));
  }
  g.strokeStyle = rgba(luma(col) < 0.35 ? '#c8c8ff' : col, 0.3); g.lineWidth = s * 0.08;   // неонове сяйво — широкий напівпрозорий контур
  g.beginPath(); g.arc(0, hy, s * 0.29, 0, TAU); g.stroke();
  circle(g, 0, hy, s * 0.27, col);
  g.strokeStyle = rim; g.lineWidth = Math.max(1, s * 0.025); g.stroke();
  if (p.dr === 1) {                                                 // зі спини — роз'єм
    g.fillStyle = '#1a1a2a'; rr(g, -s * 0.06, hy - s * 0.02, s * 0.12, s * 0.12, s * 0.03); g.fill();
    circle(g, 0, hy + s * 0.04, s * 0.025, CY);
    return;
  }
  const fx = (DX[p.dr] || 0) * s * 0.07, fy = (p.dr === 3 || !p.dr) ? s * 0.02 : 0;
  g.fillStyle = '#0a0a14';
  rr(g, -s * 0.2 + fx, hy - s * 0.08 + fy, s * 0.4, s * 0.15, s * 0.07); g.fill();
  if (dead) {
    for (const ex of [-0.08, 0.08]) {
      const ox = ex * s + fx, oy = hy - s * 0.005 + fy, e = s * 0.035;
      g.strokeStyle = RED; g.lineWidth = Math.max(1, s * 0.03);
      g.beginPath(); g.moveTo(ox - e, oy - e); g.lineTo(ox + e, oy + e); g.moveTo(ox + e, oy - e); g.lineTo(ox - e, oy + e); g.stroke();
    }
    return;
  }
  const grd = g.createLinearGradient(-s * 0.16 + fx, 0, s * 0.16 + fx, 0);
  grd.addColorStop(0, CY); grd.addColorStop(1, MG);
  g.fillStyle = grd;
  rr(g, -s * 0.16 + fx, hy - s * 0.035 + fy, s * 0.32, s * 0.06, s * 0.03); g.fill();
}

// Монстри: 0 — дрон охорони з червоним оком, 1 — павук-бот, 2 — глітч-голограма
function monster(g, m, s, T, wob) {
  const ex = (DX[m.d] || 0) * s * 0.06, ey = ((m.d === 3) - (m.d === 1)) * s * 0.05;
  if (m.k === 0) {
    const h = -s * 0.04 + wob * s * 0.03;
    line(g, -s * 0.38, h - s * 0.08, s * 0.38, h - s * 0.08, s * 0.05, '#5a6080');
    for (const sx of [-1, 1]) ellipse(g, sx * s * 0.38, h - s * 0.12, s * 0.13 * Math.abs(Math.cos(T / 35 + sx)), s * 0.03, 'rgba(190,200,230,0.7)');
    circle(g, 0, h, s * 0.27, '#3b405c');
    circle(g, 0, h, s * 0.2, '#1c1f30');
    circle(g, ex, h + ey, s * 0.15, rgba(RED, 0.35));
    circle(g, ex, h + ey, s * 0.1, RED);
    circle(g, ex - s * 0.03, h + ey - s * 0.03, s * 0.03, '#ffd0d8');
    return;
  }
  if (m.k === 1) {
    const step = Math.sin(T / 60 + m.i);
    for (const sx of [-1, 1]) {
      for (let j = 0; j < 3; j++) {
        const a = (j - 1) * 0.55 + (j % 2 ? step : -step) * 0.2;
        const kx = sx * s * 0.26, ky = (j - 1) * s * 0.12;
        const mx = kx + sx * Math.cos(a) * s * 0.16, my = ky + Math.sin(a) * s * 0.16 - s * 0.08;
        g.strokeStyle = '#7a2a52'; g.lineWidth = Math.max(1, s * 0.045); g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(sx * s * 0.12, ky * 0.6); g.lineTo(mx, my); g.lineTo(mx + sx * s * 0.07, my + s * 0.16); g.stroke();
      }
    }
    poly(g, [[0, -s * 0.27], [s * 0.24, -s * 0.05], [s * 0.17, s * 0.22], [-s * 0.17, s * 0.22], [-s * 0.24, -s * 0.05]], '#4a0d2c');
    g.strokeStyle = MG; g.lineWidth = Math.max(1, s * 0.035); g.lineJoin = 'round'; g.stroke();
    for (const sx of [-1, 1]) {
      circle(g, sx * s * 0.08 + ex, -s * 0.02 + ey, s * 0.06, rgba('#ff8a2b', 0.35));
      circle(g, sx * s * 0.08 + ex, -s * 0.02 + ey, s * 0.035, '#ffb02b');
    }
    return;
  }
  const jit = (Math.floor(T / 90 + m.i) % 5 === 0) ? s * 0.05 : s * 0.02;     // зсув кольорів, зрідка — більший
  for (const [c, dx] of [[MG, jit], [CY, -jit * 0.5]]) {
    g.save();
    g.translate(dx, 0);
    ghostPath(g, s, wob);
    g.fillStyle = rgba(c, c === CY ? 0.75 : 0.45);
    g.fill();
    g.restore();
  }
  g.fillStyle = 'rgba(10,8,25,0.35)';                              // розгортка
  for (let j = 0; j < 6; j++) g.fillRect(-s * 0.35, -s * 0.36 + j * s * 0.12 + (T / 40 % (s * 0.12)), s * 0.7, Math.max(1, s * 0.025));
  g.fillStyle = '#fff';
  for (const sx of [-1, 1]) g.fillRect(sx * s * 0.1 - s * 0.04 + ex, -s * 0.14 + ey, s * 0.08, s * 0.08);
}

export default {
  name: 'Кіберпанк',
  bg: '#07040f',
  shadow: 'rgba(255,43,214,0.35)',
  emoji: { bomb: '💣', fire: '🔥', speed: '⚡', pass: '👾', resist: '🛡' },
  fire: [MG, '#35e8ff', '#f2feff'],
  burn: [MG, 'rgba(53,232,255,0)'],
  blocks: 2,
  floor, stone, block, wall, item, bomb, player, monster,
};
