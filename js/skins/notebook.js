// notebook.js — «Зошит»: аркуш у клітинку на дерев'яному столі, усе намальоване ручкою й олівцем і трохи «тремтить»
// (лінії перемальовуються кожні BOIL мс). Стовпи — заштриховані олівцем квадрати (на всю клітинку, як частина аркуша),
// рамка — синя обкладинка зі спіраллю зверху; блоки — предмети з тінню: ящик, накреслений ручкою, зім'ятий папірець,
// жовтий стікер; стіни — чорний маркер. Гравці — чоловічки з кружечком-головою і футболкою кольору гравця;
// клякса, паперовий літачок, гумка-привид. Вогонь — маркери-виділювачі.
// Бонуси: 💣 бомба, 🔥 вогонь, ✈️ швидкість, 👻 прохід, 🛡️ стійкість, 📡 детонатор.
import { DX, DY, IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, IT_REMOTE } from '../sim.js';
import { TAU, rr, rnd, luma, shade, circle, ellipse, line, poly, bombBeat, bombFlash, spark, remoteIcon } from './common.js';

const PAPER = '#fbfaf3', GRID = 'rgba(96,150,214,0.35)', MARGIN = 'rgba(226,92,104,0.55)';
const INK = '#2a4fa8', PENCIL = '#55585f', DARK = '#23252c';
const BOIL = 140;                    // «тремтіння» ліній: нова фаза кожні стільки мс

// Тремтлива лінія: від (x1, y1) до (x2, y2) з легким вигином (seed — стала фаза)
function sketch(g, x1, y1, x2, y2, w, color, seed) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, len = Math.hypot(x2 - x1, y2 - y1);
  const k = (rnd(seed, 7) - 0.5) * len * 0.08;
  g.strokeStyle = color; g.lineWidth = Math.max(1, w); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x1, y1);
  g.quadraticCurveTo(mx - (y2 - y1) / len * k, my + (x2 - x1) / len * k, x2, y2);
  g.stroke();
}
// Тремтливий контур прямокутника (чотири лінії з перехльостом, як рукою)
function sketchRect(g, x, y, w, h, lw, color, seed) {
  const o = lw * 0.8;
  sketch(g, x - o, y, x + w + o, y + (rnd(seed, 1) - 0.5) * lw, lw, color, seed + 1);
  sketch(g, x + w, y - o, x + w + (rnd(seed, 2) - 0.5) * lw, y + h + o, lw, color, seed + 2);
  sketch(g, x + w + o, y + h, x - o, y + h + (rnd(seed, 3) - 0.5) * lw, lw, color, seed + 3);
  sketch(g, x, y + h + o, x + (rnd(seed, 4) - 0.5) * lw, y - o, lw, color, seed + 4);
}
// Тремтливе коло
function sketchCircle(g, cx, cy, r, lw, color, seed) {
  g.strokeStyle = color; g.lineWidth = Math.max(1, lw); g.lineCap = 'round';
  g.beginPath();
  for (let j = 0; j <= 14; j++) {
    const a = j / 12 * TAU + rnd(seed, 0) * TAU, rr2 = r * (1 + (rnd(seed, j % 12 + 1) - 0.5) * 0.08);
    const X = cx + Math.cos(a) * rr2, Y = cy + Math.sin(a) * rr2;
    j ? g.lineTo(X, Y) : g.moveTo(X, Y);
  }
  g.stroke();
}
const phase = (T, i = 0) => Math.floor(T / BOIL) * 7 + i * 13;

// Шкільне приладдя на столі — у координатах від центру предмета, лежить уздовж x; L — довжина
const shadowOf = (g, L, h) => { g.fillStyle = 'rgba(25,12,4,0.35)'; rr(g, -L / 2 + h * 0.15, -h / 2 + h * 0.35, L, h, h * 0.4); g.fill(); };
function pencil(g, L, body = '#f2c230') {
  const h = L * 0.075;
  shadowOf(g, L, h);
  g.fillStyle = body; g.fillRect(-L / 2 + h * 1.2, -h / 2, L * 0.78, h);
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(-L / 2 + h * 1.2, h * 0.12, L * 0.78, h * 0.38);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-L / 2 + h * 1.2, -h * 0.4, L * 0.78, h * 0.15);
  g.fillStyle = '#b7b9bf'; g.fillRect(-L / 2 + h * 0.4, -h / 2, h * 0.85, h);                     // обойма
  g.fillStyle = '#ef8fa0'; rr(g, -L / 2, -h / 2, h * 0.6, h, h * 0.2); g.fill();                    // гумка
  const tx = -L / 2 + h * 1.2 + L * 0.78;
  poly(g, [[tx, -h / 2], [L / 2, 0], [tx, h / 2]], '#e8c99a');                                        // заточка
  poly(g, [[L / 2 - h * 0.7, -h * 0.18], [L / 2, 0], [L / 2 - h * 0.7, h * 0.18]], DARK);
}
function pen(g, L) {
  const h = L * 0.07;
  shadowOf(g, L, h);
  g.fillStyle = '#e9eef6'; rr(g, -L / 2, -h / 2, L * 0.86, h, h * 0.45); g.fill();
  g.fillStyle = 'rgba(42,79,168,0.25)'; g.fillRect(-L / 2 + h, -h * 0.15, L * 0.6, h * 0.3);           // стрижень
  g.fillStyle = INK; rr(g, -L / 2, -h * 0.55, L * 0.22, h * 1.1, h * 0.45); g.fill();                  // ковпачок
  g.fillRect(-L / 2 + L * 0.08, -h * 0.8, L * 0.16, h * 0.22);                                        // кліпса
  poly(g, [[L * 0.36, -h * 0.42], [L / 2, 0], [L * 0.36, h * 0.42]], '#cfd6e2');
  circle(g, L / 2 - h * 0.1, 0, h * 0.12, INK);
}
function ruler(g, L) {
  const h = L * 0.13;
  shadowOf(g, L, h);
  g.fillStyle = 'rgba(190,230,255,0.75)'; g.fillRect(-L / 2, -h / 2, L, h);
  g.strokeStyle = 'rgba(40,70,110,0.7)'; g.lineWidth = Math.max(1, L * 0.004);
  g.beginPath();
  for (let k = 0; k <= 30; k++) { const x = -L / 2 + L * 0.03 + k * L * 0.0313; g.moveTo(x, -h / 2); g.lineTo(x, -h / 2 + h * (k % 5 ? 0.22 : 0.42)); }
  g.stroke();
  g.strokeRect(-L / 2, -h / 2, L, h);
}
function eraser(g, L) {
  const h = L * 0.5;
  shadowOf(g, L, h);
  g.fillStyle = '#f7f3ea'; rr(g, -L / 2, -h / 2, L, h, h * 0.15); g.fill();
  g.fillStyle = '#4f7fd1'; rr(g, L * 0.05, -h / 2, L * 0.45, h, h * 0.15); g.fill(); g.fillRect(L * 0.05, -h / 2, L * 0.2, h);
  g.fillStyle = '#e25c68'; g.fillRect(-L * 0.05, -h / 2, L * 0.1, h);
}
function sharpener(g, L) {
  const h = L * 0.7;
  shadowOf(g, L, h);
  g.fillStyle = '#d84a4a'; rr(g, -L / 2, -h / 2, L, h, h * 0.12); g.fill();
  g.fillStyle = '#a9adb6'; g.fillRect(-L * 0.1, -h / 2, L * 0.35, h);
  circle(g, -L * 0.25, 0, h * 0.2, '#5a1f1f');
}
function clip(g, L) {
  g.strokeStyle = '#c9ced8'; g.lineWidth = Math.max(1, L * 0.05); g.lineCap = 'round';
  const h = L * 0.3;
  g.beginPath();
  g.moveTo(L * 0.3, h * 0.25); g.lineTo(-L * 0.35, h * 0.25); g.arc(-L * 0.35, 0, h * 0.25, Math.PI / 2, -Math.PI / 2);
  g.lineTo(L * 0.4, -h * 0.25); g.arc(L * 0.4, 0, h * 0.25, -Math.PI / 2, Math.PI / 2);
  g.moveTo(L * 0.4, h * 0.25); g.lineTo(-L * 0.2, h * 0.25);
  g.stroke();
}

// Тло — дерев'яний стіл і шкільне приладдя
function backdrop(g, W, H, dpr) {
  const step = 9 * dpr;
  for (let y = 0, r = 0; y < H; y += step, r++) {
    g.strokeStyle = r % 3 ? 'rgba(60,35,15,0.18)' : 'rgba(255,220,170,0.06)';
    g.lineWidth = (r % 5 ? 1 : 2) * dpr;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= W; x += 40 * dpr) g.lineTo(x, y + Math.sin(x / (90 * dpr) + r * 0.7) * 3 * dpr);
    g.stroke();
  }
  const u = H / 900;
  for (const [fn, fx, fy, L, rot] of [
    [pencil, 0.07, 0.2, 230, 1.35], [pen, 0.1, 0.55, 200, -1.75], [eraser, 0.06, 0.78, 60, 0.4], [clip, 0.03, 0.42, 50, 0.9],
    [ruler, 0.94, 0.5, 330, 1.62], [(g, L) => pencil(g, L, '#4caf6a'), 0.905, 0.14, 190, 2.2], [sharpener, 0.9, 0.86, 46, -0.3], [clip, 0.97, 0.9, 44, -0.6],
  ]) {
    g.save(); g.translate(W * fx, H * fy); g.rotate(rot); fn(g, L * u); g.restore();
  }
}

// Аркуш у клітинку: клітинка поля — 2×2 клітинки зошита; поле на лівому краї — червона лінія
function floor(g, px, py, s, x, y, map) {
  g.fillStyle = PAPER; g.fillRect(px, py, s, s);
  g.strokeStyle = GRID; g.lineWidth = Math.max(1, s * 0.02);
  g.beginPath();
  for (const f of [0, 0.5]) { g.moveTo(px + s * f, py); g.lineTo(px + s * f, py + s); g.moveTo(px, py + s * f); g.lineTo(px + s, py + s * f); }
  g.stroke();
  if (x === 1) { g.fillStyle = MARGIN; g.fillRect(px + s * 0.08, py, Math.max(1, s * 0.03), s); }
  const i = y * map.GW + x, r = rnd(i, 21);
  if (r < 0.05) {                                                    // дрібні каракулі на полях
    g.save(); g.globalAlpha = 0.35;
    sketchCircle(g, px + s * 0.7, py + s * 0.3, s * 0.08, s * 0.025, INK, i);
    g.restore();
  } else if (r < 0.09) {
    g.save(); g.globalAlpha = 0.3;
    for (let j = 0; j < 3; j++) sketch(g, px + s * 0.2, py + s * (0.6 + j * 0.08), px + s * (0.5 + rnd(i, j) * 0.2), py + s * (0.6 + j * 0.08), s * 0.02, PENCIL, i + j);
    g.restore();
  }
  // тінь від стовпа зверху й ліворуч — олівцем
  g.fillStyle = 'rgba(70,72,82,0.13)';
  if (map.cell[i - map.GW] === 1) g.fillRect(px, py, s, s * 0.14);
  if (map.cell[i - 1] === 1) g.fillRect(px, py, s * 0.1, s);
}

// Рамка — синя обкладинка (зверху — кільця спіралі); стовп — заштрихований олівцем квадрат на всю клітинку
function stone(g, x, y, s, border, cx, cy, map) {
  const i = cy * map.GW + cx;
  if (border) {
    g.fillStyle = (cx + cy) % 2 ? '#2b3d6b' : '#2e4171'; g.fillRect(x, y, s, s);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let j = 0; j < 4; j++) g.fillRect(x, y + s * (0.1 + j * 0.25), s, Math.max(1, s * 0.03));
    if (cy === 0 && cx > 0 && cx < map.GW - 1) {                    // спіраль
      g.strokeStyle = '#c9ced8'; g.lineWidth = Math.max(1.5, s * 0.08); g.lineCap = 'round';
      for (const fx of [0.3, 0.7]) {
        circle(g, x + s * fx, y + s * 0.8, s * 0.07, '#141a2c');
        g.beginPath(); g.ellipse(x + s * fx, y + s * 0.55, s * 0.09, s * 0.28, 0, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
      }
    }
    return;
  }
  g.fillStyle = PAPER; g.fillRect(x, y, s, s);
  g.fillStyle = '#9a9da6'; g.fillRect(x + s * 0.04, y + s * 0.04, s * 0.92, s * 0.92);
  g.save();
  g.beginPath(); g.rect(x + s * 0.04, y + s * 0.04, s * 0.92, s * 0.92); g.clip();
  g.strokeStyle = 'rgba(40,42,50,0.45)'; g.lineWidth = Math.max(1, s * 0.035);
  g.beginPath();
  for (let k = -1; k <= 10; k++) { const o = k * s * 0.11 + rnd(i, k + 3) * s * 0.03; g.moveTo(x + o, y + s); g.lineTo(x + o + s, y); }
  g.stroke();
  g.strokeStyle = 'rgba(40,42,50,0.25)';
  g.beginPath();
  for (let k = -1; k <= 6; k++) { const o = k * s * 0.19; g.moveTo(x + o, y); g.lineTo(x + o + s, y + s); }
  g.stroke();
  g.restore();
  sketchRect(g, x + s * 0.04, y + s * 0.04, s * 0.92, s * 0.92, s * 0.06, DARK, i);
}

// Блоки: 0 — ящик, накреслений ручкою, 1 — зім'ятий папірець, 2 — жовтий стікер
function block(g, s, v) {
  ellipse(g, s * 0.52, s * 0.88, s * 0.38, s * 0.08, 'rgba(60,60,80,0.18)');
  if (v === 0) {
    g.fillStyle = '#dbe7fb'; g.fillRect(s * 0.12, s * 0.12, s * 0.76, s * 0.74);
    g.fillStyle = 'rgba(42,79,168,0.12)';
    for (let j = 0; j < 3; j++) g.fillRect(s * 0.12, s * (0.12 + j * 0.25), s * 0.76, s * 0.12);
    sketchRect(g, s * 0.12, s * 0.12, s * 0.76, s * 0.74, s * 0.055, INK, 3);
    sketch(g, s * 0.14, s * 0.14, s * 0.86, s * 0.84, s * 0.045, INK, 9);
    sketch(g, s * 0.86, s * 0.14, s * 0.14, s * 0.84, s * 0.045, INK, 11);
    sketchRect(g, s * 0.22, s * 0.22, s * 0.56, s * 0.54, s * 0.03, INK, 15);
    return;
  }
  if (v === 1) {
    g.fillStyle = '#f2f0e6';
    g.beginPath();
    for (let j = 0; j < 11; j++) {
      const a = j / 11 * TAU, r = s * (0.33 + (rnd(j, 5) - 0.5) * 0.1);
      j ? g.lineTo(s / 2 + Math.cos(a) * r, s * 0.52 + Math.sin(a) * r) : g.moveTo(s / 2 + Math.cos(a) * r, s * 0.52 + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    g.strokeStyle = PENCIL; g.lineWidth = Math.max(1, s * 0.035); g.stroke();
    g.strokeStyle = 'rgba(85,88,95,0.55)'; g.lineWidth = Math.max(1, s * 0.022);
    g.beginPath();
    for (const [a, b, c, d] of [[0.3, 0.35, 0.55, 0.5], [0.55, 0.5, 0.72, 0.38], [0.55, 0.5, 0.5, 0.75], [0.35, 0.65, 0.5, 0.75], [0.62, 0.62, 0.76, 0.66]]) {
      g.moveTo(s * a, s * b); g.lineTo(s * c, s * d);
    }
    g.stroke();
    g.fillStyle = 'rgba(60,60,80,0.1)';
    g.beginPath(); g.ellipse(s * 0.58, s * 0.62, s * 0.22, s * 0.18, 0.5, 0, TAU); g.fill();
    return;
  }
  g.save(); g.translate(s / 2, s / 2); g.rotate(-0.08);
  g.fillStyle = '#ffe769'; g.fillRect(-s * 0.36, -s * 0.36, s * 0.72, s * 0.72);
  g.fillStyle = '#ffd83d'; g.fillRect(-s * 0.36, -s * 0.36, s * 0.72, s * 0.12);
  poly(g, [[s * 0.36, s * 0.16], [s * 0.36, s * 0.36], [s * 0.16, s * 0.36]], '#e8c22e');
  poly(g, [[s * 0.36, s * 0.16], [s * 0.16, s * 0.16], [s * 0.16, s * 0.36]], '#fff3a8');
  for (let j = 0; j < 3; j++) sketch(g, -s * 0.24, -s * (0.1 - j * 0.12), s * (0.06 + rnd(j, 2) * 0.16), -s * (0.1 - j * 0.12), s * 0.03, INK, 30 + j);
  g.restore();
}

// Стіна — замальовано чорним маркером, червоний «хрест»
function wall(g, s) {
  g.fillStyle = PAPER; g.fillRect(0, 0, s, s);
  g.fillStyle = DARK; g.fillRect(s * 0.03, s * 0.03, s * 0.94, s * 0.94);
  g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = Math.max(1, s * 0.05);
  g.beginPath();
  for (let j = 0; j < 6; j++) { g.moveTo(s * 0.08, s * (0.12 + j * 0.15)); g.lineTo(s * 0.92, s * (0.1 + j * 0.15 + 0.04)); }
  g.stroke();
  sketch(g, s * 0.2, s * 0.2, s * 0.8, s * 0.8, s * 0.09, '#e0353b', 2);
  sketch(g, s * 0.8, s * 0.2, s * 0.2, s * 0.8, s * 0.09, '#e0353b', 5);
}

// Бонуси — кольоровий стікер з піктограмою ручкою
const NOTE = { [IT_BOMB]: '#9fd3ff', [IT_FIRE]: '#ffb38a', [IT_SPEED]: '#c7f29b', [IT_PASS]: '#d7c2ff', [IT_RESIST]: '#ffe17a', [IT_REMOTE]: '#ffb3d1' };
function item(g, k, s) {
  const cx = s / 2, cy = s / 2;
  g.fillStyle = 'rgba(60,60,80,0.2)'; g.fillRect(s * 0.14, s * 0.16, s * 0.76, s * 0.76);
  g.fillStyle = NOTE[k]; g.fillRect(s * 0.1, s * 0.1, s * 0.76, s * 0.76);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(s * 0.1, s * 0.1, s * 0.76, s * 0.1);
  sketchRect(g, s * 0.1, s * 0.1, s * 0.76, s * 0.76, s * 0.025, 'rgba(42,79,168,0.6)', k);
  const lw = s * 0.045, x = cx - s * 0.02, y = cy - s * 0.02;
  if (k === IT_BOMB) inkBomb(g, x, y + s * 0.04, s * 0.17, 0);
  else if (k === IT_FIRE) {
    g.fillStyle = '#ff7a1a';
    g.beginPath(); g.moveTo(x, y - s * 0.26); g.bezierCurveTo(x + s * 0.24, y - s * 0.02, x + s * 0.2, y + s * 0.24, x, y + s * 0.24);
    g.bezierCurveTo(x - s * 0.2, y + s * 0.24, x - s * 0.24, y - s * 0.02, x, y - s * 0.26); g.fill();
    g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
    ellipse(g, x, y + s * 0.1, s * 0.07, s * 0.11, '#ffe066');
  } else if (k === IT_SPEED) {                                       // паперовий літачок
    poly(g, [[x - s * 0.28, y + s * 0.02], [x + s * 0.28, y - s * 0.2], [x - s * 0.04, y + s * 0.24]], '#fff');
    poly(g, [[x - s * 0.04, y + s * 0.06], [x + s * 0.28, y - s * 0.2], [x - s * 0.04, y + s * 0.24]], '#dfe5ee');
    g.strokeStyle = INK; g.lineWidth = lw * 0.8; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(x - s * 0.28, y + s * 0.02); g.lineTo(x + s * 0.28, y - s * 0.2); g.lineTo(x - s * 0.04, y + s * 0.24); g.closePath();
    g.moveTo(x - s * 0.04, y + s * 0.06); g.lineTo(x + s * 0.28, y - s * 0.2); g.stroke();
    for (let j = 0; j < 3; j++) sketch(g, x - s * 0.36, y + s * (0.1 + j * 0.06), x - s * 0.24, y + s * (0.1 + j * 0.06), lw * 0.6, INK, j);
  } else if (k === IT_PASS) {
    g.save(); g.translate(x, y + s * 0.02);
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(0, -s * 0.04, s * 0.2, Math.PI, 0); g.lineTo(s * 0.2, s * 0.2);
    for (let j = 0; j < 4; j++) g.lineTo(s * (0.2 - (j + 0.5) * 0.1), s * (j % 2 ? 0.2 : 0.13)), g.lineTo(s * (0.2 - (j + 1) * 0.1), s * 0.2);
    g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = lw * 0.8; g.stroke();
    circle(g, -s * 0.07, -s * 0.04, s * 0.03, DARK); circle(g, s * 0.07, -s * 0.04, s * 0.03, DARK);
    g.restore();
  } else if (k === IT_RESIST) {
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(x, y - s * 0.26); g.lineTo(x + s * 0.22, y - s * 0.17); g.quadraticCurveTo(x + s * 0.2, y + s * 0.15, x, y + s * 0.27);
    g.quadraticCurveTo(x - s * 0.2, y + s * 0.15, x - s * 0.22, y - s * 0.17); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
    sketch(g, x - s * 0.08, y, x - s * 0.01, y + s * 0.08, lw, '#2e9e4f', 1);
    sketch(g, x - s * 0.01, y + s * 0.08, x + s * 0.11, y - s * 0.08, lw, '#2e9e4f', 2);
  } else if (k === IT_REMOTE) remoteIcon(g, x, y, s, '#4a5068', '#e0353b', INK);
}

// Бомба, замальована ручкою: чорне коло з «каракулями», відблиск і ґніт
function inkBomb(g, cx, cy, r, seed, red = false) {
  circle(g, cx, cy, r, red ? '#7a1a1a' : DARK);
  g.strokeStyle = red ? 'rgba(255,90,90,0.5)' : 'rgba(120,130,170,0.45)'; g.lineWidth = Math.max(1, r * 0.08);
  g.beginPath();
  for (let j = 0; j < 7; j++) { const a = j * 0.9 + seed; g.moveTo(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75); g.lineTo(cx + Math.cos(a + 2.4) * r * 0.75, cy + Math.sin(a + 2.4) * r * 0.75); }
  g.stroke();
  sketchCircle(g, cx, cy, r, Math.max(1, r * 0.12), DARK, seed);
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = Math.max(1, r * 0.12); g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy, r * 0.65, Math.PI * 1.1, Math.PI * 1.45); g.stroke();
  sketch(g, cx + r * 0.5, cy - r * 0.8, cx + r * 1.15, cy - r * 1.15, Math.max(1, r * 0.16), PENCIL, seed + 3);
}
function bomb(g, x, y, s, k, T) {
  const r = s * (0.32 + bombBeat(k, T)), cx = x + s / 2, cy = y + s * 0.55;
  ellipse(g, cx, y + s * 0.88, s * 0.28, s * 0.07, 'rgba(60,60,80,0.2)');
  inkBomb(g, cx, cy, r, phase(T), bombFlash(k, T));
  spark(g, cx + r * 1.15, cy - r * 1.15, s, '#ff5c8a', '#fff59a');
}

// Чоловічок: голова-кружечок, футболка кольору гравця, руки й ноги — лініями ручкою; усе «тремтить»
function player(g, p, s, T, { col, walk, bob, dead }) {
  const ph = phase(T, p.c), lw = s * 0.055;
  for (const [sx, w] of [[-1, walk], [1, -walk]]) {
    sketch(g, sx * s * 0.07, s * 0.18 - bob, sx * s * 0.14 + w * s * 0.06, s * 0.4, lw, DARK, ph + sx + 3);
  }
  for (const [sx, w] of [[-1, walk], [1, -walk]]) {
    sketch(g, sx * s * 0.13, s * 0.0 - bob, sx * s * 0.28, s * 0.14 - bob - w * s * 0.05, lw, DARK, ph + sx + 5);
  }
  g.fillStyle = col;                                                 // футболка
  g.beginPath();
  g.moveTo(-s * 0.14, -s * 0.04 - bob); g.lineTo(s * 0.14, -s * 0.04 - bob); g.lineTo(s * 0.17, s * 0.22 - bob); g.lineTo(-s * 0.17, s * 0.22 - bob);
  g.closePath(); g.fill();
  g.strokeStyle = luma(col) > 0.85 ? PENCIL : shade(col, -0.45); g.lineWidth = Math.max(1, s * 0.035); g.lineJoin = 'round'; g.stroke();
  const hy = -s * 0.2 - bob;
  circle(g, 0, hy, s * 0.17, PAPER);
  sketchCircle(g, 0, hy, s * 0.17, lw, DARK, ph);
  for (let j = 0; j < 3; j++) sketch(g, -s * 0.06 + j * s * 0.06, hy - s * 0.16, -s * 0.09 + j * s * 0.07, hy - s * 0.26, lw * 0.7, DARK, ph + 20 + j);   // волосся
  if (p.dr === 1) return;
  const fx = (DX[p.dr] || 0) * s * 0.05, fy = p.dr === 3 || !p.dr ? s * 0.02 : 0;
  if (dead) {
    for (const ex of [-0.06, 0.06]) {
      const ox = ex * s + fx, oy = hy - s * 0.02 + fy, e = s * 0.03;
      sketch(g, ox - e, oy - e, ox + e, oy + e, lw * 0.6, DARK, ph + 30);
      sketch(g, ox + e, oy - e, ox - e, oy + e, lw * 0.6, DARK, ph + 31);
    }
  } else {
    for (const ex of [-0.06, 0.06]) circle(g, ex * s + fx, hy - s * 0.02 + fy, s * 0.028, DARK);
    g.strokeStyle = DARK; g.lineWidth = Math.max(1, s * 0.025);
    g.beginPath(); g.arc(fx, hy + s * 0.04 + fy, s * 0.06, 0.3, Math.PI - 0.3); g.stroke();
  }
}

// Монстри: 0 — клякса чорнила, 1 — паперовий літачок (носом за рухом), 2 — гумка-привид
function monster(g, m, s, T, wob) {
  const ph = phase(T, m.i);
  if (m.k === 0) {
    g.fillStyle = '#4b3fa8';
    g.beginPath();
    for (let j = 0; j < 12; j++) {
      const a = j / 12 * TAU, r = s * (0.3 + (j % 2 ? 0.05 : -0.02) + Math.sin(T / 200 + j * 1.7 + m.i) * 0.02);
      j ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath(); g.fill();
    for (const [dx, dy, r] of [[0.36, 0.1, 0.05], [-0.34, 0.2, 0.04], [0.1, -0.38, 0.035]]) circle(g, s * dx, s * dy, s * r, '#4b3fa8');
    paperEyes(g, m, s, -s * 0.04, ph);
    return;
  }
  if (m.k === 1) {
    const a = Math.atan2(DY[m.d] || 0, DX[m.d] || 1);
    g.save(); g.rotate(a);
    poly(g, [[s * 0.36, 0], [-s * 0.3, -s * 0.3], [-s * 0.18, 0], [-s * 0.3, s * 0.3]], '#fff');
    poly(g, [[s * 0.36, 0], [-s * 0.18, 0], [-s * 0.3, s * 0.3]], '#dfe5ee');
    g.strokeStyle = INK; g.lineWidth = Math.max(1, s * 0.04); g.lineJoin = 'round';
    g.beginPath(); g.moveTo(s * 0.36, 0); g.lineTo(-s * 0.3, -s * 0.3); g.lineTo(-s * 0.18, 0); g.lineTo(-s * 0.3, s * 0.3); g.closePath();
    g.moveTo(s * 0.36, 0); g.lineTo(-s * 0.18, 0); g.stroke();
    g.restore();
    paperEyes(g, m, s, -s * 0.02, ph, true);
    return;
  }
  g.fillStyle = '#ff9fb5';                                           // гумка
  rr(g, -s * 0.26, -s * 0.3 + wob * s * 0.02, s * 0.52, s * 0.58, s * 0.1); g.fill();
  g.fillStyle = '#5b8fd9'; rr(g, -s * 0.26, s * 0.06, s * 0.52, s * 0.22, s * 0.06); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)'; rr(g, -s * 0.2, -s * 0.26, s * 0.12, s * 0.3, s * 0.05); g.fill();
  for (let j = 0; j < 3; j++) ellipse(g, -s * 0.12 + j * s * 0.12, s * 0.36 + Math.sin(T / 150 + j) * s * 0.02, s * 0.04, s * 0.025, 'rgba(255,159,181,0.6)');
  paperEyes(g, m, s, -s * 0.12, ph);
}
function paperEyes(g, m, s, eyeY, ph, angry = false) {
  const ex = (DX[m.d] || 0) * s * 0.04, ey = ((m.d === 3) - (m.d === 1)) * s * 0.03;
  for (const sx of [-1, 1]) {
    circle(g, sx * s * 0.1, eyeY, s * 0.075, '#fff');
    sketchCircle(g, sx * s * 0.1, eyeY, s * 0.075, s * 0.025, DARK, ph + sx);
    circle(g, sx * s * 0.1 + ex, eyeY + ey, s * 0.035, DARK);
  }
  if (angry) {
    sketch(g, -s * 0.18, eyeY - s * 0.13, -s * 0.04, eyeY - s * 0.07, s * 0.035, DARK, ph + 5);
    sketch(g, s * 0.18, eyeY - s * 0.13, s * 0.04, eyeY - s * 0.07, s * 0.035, DARK, ph + 6);
  }
}

export default {
  name: 'Зошит',
  bg: '#6b4a2e',
  backdrop,
  shadow: 'rgba(30,15,5,0.55)',
  emoji: { bomb: '💣', fire: '🔥', speed: '✈️', pass: '👻', resist: '🛡️', remote: '📡' },
  fire: ['#ff5c8a', '#ffb02b', '#fff59a'],
  burn: ['#ff5c8a', 'rgba(255,220,80,0)'],
  blocks: 3,
  floor, stone, block, wall, item, bomb, player, monster,
};
