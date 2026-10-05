// west.js — «Дикий Захід»: курна земля з тріщинами, стовпи — червоні скелі з пластами (на всю клітинку), рамка — темніша
// скеля каньйону; блоки — предмети з тінню: бочки, ящики, тюки сіна; стіни — частокіл. Гравці — ковбої в капелюхах
// і жилетах кольору гравця; перекотиполе, гримуча змія, привид шерифа. Бомби — в'язки динаміту.
// Тло — захід сонця над столовими горами. Бонуси: 🧨 бомба, 🔥 вогонь, 🐎 швидкість (шпора), 🪶 прохід (перо),
// ⭐ стійкість (зірка шерифа), 🕹️ детонатор (підривна машинка).
import { DX, DY, IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, IT_REMOTE } from '../sim.js';
import { TAU, rr, rnd, luma, shade, circle, ellipse, line, poly, bombBeat, bombFlash, pillarShade, spark, ghostPath, flameShape } from './common.js';

const DUST = '#d8b384', DUST2 = '#d2ad7d', ROCK = '#b0532e', ROCK_HI = '#cf7046', ROCK_LO = '#7a3518';
const WOOD = '#9a6236', WOOD_D = '#6b3f1d', SKIN = '#e8b48a', TNT = '#d32f2f', BRASS = '#d9a441';

// Тло — захід сонця: смуги неба, сонце, столові гори й кактуси
function backdrop(g, W, H, dpr) {
  const bands = ['#2a1530', '#4a1f38', '#7a2c3a', '#b2473a', '#e0743a', '#f2a24a'];
  bands.forEach((c, k) => { g.fillStyle = c; g.fillRect(0, H * k / bands.length * 0.75, W, H * 0.75 / bands.length + 1); });
  circle(g, W * 0.72, H * 0.7, H * 0.12, '#ffd36a');
  g.fillStyle = '#3a1a14';
  g.beginPath(); g.moveTo(0, H * 0.78);
  for (const [x, y] of [[0.08, 0.78], [0.1, 0.6], [0.24, 0.6], [0.27, 0.78], [0.55, 0.78], [0.58, 0.66], [0.66, 0.66], [0.68, 0.78], [0.85, 0.78], [0.87, 0.56], [0.97, 0.56], [1, 0.7]]) g.lineTo(W * x, H * y);
  g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
  for (const [fx, fy, k] of [[0.825, 0.78, 6], [0.93, 0.97, 11]]) {   // кактуси — з боків, щоб у грі їх було видно
    const x = W * fx, y = H * fy, u = k * H / 900;
    g.fillStyle = fy > 0.8 ? '#190806' : '#2a120e';
    rr(g, x - u, y - u * 9, u * 2, u * 9, u); g.fill();
    rr(g, x - u * 4, y - u * 6, u * 1.6, u * 3.5, u * 0.8); g.fill(); g.fillRect(x - u * 4, y - u * 3.3, u * 4, u * 1.4);
    rr(g, x + u * 2.4, y - u * 7.5, u * 1.6, u * 3.5, u * 0.8); g.fill(); g.fillRect(x, y - u * 4.6, u * 4, u * 1.4);
  }
}

function floor(g, px, py, s, x, y, map) {
  const i = y * map.GW + x;
  g.fillStyle = (x + y) % 2 ? DUST : DUST2; g.fillRect(px, py, s, s);
  for (let j = 0; j < 4; j++) circle(g, px + s * rnd(i, 10 + j), py + s * rnd(i, 20 + j), Math.max(0.7, s * 0.02), 'rgba(120,80,40,0.35)');
  const r = rnd(i, 5);
  if (r < 0.12) {                                                   // тріщина
    g.strokeStyle = 'rgba(110,70,35,0.45)'; g.lineWidth = Math.max(1, s * 0.02); g.lineCap = 'round';
    g.beginPath(); g.moveTo(px + s * 0.2, py + s * 0.3); g.lineTo(px + s * 0.42, py + s * 0.45); g.lineTo(px + s * 0.38, py + s * 0.7);
    g.moveTo(px + s * 0.42, py + s * 0.45); g.lineTo(px + s * 0.66, py + s * 0.5); g.stroke();
  } else if (r < 0.2) {                                             // суха трава
    g.strokeStyle = 'rgba(150,120,50,0.8)'; g.lineWidth = Math.max(1, s * 0.02);
    g.beginPath(); for (const a of [-0.6, -0.2, 0.2, 0.6]) { g.moveTo(px + s * 0.7, py + s * 0.75); g.lineTo(px + s * (0.7 + Math.sin(a) * 0.12), py + s * (0.75 - Math.cos(a) * 0.14)); } g.stroke();
  } else if (r < 0.23) {                                            // череп бика
    ellipse(g, px + s * 0.35, py + s * 0.62, s * 0.06, s * 0.05, '#efe6d2');
    line(g, px + s * 0.3, py + s * 0.59, px + s * 0.22, py + s * 0.54, s * 0.025, '#efe6d2');
    line(g, px + s * 0.4, py + s * 0.59, px + s * 0.48, py + s * 0.54, s * 0.025, '#efe6d2');
  }
  pillarShade(g, map, x, y, px, py, s, 'rgba(100,50,20,0.25)');
}

// Рамка — темна скеля каньйону; стовп — червона скеля з пластами на всю клітинку
function stone(g, x, y, s, border, cx, cy, map) {
  const i = cy * map.GW + cx, d = Math.max(1, Math.round(s * 0.08));
  const [base, hi, lo] = border ? ['#7a3a22', '#94492b', '#4e2312'] : [ROCK, ROCK_HI, ROCK_LO];
  g.fillStyle = lo; g.fillRect(x, y, s, s);
  g.fillStyle = hi; g.fillRect(x, y, s - d, s - d);
  g.fillStyle = base; g.fillRect(x + d, y + d, s - 2 * d, s - 2 * d);
  g.fillStyle = 'rgba(0,0,0,0.14)';                                  // пласти
  for (let j = 0; j < 3; j++) {
    const yy = y + s * (0.28 + j * 0.24 + (rnd(i, j) - 0.5) * 0.06);
    g.fillRect(x + d, yy, s - 2 * d, Math.max(1, s * 0.05));
  }
  g.fillStyle = 'rgba(255,200,150,0.14)';
  for (let j = 0; j < 3; j++) g.fillRect(x + d, y + s * (0.22 + j * 0.24), s - 2 * d, Math.max(1, s * 0.025));
  if (!border && rnd(i, 7) < 0.3) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(x + s * 0.65, y + s * 0.4, s * 0.08, s * 0.05, 0, 0, TAU); g.fill(); }
}

// Блоки: 0 — бочка, 1 — ящик, 2 — тюк сіна
function block(g, s, v) {
  ellipse(g, s / 2, s * 0.88, s * 0.36, s * 0.09, 'rgba(100,50,20,0.35)');
  if (v === 0) {
    g.fillStyle = WOOD;
    g.beginPath(); g.moveTo(s * 0.22, s * 0.14); g.quadraticCurveTo(s * 0.12, s * 0.5, s * 0.22, s * 0.86); g.lineTo(s * 0.78, s * 0.86);
    g.quadraticCurveTo(s * 0.88, s * 0.5, s * 0.78, s * 0.14); g.closePath(); g.fill();
    g.strokeStyle = WOOD_D; g.lineWidth = Math.max(1, s * 0.02);
    for (const fx of [0.36, 0.5, 0.64]) { g.beginPath(); g.moveTo(s * fx, s * 0.14); g.quadraticCurveTo(s * (fx + (fx - 0.5) * 0.3), s * 0.5, s * fx, s * 0.86); g.stroke(); }
    g.fillStyle = '#4a4a52';
    for (const fy of [0.24, 0.74]) g.fillRect(s * 0.17, s * fy, s * 0.66, s * 0.07);
    ellipse(g, s / 2, s * 0.14, s * 0.28, s * 0.06, '#b07a46');
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(s * 0.28, s * 0.2, s * 0.05, s * 0.6);
    return;
  }
  if (v === 1) {
    g.fillStyle = '#c08a52'; g.fillRect(s * 0.14, s * 0.18, s * 0.72, s * 0.68);
    g.strokeStyle = '#7a5028'; g.lineWidth = Math.max(1, s * 0.06);
    g.strokeRect(s * 0.17, s * 0.21, s * 0.66, s * 0.62);
    g.beginPath(); g.moveTo(s * 0.17, s * 0.21); g.lineTo(s * 0.83, s * 0.83); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let j = 1; j < 4; j++) g.fillRect(s * 0.14, s * (0.18 + j * 0.17), s * 0.72, Math.max(1, s * 0.015));
    g.fillStyle = TNT; g.font = `bold ${Math.round(s * 0.16)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('XXX', s * 0.5, s * 0.6);
    return;
  }
  g.fillStyle = '#e0bd5c'; rr(g, s * 0.1, s * 0.3, s * 0.8, s * 0.56, s * 0.06); g.fill();
  g.fillStyle = '#ecd07a'; g.fillRect(s * 0.1, s * 0.3, s * 0.8, s * 0.1);
  g.strokeStyle = '#b8932e'; g.lineWidth = Math.max(1, s * 0.02); g.lineCap = 'round';
  g.beginPath();
  for (let j = 0; j < 12; j++) { const x = s * (0.14 + rnd(j, 8) * 0.72), y = s * (0.42 + rnd(j, 9) * 0.38); g.moveTo(x, y); g.lineTo(x + s * 0.08, y + (rnd(j, 10) - 0.5) * s * 0.06); }
  g.stroke();
  for (const fx of [0.32, 0.68]) line(g, s * fx, s * 0.3, s * fx, s * 0.86, s * 0.035, '#7a5028', 'butt');
}

// Стіна — частокіл із загострених колод
function wall(g, s) {
  g.fillStyle = '#3a2414'; g.fillRect(0, 0, s, s);
  for (let j = 0; j < 4; j++) {
    const x = s * (0.01 + j * 0.25), w = s * 0.23;
    g.fillStyle = '#8a5a33';
    g.beginPath(); g.moveTo(x, s); g.lineTo(x, s * 0.16); g.lineTo(x + w / 2, 0); g.lineTo(x + w, s * 0.16); g.lineTo(x + w, s); g.closePath(); g.fill();
    g.fillStyle = '#a8703f'; g.fillRect(x + w * 0.15, s * 0.16, w * 0.2, s * 0.84);
  }
  for (const fy of [0.32, 0.72]) { g.fillStyle = '#5a3a1f'; g.fillRect(0, s * fy, s, s * 0.07); }
}

// Бонуси — без рамки, лише тінь на землі
function item(g, k, s) {
  const cx = s / 2, cy = s / 2 + s * 0.03;
  ellipse(g, cx, s * 0.84, s * 0.26, s * 0.07, 'rgba(100,50,20,0.35)');
  if (k === IT_BOMB) dynamite(g, cx, cy + s * 0.02, s * 0.7, false);
  else if (k === IT_FIRE) { flameShape(g, cx, cy, s * 0.24, '#e8401c'); flameShape(g, cx, cy + s * 0.06, s * 0.14, '#ffc23d'); }
  else if (k === IT_SPEED) {                                         // шпора
    g.strokeStyle = '#8a8f9a'; g.lineWidth = s * 0.05; g.lineCap = 'round';
    g.beginPath(); g.arc(cx - s * 0.06, cy, s * 0.14, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
    line(g, cx - s * 0.06, cy, cx + s * 0.12, cy, s * 0.04, '#8a8f9a');
    g.fillStyle = BRASS; g.beginPath();
    for (let j = 0; j < 16; j++) { const a = j * TAU / 16, r = s * (j % 2 ? 0.05 : 0.12); j ? g.lineTo(cx + s * 0.16 + Math.cos(a) * r, cy + Math.sin(a) * r) : g.moveTo(cx + s * 0.16 + Math.cos(a) * r, cy + Math.sin(a) * r); }
    g.closePath(); g.fill();
  } else if (k === IT_PASS) {                                        // перо
    g.save(); g.translate(cx, cy); g.rotate(-0.7);
    ellipse(g, 0, 0, s * 0.08, s * 0.26, '#f4f4f4');
    g.fillStyle = '#d32f2f'; g.beginPath(); g.ellipse(0, -s * 0.12, s * 0.08, s * 0.1, 0, Math.PI, TAU); g.fill();
    line(g, 0, -s * 0.24, 0, s * 0.3, s * 0.02, '#6b4a2a');
    g.restore();
  } else if (k === IT_RESIST) star(g, cx, cy, s * 0.24, BRASS);
  else if (k === IT_REMOTE) {                                      // підривна машинка
    g.fillStyle = '#7a4a24'; g.fillRect(cx - s * 0.18, cy - s * 0.02, s * 0.36, s * 0.26);
    g.fillStyle = TNT; g.font = `bold ${Math.round(s * 0.11)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('TNT', cx, cy + s * 0.12);
    line(g, cx, cy - s * 0.02, cx, cy - s * 0.2, s * 0.04, '#6b6b70');
    line(g, cx - s * 0.13, cy - s * 0.22, cx + s * 0.13, cy - s * 0.22, s * 0.05, '#2a2a2a');
  }
}
function star(g, cx, cy, r, color) {
  g.fillStyle = color;
  g.beginPath();
  for (let j = 0; j < 10; j++) { const a = -Math.PI / 2 + j * TAU / 10, rr2 = j % 2 ? r * 0.45 : r; j ? g.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2) : g.moveTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); }
  g.closePath(); g.fill();
  for (let j = 0; j < 5; j++) { const a = -Math.PI / 2 + j * TAU / 5; circle(g, cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.13, color); }
  circle(g, cx, cy, r * 0.25, shade(color, -0.25));
}

// В'язка динаміту: три червоні шашки, мотузка, ґніт
function dynamite(g, cx, cy, s, red) {
  for (const dx of [-1, 0, 1]) {
    g.fillStyle = red ? '#ff5a3a' : TNT; rr(g, cx + dx * s * 0.13 - s * 0.065, cy - s * 0.2, s * 0.13, s * 0.42, s * 0.04); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(cx + dx * s * 0.13 - s * 0.04, cy - s * 0.18, s * 0.025, s * 0.38);
    ellipse(g, cx + dx * s * 0.13, cy - s * 0.2, s * 0.065, s * 0.02, '#f0c8a0');
  }
  g.fillStyle = '#5a3a1f'; g.fillRect(cx - s * 0.2, cy - s * 0.02, s * 0.4, s * 0.05);
  g.strokeStyle = '#3a3a3a'; g.lineWidth = Math.max(1, s * 0.025); g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx, cy - s * 0.2); g.quadraticCurveTo(cx + s * 0.06, cy - s * 0.34, cx + s * 0.16, cy - s * 0.32); g.stroke();
}
function bomb(g, x, y, s, k, T) {
  const sc = 1 + bombBeat(k, T) * 1.5, cx = x + s / 2, cy = y + s * 0.56;
  ellipse(g, cx, y + s * 0.86, s * 0.28, s * 0.08, 'rgba(100,50,20,0.35)');
  dynamite(g, cx, cy, s * 0.95 * sc, bombFlash(k, T));
  spark(g, cx + s * 0.16 * sc, cy - s * 0.31 * sc, s);
}

// Ковбой: капелюх і жилет кольору гравця, сорочка, хустка, джинси, чоботи
function player(g, p, s, T, { col, walk, bob, dead }) {
  const dark = shade(col, -0.35);
  for (const [sx, w] of [[-1, walk], [1, -walk]]) {
    line(g, sx * s * 0.09, s * 0.2, sx * s * 0.1, s * 0.34 + w * s * 0.05, s * 0.1, '#3a5a8a');
    g.fillStyle = '#5a3418'; rr(g, sx * s * 0.1 - s * 0.07, s * 0.33 + w * s * 0.05, s * 0.14, s * 0.08, s * 0.03); g.fill();
  }
  g.fillStyle = '#e8d8b0'; rr(g, -s * 0.18, -s * 0.05 - bob, s * 0.36, s * 0.28, s * 0.08); g.fill();   // сорочка
  g.fillStyle = col;                                                 // жилет
  g.fillRect(-s * 0.18, -s * 0.04 - bob, s * 0.12, s * 0.26); g.fillRect(s * 0.06, -s * 0.04 - bob, s * 0.12, s * 0.26);
  g.strokeStyle = luma(col) > 0.8 ? 'rgba(0,0,0,0.3)' : dark; g.lineWidth = Math.max(1, s * 0.015);
  g.strokeRect(-s * 0.18, -s * 0.04 - bob, s * 0.12, s * 0.26); g.strokeRect(s * 0.06, -s * 0.04 - bob, s * 0.12, s * 0.26);
  g.fillStyle = '#5a3418'; g.fillRect(-s * 0.18, s * 0.17 - bob, s * 0.36, s * 0.04);
  g.fillStyle = BRASS; g.fillRect(-s * 0.03, s * 0.165 - bob, s * 0.06, s * 0.05);
  for (const sx of [-1, 1]) {
    line(g, sx * s * 0.2, 0 - bob, sx * s * 0.26, s * 0.12 - bob - sx * walk * s * 0.04, s * 0.07, '#e8d8b0');
    circle(g, sx * s * 0.26, s * 0.14 - bob - sx * walk * s * 0.04, s * 0.04, SKIN);
  }
  const hy = -s * 0.18 - bob;
  circle(g, 0, hy, s * 0.16, SKIN);
  if (p.dr !== 1) poly(g, [[-s * 0.13, hy + s * 0.1], [s * 0.13, hy + s * 0.1], [0, hy + s * 0.22]], '#c62828');   // хустка
  ellipse(g, 0, hy - s * 0.1, s * 0.3, s * 0.07, dark);              // поля капелюха
  g.fillStyle = col;
  g.beginPath(); g.moveTo(-s * 0.15, hy - s * 0.1); g.quadraticCurveTo(-s * 0.16, hy - s * 0.32, -s * 0.04, hy - s * 0.3);
  g.lineTo(0, hy - s * 0.26); g.lineTo(s * 0.04, hy - s * 0.3); g.quadraticCurveTo(s * 0.16, hy - s * 0.32, s * 0.15, hy - s * 0.1); g.closePath(); g.fill();
  g.fillStyle = dark; g.fillRect(-s * 0.15, hy - s * 0.15, s * 0.3, s * 0.04);
  if (p.dr === 1) return;
  const fx = (DX[p.dr] || 0) * s * 0.05, fy = p.dr === 3 || !p.dr ? s * 0.015 : 0;
  if (dead) {
    g.strokeStyle = '#2a1a10'; g.lineWidth = Math.max(1, s * 0.022);
    for (const ex of [-0.06, 0.06]) {
      const ox = ex * s + fx, oy = hy + fy, e = s * 0.025;
      g.beginPath(); g.moveTo(ox - e, oy - e); g.lineTo(ox + e, oy + e); g.moveTo(ox + e, oy - e); g.lineTo(ox - e, oy + e); g.stroke();
    }
  } else for (const ex of [-0.06, 0.06]) circle(g, ex * s + fx, hy + fy, s * 0.024, '#2a1a10');
  line(g, fx - s * 0.06, hy + s * 0.06 + fy, fx + s * 0.06, hy + s * 0.06 + fy, s * 0.03, '#6b3f1d');   // вуса
}

// Монстри: 0 — перекотиполе (котиться), 1 — гримуча змія (головою за рухом), 2 — привид шерифа
function monster(g, m, s, T, wob) {
  if (m.k === 0) {
    g.save(); g.rotate(T / 160 * ((DX[m.d] || DY[m.d] || 1)));
    g.strokeStyle = '#a07a3a'; g.lineWidth = Math.max(1, s * 0.03); g.lineCap = 'round';
    g.beginPath();
    for (let j = 0; j < 14; j++) { const a = j * 2.4 + m.i, r1 = s * 0.08, r2 = s * 0.32; g.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); g.quadraticCurveTo(Math.cos(a + 1) * r2, Math.sin(a + 1) * r2, Math.cos(a + 2) * r2 * 0.9, Math.sin(a + 2) * r2 * 0.9); }
    g.stroke();
    g.strokeStyle = '#7a5a2a';
    g.beginPath(); g.arc(0, 0, s * 0.3, 0, TAU); g.stroke();
    g.restore();
    for (const sx of [-1, 1]) { circle(g, sx * s * 0.08, -s * 0.04, s * 0.05, '#fff'); circle(g, sx * s * 0.08 + (DX[m.d] || 0) * s * 0.02, -s * 0.04, s * 0.025, '#111'); }
    return;
  }
  if (m.k === 1) {
    const a = Math.atan2(DY[m.d] || 0, DX[m.d] || 1);
    g.save(); g.rotate(a);
    g.strokeStyle = '#8a7a3a'; g.lineWidth = s * 0.14; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(-s * 0.36, 0);
    for (let j = 0; j <= 6; j++) g.lineTo(-s * 0.36 + j * s * 0.09, Math.sin(T / 90 + j * 1.1 + m.i) * s * 0.1);
    g.stroke();
    g.strokeStyle = '#5a4a1a'; g.lineWidth = s * 0.05; g.setLineDash([s * 0.05, s * 0.06]); g.stroke(); g.setLineDash([]);
    for (let j = 0; j < 3; j++) ellipse(g, -s * (0.4 + j * 0.05), 0, s * 0.03, s * 0.045, '#d9c39a');   // брязкальце
    ellipse(g, s * 0.24, Math.sin(T / 90 + 6.6 + m.i) * s * 0.1, s * 0.12, s * 0.09, '#9a8a40');
    const hy = Math.sin(T / 90 + 6.6 + m.i) * s * 0.1;
    for (const sy of [-1, 1]) { circle(g, s * 0.28, hy + sy * s * 0.045, s * 0.022, '#ffd23f'); circle(g, s * 0.29, hy + sy * s * 0.045, s * 0.01, '#111'); }
    if (Math.floor(T / 300 + m.i) % 2) { line(g, s * 0.36, hy, s * 0.44, hy, s * 0.015, '#d32f2f'); line(g, s * 0.44, hy, s * 0.48, hy - s * 0.02, s * 0.012, '#d32f2f'); line(g, s * 0.44, hy, s * 0.48, hy + s * 0.02, s * 0.012, '#d32f2f'); }
    g.restore();
    return;
  }
  g.fillStyle = '#eef2ff'; ghostPath(g, s, wob, 0.28); g.fill();
  ellipse(g, 0, -s * 0.33, s * 0.3, s * 0.06, '#3a3a44');            // капелюх
  g.fillStyle = '#3a3a44'; rr(g, -s * 0.15, -s * 0.48, s * 0.3, s * 0.16, s * 0.05); g.fill();
  star(g, s * 0.1, s * 0.08, s * 0.07, BRASS);
  const ex = (DX[m.d] || 0) * s * 0.04;
  for (const sx of [-1, 1]) ellipse(g, sx * s * 0.09 + ex, -s * 0.12, s * 0.04, s * 0.06, '#1d1d2a');
}

export default {
  name: 'Дикий Захід',
  bg: '#2a1530',
  backdrop,
  shadow: 'rgba(40,10,0,0.55)',
  emoji: { bomb: '🧨', fire: '🔥', speed: '🐎', pass: '🪶', resist: '⭐', remote: '🕹️' },
  fire: ['#d9381e', '#ff8c1a', '#ffe6a0'],
  burn: ['#ff6a00', 'rgba(255,220,80,0)'],
  blocks: 3,
  floor, stone, block, wall, item, bomb, player, monster,
};
