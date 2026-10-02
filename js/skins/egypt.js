// egypt.js — «Єгипет»: плити пісковику, стовпи — темні тесані блоки з ієрогліфами (на всю клітинку), рамка — ступені
// піраміди з золотою смугою; блоки — предмети з тінню: амфори, плетені кошики, скрині із золотом; стіни — білий вапняк.
// Гравці — фараони в немесі кольору гравця із золотом; мумія, скарабей, дух-ка. Бомби — чорні з золотим скарабеєм.
// Тло — піраміди й дюни вночі. Бонуси: 💣 бомба, ☀️ вогонь (диск Ра), 🐪 швидкість, 👁️ прохід (око Гора),
// 🪲 стійкість (скарабей), 👡 штурхання (сандалія), 🗝️ детонатор (анх).
import { DX, DY, IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, IT_KICK, IT_REMOTE } from '../sim.js';
import { TAU, rr, rnd, luma, shade, circle, ellipse, line, poly, bombShape, bombBeat, bombFlash, pillarShade, spark, kickIcon, ghostPath } from './common.js';

const SAND = '#e6c992', SAND2 = '#e0c18a', STONE = '#9b7448', STONE_HI = '#b88d5a', STONE_LO = '#6e5030';
const GOLD = '#e8b923', GOLD_D = '#a87c10', LAPIS = '#1f4fa8', SKIN = '#c98a52', INK = '#3a2614';

// Тло — нічна пустеля: зорі, піраміди, дюни
function backdrop(g, W, H, dpr) {
  for (let j = 0; j < 120; j++) circle(g, rnd(j, 1) * W, rnd(j, 2) * H * 0.6, (0.6 + rnd(j, 3)) * dpr, `rgba(255,240,200,${0.3 + rnd(j, 4) * 0.5})`);
  const base = H * 0.78;
  for (const [x, h, c] of [[0.15, 0.3, '#5a3d22'], [0.3, 0.2, '#4a3220'], [0.78, 0.34, '#5a3d22'], [0.9, 0.18, '#4a3220']]) {
    poly(g, [[W * x - H * h, base], [W * x, base - H * h], [W * x + H * h, base]], c);
    poly(g, [[W * x, base - H * h], [W * x + H * h, base], [W * x + H * h * 0.25, base]], 'rgba(0,0,0,0.25)');
  }
  g.fillStyle = '#6b4a28';
  g.beginPath(); g.moveTo(0, base);
  for (let x = 0; x <= W; x += 20 * dpr) g.lineTo(x, base + Math.sin(x / (160 * dpr)) * 12 * dpr);
  g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
}

function floor(g, px, py, s, x, y, map) {
  const i = y * map.GW + x;
  g.fillStyle = (x + y) % 2 ? SAND : SAND2; g.fillRect(px, py, s, s);
  g.fillStyle = 'rgba(120,80,30,0.18)';                              // шви плит
  g.fillRect(px, py, s, Math.max(1, s * 0.03)); g.fillRect(px, py, Math.max(1, s * 0.03), s);
  if (rnd(i, 3) < 0.5) g.fillRect(px + s * 0.5, py, Math.max(1, s * 0.02), s * 0.5);
  for (let j = 0; j < 3; j++) circle(g, px + s * rnd(i, 10 + j), py + s * rnd(i, 20 + j), Math.max(0.6, s * 0.015), 'rgba(140,100,50,0.35)');
  if (rnd(i, 9) < 0.06) {                                           // наметений пісок
    g.fillStyle = 'rgba(245,220,160,0.7)'; g.beginPath(); g.ellipse(px + s * 0.6, py + s * 0.75, s * 0.3, s * 0.08, -0.1, 0, TAU); g.fill();
  }
  pillarShade(g, map, x, y, px, py, s, 'rgba(90,60,20,0.25)');
}

// Ієрогліфи на стовпах: око, анх, птах, хвилі, нога — дрібні знаки лінією
const GLYPHS = [
  (g, x, y, u) => { g.beginPath(); g.ellipse(x, y, u * 1.4, u * 0.7, 0, 0, TAU); g.stroke(); circle(g, x, y, u * 0.35, INK); g.beginPath(); g.moveTo(x, y + u * 0.7); g.lineTo(x - u * 0.4, y + u * 1.6); g.stroke(); },
  (g, x, y, u) => { g.beginPath(); g.ellipse(x, y - u * 0.8, u * 0.55, u * 0.7, 0, 0, TAU); g.moveTo(x - u * 1.1, y); g.lineTo(x + u * 1.1, y); g.moveTo(x, y - u * 0.1); g.lineTo(x, y + u * 1.6); g.stroke(); },
  (g, x, y, u) => { g.beginPath(); g.moveTo(x - u * 1.2, y + u); g.quadraticCurveTo(x - u * 0.2, y - u * 1.4, x + u * 1.2, y - u * 0.6); g.moveTo(x - u * 0.2, y - u * 0.2); g.lineTo(x - u * 0.3, y + u * 1.4); g.stroke(); },
  (g, x, y, u) => { g.beginPath(); for (let j = 0; j < 3; j++) { g.moveTo(x - u * 1.2, y + (j - 1) * u * 0.8); for (let k = 0; k < 4; k++) g.lineTo(x - u * 1.2 + (k + 1) * u * 0.6, y + (j - 1) * u * 0.8 + (k % 2 ? 0 : -u * 0.35)); } g.stroke(); },
  (g, x, y, u) => { g.beginPath(); g.moveTo(x, y - u * 1.4); g.lineTo(x, y + u); g.lineTo(x + u * 1.2, y + u); g.stroke(); },
];
// Рамка — ступені піраміди (темні блоки, золота смуга); стовп — тесаний блок з ієрогліфами на всю клітинку
function stone(g, x, y, s, border, cx, cy, map) {
  const d = Math.max(1, Math.round(s * 0.08)), i = cy * map.GW + cx;
  if (border) {
    g.fillStyle = '#5e4222'; g.fillRect(x, y, s, s);
    g.fillStyle = '#76552e'; g.fillRect(x, y, s, s * 0.45); g.fillRect(x, y + s * 0.5, s, s * 0.45);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + ((cx + cy) % 2 ? s * 0.5 : 0), y, Math.max(1, s * 0.03), s * 0.45);
    g.fillStyle = GOLD; g.fillRect(x, y + s * 0.45, s, Math.max(1, s * 0.05));
    return;
  }
  g.fillStyle = STONE_LO; g.fillRect(x, y, s, s);
  g.fillStyle = STONE_HI; g.fillRect(x, y, s - d, s - d);
  g.fillStyle = STONE; g.fillRect(x + d, y + d, s - 2 * d, s - 2 * d);
  g.strokeStyle = 'rgba(58,38,20,0.55)'; g.lineWidth = Math.max(1, s * 0.03); g.lineCap = 'round'; g.lineJoin = 'round';
  const u = s * 0.075;
  GLYPHS[Math.floor(rnd(i, 1) * GLYPHS.length)](g, x + s * 0.32, y + s * 0.36, u);
  GLYPHS[Math.floor(rnd(i, 2) * GLYPHS.length)](g, x + s * 0.68, y + s * 0.64, u);
  g.fillStyle = 'rgba(58,38,20,0.4)'; g.fillRect(x + s * 0.5, y + d, Math.max(1, s * 0.02), s - 2 * d);
}

// Блоки: 0 — амфора, 1 — плетений кошик, 2 — скриня
function block(g, s, v) {
  ellipse(g, s / 2, s * 0.88, s * 0.34, s * 0.09, 'rgba(90,60,20,0.35)');
  if (v === 0) {
    g.fillStyle = '#c0602e';
    g.beginPath(); g.moveTo(s * 0.4, s * 0.12); g.lineTo(s * 0.6, s * 0.12); g.quadraticCurveTo(s * 0.6, s * 0.3, s * 0.78, s * 0.42);
    g.quadraticCurveTo(s * 0.86, s * 0.7, s * 0.56, s * 0.88); g.lineTo(s * 0.44, s * 0.88); g.quadraticCurveTo(s * 0.14, s * 0.7, s * 0.22, s * 0.42);
    g.quadraticCurveTo(s * 0.4, s * 0.3, s * 0.4, s * 0.12); g.fill();
    g.strokeStyle = '#8c3f1a'; g.lineWidth = Math.max(1, s * 0.04);
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(s * (0.5 + sx * 0.1), s * 0.2); g.quadraticCurveTo(s * (0.5 + sx * 0.3), s * 0.2, s * (0.5 + sx * 0.26), s * 0.4); g.stroke(); }
    g.fillStyle = '#1a1a1a'; g.fillRect(s * 0.2, s * 0.52, s * 0.6, s * 0.07);
    g.fillStyle = GOLD; for (let j = 0; j < 5; j++) g.fillRect(s * (0.25 + j * 0.11), s * 0.6, s * 0.05, s * 0.05);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.ellipse(s * 0.36, s * 0.55, s * 0.05, s * 0.15, 0.2, 0, TAU); g.fill();
    return;
  }
  if (v === 1) {
    g.fillStyle = '#c9a25a'; rr(g, s * 0.16, s * 0.3, s * 0.68, s * 0.56, s * 0.12); g.fill();
    g.strokeStyle = '#8f6a2a'; g.lineWidth = Math.max(1, s * 0.03);
    for (let j = 0; j < 5; j++) { g.beginPath(); g.moveTo(s * 0.16, s * (0.38 + j * 0.1)); g.lineTo(s * 0.84, s * (0.38 + j * 0.1)); g.stroke(); }
    for (let j = 0; j < 6; j++) for (let k = 0; k < 5; k++) if ((j + k) % 2) { g.fillStyle = '#a8823a'; g.fillRect(s * (0.18 + j * 0.11), s * (0.33 + k * 0.1), s * 0.07, s * 0.05); }
    g.fillStyle = '#b08840'; rr(g, s * 0.1, s * 0.18, s * 0.8, s * 0.16, s * 0.08); g.fill();
    g.fillStyle = LAPIS; g.fillRect(s * 0.1, s * 0.24, s * 0.8, s * 0.04);
    return;
  }
  g.fillStyle = '#7a4a24'; g.fillRect(s * 0.12, s * 0.3, s * 0.76, s * 0.54);
  g.fillStyle = '#8f5a2c'; rr(g, s * 0.1, s * 0.16, s * 0.8, s * 0.22, s * 0.1); g.fill();
  g.fillStyle = GOLD;
  for (const fx of [0.12, 0.84]) g.fillRect(s * fx, s * 0.16, s * 0.04, s * 0.68);
  g.fillRect(s * 0.12, s * 0.36, s * 0.76, s * 0.04);
  g.fillRect(s * 0.44, s * 0.36, s * 0.12, s * 0.16);
  circle(g, s * 0.5, s * 0.47, s * 0.025, '#3a2614');
  for (let j = 0; j < 3; j++) g.fillRect(s * (0.24 + j * 0.2), s * 0.6, s * 0.12, s * 0.12);
  g.fillStyle = LAPIS; for (let j = 0; j < 3; j++) g.fillRect(s * (0.26 + j * 0.2), s * 0.62, s * 0.08, s * 0.08);
}

// Стіна — білий вапняк великими блоками з охристими швами
function wall(g, s) {
  g.fillStyle = '#c9b48a'; g.fillRect(0, 0, s, s);
  for (const [x, y, w, h] of [[0.02, 0.02, 0.6, 0.46], [0.66, 0.02, 0.32, 0.46], [0.02, 0.52, 0.3, 0.46], [0.36, 0.52, 0.62, 0.46]]) {
    g.fillStyle = '#f2e8d2'; g.fillRect(s * x, s * y, s * w, s * h);
    g.fillStyle = '#ffffff'; g.fillRect(s * x, s * y, s * w, Math.max(1, s * 0.04));
    g.fillStyle = 'rgba(160,120,60,0.25)'; g.fillRect(s * x, s * (y + h) - Math.max(1, s * 0.05), s * w, Math.max(1, s * 0.05));
  }
  g.strokeStyle = '#b34a2a'; g.lineWidth = Math.max(1, s * 0.035);
  g.beginPath(); g.ellipse(s * 0.32, s * 0.25, s * 0.12, s * 0.07, 0, 0, TAU); g.stroke();
  circle(g, s * 0.32, s * 0.25, s * 0.035, '#b34a2a');
}

// Бонуси на лазуритовій плитці із золотою облямівкою
function item(g, k, s) {
  const p = s * 0.1, cx = s / 2, cy = s / 2;
  g.fillStyle = 'rgba(0,0,0,0.3)'; rr(g, p + s * 0.03, p + s * 0.05, s - 2 * p, s - 2 * p, s * 0.08); g.fill();
  g.fillStyle = GOLD; rr(g, p, p, s - 2 * p, s - 2 * p, s * 0.08); g.fill();
  g.fillStyle = LAPIS; rr(g, p + s * 0.05, p + s * 0.05, s - 2 * p - s * 0.1, s - 2 * p - s * 0.1, s * 0.05); g.fill();
  if (k === IT_BOMB) egyptBomb(g, cx, cy + s * 0.04, s * 0.18, false);
  else if (k === IT_FIRE) {                                          // диск Ра з променями
    g.strokeStyle = GOLD; g.lineWidth = Math.max(1, s * 0.035); g.lineCap = 'round';
    g.beginPath();
    for (let j = 0; j < 10; j++) { const a = j * TAU / 10; g.moveTo(cx + Math.cos(a) * s * 0.17, cy + Math.sin(a) * s * 0.17); g.lineTo(cx + Math.cos(a) * s * 0.27, cy + Math.sin(a) * s * 0.27); }
    g.stroke();
    circle(g, cx, cy, s * 0.15, '#ff7a1a'); circle(g, cx, cy, s * 0.1, '#ffd23f');
  } else if (k === IT_SPEED) {                                       // верблюд
    g.fillStyle = '#e0b46a';
    g.beginPath(); g.ellipse(cx - s * 0.02, cy, s * 0.17, s * 0.09, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(cx - s * 0.06, cy - s * 0.08, s * 0.08, s * 0.08, 0, Math.PI, 0); g.fill();
    line(g, cx + s * 0.13, cy - s * 0.02, cx + s * 0.2, cy - s * 0.18, s * 0.06, '#e0b46a');
    ellipse(g, cx + s * 0.24, cy - s * 0.19, s * 0.06, s * 0.035, '#e0b46a');
    for (const fx of [-0.13, -0.05, 0.05, 0.12]) line(g, cx + s * fx, cy + s * 0.06, cx + s * fx, cy + s * 0.24, s * 0.035, '#e0b46a');
    circle(g, cx + s * 0.25, cy - s * 0.2, s * 0.012, INK);
  } else if (k === IT_PASS) {                                        // око Гора
    g.strokeStyle = GOLD; g.lineWidth = Math.max(1, s * 0.035); g.lineCap = 'round';
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(cx - s * 0.24, cy); g.quadraticCurveTo(cx, cy - s * 0.18, cx + s * 0.24, cy); g.quadraticCurveTo(cx, cy + s * 0.14, cx - s * 0.24, cy); g.fill(); g.stroke();
    circle(g, cx, cy - s * 0.01, s * 0.07, '#111');
    g.beginPath(); g.moveTo(cx - s * 0.24, cy - s * 0.12); g.quadraticCurveTo(cx, cy - s * 0.24, cx + s * 0.26, cy - s * 0.12); g.stroke();
    g.beginPath(); g.moveTo(cx - s * 0.04, cy + s * 0.08); g.lineTo(cx - s * 0.06, cy + s * 0.24); g.moveTo(cx + s * 0.06, cy + s * 0.08); g.quadraticCurveTo(cx + s * 0.16, cy + s * 0.26, cx + s * 0.22, cy + s * 0.16); g.stroke();
  } else if (k === IT_RESIST) scarab(g, cx, cy + s * 0.02, s * 0.85, 0, '#2fa58a');
  else if (k === IT_KICK) kickIcon(g, cx, cy, s, '#c9a25a', GOLD_D, '#1a1a1a');
  else if (k === IT_REMOTE) {                                        // анх
    g.strokeStyle = GOLD; g.lineWidth = s * 0.07; g.lineCap = 'round';
    g.beginPath(); g.ellipse(cx, cy - s * 0.13, s * 0.08, s * 0.1, 0, 0, TAU);
    g.moveTo(cx - s * 0.17, cy + s * 0.0); g.lineTo(cx + s * 0.17, cy + s * 0.0); g.moveTo(cx, cy - s * 0.03); g.lineTo(cx, cy + s * 0.26); g.stroke();
  }
}

// Скарабей: панцир, голова з рогами, лапки (вид згори; a — поворот)
function scarab(g, cx, cy, s, a, shell = '#1f6f7a', legs = 0) {
  g.save(); g.translate(cx, cy); g.rotate(a);
  g.strokeStyle = '#2a1a0a'; g.lineWidth = Math.max(1, s * 0.03); g.lineCap = 'round';
  for (const sy of [-1, 1]) for (let j = 0; j < 3; j++) {
    const lx = -s * 0.08 + j * s * 0.08, ph = Math.sin(legs + j * 2) * s * 0.03;
    g.beginPath(); g.moveTo(lx, sy * s * 0.1); g.lineTo(lx + ph, sy * s * 0.2); g.lineTo(lx + ph + s * 0.03, sy * s * 0.25); g.stroke();
  }
  ellipse(g, -s * 0.02, 0, s * 0.16, s * 0.14, shell);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.moveTo(-s * 0.18, 0); g.lineTo(s * 0.12, 0); g.stroke();
  ellipse(g, s * 0.15, 0, s * 0.06, s * 0.08, shade(shell, -0.35));
  poly(g, [[s * 0.19, -s * 0.05], [s * 0.27, -s * 0.03], [s * 0.21, 0], [s * 0.27, s * 0.03], [s * 0.19, s * 0.05]], GOLD_D);
  ellipse(g, -s * 0.06, -s * 0.06, s * 0.06, s * 0.025, 'rgba(255,255,255,0.35)', 0.2);
  g.restore();
}

function egyptBomb(g, cx, cy, r, red) {
  bombShape(g, cx, cy, r, red ? '#a83a2a' : '#4a4a55', red ? '#3a0a08' : '#101016', '#c9a36b');
  g.fillStyle = GOLD; g.fillRect(cx - r, cy - r * 0.12, r * 2, r * 0.24);
  scarab(g, cx, cy + r * 0.02, r * 1.1, -Math.PI / 2, GOLD);
}
function bomb(g, x, y, s, k, T) {
  const r = s * (0.32 + bombBeat(k, T)), cx = x + s / 2, cy = y + s * 0.55;
  ellipse(g, cx, y + s * 0.88, s * 0.28, s * 0.08, 'rgba(90,60,20,0.35)');
  egyptBomb(g, cx, cy, r, bombFlash(k, T));
  spark(g, cx + r * 1.2, cy - r * 1.05, s);
}

// Фараон: немес у смужку (колір гравця й золото), підведені очі, золотий комір, біла схенті
function player(g, p, s, T, { col, walk, bob, dead }) {
  for (const [sx, w] of [[-1, walk], [1, -walk]]) {
    line(g, sx * s * 0.09, s * 0.24, sx * s * 0.11, s * 0.36 + w * s * 0.05, s * 0.08, SKIN);
    ellipse(g, sx * s * 0.11, s * 0.39 + w * s * 0.05, s * 0.07, s * 0.035, GOLD_D);
  }
  g.fillStyle = '#f6f1e4';                                           // схенті
  g.beginPath(); g.moveTo(-s * 0.17, s * 0.1 - bob); g.lineTo(s * 0.17, s * 0.1 - bob); g.lineTo(s * 0.21, s * 0.28 - bob); g.lineTo(-s * 0.21, s * 0.28 - bob); g.closePath(); g.fill();
  g.fillStyle = GOLD; g.fillRect(-s * 0.04, s * 0.1 - bob, s * 0.08, s * 0.18);
  g.fillStyle = SKIN; rr(g, -s * 0.16, -s * 0.06 - bob, s * 0.32, s * 0.18, s * 0.06); g.fill();
  for (const sx of [-1, 1]) {
    line(g, sx * s * 0.17, -s * 0.02 - bob, sx * s * 0.25, s * 0.1 - bob - sx * walk * s * 0.04, s * 0.07, SKIN);
    circle(g, sx * s * 0.25, s * 0.11 - bob - sx * walk * s * 0.04, s * 0.03, GOLD);
  }
  g.strokeStyle = GOLD; g.lineWidth = Math.max(1, s * 0.05);         // комір
  g.beginPath(); g.arc(0, -s * 0.07 - bob, s * 0.14, 0.15, Math.PI - 0.15); g.stroke();
  g.strokeStyle = LAPIS; g.lineWidth = Math.max(1, s * 0.022);
  g.beginPath(); g.arc(0, -s * 0.07 - bob, s * 0.17, 0.2, Math.PI - 0.2); g.stroke();
  const hy = -s * 0.2 - bob, back = p.dr === 1;
  // немес: крила з боків і верх у смужку
  g.save();
  g.beginPath();
  g.moveTo(-s * 0.2, hy - s * 0.12); g.quadraticCurveTo(0, hy - s * 0.3, s * 0.2, hy - s * 0.12);
  g.lineTo(s * 0.27, hy + s * 0.14); g.lineTo(s * 0.15, hy + s * 0.14); g.lineTo(s * 0.13, hy);
  g.lineTo(-s * 0.13, hy); g.lineTo(-s * 0.15, hy + s * 0.14); g.lineTo(-s * 0.27, hy + s * 0.14); g.closePath();
  if (back) { g.moveTo(-s * 0.13, hy); g.lineTo(s * 0.13, hy); g.lineTo(s * 0.13, hy + s * 0.1); g.lineTo(-s * 0.13, hy + s * 0.1); }
  g.fillStyle = col; g.fill();
  g.clip();
  g.fillStyle = GOLD;
  for (let j = -6; j <= 6; j++) g.fillRect(j * s * 0.045 - s * 0.012, hy - s * 0.3, s * 0.022, s * 0.5);
  g.restore();
  if (!back) {
    g.fillStyle = SKIN; rr(g, -s * 0.13, hy - s * 0.05, s * 0.26, s * 0.2, s * 0.06); g.fill();
    g.fillStyle = GOLD; g.fillRect(-s * 0.13, hy - s * 0.08, s * 0.26, s * 0.04);
    poly(g, [[-s * 0.025, hy - s * 0.12], [s * 0.025, hy - s * 0.12], [0, hy - s * 0.2]], GOLD);   // урей
    const fx = (DX[p.dr] || 0) * s * 0.04, fy = p.dr === 3 || !p.dr ? s * 0.015 : 0;
    if (dead) {
      g.strokeStyle = INK; g.lineWidth = Math.max(1, s * 0.022);
      for (const ex of [-0.06, 0.06]) {
        const ox = ex * s + fx, oy = hy + s * 0.03 + fy, e = s * 0.028;
        g.beginPath(); g.moveTo(ox - e, oy - e); g.lineTo(ox + e, oy + e); g.moveTo(ox + e, oy - e); g.lineTo(ox - e, oy + e); g.stroke();
      }
    } else {
      for (const ex of [-0.06, 0.06]) {
        ellipse(g, ex * s + fx, hy + s * 0.03 + fy, s * 0.04, s * 0.022, '#fff');
        circle(g, ex * s + fx, hy + s * 0.03 + fy, s * 0.018, '#111');
        line(g, ex * s + fx + s * 0.04, hy + s * 0.03 + fy, ex * s + fx + s * 0.065, hy + s * 0.045 + fy, s * 0.015, '#111');
      }
    }
    g.fillStyle = '#3a2614'; g.fillRect(-s * 0.02 + fx, hy + s * 0.13, s * 0.04, s * 0.06);   // борідка
  }
}

// Монстри: 0 — мумія, 1 — скарабей (головою за рухом), 2 — дух-ка
function monster(g, m, s, T, wob) {
  const ex = (DX[m.d] || 0) * s * 0.04;
  if (m.k === 0) {
    g.fillStyle = '#e6dcc2'; rr(g, -s * 0.2, -s * 0.34, s * 0.4, s * 0.68, s * 0.16); g.fill();
    g.strokeStyle = '#b8a888'; g.lineWidth = Math.max(1, s * 0.025);
    for (let j = 0; j < 8; j++) {
      const y = -s * 0.28 + j * s * 0.08;
      g.beginPath(); g.moveTo(-s * 0.2, y + (j % 2 ? s * 0.03 : 0)); g.lineTo(s * 0.2, y + (j % 2 ? 0 : s * 0.03)); g.stroke();
    }
    for (const sx of [-1, 1]) {                                      // руки вперед
      line(g, sx * s * 0.2, -s * 0.02, sx * s * 0.3, -s * 0.08 + wob * s * 0.03, s * 0.09, '#e6dcc2');
      line(g, sx * s * 0.3, -s * 0.08 + wob * s * 0.03, sx * s * 0.38, -s * 0.02, s * 0.03, '#e6dcc2');
    }
    g.fillStyle = '#2a1a0a'; g.fillRect(-s * 0.14, -s * 0.2, s * 0.28, s * 0.07);
    for (const sx of [-1, 1]) circle(g, sx * s * 0.07 + ex, -s * 0.165, s * 0.025, '#ff3b30');
    return;
  }
  if (m.k === 1) {
    scarab(g, 0, 0, s * 1.6, Math.atan2(DY[m.d] || 0, DX[m.d] || 1), '#1f6f7a', T / 60 + m.i);
    return;
  }
  g.fillStyle = 'rgba(80,200,210,0.75)';
  ghostPath(g, s, wob, 0.3); g.fill();
  g.strokeStyle = 'rgba(232,185,35,0.9)'; g.lineWidth = Math.max(1, s * 0.03);
  g.beginPath(); g.moveTo(-s * 0.2, -s * 0.22); g.lineTo(s * 0.2, -s * 0.22); g.stroke();
  for (const sx of [-1, 1]) {
    ellipse(g, sx * s * 0.1 + ex, -s * 0.08, s * 0.07, s * 0.04, '#fff');
    circle(g, sx * s * 0.1 + ex * 1.3, -s * 0.08, s * 0.025, '#111');
    line(g, sx * s * 0.1 + ex + sx * s * 0.07, -s * 0.08, sx * s * 0.1 + ex + sx * s * 0.11, -s * 0.06, s * 0.02, '#111');
  }
}

export default {
  name: 'Єгипет',
  bg: '#241a2e',
  backdrop,
  shadow: 'rgba(20,10,0,0.6)',
  emoji: { bomb: '💣', fire: '☀️', speed: '🐪', pass: '👁️', resist: '🪲', kick: '👡', remote: '🗝️' },
  fire: ['#e8611c', '#ffc23d', '#fff4c4'],
  burn: ['#ff6a00', 'rgba(255,220,80,0)'],
  blocks: 3,
  floor, stone, block, wall, item, bomb, player, monster,
};
