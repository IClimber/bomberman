// village.js — «Українське село»: трава з маками й волошками, стовпи — білені хати під солом'яною стріхою (на всю клітинку),
// рамка — плетений тин з глечиками на кілках; блоки — предмети з тінню: соняшники, сніп пшениці, копиця сіна;
// стіни — дубові колоди. Гравці — козаки з оселедцем і вусами, у вишиванці й шароварах кольору гравця;
// чорт, сердитий гусак, мавка. Бомби — макітри з ґнотом. Тло — орнамент вишивки.
// Бонуси: 🏺 бомба, 🌶️ вогонь, 🐎 швидкість (підкова), 🕊️ прохід, 🧄 стійкість (часник), 🔔 детонатор (дзвін).
import { DX, DY, IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, IT_REMOTE } from '../sim.js';
import { TAU, rr, rnd, luma, shade, circle, ellipse, line, poly, bombBeat, bombFlash, pillarShade, spark } from './common.js';

const GRASS = '#7cae46', GRASS2 = '#76a742', WHITE = '#f6f1e4', STRAW = '#d9b45a', STRAW_D = '#a9842f';
const RED = '#c62828', CLAY = '#c8743c', CLAY_D = '#8c4a22', SKIN = '#f2c9a0', WOOD = '#8a5a33';

// Тло — смуги орнаменту вишивки (хрестик): червоні ромби з чорним
function backdrop(g, W, H, dpr) {
  const u = 5 * dpr, band = 13;
  for (let y0 = u * 3, r = 0; y0 < H; y0 += u * (band + 10), r++) {
    for (let x0 = ((r % 2) * band * u) / 2 - band * u; x0 < W; x0 += band * u) {
      for (let j = 0; j < band; j++) {
        for (let i = 0; i < band; i++) {
          const d = Math.abs(i - 6) + Math.abs(j - 6);
          const c = d === 6 || d === 2 ? 'rgba(198,40,40,0.55)' : d === 4 ? 'rgba(0,0,0,0.55)' : d === 0 ? 'rgba(198,40,40,0.55)' : null;
          if (!c) continue;
          g.fillStyle = c; g.fillRect(x0 + i * u, y0 + j * u, u * 0.8, u * 0.8);
        }
      }
    }
  }
  // Обабіч — стрічки-рушники з «ружею» (восьмипелюсткова зірка хрестиком)
  const bw = 15 * u;
  for (const x0 of [W * 0.035, W * 0.965 - bw]) {
    g.fillStyle = '#f3ead6'; g.fillRect(x0 - u, 0, bw + 2 * u, H);
    for (let y = 0; y < H; y += u * 2) {
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x0, y, u * 0.8, u * 0.8); g.fillRect(x0 + bw - u, y, u * 0.8, u * 0.8);
    }
    for (let yc = 9 * u, k = 0; yc < H; yc += 17 * u, k++) {
      for (let j = -6; j <= 6; j++) {
        for (let i = -6; i <= 6; i++) {
          const a = Math.abs(i), b = Math.abs(j);
          const star = (a === 0 && b <= 6) || (b === 0 && a <= 6) || (a === b && a <= 4) || (a + b === 4 && a && b) || (a + b === 6 && Math.abs(a - b) === 2);
          if (!star) continue;
          const core = a + b <= 1;
          g.fillStyle = core ? 'rgba(0,0,0,0.65)' : k % 2 ? 'rgba(198,40,40,0.75)' : 'rgba(0,0,0,0.6)';
          g.fillRect(x0 + bw / 2 - u / 2 + i * u, yc + j * u, u * 0.8, u * 0.8);
        }
      }
    }
  }
}

function floor(g, px, py, s, x, y, map) {
  const i = y * map.GW + x;
  g.fillStyle = (x + y) % 2 ? GRASS : GRASS2; g.fillRect(px, py, s, s);
  g.strokeStyle = 'rgba(40,90,20,0.35)'; g.lineWidth = Math.max(1, s * 0.02); g.lineCap = 'round';
  g.beginPath();
  for (let j = 0; j < 5; j++) {
    const gx = px + s * rnd(i, 30 + j), gy = py + s * (0.2 + 0.7 * rnd(i, 40 + j));
    g.moveTo(gx, gy); g.lineTo(gx - s * 0.02, gy - s * 0.07); g.moveTo(gx, gy); g.lineTo(gx + s * 0.03, gy - s * 0.06);
  }
  g.stroke();
  const r = rnd(i, 11);
  if (r < 0.07) flower(g, px + s * 0.7, py + s * 0.3, s * 0.06, '#e53935', '#2b1a10');        // мак
  else if (r < 0.12) flower(g, px + s * 0.3, py + s * 0.68, s * 0.05, '#3f7fe0', '#f6e27a');   // волошка
  else if (r < 0.15) flower(g, px + s * 0.62, py + s * 0.7, s * 0.045, '#fff', '#f2c230');     // ромашка
  pillarShade(g, map, x, y, px, py, s, 'rgba(30,50,10,0.22)');
}
function flower(g, x, y, r, petal, mid) {
  for (let j = 0; j < 5; j++) { const a = j * TAU / 5; circle(g, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.55, petal); }
  circle(g, x, y, r * 0.4, mid);
}

// Рамка — плетений тин (зрідка глечик на кілку); стовп — біла хата під стріхою на всю клітинку
function stone(g, x, y, s, border, cx, cy, map) {
  if (border) {
    g.fillStyle = '#5d7a32'; g.fillRect(x, y, s, s);
    for (const fx of [0.15, 0.5, 0.85]) { g.fillStyle = '#5a3a1f'; g.fillRect(x + s * fx - s * 0.04, y + s * 0.05, s * 0.08, s * 0.9); }
    for (let j = 0; j < 5; j++) {
      const yy = y + s * (0.18 + j * 0.16);
      g.fillStyle = j % 2 ? '#9a6a3a' : '#b07a42';
      g.beginPath(); g.ellipse(x + s / 2, yy, s * 0.52, s * 0.065, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(60,35,15,0.5)'; g.lineWidth = Math.max(1, s * 0.015);
      g.beginPath(); g.moveTo(x, yy); g.lineTo(x + s, yy); g.stroke();
    }
    if (rnd(cy * map.GW + cx, 5) < 0.18) {                         // глечик на кілку
      ellipse(g, x + s * 0.5, y + s * 0.2, s * 0.15, s * 0.13, CLAY);
      g.fillStyle = CLAY_D; g.fillRect(x + s * 0.43, y + s * 0.04, s * 0.14, s * 0.06);
      line(g, x + s * 0.38, y + s * 0.2, x + s * 0.62, y + s * 0.2, s * 0.025, '#f6f1e4');
    }
    return;
  }
  const d = Math.max(1, s * 0.05);
  g.fillStyle = WHITE; g.fillRect(x, y, s, s);                        // стіна
  g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(x, y + s - d * 2, s, d * 2);
  g.fillStyle = '#3d6fc4'; g.fillRect(x, y + s * 0.84, s, s * 0.16);  // призьба
  g.fillStyle = '#2d55a0'; g.fillRect(x, y + s * 0.84, s, Math.max(1, s * 0.03));
  g.fillStyle = '#3d6fc4'; g.fillRect(x + s * 0.32, y + s * 0.5, s * 0.36, s * 0.26);   // віконце
  g.fillStyle = '#bfe0ff'; g.fillRect(x + s * 0.36, y + s * 0.54, s * 0.12, s * 0.09); g.fillRect(x + s * 0.52, y + s * 0.54, s * 0.12, s * 0.09);
  g.fillRect(x + s * 0.36, y + s * 0.65, s * 0.12, s * 0.08); g.fillRect(x + s * 0.52, y + s * 0.65, s * 0.12, s * 0.08);
  for (const fx of [0.12, 0.88]) circle(g, x + s * fx, y + s * 0.62, s * 0.045, RED);  // мальовані квіти
  g.fillStyle = STRAW;                                                 // стріха
  g.beginPath(); g.moveTo(x - s * 0.02, y + s * 0.46); g.lineTo(x + s * 0.5, y); g.lineTo(x + s * 1.02, y + s * 0.46); g.closePath(); g.fill();
  g.fillRect(x, y, s, s * 0.06);
  g.strokeStyle = STRAW_D; g.lineWidth = Math.max(1, s * 0.022);
  g.beginPath();
  for (let j = 0; j <= 9; j++) { const fx = j / 9; g.moveTo(x + s * 0.5, y + s * 0.02); g.lineTo(x + s * fx, y + s * 0.46); }
  g.stroke();
  g.fillStyle = STRAW_D; g.fillRect(x - s * 0.02, y + s * 0.43, s * 1.04, s * 0.05);
}

// Блоки: 0 — соняшники, 1 — сніп пшениці, 2 — копиця сіна
function block(g, s, v) {
  ellipse(g, s / 2, s * 0.88, s * 0.36, s * 0.09, 'rgba(30,50,10,0.3)');
  if (v === 0) {
    for (const [fx, top] of [[0.3, 0.28], [0.7, 0.34], [0.5, 0.16]]) {
      line(g, s * fx, s * 0.88, s * fx, s * top, s * 0.06, '#4e7a26');
      ellipse(g, s * fx - s * 0.08, s * (top + 0.3), s * 0.09, s * 0.04, '#5f9a2e', -0.5);
      ellipse(g, s * fx + s * 0.08, s * (top + 0.36), s * 0.09, s * 0.04, '#5f9a2e', 0.5);
    }
    for (const [fx, fy, r] of [[0.3, 0.3, 0.15], [0.7, 0.36, 0.14], [0.5, 0.18, 0.16]]) {
      for (let j = 0; j < 12; j++) { const a = j * TAU / 12; ellipse(g, s * fx + Math.cos(a) * s * r * 0.75, s * fy + Math.sin(a) * s * r * 0.75, s * r * 0.4, s * r * 0.18, '#ffc61a', a); }
      circle(g, s * fx, s * fy, s * r * 0.55, '#5a3418');
      circle(g, s * fx - s * r * 0.15, s * fy - s * r * 0.15, s * r * 0.15, '#7a4a24');
    }
    return;
  }
  if (v === 1) {
    g.fillStyle = '#e8c45a';
    g.beginPath(); g.moveTo(s * 0.3, s * 0.86); g.lineTo(s * 0.42, s * 0.5); g.lineTo(s * 0.18, s * 0.12); g.lineTo(s * 0.82, s * 0.12);
    g.lineTo(s * 0.58, s * 0.5); g.lineTo(s * 0.7, s * 0.86); g.closePath(); g.fill();
    g.strokeStyle = '#b8902c'; g.lineWidth = Math.max(1, s * 0.02);
    g.beginPath();
    for (let j = 0; j < 7; j++) { const t = j / 6; g.moveTo(s * (0.2 + t * 0.6), s * 0.14); g.lineTo(s * (0.44 + t * 0.12), s * 0.5); g.lineTo(s * (0.32 + t * 0.36), s * 0.84); }
    g.stroke();
    for (let j = 0; j < 7; j++) ellipse(g, s * (0.2 + j * 0.1), s * 0.12, s * 0.035, s * 0.08, '#d9a93a', (j - 3) * 0.2);
    g.fillStyle = RED; g.fillRect(s * 0.38, s * 0.46, s * 0.24, s * 0.08);
    return;
  }
  g.fillStyle = '#d9b45a';
  g.beginPath(); g.moveTo(s * 0.1, s * 0.86); g.quadraticCurveTo(s * 0.12, s * 0.1, s * 0.5, s * 0.08); g.quadraticCurveTo(s * 0.88, s * 0.1, s * 0.9, s * 0.86); g.closePath(); g.fill();
  g.strokeStyle = '#a9842f'; g.lineWidth = Math.max(1, s * 0.02); g.lineCap = 'round';
  g.beginPath();
  for (let j = 0; j < 14; j++) {
    const x = s * (0.18 + rnd(j, 3) * 0.64), y = s * (0.2 + rnd(j, 4) * 0.6);
    g.moveTo(x, y); g.lineTo(x + s * (rnd(j, 5) - 0.5) * 0.16, y + s * 0.08);
  }
  g.stroke();
  line(g, s * 0.5, s * 0.08, s * 0.5, s * -0.02, s * 0.04, WOOD);
  g.fillStyle = 'rgba(255,255,255,0.2)'; g.beginPath(); g.ellipse(s * 0.36, s * 0.32, s * 0.08, s * 0.16, 0.4, 0, TAU); g.fill();
}

// Стіна — дубові колоди
function wall(g, s) {
  g.fillStyle = '#3a2414'; g.fillRect(0, 0, s, s);
  for (let j = 0; j < 3; j++) {
    const y = s * (0.02 + j * 0.33), h = s * 0.3;
    g.fillStyle = '#7a4a24'; rr(g, 0, y, s, h, h / 2); g.fill();
    g.fillStyle = '#946036'; g.fillRect(0, y + h * 0.15, s, h * 0.2);
    const ex = j % 2 ? s - h * 0.55 : h * 0.55;                     // торець з кільцями
    circle(g, ex, y + h / 2, h * 0.42, '#c89a5a');
    g.strokeStyle = '#8a5a33'; g.lineWidth = Math.max(1, s * 0.015);
    for (const r of [0.28, 0.16]) { g.beginPath(); g.arc(ex, y + h / 2, h * r, 0, TAU); g.stroke(); }
  }
}

// Бонуси на рушнику з вишитою облямівкою
function item(g, k, s) {
  const cx = s / 2, cy = s / 2;
  ellipse(g, cx, s * 0.82, s * 0.26, s * 0.07, 'rgba(20,50,10,0.35)');       // без рамки — лише тінь на траві
  if (k === IT_BOMB) makitra(g, cx, cy + s * 0.04, s * 0.18, false);
  else if (k === IT_FIRE) {                                          // червоний перець
    g.fillStyle = '#d32f2f';
    g.beginPath(); g.moveTo(cx - s * 0.12, cy - s * 0.16); g.quadraticCurveTo(cx + s * 0.24, cy - s * 0.12, cx + s * 0.16, cy + s * 0.26);
    g.quadraticCurveTo(cx + s * 0.02, cy + s * 0.0, cx - s * 0.16, cy - s * 0.06); g.closePath(); g.fill();
    ellipse(g, cx - s * 0.02, cy - s * 0.1, s * 0.06, s * 0.025, 'rgba(255,255,255,0.45)', 0.2);
    line(g, cx - s * 0.14, cy - s * 0.12, cx - s * 0.22, cy - s * 0.24, s * 0.045, '#3e7a22');
  } else if (k === IT_SPEED) {                                       // підкова
    g.strokeStyle = '#8d939e'; g.lineWidth = s * 0.1; g.lineCap = 'butt';
    g.beginPath(); g.arc(cx, cy - s * 0.02, s * 0.17, Math.PI * 0.85, Math.PI * 2.15); g.stroke();
    g.fillStyle = '#3a3f4a';
    for (let j = 0; j < 6; j++) { const a = Math.PI * (0.95 + j * 0.22); circle(g, cx + Math.cos(a) * s * 0.17, cy - s * 0.02 + Math.sin(a) * s * 0.17, s * 0.018, '#3a3f4a'); }
  } else if (k === IT_PASS) {                                        // голуб
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(cx, cy + s * 0.04, s * 0.17, s * 0.09, -0.2, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(cx - s * 0.04, cy); g.quadraticCurveTo(cx - s * 0.12, cy - s * 0.3, cx + s * 0.12, cy - s * 0.24); g.quadraticCurveTo(cx + s * 0.04, cy - s * 0.06, cx + s * 0.06, cy + s * 0.02); g.fill();
    circle(g, cx + s * 0.16, cy - s * 0.02, s * 0.06, '#fff');
    poly(g, [[cx + s * 0.21, cy - s * 0.03], [cx + s * 0.28, cy - s * 0.01], [cx + s * 0.21, cy + s * 0.01]], '#f2a33a');
    poly(g, [[cx - s * 0.15, cy + s * 0.06], [cx - s * 0.3, cy], [cx - s * 0.28, cy + s * 0.12]], '#fff');
    g.strokeStyle = '#8a95a6'; g.lineWidth = Math.max(1, s * 0.015);
    g.beginPath(); g.ellipse(cx, cy + s * 0.04, s * 0.17, s * 0.09, -0.2, 0, TAU); g.stroke();
    circle(g, cx + s * 0.17, cy - s * 0.03, s * 0.012, '#111');
  } else if (k === IT_RESIST) {                                      // часник
    for (const [dx, a] of [[-0.08, -0.25], [0.08, 0.25], [0, 0]]) ellipse(g, cx + s * dx, cy + s * 0.06, s * 0.11, s * 0.15, dx ? '#efe6d8' : '#fbf7f0', a);
    g.strokeStyle = '#c8b9a6'; g.lineWidth = Math.max(1, s * 0.015);
    g.beginPath(); g.moveTo(cx, cy - s * 0.08); g.lineTo(cx, cy + s * 0.2); g.stroke();
    poly(g, [[cx - s * 0.03, cy - s * 0.08], [cx, cy - s * 0.24], [cx + s * 0.03, cy - s * 0.08]], '#e8dcc6');
    line(g, cx - s * 0.06, cy + s * 0.21, cx + s * 0.06, cy + s * 0.21, s * 0.02, '#c8b9a6');
  } else if (k === IT_REMOTE) {                                        // дзвін
    line(g, cx, cy - s * 0.28, cx, cy - s * 0.2, s * 0.04, WOOD);
    g.fillStyle = '#d9a21b';
    g.beginPath(); g.moveTo(cx - s * 0.2, cy + s * 0.14); g.quadraticCurveTo(cx - s * 0.15, cy - s * 0.2, cx, cy - s * 0.21);
    g.quadraticCurveTo(cx + s * 0.15, cy - s * 0.2, cx + s * 0.2, cy + s * 0.14); g.closePath(); g.fill();
    g.fillStyle = '#a87a10'; g.fillRect(cx - s * 0.22, cy + s * 0.12, s * 0.44, s * 0.05);
    circle(g, cx, cy + s * 0.21, s * 0.05, '#a87a10');
    ellipse(g, cx - s * 0.08, cy - s * 0.04, s * 0.03, s * 0.08, 'rgba(255,255,255,0.45)', 0.3);
  }
}

// Макітра (глиняний горщик) з ґнотом і розписом
function makitra(g, cx, cy, r, red) {
  g.fillStyle = red ? '#d9472b' : CLAY;
  g.beginPath(); g.ellipse(cx, cy + r * 0.1, r, r * 0.9, 0, 0, TAU); g.fill();
  g.fillStyle = red ? '#a32a14' : CLAY_D;
  rr(g, cx - r * 0.55, cy - r * 0.95, r * 1.1, r * 0.3, r * 0.1); g.fill();
  g.fillStyle = '#f6f1e4'; g.fillRect(cx - r * 0.95, cy + r * 0.05, r * 1.9, r * 0.14);
  for (let j = -2; j <= 2; j++) circle(g, cx + j * r * 0.36, cy + r * 0.12, r * 0.07, RED);
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.ellipse(cx - r * 0.45, cy - r * 0.25, r * 0.16, r * 0.3, 0.4, 0, TAU); g.fill();
  g.strokeStyle = '#d9c39a'; g.lineWidth = Math.max(1, r * 0.16); g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx, cy - r * 0.95); g.quadraticCurveTo(cx + r * 0.3, cy - r * 1.5, cx + r * 0.7, cy - r * 1.35); g.stroke();
}
function bomb(g, x, y, s, k, T) {
  const r = s * (0.3 + bombBeat(k, T)), cx = x + s / 2, cy = y + s * 0.56;
  ellipse(g, cx, y + s * 0.88, s * 0.28, s * 0.08, 'rgba(30,50,10,0.35)');
  makitra(g, cx, cy, r, bombFlash(k, T));
  spark(g, cx + r * 0.7, cy - r * 1.35, s);
}

// Козак: бритий з оселедцем і вусами, вишиванка з червоним орнаментом, шаровари й пояс кольору гравця, червоні чоботи
function player(g, p, s, T, { col, walk, bob, dead }) {
  const dark = shade(col, -0.35);
  for (const [sx, w] of [[-1, walk], [1, -walk]]) {                 // чоботи
    g.fillStyle = '#9e1f1f'; rr(g, sx * s * 0.13 - s * 0.07, s * 0.3 + w * s * 0.05, s * 0.14, s * 0.12, s * 0.04); g.fill();
  }
  g.fillStyle = col;                                                 // шаровари
  g.beginPath(); g.moveTo(-s * 0.22, s * 0.12 - bob); g.quadraticCurveTo(-s * 0.3, s * 0.3, -s * 0.18, s * 0.34); g.lineTo(s * 0.18, s * 0.34);
  g.quadraticCurveTo(s * 0.3, s * 0.3, s * 0.22, s * 0.12 - bob); g.closePath(); g.fill();
  g.strokeStyle = luma(col) > 0.8 ? 'rgba(0,0,0,0.3)' : dark; g.lineWidth = Math.max(1, s * 0.02); g.stroke();
  line(g, 0, s * 0.18 - bob, 0, s * 0.33, s * 0.02, dark);
  g.fillStyle = WHITE; rr(g, -s * 0.19, -s * 0.04 - bob, s * 0.38, s * 0.2, s * 0.07); g.fill();   // сорочка
  g.fillStyle = RED;
  for (let j = -2; j <= 2; j++) g.fillRect(j * s * 0.05 - s * 0.015, -s * 0.03 - bob, s * 0.03, s * 0.03);
  for (const sx of [-1, 1]) for (let j = 0; j < 3; j++) g.fillRect(sx * s * 0.15 - s * 0.012, s * (0.0 + j * 0.05) - bob, s * 0.024, s * 0.024);
  g.fillStyle = dark; g.fillRect(-s * 0.2, s * 0.11 - bob, s * 0.4, s * 0.05);   // пояс
  for (const sx of [-1, 1]) {
    g.fillStyle = WHITE; circle(g, sx * s * 0.24, s * 0.08 - bob - sx * walk * s * 0.04, s * 0.065, WHITE);
    circle(g, sx * s * 0.26, s * 0.13 - bob - sx * walk * s * 0.04, s * 0.045, SKIN);
  }
  const hy = -s * 0.17 - bob;
  circle(g, 0, hy, s * 0.2, SKIN);
  const back = p.dr === 1;
  g.strokeStyle = '#3a2414'; g.lineWidth = Math.max(1.5, s * 0.05); g.lineCap = 'round';   // оселедець
  g.beginPath(); g.moveTo(0, hy - s * 0.19); g.quadraticCurveTo(s * 0.2, hy - s * 0.3, s * 0.18, hy - (back ? s * 0.02 : s * 0.12)); g.stroke();
  if (back) return;
  const fx = (DX[p.dr] || 0) * s * 0.06, fy = p.dr === 3 || !p.dr ? s * 0.02 : 0;
  if (dead) {
    g.strokeStyle = '#2a1a10'; g.lineWidth = Math.max(1, s * 0.025);
    for (const ex of [-0.07, 0.07]) {
      const ox = ex * s + fx, oy = hy - s * 0.02 + fy, e = s * 0.03;
      g.beginPath(); g.moveTo(ox - e, oy - e); g.lineTo(ox + e, oy + e); g.moveTo(ox + e, oy - e); g.lineTo(ox - e, oy + e); g.stroke();
    }
  } else for (const ex of [-0.07, 0.07]) circle(g, ex * s + fx, hy - s * 0.02 + fy, s * 0.028, '#2a1a10');
  g.strokeStyle = '#3a2414'; g.lineWidth = Math.max(1.5, s * 0.04);   // вуса
  g.beginPath();
  g.moveTo(fx, hy + s * 0.06 + fy); g.quadraticCurveTo(fx - s * 0.1, hy + s * 0.04 + fy, fx - s * 0.15, hy + s * 0.12 + fy);
  g.moveTo(fx, hy + s * 0.06 + fy); g.quadraticCurveTo(fx + s * 0.1, hy + s * 0.04 + fy, fx + s * 0.15, hy + s * 0.12 + fy);
  g.stroke();
}

// Монстри: 0 — чорт, 1 — гусак (дзьобом за рухом), 2 — мавка
function monster(g, m, s, T, wob) {
  const ex = (DX[m.d] || 0) * s * 0.04;
  if (m.k === 0) {
    g.strokeStyle = '#2a1a1a'; g.lineWidth = Math.max(1, s * 0.04); g.lineCap = 'round';   // хвіст
    g.beginPath(); g.moveTo(s * 0.2, s * 0.2); g.quadraticCurveTo(s * 0.42, s * 0.3 + wob * s * 0.05, s * 0.38, s * 0.05); g.stroke();
    poly(g, [[s * 0.38, s * 0.0], [s * 0.44, s * 0.08], [s * 0.33, s * 0.08]], '#2a1a1a');
    g.fillStyle = '#3a2a2a'; rr(g, -s * 0.22, -s * 0.05, s * 0.44, s * 0.38, s * 0.15); g.fill();
    for (const sx of [-1, 1]) {
      poly(g, [[sx * s * 0.12, -s * 0.28], [sx * s * 0.26, -s * 0.46], [sx * s * 0.2, -s * 0.24]], '#e8dcc6');
      line(g, sx * s * 0.1, s * 0.3, sx * s * 0.12, s * 0.4, s * 0.06, '#2a1a1a');
    }
    circle(g, 0, -s * 0.14, s * 0.2, '#4a3434');
    ellipse(g, ex, -s * 0.06, s * 0.08, s * 0.06, '#d98a8a');
    circle(g, ex - s * 0.025, -s * 0.06, s * 0.015, '#5a2a2a'); circle(g, ex + s * 0.025, -s * 0.06, s * 0.015, '#5a2a2a');
    for (const sx of [-1, 1]) { circle(g, sx * s * 0.08 + ex, -s * 0.18, s * 0.045, '#ffd23f'); circle(g, sx * s * 0.08 + ex * 1.3, -s * 0.18, s * 0.02, '#111'); }
    return;
  }
  if (m.k === 1) {
    const a = Math.atan2(DY[m.d] || 0, DX[m.d] || 1), flap = Math.sin(T / 60 + m.i) * 0.3;
    g.save(); g.rotate(a);
    for (const sy of [-1, 1]) {                                     // крила
      g.save(); g.rotate(sy * (0.4 + flap));
      ellipse(g, -s * 0.12, sy * s * 0.12, s * 0.2, s * 0.08, '#e8ecf2');
      g.restore();
    }
    ellipse(g, -s * 0.04, 0, s * 0.26, s * 0.17, '#fbfbfb');
    poly(g, [[-s * 0.28, -s * 0.06], [-s * 0.4, 0], [-s * 0.28, s * 0.06]], '#e8ecf2');
    line(g, s * 0.12, 0, s * 0.26, 0, s * 0.1, '#fbfbfb');            // шия
    circle(g, s * 0.28, 0, s * 0.08, '#fbfbfb');
    poly(g, [[s * 0.34, -s * 0.04], [s * 0.48, 0], [s * 0.34, s * 0.04]], '#f28c1a');
    for (const sy of [-1, 1]) { circle(g, s * 0.3, sy * s * 0.045, s * 0.018, '#111'); line(g, s * 0.26, sy * s * 0.07, s * 0.33, sy * s * 0.055, s * 0.015, '#111'); }
    g.restore();
    return;
  }
  // мавка: довге зелене волосся, вінок, бліде обличчя
  g.fillStyle = 'rgba(70,150,80,0.85)';
  g.beginPath(); g.moveTo(-s * 0.24, -s * 0.18);
  for (let j = 0; j <= 6; j++) g.lineTo(-s * 0.24 + j * s * 0.08, s * 0.36 + Math.sin(T / 140 + j + m.i) * s * 0.04 * (j % 2 ? 1 : -1));
  g.lineTo(s * 0.24, -s * 0.18); g.closePath(); g.fill();
  g.fillStyle = 'rgba(220,240,225,0.9)'; g.beginPath(); g.ellipse(0, s * 0.12, s * 0.13, s * 0.2, 0, 0, TAU); g.fill();
  circle(g, 0, -s * 0.12, s * 0.17, '#dfeee0');
  g.fillStyle = 'rgba(70,150,80,0.95)'; g.beginPath(); g.arc(0, -s * 0.15, s * 0.19, Math.PI * 1.05, Math.PI * 1.95); g.fill();
  for (let j = 0; j < 5; j++) circle(g, -s * 0.16 + j * s * 0.08, -s * 0.3 + Math.abs(j - 2) * s * 0.03, s * 0.04, ['#e53935', '#ffd23f', '#3f7fe0', '#ffd23f', '#e53935'][j]);
  for (const sx of [-1, 1]) { ellipse(g, sx * s * 0.06 + ex, -s * 0.1, s * 0.035, s * 0.045, '#1d4a2a'); circle(g, sx * s * 0.06 + ex - s * 0.01, -s * 0.115, s * 0.012, '#fff'); }
}

export default {
  name: 'Українське село',
  bg: '#f3ead6',
  backdrop,
  shadow: 'rgba(60,40,20,0.45)',
  emoji: { bomb: '🏺', fire: '🌶️', speed: '🐎', pass: '🕊️', resist: '🧄', remote: '🔔' },
  fire: ['#d9381e', '#ff9f1c', '#fff1b8'],
  burn: ['#ff6a00', 'rgba(255,220,80,0)'],
  blocks: 3,
  floor, stone, block, wall, item, bomb, player, monster,
};
