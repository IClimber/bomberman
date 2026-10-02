// candy.js — «Солодощі»: рожево-кремова глазур з посипкою, стовпи — плитки шоколаду (на всю клітинку), рамка — темний
// шоколад з білою глазур'ю; блоки — предмети з тінню: капкейки, желейні кубики, льодяники; стіни — карамельні палички
// в смужку. Гравці — імбирні чоловічки з гудзиками й шарфиком кольору гравця; желейний ведмедик, оса, привид-маршмелоу.
// Бомби — круглі цукерки з ґнотом. Бонуси: 🍬 бомба, 🔥 вогонь, ⚡ швидкість, 👻 прохід, 🛡️ стійкість,
// 📡 детонатор.
import { DX, DY, IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, IT_REMOTE } from '../sim.js';
import { TAU, rr, rnd, luma, shade, rgba, circle, ellipse, line, poly, bombBeat, bombFlash, pillarShade, spark, flameShape, remoteIcon, ghostPath } from './common.js';

const ICE = '#ffe3ec', ICE2 = '#ffdbe6', CHOC = '#5b3420', CHOC_HI = '#7a4a2e', CHOC_LO = '#3a1f10';
const COOKIE = '#c98a4a', ICING = '#fffaf2';
const SPRINKLES = ['#ff4d8d', '#4dc3ff', '#ffd23f', '#7be36a', '#b07aff', '#ff8a3d'];

// Тло — рожевий фон з посипкою
function backdrop(g, W, H, dpr) {
  for (let j = 0; j < 400; j++) {
    g.save(); g.translate(rnd(j, 1) * W, rnd(j, 2) * H); g.rotate(rnd(j, 3) * TAU);
    g.fillStyle = SPRINKLES[j % SPRINKLES.length]; rr(g, -4 * dpr, -1.3 * dpr, 8 * dpr, 2.6 * dpr, 1.3 * dpr); g.fill();
    g.restore();
  }
}

function floor(g, px, py, s, x, y, map) {
  const i = y * map.GW + x;
  g.fillStyle = (x + y) % 2 ? ICE : ICE2; g.fillRect(px, py, s, s);
  for (let j = 0; j < 3; j++) {
    if (rnd(i, j) > 0.55) continue;
    g.save(); g.translate(px + s * rnd(i, 10 + j), py + s * rnd(i, 20 + j)); g.rotate(rnd(i, 30 + j) * TAU);
    g.fillStyle = SPRINKLES[Math.floor(rnd(i, 40 + j) * SPRINKLES.length)];
    rr(g, -s * 0.05, -s * 0.015, s * 0.1, s * 0.03, s * 0.015); g.fill();
    g.restore();
  }
  pillarShade(g, map, x, y, px, py, s, 'rgba(90,30,40,0.18)');
}

// Рамка — темний шоколад з потьоками глазурі; стовп — плитка шоколаду (2×2 часточки) на всю клітинку
function stone(g, x, y, s, border, cx, cy, map) {
  const d = Math.max(1, Math.round(s * 0.06));
  if (border) {
    g.fillStyle = CHOC_LO; g.fillRect(x, y, s, s);
    g.fillStyle = '#4a2814'; g.fillRect(x + d, y + d, s - 2 * d, s - 2 * d);
    if (cy === 0 || cy === map.GH - 1) {                            // глазур, що стікає
      g.fillStyle = ICING;
      const top = cy === 0 ? y + s * 0.7 : y;
      g.fillRect(x, top, s, s * 0.12);
      for (let j = 0; j < 3; j++) { const r = rnd(cy * map.GW + cx, j); if (cy === 0) { rr(g, x + s * (0.1 + j * 0.3), top, s * 0.12, s * (0.15 + r * 0.15), s * 0.06); g.fill(); } }
    }
    return;
  }
  g.fillStyle = CHOC_LO; g.fillRect(x, y, s, s);
  for (const [fx, fy] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]]) {
    const qx = x + s * fx + d * 0.5, qy = y + s * fy + d * 0.5, q = s / 2 - d;
    g.fillStyle = CHOC_HI; g.fillRect(qx, qy, q, q);
    g.fillStyle = CHOC; g.fillRect(qx + d * 0.8, qy + d * 0.8, q - d * 1.6, q - d * 1.6);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(qx + d * 0.8, qy + d * 0.8, q - d * 1.6, Math.max(1, d * 0.6));
  }
}

// Блоки: 0 — капкейк, 1 — желейний кубик, 2 — льодяник
function block(g, s, v) {
  ellipse(g, s / 2, s * 0.88, s * 0.34, s * 0.09, 'rgba(120,40,70,0.25)');
  if (v === 0) {
    g.fillStyle = '#ff9ec7';
    g.beginPath(); g.moveTo(s * 0.2, s * 0.5); g.lineTo(s * 0.8, s * 0.5); g.lineTo(s * 0.7, s * 0.88); g.lineTo(s * 0.3, s * 0.88); g.closePath(); g.fill();
    g.strokeStyle = '#e06aa0'; g.lineWidth = Math.max(1, s * 0.025);
    for (let j = 1; j < 5; j++) { g.beginPath(); g.moveTo(s * (0.2 + j * 0.12), s * 0.5); g.lineTo(s * (0.3 + j * 0.08), s * 0.88); g.stroke(); }
    for (const [fx, fy, r] of [[0.32, 0.46, 0.15], [0.68, 0.46, 0.15], [0.5, 0.4, 0.18], [0.5, 0.24, 0.14]]) circle(g, s * fx, s * fy, s * r, ICING);
    circle(g, s * 0.52, s * 0.1, s * 0.07, '#e53935');
    line(g, s * 0.52, s * 0.04, s * 0.58, s * -0.02, s * 0.02, '#3e7a22');
    for (let j = 0; j < 6; j++) { g.fillStyle = SPRINKLES[j]; g.fillRect(s * (0.3 + rnd(j, 1) * 0.4), s * (0.28 + rnd(j, 2) * 0.2), s * 0.05, s * 0.02); }
    return;
  }
  if (v === 1) {
    const c = ['#7be36a', '#ff5a6e', '#ffb02b'][0];
    g.fillStyle = rgba(c, 0.85); rr(g, s * 0.16, s * 0.2, s * 0.68, s * 0.66, s * 0.14); g.fill();
    g.fillStyle = shade(c, -0.2); rr(g, s * 0.16, s * 0.66, s * 0.68, s * 0.2, s * 0.1); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)'; rr(g, s * 0.24, s * 0.26, s * 0.18, s * 0.08, s * 0.04); g.fill();
    for (let j = 0; j < 8; j++) circle(g, s * (0.24 + rnd(j, 6) * 0.52), s * (0.3 + rnd(j, 7) * 0.5), s * 0.018, 'rgba(255,255,255,0.8)');   // цукор
    return;
  }
  line(g, s * 0.5, s * 0.5, s * 0.5, s * 0.9, s * 0.06, '#f4f4f4');
  circle(g, s * 0.5, s * 0.4, s * 0.3, '#fff');
  g.save(); g.beginPath(); g.arc(s * 0.5, s * 0.4, s * 0.3, 0, TAU); g.clip();
  for (let j = 0; j < 6; j++) {
    g.strokeStyle = SPRINKLES[j]; g.lineWidth = s * 0.08;
    g.beginPath(); g.arc(s * 0.5, s * 0.4, s * (0.05 + j * 0.05), j, j + 3.6); g.stroke();
  }
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(s * 0.38, s * 0.26, s * 0.08, s * 0.04, -0.6, 0, TAU); g.fill();
}

// Стіна — карамельні палички в смужку
function wall(g, s) {
  g.fillStyle = '#fff'; g.fillRect(0, 0, s, s);
  g.save(); g.beginPath(); g.rect(0, 0, s, s); g.clip();
  g.fillStyle = '#e02434';
  for (let j = -4; j < 8; j++) { g.beginPath(); g.moveTo(j * s * 0.25, 0); g.lineTo(j * s * 0.25 + s * 0.12, 0); g.lineTo(j * s * 0.25 + s * 0.12 - s, s); g.lineTo(j * s * 0.25 - s, s); g.closePath(); g.fill(); }
  g.restore();
  g.strokeStyle = 'rgba(120,0,20,0.45)'; g.lineWidth = Math.max(1, s * 0.04); g.strokeRect(s * 0.02, s * 0.02, s * 0.96, s * 0.96);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(s * 0.06, s * 0.06, s * 0.88, s * 0.06);
}

// Бонуси на круглому печиві з глазур'ю
const ITEM_BG = { [IT_BOMB]: '#7ec8ff', [IT_FIRE]: '#ffb07e', [IT_SPEED]: '#fff07e', [IT_PASS]: '#d6b8ff', [IT_RESIST]: '#9ef0b0', [IT_REMOTE]: '#b8f0ff' };
function item(g, k, s) {
  const cx = s / 2, cy = s / 2;
  circle(g, cx + s * 0.02, cy + s * 0.04, s * 0.4, 'rgba(120,40,70,0.25)');
  circle(g, cx, cy, s * 0.4, COOKIE);
  g.fillStyle = ITEM_BG[k];
  g.beginPath();
  for (let j = 0; j <= 16; j++) { const a = j / 16 * TAU, r = s * (0.33 + (j % 2 ? 0.02 : 0)); j ? g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
  g.closePath(); g.fill();
  if (k === IT_BOMB) candyBomb(g, cx, cy + s * 0.03, s * 0.15, false);
  else if (k === IT_FIRE) { flameShape(g, cx, cy, s * 0.22, '#ff4d8d'); flameShape(g, cx, cy + s * 0.05, s * 0.13, '#ffd23f'); }
  else if (k === IT_SPEED) {
    g.fillStyle = '#ff8a3d';
    g.beginPath();
    g.moveTo(cx + s * 0.05, cy - s * 0.26); g.lineTo(cx - s * 0.16, cy + s * 0.04); g.lineTo(cx - s * 0.01, cy + s * 0.04);
    g.lineTo(cx - s * 0.07, cy + s * 0.26); g.lineTo(cx + s * 0.16, cy - s * 0.06); g.lineTo(cx + s * 0.01, cy - s * 0.06);
    g.closePath(); g.fill();
  } else if (k === IT_PASS) { g.save(); g.translate(cx, cy + s * 0.03); g.scale(0.7, 0.7); marshmallow(g, s, 0, { d: 3 }); g.restore(); }
  else if (k === IT_RESIST) {
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(cx, cy - s * 0.24); g.lineTo(cx + s * 0.2, cy - s * 0.15); g.quadraticCurveTo(cx + s * 0.18, cy + s * 0.14, cx, cy + s * 0.25);
    g.quadraticCurveTo(cx - s * 0.18, cy + s * 0.14, cx - s * 0.2, cy - s * 0.15); g.closePath(); g.fill();
    g.fillStyle = '#ff4d8d'; g.beginPath(); g.arc(cx - s * 0.05, cy - s * 0.02, s * 0.06, 0, TAU); g.arc(cx + s * 0.05, cy - s * 0.02, s * 0.06, 0, TAU); g.fill();
    poly(g, [[cx - s * 0.11, cy], [cx + s * 0.11, cy], [cx, cy + s * 0.13]], '#ff4d8d');
  } else if (k === IT_REMOTE) remoteIcon(g, cx, cy, s * 0.95, '#ff4d8d', '#fff', '#7a1a3a');
}

// Цукерка-бомба: кругла, з білими смужками й ґнотом
function candyBomb(g, cx, cy, r, red) {
  circle(g, cx, cy, r, red ? '#ff2a4a' : '#8a1a3a');
  g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = r * 0.22;
  for (const a of [-0.6, 0.4, 1.4]) { g.beginPath(); g.arc(cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r * 1.4, r * 1.2, 0, TAU); g.stroke(); }
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.25, r * 0.14, -0.6, 0, TAU); g.fill();
  g.strokeStyle = '#ff9ec7'; g.lineWidth = Math.max(1, r * 0.2); g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx + r * 0.5, cy - r * 0.8); g.quadraticCurveTo(cx + r * 0.9, cy - r * 1.3, cx + r * 1.2, cy - r * 1.05); g.stroke();
}
function bomb(g, x, y, s, k, T) {
  const r = s * (0.32 + bombBeat(k, T)), cx = x + s / 2, cy = y + s * 0.55;
  ellipse(g, cx, y + s * 0.88, s * 0.28, s * 0.08, 'rgba(120,40,70,0.3)');
  candyBomb(g, cx, cy, r, bombFlash(k, T));
  spark(g, cx + r * 1.2, cy - r * 1.05, s);
}

// Імбирний чоловічок: печиво з глазур'ю, гудзики-драже й шарфик кольору гравця
function player(g, p, s, T, { col, walk, bob, dead }) {
  g.fillStyle = COOKIE;
  for (const [sx, w] of [[-1, walk], [1, -walk]]) { rr(g, sx * s * 0.1 - s * 0.07, s * 0.12 - bob, s * 0.14, s * 0.28 + w * s * 0.04, s * 0.07); g.fill(); }
  for (const sx of [-1, 1]) { g.save(); g.translate(sx * s * 0.16, 0.02 * s - bob); g.rotate(sx * (0.9 + walk * 0.3)); rr(g, -s * 0.06, -s * 0.05, s * 0.24, s * 0.11, s * 0.055); g.fill(); g.restore(); }
  rr(g, -s * 0.17, -s * 0.06 - bob, s * 0.34, s * 0.3, s * 0.12); g.fill();
  g.strokeStyle = ICING; g.lineWidth = Math.max(1, s * 0.02); g.lineCap = 'round';
  for (const [sx, w] of [[-1, walk], [1, -walk]]) { g.beginPath(); g.moveTo(sx * s * 0.06, s * 0.34 + w * s * 0.04); g.quadraticCurveTo(sx * s * 0.1, s * 0.37 + w * s * 0.04, sx * s * 0.14, s * 0.34 + w * s * 0.04); g.stroke(); }
  for (let j = 0; j < 2; j++) circle(g, 0, s * (0.06 + j * 0.09) - bob, s * 0.035, col);   // гудзики
  const hy = -s * 0.2 - bob;
  circle(g, 0, hy, s * 0.17, COOKIE);
  g.fillStyle = col; rr(g, -s * 0.17, -s * 0.07 - bob, s * 0.34, s * 0.07, s * 0.03); g.fill();   // шарфик
  g.strokeStyle = luma(col) > 0.85 ? 'rgba(0,0,0,0.25)' : shade(col, -0.35); g.lineWidth = Math.max(1, s * 0.015); g.stroke();
  if (p.dr !== 1) { rr(g, s * 0.06, -s * 0.06 - bob, s * 0.07, s * 0.14, s * 0.03); g.fillStyle = col; g.fill(); }
  if (p.dr === 1) return;
  const fx = (DX[p.dr] || 0) * s * 0.05, fy = p.dr === 3 || !p.dr ? s * 0.015 : 0;
  if (dead) {
    g.strokeStyle = ICING; g.lineWidth = Math.max(1, s * 0.025);
    for (const ex of [-0.06, 0.06]) {
      const ox = ex * s + fx, oy = hy - s * 0.02 + fy, e = s * 0.028;
      g.beginPath(); g.moveTo(ox - e, oy - e); g.lineTo(ox + e, oy + e); g.moveTo(ox + e, oy - e); g.lineTo(ox - e, oy + e); g.stroke();
    }
  } else for (const ex of [-0.06, 0.06]) circle(g, ex * s + fx, hy - s * 0.02 + fy, s * 0.028, ICING);
  g.strokeStyle = ICING; g.lineWidth = Math.max(1, s * 0.025);
  g.beginPath(); g.arc(fx, hy + s * 0.04 + fy, s * 0.06, 0.3, Math.PI - 0.3); g.stroke();
}

// Привид-маршмелоу (і на іконці бонуса)
function marshmallow(g, s, wob, m) {
  g.fillStyle = '#fffaf6';
  ghostPath(g, s, wob, 0.3); g.fill();
  g.strokeStyle = '#ffd0e0'; g.lineWidth = Math.max(1, s * 0.03); g.stroke();
  circle(g, -s * 0.16, s * 0.0, s * 0.05, 'rgba(255,150,190,0.5)'); circle(g, s * 0.16, s * 0.0, s * 0.05, 'rgba(255,150,190,0.5)');
  const ex = (DX[m.d] || 0) * s * 0.04;
  for (const sx of [-1, 1]) ellipse(g, sx * s * 0.09 + ex, -s * 0.1, s * 0.04, s * 0.06, '#5a2a3a');
}
// Монстри: 0 — желейний ведмедик, 1 — оса (головою за рухом), 2 — привид-маршмелоу
function monster(g, m, s, T, wob) {
  const ex = (DX[m.d] || 0) * s * 0.04;
  if (m.k === 0) {
    const c = '#ff3b4f';
    g.fillStyle = rgba(c, 0.85);
    for (const sx of [-1, 1]) { circle(g, sx * s * 0.16, -s * 0.3, s * 0.08, rgba(c, 0.85)); ellipse(g, sx * s * 0.2, s * 0.06, s * 0.07, s * 0.1, rgba(c, 0.85), sx * 0.5); ellipse(g, sx * s * 0.13, s * 0.3, s * 0.08, s * 0.07, rgba(c, 0.85)); }
    g.beginPath(); g.ellipse(0, s * 0.1, s * 0.18, s * 0.22, 0, 0, TAU); g.fill();
    circle(g, 0, -s * 0.18, s * 0.17, rgba(c, 0.85));
    ellipse(g, ex, -s * 0.12, s * 0.07, s * 0.05, rgba('#ffffff', 0.35));
    for (const sx of [-1, 1]) circle(g, sx * s * 0.07 + ex, -s * 0.2, s * 0.025, '#4a0a14');
    g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(-s * 0.08, s * 0.02, s * 0.04, s * 0.09, 0.3, 0, TAU); g.fill();
    return;
  }
  if (m.k === 1) {
    const a = Math.atan2(DY[m.d] || 0, DX[m.d] || 1), flap = Math.abs(Math.sin(T / 30 + m.i));
    g.save(); g.rotate(a);
    for (const sy of [-1, 1]) ellipse(g, -s * 0.02, sy * s * (0.12 + flap * 0.06), s * 0.14, s * 0.08, 'rgba(220,240,255,0.75)', sy * 0.4);
    ellipse(g, -s * 0.12, 0, s * 0.18, s * 0.13, '#ffc61a');
    g.save(); g.beginPath(); g.ellipse(-s * 0.12, 0, s * 0.18, s * 0.13, 0, 0, TAU); g.clip();
    g.fillStyle = '#1a1a1a'; for (const fx of [-0.2, -0.1, 0]) g.fillRect(s * fx - s * 0.03, -s * 0.15, s * 0.05, s * 0.3);
    g.restore();
    poly(g, [[-s * 0.3, -s * 0.03], [-s * 0.4, 0], [-s * 0.3, s * 0.03]], '#1a1a1a');
    circle(g, s * 0.12, 0, s * 0.1, '#ffc61a');
    for (const sy of [-1, 1]) { circle(g, s * 0.16, sy * s * 0.05, s * 0.04, '#1a1a1a'); line(g, s * 0.18, sy * s * 0.06, s * 0.28, sy * s * 0.12, s * 0.015, '#1a1a1a'); }
    g.restore();
    return;
  }
  marshmallow(g, s, wob, m);
}

export default {
  name: 'Солодощі',
  bg: '#ffc2d6',
  backdrop,
  shadow: 'rgba(120,40,80,0.35)',
  emoji: { bomb: '🍬', fire: '🔥', speed: '⚡', pass: '👻', resist: '🛡️', remote: '📡' },
  fire: ['#ff4d8d', '#ffa64d', '#fff2b3'],
  burn: ['#ff4d8d', 'rgba(255,220,120,0)'],
  blocks: 3,
  floor, stone, block, wall, item, bomb, player, monster,
};
