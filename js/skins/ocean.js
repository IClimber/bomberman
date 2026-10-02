// ocean.js — «Під водою»: піщане дно з брижами й відблисками, стовпи — темні скелі з мушлями й водоростями (на всю клітинку),
// рамка — риф з коралами; блоки — предмети з тінню: затонулі бочки, скрині зі скарбами, мушлі-перлівниці;
// стіни — іржаві листи корабельного корпусу. Гравці — водолази в мідних шоломах, костюм кольору гравця;
// восьминіг, мурена, риба-вудильник. Бомби — морські міни. Вогонь — кипляча вода.
// Тло — глибина з променями світла й бульбашками. Бонуси: 💣 бомба, 🔱 вогонь, 🐬 швидкість, 🌊 прохід,
// 🐢 стійкість (панцир), 📡 детонатор.
import { DX, DY, IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, IT_REMOTE } from '../sim.js';
import { TAU, rr, rnd, luma, shade, rgba, circle, ellipse, line, poly, bombBeat, bombFlash, pillarShade, remoteIcon } from './common.js';

const SAND = '#d9c896', SAND2 = '#d3c18e', ROCK = '#4f5f66', ROCK_HI = '#6b7c84', ROCK_LO = '#33403f';
const BRASS = '#c8913a', BRASS_HI = '#f0c060', WOOD = '#7a5030', SEA = '#0e4f6e';

// Тло — глибина: промені світла згори, бульбашки
function backdrop(g, W, H, dpr) {
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#13628a'); grd.addColorStop(1, '#041c2c');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(180,240,255,0.06)';
  for (let j = 0; j < 7; j++) {
    const x = W * (0.05 + j * 0.15);
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + W * 0.05, 0); g.lineTo(x + W * 0.16, H); g.lineTo(x + W * 0.07, H); g.closePath(); g.fill();
  }
  g.strokeStyle = 'rgba(200,245,255,0.35)';
  for (let j = 0; j < 80; j++) {
    const r = (2 + rnd(j, 3) * 6) * dpr;
    g.lineWidth = Math.max(1, dpr);
    g.beginPath(); g.arc(rnd(j, 1) * W, rnd(j, 2) * H, r, 0, TAU); g.stroke();
  }
}

function floor(g, px, py, s, x, y, map) {
  const i = y * map.GW + x;
  g.fillStyle = (x + y) % 2 ? SAND : SAND2; g.fillRect(px, py, s, s);
  g.strokeStyle = 'rgba(150,120,70,0.3)'; g.lineWidth = Math.max(1, s * 0.025);   // брижі
  for (const fy of [0.3, 0.62]) {
    g.beginPath(); g.moveTo(px, py + s * fy);
    g.quadraticCurveTo(px + s * 0.25, py + s * (fy - 0.06), px + s * 0.5, py + s * fy); g.quadraticCurveTo(px + s * 0.75, py + s * (fy + 0.06), px + s, py + s * fy);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = Math.max(1, s * 0.02);   // відблиски
  g.beginPath(); g.ellipse(px + s * (0.3 + rnd(i, 1) * 0.4), py + s * (0.3 + rnd(i, 2) * 0.4), s * 0.12, s * 0.06, rnd(i, 3) * 3, 0, TAU); g.stroke();
  const r = rnd(i, 5);
  if (r < 0.06) { ellipse(g, px + s * 0.7, py + s * 0.72, s * 0.06, s * 0.05, '#f6d0c0'); }
  else if (r < 0.1) {
    g.strokeStyle = '#3f8f4a'; g.lineWidth = Math.max(1, s * 0.03); g.lineCap = 'round';
    g.beginPath(); g.moveTo(px + s * 0.25, py + s * 0.85); g.quadraticCurveTo(px + s * 0.15, py + s * 0.6, px + s * 0.3, py + s * 0.45); g.stroke();
  }
  pillarShade(g, map, x, y, px, py, s, 'rgba(10,40,50,0.25)');
}

// Рамка — риф (темна скеля, зрідка корал); стовп — скеля з мушлями й водоростями на всю клітинку
function stone(g, x, y, s, border, cx, cy, map) {
  const i = cy * map.GW + cx, d = Math.max(1, Math.round(s * 0.08));
  const [base, hi, lo] = border ? ['#2c3a40', '#3c4c54', '#1c2629'] : [ROCK, ROCK_HI, ROCK_LO];
  g.fillStyle = lo; g.fillRect(x, y, s, s);
  g.fillStyle = hi; g.fillRect(x, y, s - d, s - d);
  g.fillStyle = base; g.fillRect(x + d, y + d, s - 2 * d, s - 2 * d);
  for (let j = 0; j < 4; j++) circle(g, x + s * (0.2 + rnd(i, j) * 0.6), y + s * (0.2 + rnd(i, j + 9) * 0.6), s * (0.04 + rnd(i, j + 4) * 0.04), 'rgba(0,0,0,0.18)');
  if (border) {
    if (rnd(i, 3) < 0.25) {                                         // корал
      g.strokeStyle = ['#ff6b8a', '#ff9f5a', '#c86bff'][Math.floor(rnd(i, 4) * 3)]; g.lineWidth = Math.max(1.5, s * 0.07); g.lineCap = 'round';
      g.beginPath(); g.moveTo(x + s * 0.5, y + s * 0.9); g.lineTo(x + s * 0.5, y + s * 0.4); g.moveTo(x + s * 0.5, y + s * 0.62); g.lineTo(x + s * 0.3, y + s * 0.38);
      g.moveTo(x + s * 0.5, y + s * 0.55); g.lineTo(x + s * 0.7, y + s * 0.3); g.stroke();
    }
    return;
  }
  for (let j = 0; j < 2; j++) {                                     // жолуді-вусоногі
    const bx = x + s * (0.25 + rnd(i, 20 + j) * 0.5), by = y + s * (0.35 + rnd(i, 30 + j) * 0.4);
    circle(g, bx, by, s * 0.06, '#d8d4c6'); circle(g, bx, by, s * 0.025, '#5a5a52');
  }
  g.fillStyle = '#3f8f4a';                                           // водорості згори
  g.fillRect(x + d, y + d, s - 2 * d, s * 0.08);
  for (let j = 0; j < 4; j++) { rr(g, x + s * (0.12 + j * 0.2), y + d, s * 0.08, s * (0.12 + rnd(i, 40 + j) * 0.12), s * 0.04); g.fill(); }
}

// Блоки: 0 — затонула бочка, 1 — скриня зі скарбами, 2 — мушля-перлівниця
function block(g, s, v) {
  ellipse(g, s / 2, s * 0.88, s * 0.34, s * 0.09, 'rgba(10,40,50,0.3)');
  if (v === 0) {
    g.save(); g.translate(s / 2, s * 0.56); g.rotate(-0.25);
    g.fillStyle = WOOD; rr(g, -s * 0.34, -s * 0.24, s * 0.68, s * 0.48, s * 0.18); g.fill();
    g.strokeStyle = '#5a3a1f'; g.lineWidth = Math.max(1, s * 0.02);
    for (const fy of [-0.12, 0, 0.12]) { g.beginPath(); g.moveTo(-s * 0.32, s * fy); g.lineTo(s * 0.32, s * fy); g.stroke(); }
    g.fillStyle = '#5a6a6e'; for (const fx of [-0.2, 0.2]) g.fillRect(s * fx - s * 0.03, -s * 0.24, s * 0.06, s * 0.48);
    ellipse(g, s * 0.32, 0, s * 0.06, s * 0.22, '#9a6a40');
    g.restore();
    line(g, s * 0.22, s * 0.36, s * 0.16, s * 0.18, s * 0.04, '#3f8f4a');
    return;
  }
  if (v === 1) {
    g.fillStyle = '#7a4a24'; g.fillRect(s * 0.14, s * 0.42, s * 0.72, s * 0.42);
    g.fillStyle = '#8f5a2c';
    g.beginPath(); g.moveTo(s * 0.14, s * 0.42); g.quadraticCurveTo(s * 0.18, s * 0.16, s * 0.5, s * 0.16); g.quadraticCurveTo(s * 0.82, s * 0.16, s * 0.86, s * 0.42); g.closePath(); g.fill();
    g.fillStyle = BRASS;
    for (const fx of [0.14, 0.82]) g.fillRect(s * fx, s * 0.28, s * 0.04, s * 0.56);
    g.fillRect(s * 0.14, s * 0.4, s * 0.72, s * 0.05);
    g.fillRect(s * 0.44, s * 0.4, s * 0.12, s * 0.14);
    circle(g, s * 0.5, s * 0.49, s * 0.02, '#3a2614');
    for (const [fx, c] of [[0.3, '#ffd23f'], [0.42, '#ff5a6e'], [0.64, '#4dc3ff']]) circle(g, s * fx, s * 0.36, s * 0.035, c);
    return;
  }
  g.fillStyle = '#f0b8c8';
  g.beginPath(); g.moveTo(s * 0.12, s * 0.62); g.quadraticCurveTo(s * 0.18, s * 0.16, s * 0.5, s * 0.14); g.quadraticCurveTo(s * 0.82, s * 0.16, s * 0.88, s * 0.62); g.closePath(); g.fill();
  g.fillStyle = '#e09aae';
  g.beginPath(); g.moveTo(s * 0.12, s * 0.62); g.quadraticCurveTo(s * 0.5, s * 0.92, s * 0.88, s * 0.62); g.closePath(); g.fill();
  g.strokeStyle = '#c87a90'; g.lineWidth = Math.max(1, s * 0.02);
  for (let j = 0; j < 7; j++) { const t = (j + 0.5) / 7; g.beginPath(); g.moveTo(s * 0.5, s * 0.66); g.lineTo(s * (0.14 + t * 0.72), s * (0.62 - Math.sin(t * Math.PI) * 0.44)); g.stroke(); }
  circle(g, s * 0.5, s * 0.64, s * 0.07, '#fffaf2');
  circle(g, s * 0.48, s * 0.62, s * 0.025, '#fff');
}

// Стіна — іржаві листи корпусу з заклепками
function wall(g, s) {
  g.fillStyle = '#5a3a2a'; g.fillRect(0, 0, s, s);
  for (const [x, y] of [[0.02, 0.02], [0.52, 0.02], [0.02, 0.52], [0.52, 0.52]]) {
    g.fillStyle = '#8a5a3a'; g.fillRect(s * x, s * y, s * 0.46, s * 0.46);
    g.fillStyle = 'rgba(200,110,50,0.35)'; g.fillRect(s * x, s * y, s * 0.46, s * 0.1);
    for (const [fx, fy] of [[0.06, 0.06], [0.4, 0.06], [0.06, 0.4], [0.4, 0.4]]) circle(g, s * (x + fx), s * (y + fy), s * 0.025, '#c8a07a');
  }
  g.fillStyle = 'rgba(60,140,80,0.55)'; for (let j = 0; j < 3; j++) { rr(g, s * (0.1 + j * 0.32), s * 0.7, s * 0.06, s * 0.3, s * 0.03); g.fill(); }
}

// Бонуси в бульбашці
const ITEM_BG = { [IT_BOMB]: '#ff8a7a', [IT_FIRE]: '#ff7a5a', [IT_SPEED]: '#7ae0ff', [IT_PASS]: '#9ad8ff', [IT_RESIST]: '#8ef0a8', [IT_REMOTE]: '#d0b8ff' };
function item(g, k, s) {
  const cx = s / 2, cy = s / 2;
  circle(g, cx, cy, s * 0.4, rgba(ITEM_BG[k], 0.55));
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = Math.max(1, s * 0.03);
  g.beginPath(); g.arc(cx, cy, s * 0.4, 0, TAU); g.stroke();
  g.beginPath(); g.arc(cx, cy, s * 0.32, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
  if (k === IT_BOMB) mine(g, cx, cy + s * 0.02, s * 0.15, false, 0);
  else if (k === IT_FIRE) {                                          // тризуб
    g.strokeStyle = BRASS_HI; g.lineWidth = s * 0.045; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, cy + s * 0.28); g.lineTo(cx, cy - s * 0.24);
    g.moveTo(cx - s * 0.15, cy - s * 0.2); g.quadraticCurveTo(cx - s * 0.15, cy - s * 0.02, cx, cy - s * 0.02); g.quadraticCurveTo(cx + s * 0.15, cy - s * 0.02, cx + s * 0.15, cy - s * 0.2);
    g.stroke();
    for (const fx of [-0.15, 0, 0.15]) poly(g, [[cx + s * fx - s * 0.04, cy - s * (fx ? 0.18 : 0.22)], [cx + s * fx, cy - s * (fx ? 0.28 : 0.32)], [cx + s * fx + s * 0.04, cy - s * (fx ? 0.18 : 0.22)]], BRASS_HI);
  } else if (k === IT_SPEED) {                                       // дельфін
    g.fillStyle = '#5a8ab0';
    g.beginPath(); g.moveTo(cx - s * 0.26, cy + s * 0.08); g.quadraticCurveTo(cx - s * 0.06, cy - s * 0.22, cx + s * 0.2, cy - s * 0.06);
    g.lineTo(cx + s * 0.28, cy - s * 0.04); g.lineTo(cx + s * 0.18, cy + s * 0.0); g.quadraticCurveTo(cx - s * 0.02, cy + s * 0.04, cx - s * 0.22, cy + s * 0.16); g.closePath(); g.fill();
    poly(g, [[cx - s * 0.02, cy - s * 0.12], [cx + s * 0.02, cy - s * 0.24], [cx + s * 0.06, cy - s * 0.1]], '#5a8ab0');
    poly(g, [[cx - s * 0.22, cy + s * 0.12], [cx - s * 0.3, cy + s * 0.02], [cx - s * 0.32, cy + s * 0.22]], '#5a8ab0');
    circle(g, cx + s * 0.13, cy - s * 0.07, s * 0.015, '#111');
  } else if (k === IT_PASS) {                                        // хвиля
    g.strokeStyle = '#1a6fb0'; g.lineWidth = s * 0.06; g.lineCap = 'round';
    for (const dy of [-0.08, 0.1]) {
      g.beginPath(); g.moveTo(cx - s * 0.24, cy + s * dy);
      g.quadraticCurveTo(cx - s * 0.12, cy + s * (dy - 0.12), cx, cy + s * dy); g.quadraticCurveTo(cx + s * 0.12, cy + s * (dy + 0.12), cx + s * 0.24, cy + s * dy);
      g.stroke();
    }
  } else if (k === IT_RESIST) {                                      // панцир черепахи
    for (const [dx, dy] of [[-0.18, -0.12], [0.18, -0.12], [-0.18, 0.14], [0.18, 0.14]]) ellipse(g, cx + s * dx, cy + s * dy, s * 0.06, s * 0.045, '#6fae5a');
    circle(g, cx + s * 0.24, cy, s * 0.06, '#6fae5a');
    ellipse(g, cx, cy, s * 0.2, s * 0.17, '#3f7a3a');
    g.strokeStyle = '#8fd07a'; g.lineWidth = Math.max(1, s * 0.02);
    g.beginPath(); g.moveTo(cx - s * 0.08, cy - s * 0.05); g.lineTo(cx + s * 0.08, cy - s * 0.05); g.lineTo(cx + s * 0.1, cy + s * 0.05); g.lineTo(cx - s * 0.1, cy + s * 0.05); g.closePath(); g.stroke();
  } else if (k === IT_REMOTE) remoteIcon(g, cx, cy, s * 0.95, '#2a3a44', '#ff3b30', '#ffd23f');
}

// Морська міна: куля з рогами й вогником, що частішає до вибуху
function mine(g, cx, cy, r, red, T, k = 0) {
  g.strokeStyle = '#2a3238'; g.lineWidth = Math.max(1, r * 0.22); g.lineCap = 'round';
  for (let j = 0; j < 8; j++) { const a = j * TAU / 8; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); g.lineTo(cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 1.3); g.stroke(); }
  for (let j = 0; j < 8; j++) { const a = j * TAU / 8; circle(g, cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 1.3, r * 0.14, '#5a666e'); }
  const grd = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  grd.addColorStop(0, red ? '#d85a4a' : '#6a7880'); grd.addColorStop(1, red ? '#5a1408' : '#1a2228');
  g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx - r, cy - r * 0.08, r * 2, r * 0.16);
  const on = Math.floor(T / (300 - 230 * k)) % 2 === 0;
  circle(g, cx, cy - r * 0.45, r * 0.16, on ? '#ff3b30' : '#6a1a14');
}
function bomb(g, x, y, s, k, T) {
  const r = s * (0.25 + bombBeat(k, T)), cx = x + s / 2, cy = y + s * 0.52;
  ellipse(g, cx, y + s * 0.88, s * 0.28, s * 0.07, 'rgba(10,40,50,0.3)');
  mine(g, cx, cy, r, bombFlash(k, T), T, k);
}

// Водолаз: мідний шолом з круглим ілюмінатором, костюм кольору гравця, балон за спиною
function player(g, p, s, T, { col, walk, bob, dead }) {
  const dark = shade(col, -0.35);
  for (const [sx, w] of [[-1, walk], [1, -walk]]) {
    line(g, sx * s * 0.09, s * 0.2, sx * s * 0.1, s * 0.34 + w * s * 0.05, s * 0.12, col);
    ellipse(g, sx * s * 0.11, s * 0.38 + w * s * 0.05, s * 0.09, s * 0.05, '#2a3238');
  }
  if (p.dr === 1) { g.fillStyle = '#d8d8d0'; rr(g, -s * 0.12, -s * 0.06 - bob, s * 0.24, s * 0.3, s * 0.1); g.fill(); }   // балон
  g.fillStyle = col; rr(g, -s * 0.19, -s * 0.04 - bob, s * 0.38, s * 0.3, s * 0.12); g.fill();
  g.strokeStyle = luma(col) > 0.8 ? 'rgba(0,0,0,0.3)' : dark; g.lineWidth = Math.max(1, s * 0.02); g.stroke();
  g.fillStyle = BRASS; g.fillRect(-s * 0.19, s * 0.12 - bob, s * 0.38, s * 0.04);
  for (const sx of [-1, 1]) {
    line(g, sx * s * 0.2, s * 0.02 - bob, sx * s * 0.27, s * 0.14 - bob - sx * walk * s * 0.04, s * 0.09, col);
    circle(g, sx * s * 0.27, s * 0.16 - bob - sx * walk * s * 0.04, s * 0.05, '#2a3238');
  }
  const hy = -s * 0.18 - bob;
  circle(g, 0, hy, s * 0.23, BRASS);
  g.fillStyle = BRASS_HI; g.beginPath(); g.ellipse(-s * 0.09, hy - s * 0.11, s * 0.07, s * 0.04, -0.5, 0, TAU); g.fill();
  g.fillStyle = shade(BRASS, -0.3); g.fillRect(-s * 0.2, hy + s * 0.14, s * 0.4, s * 0.06);
  for (let j = 0; j < 3; j++) circle(g, -s * 0.14 + j * s * 0.14, hy + s * 0.17, s * 0.018, BRASS_HI);
  const t = T / 700 + p.c;                                           // бульбашки
  for (let j = 0; j < 2; j++) {
    const ph = (t + j * 0.5) % 1;
    g.strokeStyle = `rgba(220,250,255,${0.8 - ph * 0.8})`; g.lineWidth = Math.max(1, s * 0.015);
    g.beginPath(); g.arc(s * 0.18 + Math.sin(ph * 6) * s * 0.03, hy - s * 0.24 - ph * s * 0.3, s * (0.03 + j * 0.01), 0, TAU); g.stroke();
  }
  if (p.dr === 1) return;
  const fx = (DX[p.dr] || 0) * s * 0.06, fy = p.dr === 3 || !p.dr ? s * 0.02 : 0;
  circle(g, fx, hy + fy, s * 0.13, '#3a4c54');
  circle(g, fx, hy + fy, s * 0.11, '#a8dcef');
  ellipse(g, fx - s * 0.04, hy - s * 0.04 + fy, s * 0.03, s * 0.02, 'rgba(255,255,255,0.7)', -0.5);
  if (dead) {
    g.strokeStyle = '#1a2a30'; g.lineWidth = Math.max(1, s * 0.022);
    for (const ex of [-0.045, 0.045]) {
      const ox = ex * s + fx, oy = hy + fy, e = s * 0.022;
      g.beginPath(); g.moveTo(ox - e, oy - e); g.lineTo(ox + e, oy + e); g.moveTo(ox + e, oy - e); g.lineTo(ox - e, oy + e); g.stroke();
    }
  } else for (const ex of [-0.045, 0.045]) circle(g, ex * s + fx, hy + fy, s * 0.02, '#1a2a30');
}

// Монстри: 0 — восьминіг, 1 — мурена (головою за рухом), 2 — риба-вудильник з вогником
function monster(g, m, s, T, wob) {
  const ex = (DX[m.d] || 0) * s * 0.04;
  if (m.k === 0) {
    g.strokeStyle = '#b05ac8'; g.lineWidth = s * 0.07; g.lineCap = 'round';
    for (let j = 0; j < 6; j++) {
      const x0 = (j - 2.5) * s * 0.08;
      g.beginPath(); g.moveTo(x0, s * 0.05);
      g.quadraticCurveTo(x0 * 1.6 + Math.sin(T / 150 + j) * s * 0.06, s * 0.25, x0 * 2 + Math.sin(T / 150 + j + 1) * s * 0.05, s * 0.38); g.stroke();
    }
    ellipse(g, 0, -s * 0.08 + wob * s * 0.02, s * 0.24, s * 0.24, '#c86bdb');
    for (let j = 0; j < 4; j++) circle(g, -s * 0.12 + j * s * 0.08, -s * 0.2, s * 0.025, 'rgba(255,255,255,0.35)');
    for (const sx of [-1, 1]) { circle(g, sx * s * 0.09 + ex, -s * 0.04, s * 0.06, '#fff'); circle(g, sx * s * 0.09 + ex * 1.4, -s * 0.03, s * 0.03, '#2a0a3a'); }
    return;
  }
  if (m.k === 1) {
    const a = Math.atan2(DY[m.d] || 0, DX[m.d] || 1);
    g.save(); g.rotate(a);
    g.strokeStyle = '#4f7a3a'; g.lineWidth = s * 0.16; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-s * 0.4, 0);
    for (let j = 0; j <= 6; j++) g.lineTo(-s * 0.4 + j * s * 0.1, Math.sin(T / 110 + j * 0.9 + m.i) * s * 0.08 * (1 - j / 7));
    g.stroke();
    g.strokeStyle = '#b8d05a'; g.lineWidth = s * 0.04; g.setLineDash([s * 0.03, s * 0.05]); g.stroke(); g.setLineDash([]);
    ellipse(g, s * 0.22, 0, s * 0.16, s * 0.1, '#5a8a40');
    g.fillStyle = '#2a1a1a'; g.beginPath(); g.moveTo(s * 0.38, 0); g.lineTo(s * 0.24, -s * 0.04); g.lineTo(s * 0.24, s * 0.04); g.closePath(); g.fill();
    for (const sy of [-1, 1]) poly(g, [[s * 0.28, sy * s * 0.02], [s * 0.31, sy * s * 0.0], [s * 0.3, sy * s * 0.045]], '#fff');
    for (const sy of [-1, 1]) { circle(g, s * 0.22, sy * s * 0.06, s * 0.03, '#ffd23f'); circle(g, s * 0.225, sy * s * 0.06, s * 0.014, '#111'); }
    g.restore();
    return;
  }
  const lure = Math.sin(T / 200 + m.i);
  g.strokeStyle = '#2a3a44'; g.lineWidth = Math.max(1, s * 0.025);
  g.beginPath(); g.moveTo(0, -s * 0.22); g.quadraticCurveTo(s * 0.06, -s * 0.44, s * 0.2 + ex, -s * 0.38); g.stroke();
  circle(g, s * 0.2 + ex, -s * 0.38, s * 0.1, `rgba(255,240,120,${0.25 + 0.15 * lure})`);
  circle(g, s * 0.2 + ex, -s * 0.38, s * 0.05, '#fff6a0');
  poly(g, [[-s * 0.24, 0], [-s * 0.42, -s * 0.16], [-s * 0.4, s * 0.16]], '#2a3a44');
  ellipse(g, 0, 0, s * 0.28, s * 0.24, '#3a4c58');
  g.fillStyle = '#1a1414'; g.beginPath(); g.ellipse(s * 0.06 + ex, s * 0.08, s * 0.16, s * 0.09, 0, 0, Math.PI); g.fill();
  for (let j = 0; j < 5; j++) poly(g, [[s * (-0.06 + j * 0.06) + ex, s * 0.08], [s * (-0.04 + j * 0.06) + ex, s * 0.15], [s * (-0.02 + j * 0.06) + ex, s * 0.08]], '#f4f4f0');
  circle(g, s * 0.08 + ex, -s * 0.08, s * 0.06, '#e8f0a0'); circle(g, s * 0.09 + ex * 1.3, -s * 0.08, s * 0.025, '#111');
}

export default {
  name: 'Під водою',
  bg: '#041c2c',
  backdrop,
  shadow: 'rgba(0,10,20,0.6)',
  emoji: { bomb: '💣', fire: '🔱', speed: '🐬', pass: '🌊', resist: '🐢', remote: '📡' },
  fire: ['#1fa2d6', '#8ff0ff', '#ffffff'],
  burn: ['#3fd0ff', 'rgba(220,250,255,0)'],
  blocks: 3,
  floor, stone, block, wall, item, bomb, player, monster,
};
