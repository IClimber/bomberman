// classic.js — стиль «За замовчуванням»: зелене поле, сірі стовпи, цегла, бомбермени в шоломах.
import { DX, IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, IT_REMOTE } from '../sim.js';
import { TAU, rr, rnd, circle, bevel, shade, flameShape, bombShape, spark, bombBeat, bombFlash, pillarShade, remoteIcon } from './common.js';

const C = {
  floorA: '#3d8a47', floorB: '#398342', floorShadow: 'rgba(0,0,0,0.22)',
  pillar: '#7a8294', pillarHi: '#a9b0bf', pillarLo: '#4e5464', pillarTop: '#8b93a5',
  border: '#596072', borderHi: '#7d8597', borderLo: '#3b404d',
  brick: '#c8743c', brickHi: '#e19a5c', brickLo: '#8c4a22', mortar: '#7a3f1d',
  wall: '#454b5a', wallHi: '#6b7387', wallLo: '#2b2f39', rivet: '#9aa3b6',
  skin: '#ffd2a8', glove: '#ff8fb1', visor: '#1d2030',
};

// Тло — шпалери з бомб і вогників
function backdrop(g, W, H, dpr) {
  const step = 70 * dpr;
  for (let r = 0, y = step / 2; y < H + step; r++, y += step * 0.8) {
    for (let c = 0, x = (r % 2) * step / 2; x < W + step; c++, x += step) {
      const i = r * 97 + c;
      g.save(); g.translate(x, y); g.rotate((rnd(i, 1) - 0.5) * 0.7);
      if ((r + c * 2) % 5 === 0) flameShape(g, 0, 0, 12 * dpr, 'rgba(255,140,50,0.07)');
      else {
        bombShape(g, 0, 0, 12 * dpr, 'rgba(120,135,170,0.11)', 'rgba(120,135,170,0.05)', 'rgba(201,163,107,0.16)');
        if (rnd(i, 2) < 0.3) circle(g, 14.5 * dpr, -12.5 * dpr, 2.5 * dpr, 'rgba(255,210,63,0.22)');
      }
      g.restore();
    }
  }
}

function floor(g, px, py, s, x, y, map) {
  g.fillStyle = (x + y) % 2 ? C.floorA : C.floorB;
  g.fillRect(px, py, s, s);
  g.fillStyle = 'rgba(255,255,255,0.035)';
  g.fillRect(px + s * 0.1, py + s * 0.1, s * 0.12, s * 0.12);
  g.fillRect(px + s * 0.62, py + s * 0.55, s * 0.1, s * 0.1);
  pillarShade(g, map, x, y, px, py, s, C.floorShadow);
}

function stone(g, x, y, s, border) {
  const d = Math.max(1, Math.round(s * 0.09));
  if (border) {
    bevel(g, x, y, s, C.border, C.borderHi, C.borderLo, d);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(x + d, y + s / 2 - d / 2, s - 2 * d, Math.max(1, d / 2));
    return;
  }
  bevel(g, x, y, s, C.pillar, C.pillarHi, C.pillarLo, d);
  g.fillStyle = C.pillarTop;
  g.fillRect(x + s * 0.28, y + s * 0.28, s * 0.44, s * 0.44);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(x + s * 0.28, y + s * 0.28, s * 0.44, Math.max(1, d / 2));
}

function block(g, s) {
  const d = Math.max(1, Math.round(s * 0.07));
  bevel(g, 0, 0, s, C.brick, C.brickHi, C.brickLo, d);
  g.fillStyle = C.mortar;
  const lw = Math.max(1, Math.round(s * 0.05));
  for (let r = 1; r < 3; r++) g.fillRect(d, Math.round(s * r / 3) - lw / 2, s - 2 * d, lw);
  const xs = [[0.5], [0.25, 0.75], [0.5]];
  for (let r = 0; r < 3; r++) {
    for (const fx of xs[r]) g.fillRect(Math.round(s * fx) - lw / 2, Math.round(s * r / 3) + (r ? lw / 2 : d), lw, Math.round(s / 3) - lw);
  }
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(d, d, s - 2 * d, Math.max(1, d / 2));
}

function wall(g, s) {
  const d = Math.max(1, Math.round(s * 0.1));
  bevel(g, 0, 0, s, C.wall, C.wallHi, C.wallLo, d);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = Math.max(1, s * 0.04);
  g.beginPath(); g.moveTo(d, d); g.lineTo(s - d, s - d); g.moveTo(s - d, d); g.lineTo(d, s - d); g.stroke();
  g.fillStyle = C.rivet;
  const r = Math.max(1, s * 0.05);
  for (const [fx, fy] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) { g.beginPath(); g.arc(s * fx, s * fy, r, 0, TAU); g.fill(); }
}

// Бонуси: кольорова плитка з піктограмою
const ITEM_BG = { [IT_BOMB]: '#2f6fd6', [IT_FIRE]: '#d9412b', [IT_SPEED]: '#7a3fd0', [IT_PASS]: '#16a39a', [IT_RESIST]: '#d9a21b', [IT_REMOTE]: '#c2185b' };
export function itemTile(g, s, bg, edge = 'rgba(255,255,255,0.55)') {
  const p = s * 0.1;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  rr(g, p + s * 0.04, p + s * 0.06, s - 2 * p, s - 2 * p, s * 0.16); g.fill();
  g.fillStyle = bg;
  rr(g, p, p, s - 2 * p, s - 2 * p, s * 0.16); g.fill();
  g.strokeStyle = edge;
  g.lineWidth = Math.max(1, s * 0.04);
  rr(g, p, p, s - 2 * p, s - 2 * p, s * 0.16); g.stroke();
}
function item(g, k, s) {
  itemTile(g, s, ITEM_BG[k]);
  const cx = s / 2, cy = s / 2;
  if (k === IT_BOMB || k === IT_PASS) {
    if (k === IT_PASS) {                                           // бомба-привид і стрілка крізь неї
      g.globalAlpha = 0.55;
      bombShape(g, cx - s * 0.06, cy + s * 0.04, s * 0.2);
      g.globalAlpha = 1;
      g.strokeStyle = '#fff'; g.lineWidth = s * 0.07; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - s * 0.3, cy + s * 0.04); g.lineTo(cx + s * 0.26, cy + s * 0.04);
      g.moveTo(cx + s * 0.12, cy - s * 0.1); g.lineTo(cx + s * 0.26, cy + s * 0.04); g.lineTo(cx + s * 0.12, cy + s * 0.18); g.stroke();
    } else bombShape(g, cx, cy + s * 0.04, s * 0.22);
  } else if (k === IT_FIRE) {
    flameShape(g, cx, cy, s * 0.3, '#ff7a1a');
    flameShape(g, cx, cy + s * 0.08, s * 0.18, '#ffe066');
  } else if (k === IT_SPEED) {                                     // блискавка
    g.fillStyle = '#ffe066';
    g.beginPath();
    g.moveTo(cx + s * 0.06, cy - s * 0.3); g.lineTo(cx - s * 0.18, cy + s * 0.04); g.lineTo(cx - s * 0.01, cy + s * 0.04);
    g.lineTo(cx - s * 0.08, cy + s * 0.3); g.lineTo(cx + s * 0.18, cy - s * 0.06); g.lineTo(cx + s * 0.01, cy - s * 0.06);
    g.closePath(); g.fill();
  } else if (k === IT_RESIST) {                                    // щит
    g.fillStyle = '#fff6d0';
    g.beginPath();
    g.moveTo(cx, cy - s * 0.28); g.lineTo(cx + s * 0.24, cy - s * 0.18); g.quadraticCurveTo(cx + s * 0.22, cy + s * 0.16, cx, cy + s * 0.3);
    g.quadraticCurveTo(cx - s * 0.22, cy + s * 0.16, cx - s * 0.24, cy - s * 0.18); g.closePath(); g.fill();
    flameShape(g, cx, cy + s * 0.02, s * 0.13, '#e2571e');
  } else if (k === IT_REMOTE) remoteIcon(g, cx, cy, s);
}

function bomb(g, x, y, s, k, T) {
  const r = s * (0.34 + bombBeat(k, T)), cx = x + s / 2, cy = y + s * 0.54;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(cx, y + s * 0.86, s * 0.3, s * 0.09, 0, 0, TAU); g.fill();
  bombShape(g, cx, cy, r);
  if (bombFlash(k, T)) {                                           // перед вибухом червоніє
    g.fillStyle = 'rgba(255,60,40,0.35)';
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  }
  spark(g, cx + r * 1.2, cy - r * 1.05, s);
}

// Гравець: шолом кольору гравця, обличчя з очима в бік руху, руки й ноги; мертвий — з хрестиками
function player(g, p, s, T, { col, walk, bob, dead }) {
  // ноги
  g.fillStyle = C.glove;
  g.beginPath(); g.ellipse(-s * 0.13, s * 0.36 + walk * s * 0.05, s * 0.1, s * 0.07, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(s * 0.13, s * 0.36 - walk * s * 0.05, s * 0.1, s * 0.07, 0, 0, TAU); g.fill();
  // тулуб
  g.fillStyle = shade(col, -0.15);
  rr(g, -s * 0.2, s * 0.04 - bob, s * 0.4, s * 0.3, s * 0.12); g.fill();
  g.fillStyle = '#1e2130';
  g.fillRect(-s * 0.2, s * 0.17 - bob, s * 0.4, s * 0.05);
  // руки
  g.fillStyle = C.glove;
  g.beginPath(); g.arc(-s * 0.25, s * 0.16 - bob - walk * s * 0.04, s * 0.075, 0, TAU); g.fill();
  g.beginPath(); g.arc(s * 0.25, s * 0.16 - bob + walk * s * 0.04, s * 0.075, 0, TAU); g.fill();
  // голова-шолом
  const hy = -s * 0.14 - bob;
  g.fillStyle = col;
  g.beginPath(); g.arc(0, hy, s * 0.27, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = Math.max(1, s * 0.025);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath(); g.ellipse(-s * 0.1, hy - s * 0.13, s * 0.08, s * 0.045, -0.5, 0, TAU); g.fill();
  // антена
  g.strokeStyle = shade(col, -0.35); g.lineWidth = Math.max(1, s * 0.03);
  g.beginPath(); g.moveTo(0, hy - s * 0.26); g.lineTo(0, hy - s * 0.36); g.stroke();
  g.fillStyle = C.glove;
  g.beginPath(); g.arc(0, hy - s * 0.38, s * 0.055, 0, TAU); g.fill();
  // обличчя (у бік руху), зі спини — без обличчя
  const fx = (DX[p.dr] || 0) * s * 0.07, fy = (p.dr === 3 || !p.dr) ? s * 0.02 : 0;
  if (p.dr === 1) return;
  g.fillStyle = C.skin;
  rr(g, -s * 0.17 + fx, hy - s * 0.08 + fy, s * 0.34, s * 0.2, s * 0.08); g.fill();
  g.fillStyle = C.visor;
  if (dead) {
    g.strokeStyle = C.visor; g.lineWidth = Math.max(1, s * 0.03);
    for (const ex of [-0.07, 0.07]) {
      const ox = ex * s + fx, oy = hy + s * 0.02 + fy, e = s * 0.035;
      g.beginPath(); g.moveTo(ox - e, oy - e); g.lineTo(ox + e, oy + e); g.moveTo(ox + e, oy - e); g.lineTo(ox - e, oy + e); g.stroke();
    }
  } else {
    for (const ex of [-0.07, 0.07]) { rr(g, ex * s + fx - s * 0.025, hy - s * 0.03 + fy, s * 0.05, s * 0.1, s * 0.025); g.fill(); }
  }
}

// Монстри: 0 — помаранчева кулька, 1 — фіолетовий колючий, 2 — привид
function monster(g, m, s, T, wob) {
  if (m.k === 0) {
    g.fillStyle = '#ff8a3d';
    g.beginPath(); g.ellipse(0, -wob * s * 0.03, s * 0.34, s * 0.32 + wob * s * 0.02, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath(); g.ellipse(-s * 0.12, -s * 0.15, s * 0.08, s * 0.05, -0.6, 0, TAU); g.fill();
  } else if (m.k === 1) {
    g.fillStyle = '#8e44ad';
    g.beginPath();
    const n = 10;
    for (let j = 0; j <= n * 2; j++) {
      const a = j / (n * 2) * TAU + T / 900, r = s * (j % 2 ? 0.27 : 0.38 + wob * 0.02);
      j ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
    g.fillStyle = '#b26ad1';
    g.beginPath(); g.arc(0, 0, s * 0.24, 0, TAU); g.fill();
  } else {
    g.fillStyle = '#dbe9ff';
    g.beginPath();
    g.arc(0, -s * 0.08, s * 0.3, Math.PI, 0);
    const bottom = s * 0.3;
    g.lineTo(s * 0.3, bottom);
    for (let j = 0; j < 4; j++) {
      const x1 = s * 0.3 - (j + 0.5) * s * 0.15, x2 = s * 0.3 - (j + 1) * s * 0.15;
      g.quadraticCurveTo(x1, bottom - s * 0.1 - wob * s * 0.04 * (j % 2 ? 1 : -1), x2, bottom);
    }
    g.closePath(); g.fill();
  }
  eyes(g, m, s, m.k === 2 ? -s * 0.1 : -s * 0.04);
  if (m.k === 1) {                                                // сердиті брови
    const eyeY = -s * 0.04;
    g.strokeStyle = '#2b1236'; g.lineWidth = Math.max(1, s * 0.035);
    g.beginPath(); g.moveTo(-s * 0.18, eyeY - s * 0.14); g.lineTo(-s * 0.04, eyeY - s * 0.08);
    g.moveTo(s * 0.18, eyeY - s * 0.14); g.lineTo(s * 0.04, eyeY - s * 0.08); g.stroke();
  }
}
// Очі в бік руху
export function eyes(g, m, s, eyeY, white = '#fff', pupil = '#16131f', gap = 0.1, size = 1) {
  const ex = (DX[m.d] || 0) * s * 0.05, ey = ((m.d === 3) - (m.d === 1)) * s * 0.04;
  for (const sx of [-1, 1]) {
    g.fillStyle = white;
    g.beginPath(); g.ellipse(sx * s * gap, eyeY, s * 0.075 * size, s * 0.095 * size, 0, 0, TAU); g.fill();
    g.fillStyle = pupil;
    g.beginPath(); g.arc(sx * s * gap + ex * size, eyeY + ey * size + s * 0.01, s * 0.04 * size, 0, TAU); g.fill();
  }
}

export default {
  name: 'За замовчуванням',
  bg: '#141722',
  backdrop,
  emoji: { bomb: '💣', fire: '🔥', speed: '👟', pass: '👻', resist: '🛡', remote: '📡' },
  fire: ['#ff6a1a', '#ffc533', '#fff6c8'],
  burn: ['#ff6a00', 'rgba(255,220,80,0)'],
  floor, stone, block, wall, item, bomb, player, monster,
};
