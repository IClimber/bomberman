// hawaii.js — «Гаваї»: пісок, океан замість рамки, валуни й тікі замість стовпів, пальми, кущі гібіскуса
// й ананаси замість блоків, бамбуковий паркан замість стін; серфери в гавайських сорочках кольору гравця;
// краби, акули, медузи; бомби-кокоси й лавовий вогонь. Бонуси: 🥥 кокос, 🌋 вулкан, 🍹 коктейль, 🏄 дошка, 🧴 крем від сонця.
import { DX, DY, IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST } from '../sim.js';
import { TAU, rr, rnd, luma, shade, circle, ellipse, line, poly, bombBeat, bombFlash, pillarShade, spark } from './common.js';

const SAND = '#f0d49a', SKIN = '#d9965f', LEAF = '#2f9e44', LEAF_D = '#1f7a34', WOOD = '#7a4a24';

function backdrop(g, W, H, dpr) {
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 2 * dpr;
  const step = 34 * dpr;
  for (let y = step / 2, r = 0; y < H; y += step, r++) {
    g.beginPath();
    for (let x = (r % 2) * step / 2 - step; x < W + step; x += step) { g.moveTo(x, y); g.quadraticCurveTo(x + step / 4, y - step / 5, x + step / 2, y); }
    g.stroke();
  }
}

function floor(g, px, py, s, x, y, map) {
  const i = y * map.GW + x;
  g.fillStyle = (x + y) % 2 ? SAND : '#ecce90';
  g.fillRect(px, py, s, s);
  for (let j = 0; j < 4; j++) circle(g, px + s * rnd(i, 40 + j), py + s * rnd(i, 50 + j), Math.max(0.6, s * 0.018), 'rgba(170,120,60,0.35)');
  const r = rnd(i, 11);
  if (r < 0.06) {                                                  // морська зірка
    g.save(); g.translate(px + s * 0.65, py + s * 0.65); g.rotate(r * 40);
    g.fillStyle = '#ff8a5c'; g.beginPath();
    for (let j = 0; j < 10; j++) { const a = j * TAU / 10, rr2 = s * (j % 2 ? 0.04 : 0.11); j ? g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2) : g.moveTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
    g.fill(); g.restore();
  } else if (r < 0.12) {                                           // мушля
    ellipse(g, px + s * 0.3, py + s * 0.7, s * 0.07, s * 0.06, '#fbe3e0');
    g.strokeStyle = 'rgba(200,140,130,0.8)'; g.lineWidth = Math.max(1, s * 0.012);
    g.beginPath(); for (const a of [-0.6, 0, 0.6]) { g.moveTo(px + s * 0.3, py + s * 0.75); g.lineTo(px + s * (0.3 + Math.sin(a) * 0.06), py + s * 0.65); } g.stroke();
  }
  pillarShade(g, map, x, y, px, py, s, 'rgba(120,80,30,0.2)');
}

// Рамка — океан з хвилями; стовпи — валуни, зрідка тікі
function stone(g, x, y, s, border, cx, cy, map) {
  if (border) {
    g.fillStyle = (cx + cy) % 2 ? '#1f8fc4' : '#1d8abd'; g.fillRect(x, y, s, s);
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = Math.max(1, s * 0.04); g.lineCap = 'round';
    for (const fy of [0.32, 0.7]) {
      g.beginPath();
      const o = ((cx * 7 + cy * 3 + fy * 10) % 3) * 0.08;
      g.moveTo(x + s * (0.1 + o), y + s * fy); g.quadraticCurveTo(x + s * (0.25 + o), y + s * (fy - 0.1), x + s * (0.4 + o), y + s * fy);
      g.stroke();
    }
    return;
  }
  g.fillStyle = SAND; g.fillRect(x, y, s, s);
  if (rnd(cy * map.GW + cx, 12) < 0.3) return tiki(g, x, y, s);
  ellipse(g, x + s / 2, y + s * 0.84, s * 0.44, s * 0.12, 'rgba(120,80,30,0.3)');
  g.fillStyle = '#6b625c';
  g.beginPath();
  g.moveTo(x + s * 0.06, y + s * 0.8); g.quadraticCurveTo(x + s * 0.02, y + s * 0.3, x + s * 0.3, y + s * 0.14);
  g.quadraticCurveTo(x + s * 0.6, y + s * 0.02, x + s * 0.82, y + s * 0.2); g.quadraticCurveTo(x + s * 1.0, y + s * 0.45, x + s * 0.94, y + s * 0.8);
  g.closePath(); g.fill();
  g.fillStyle = '#857b74';
  g.beginPath(); g.moveTo(x + s * 0.18, y + s * 0.5); g.quadraticCurveTo(x + s * 0.24, y + s * 0.24, x + s * 0.5, y + s * 0.2); g.quadraticCurveTo(x + s * 0.36, y + s * 0.34, x + s * 0.18, y + s * 0.5); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + s * 0.08, y + s * 0.72, s * 0.84, s * 0.08);
}
function tiki(g, x, y, s) {
  ellipse(g, x + s / 2, y + s * 0.88, s * 0.34, s * 0.08, 'rgba(120,80,30,0.3)');
  for (const [a, c] of [[-0.6, LEAF_D], [0, LEAF], [0.6, LEAF_D]]) ellipse(g, x + s / 2 + Math.sin(a) * s * 0.14, y + s * 0.12, s * 0.07, s * 0.14, c, a);
  g.fillStyle = WOOD; rr(g, x + s * 0.2, y + s * 0.14, s * 0.6, s * 0.76, s * 0.1); g.fill();
  g.fillStyle = shade(WOOD, -0.3); g.fillRect(x + s * 0.2, y + s * 0.34, s * 0.6, s * 0.04);
  for (const sx of [-1, 1]) { ellipse(g, x + s / 2 + sx * s * 0.13, y + s * 0.45, s * 0.09, s * 0.07, '#f2d29b'); circle(g, x + s / 2 + sx * s * 0.13, y + s * 0.46, s * 0.035, '#2a1608'); }
  poly(g, [[x + s * 0.46, y + s * 0.5], [x + s * 0.54, y + s * 0.5], [x + s * 0.57, y + s * 0.62], [x + s * 0.43, y + s * 0.62]], shade(WOOD, -0.25));
  g.fillStyle = '#2a1608'; rr(g, x + s * 0.3, y + s * 0.66, s * 0.4, s * 0.14, s * 0.04); g.fill();
  g.fillStyle = '#f2d29b';
  for (let j = 0; j < 4; j++) g.fillRect(x + s * (0.33 + j * 0.09), y + s * 0.67, s * 0.06, s * 0.05);
}

// Блоки: 0, 1 — пальми (дзеркальні), 2 — кущ гібіскуса, 3 — ананас
function block(g, s, v) {
  ellipse(g, s / 2, s * 0.88, s * 0.36, s * 0.09, 'rgba(120,80,30,0.3)');
  if (v < 2) {
    if (v) { g.translate(s, 0); g.scale(-1, 1); }
    g.strokeStyle = '#8a5a33'; g.lineWidth = s * 0.13; g.lineCap = 'round';
    g.beginPath(); g.moveTo(s * 0.46, s * 0.88); g.quadraticCurveTo(s * 0.42, s * 0.6, s * 0.52, s * 0.38); g.stroke();
    g.strokeStyle = '#6b4226'; g.lineWidth = Math.max(1, s * 0.02);
    for (let j = 0; j < 5; j++) { const t = 0.42 + j * 0.1; g.beginPath(); g.moveTo(s * (0.4 + j * 0.005), s * (0.88 - j * 0.1)); g.lineTo(s * (0.52 - j * 0.005), s * (0.86 - j * 0.1 - t * 0.02)); g.stroke(); }
    const fronds = [[-2.7, 0.5], [-2.0, 0.52], [-1.2, 0.48], [-0.5, 0.52], [0.2, 0.5], [2.9, 0.44], [1.0, 0.36]];
    for (const [a, len] of fronds) frond(g, s * 0.52, s * 0.36, a, s * len);
    for (const [dx, dy] of [[-0.05, 0.03], [0.05, 0.04], [0, 0.08]]) circle(g, s * (0.52 + dx), s * (0.36 + dy), s * 0.055, '#5a3a1f');
    return;
  }
  if (v === 2) {
    for (const [dx, dy, r] of [[0, 0.1, 0.3], [-0.2, 0.2, 0.24], [0.2, 0.2, 0.24], [-0.1, -0.08, 0.22], [0.12, -0.06, 0.22]]) circle(g, s * (0.5 + dx), s * (0.5 + dy), s * r, LEAF_D);
    for (const [dx, dy, r] of [[-0.12, -0.1, 0.14], [0.14, -0.08, 0.13], [0, 0.12, 0.16]]) circle(g, s * (0.5 + dx), s * (0.5 + dy), s * r, LEAF);
    for (const [dx, dy, c] of [[-0.18, 0.02, '#ff3d6e'], [0.16, -0.16, '#ff5a3d'], [0.12, 0.24, '#ff3d6e']]) hibiscus(g, s * (0.5 + dx), s * (0.5 + dy), s * 0.11, c);
    return;
  }
  for (const a of [-0.7, -0.35, 0, 0.35, 0.7]) ellipse(g, s / 2 + Math.sin(a) * s * 0.1, s * 0.2 - Math.cos(a) * s * 0.06, s * 0.05, s * 0.16, a % 0.7 ? LEAF : LEAF_D, a);
  ellipse(g, s / 2, s * 0.58, s * 0.26, s * 0.32, '#f2b632');
  g.save();
  g.beginPath(); g.ellipse(s / 2, s * 0.58, s * 0.26, s * 0.32, 0, 0, TAU); g.clip();
  g.strokeStyle = '#c98a1a'; g.lineWidth = Math.max(1, s * 0.025);
  for (let j = -4; j <= 4; j++) {
    g.beginPath(); g.moveTo(s / 2 + j * s * 0.1 - s * 0.3, s * 0.26); g.lineTo(s / 2 + j * s * 0.1 + s * 0.3, s * 0.9); g.stroke();
    g.beginPath(); g.moveTo(s / 2 + j * s * 0.1 + s * 0.3, s * 0.26); g.lineTo(s / 2 + j * s * 0.1 - s * 0.3, s * 0.9); g.stroke();
  }
  g.restore();
  ellipse(g, s * 0.42, s * 0.46, s * 0.05, s * 0.1, 'rgba(255,255,255,0.3)', 0.3);
}
function frond(g, x, y, a, len) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = LEAF;
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.32, len, len * 0.12); g.quadraticCurveTo(len * 0.5, len * 0.08, 0, 0); g.fill();
  g.strokeStyle = LEAF_D; g.lineWidth = Math.max(1, len * 0.05);
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.12, len, len * 0.12); g.stroke();
  g.restore();
}
function hibiscus(g, x, y, r, c) {
  for (let j = 0; j < 5; j++) { const a = j * TAU / 5; ellipse(g, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, r * 0.42, c, a); }
  circle(g, x, y, r * 0.22, '#ffe066');
}

// Стіна — бамбуковий паркан
function wall(g, s) {
  g.fillStyle = '#5a3a1f'; g.fillRect(0, 0, s, s);
  for (let j = 0; j < 4; j++) {
    const x = s * (0.02 + j * 0.245), w = s * 0.22;
    g.fillStyle = '#c9a45c'; rr(g, x, 0, w, s, w * 0.3); g.fill();
    g.fillStyle = '#e3c27a'; g.fillRect(x + w * 0.2, 0, w * 0.2, s);
    g.fillStyle = '#8a6a30';
    for (const fy of [0.3 + (j % 2) * 0.1, 0.75 - (j % 2) * 0.08]) g.fillRect(x, s * fy, w, Math.max(1, s * 0.035));
  }
  line(g, 0, s * 0.18, s, s * 0.18, s * 0.05, '#6b4226', 'butt');
  line(g, 0, s * 0.84, s, s * 0.84, s * 0.05, '#6b4226', 'butt');
}

// Бонуси на бамбуковій табличці
const ITEM_BG = { [IT_BOMB]: '#2fb5c4', [IT_FIRE]: '#ff8a5c', [IT_SPEED]: '#ffd166', [IT_PASS]: '#4fc3e8', [IT_RESIST]: '#7fd36f' };
function item(g, k, s) {
  const p = s * 0.1, cx = s / 2, cy = s / 2;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  rr(g, p + s * 0.03, p + s * 0.05, s - 2 * p, s - 2 * p, s * 0.14); g.fill();
  g.fillStyle = '#c9a45c'; rr(g, p, p, s - 2 * p, s - 2 * p, s * 0.14); g.fill();
  g.fillStyle = ITEM_BG[k]; rr(g, p + s * 0.06, p + s * 0.06, s - 2 * p - s * 0.12, s - 2 * p - s * 0.12, s * 0.1); g.fill();
  g.fillStyle = '#8a6a30';
  for (const [fx, fy] of [[0.13, 0.4], [0.87, 0.6], [0.4, 0.13], [0.6, 0.87]]) g.fillRect(s * fx - s * 0.025, s * fy - s * 0.025, s * 0.05, s * 0.05);
  if (k === IT_BOMB) coconut(g, cx, cy + s * 0.04, s * 0.19, false);
  else if (k === IT_FIRE) {
    poly(g, [[cx - s * 0.28, cy + s * 0.24], [cx - s * 0.08, cy - s * 0.1], [cx + s * 0.08, cy - s * 0.1], [cx + s * 0.28, cy + s * 0.24]], '#7a4a2e');
    poly(g, [[cx - s * 0.08, cy - s * 0.1], [cx + s * 0.08, cy - s * 0.1], [cx + s * 0.04, cy + s * 0.04], [cx, cy - s * 0.02], [cx - s * 0.05, cy + s * 0.08]], '#ff5a1f');
    for (const [dx, dy, r] of [[-0.06, -0.2, 0.05], [0.05, -0.24, 0.045], [0, -0.15, 0.06]]) circle(g, cx + dx * s, cy + dy * s, s * r, dy < -0.18 ? '#ffb02b' : '#ff5a1f');
    ellipse(g, cx + s * 0.12, cy - s * 0.28, s * 0.08, s * 0.04, 'rgba(255,255,255,0.7)');
  } else if (k === IT_SPEED) {
    line(g, cx + s * 0.04, cy - s * 0.3, cx - s * 0.02, cy + s * 0.05, s * 0.03, '#ff3d6e');
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath(); g.moveTo(cx - s * 0.2, cy - s * 0.14); g.lineTo(cx + s * 0.2, cy - s * 0.14); g.lineTo(cx + s * 0.12, cy + s * 0.14); g.lineTo(cx - s * 0.12, cy + s * 0.14); g.closePath(); g.fill();
    const grd = g.createLinearGradient(0, cy - s * 0.1, 0, cy + s * 0.14);
    grd.addColorStop(0, '#ffb02b'); grd.addColorStop(1, '#ff3d3d');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(cx - s * 0.18, cy - s * 0.1); g.lineTo(cx + s * 0.18, cy - s * 0.1); g.lineTo(cx + s * 0.12, cy + s * 0.13); g.lineTo(cx - s * 0.12, cy + s * 0.13); g.closePath(); g.fill();
    line(g, cx, cy + s * 0.14, cx, cy + s * 0.25, s * 0.035, 'rgba(255,255,255,0.8)');
    line(g, cx - s * 0.1, cy + s * 0.26, cx + s * 0.1, cy + s * 0.26, s * 0.035, 'rgba(255,255,255,0.8)');
    circle(g, cx + s * 0.18, cy - s * 0.13, s * 0.07, '#7fd36f');
    g.fillStyle = '#ff5a8a';
    g.beginPath(); g.arc(cx - s * 0.1, cy - s * 0.2, s * 0.13, Math.PI * 1.1, Math.PI * 1.9); g.closePath(); g.fill();
    line(g, cx - s * 0.1, cy - s * 0.2, cx - s * 0.04, cy - s * 0.06, s * 0.02, '#8a5a33');
  } else if (k === IT_PASS) {
    g.save(); g.translate(cx, cy); g.rotate(-0.7);
    ellipse(g, 0, 0, s * 0.34, s * 0.1, '#ff6b6b');
    g.fillStyle = '#fff'; g.fillRect(-s * 0.3, -s * 0.02, s * 0.6, s * 0.04);
    poly(g, [[-s * 0.24, s * 0.08], [-s * 0.18, s * 0.08], [-s * 0.22, s * 0.16]], '#c0392b');
    g.restore();
  } else if (k === IT_RESIST) {
    g.fillStyle = '#fff'; rr(g, cx - s * 0.13, cy - s * 0.14, s * 0.26, s * 0.38, s * 0.06); g.fill();
    g.fillStyle = '#2b8fd9'; rr(g, cx - s * 0.13, cy + s * 0.08, s * 0.26, s * 0.16, s * 0.05); g.fill();
    g.fillStyle = '#ff8a2b'; rr(g, cx - s * 0.07, cy - s * 0.27, s * 0.14, s * 0.14, s * 0.03); g.fill();
    circle(g, cx, cy - s * 0.02, s * 0.06, '#ffc61a');
    g.strokeStyle = '#ffc61a'; g.lineWidth = Math.max(1, s * 0.02);
    g.beginPath(); for (let j = 0; j < 8; j++) { const a = j * TAU / 8; g.moveTo(cx + Math.cos(a) * s * 0.08, cy - s * 0.02 + Math.sin(a) * s * 0.08); g.lineTo(cx + Math.cos(a) * s * 0.11, cy - s * 0.02 + Math.sin(a) * s * 0.11); } g.stroke();
  }
}

// Кокос: волохата коричнева куля з трьома «очками» і ґнотом
function coconut(g, cx, cy, r, red) {
  const grd = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  grd.addColorStop(0, red ? '#d9734a' : '#9a6a3f'); grd.addColorStop(1, red ? '#7a2414' : '#3e2412');
  g.fillStyle = grd;
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(40,20,5,0.45)'; g.lineWidth = Math.max(1, r * 0.06);
  g.beginPath();
  for (let j = 0; j < 7; j++) { const a = j * 0.9 + 0.4; g.moveTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5); g.lineTo(cx + Math.cos(a + 0.25) * r * 0.85, cy + Math.sin(a + 0.25) * r * 0.85); }
  g.stroke();
  for (const [dx, dy] of [[-0.2, -0.5], [0.15, -0.55], [-0.02, -0.3]]) circle(g, cx + dx * r, cy + dy * r, r * 0.09, '#2a1608');
  g.strokeStyle = '#d9c39a'; g.lineWidth = Math.max(1, r * 0.18); g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx + r * 0.5, cy - r * 0.75); g.quadraticCurveTo(cx + r * 0.9, cy - r * 1.3, cx + r * 1.2, cy - r * 1.05); g.stroke();
}
function bomb(g, x, y, s, k, T) {
  const r = s * (0.33 + bombBeat(k, T)), cx = x + s / 2, cy = y + s * 0.55;
  ellipse(g, cx, y + s * 0.87, s * 0.3, s * 0.09, 'rgba(90,60,20,0.35)');
  coconut(g, cx, cy, r, bombFlash(k, T));
  spark(g, cx + r * 1.2, cy - r * 1.05, s);
}

// Серфер: гавайська сорочка кольору гравця з квітами, намисто-леї, засмагла шкіра, темні окуляри
function player(g, p, s, T, { col, walk, bob, dead }) {
  const rim = luma(col) > 0.8 ? 'rgba(120,80,40,0.6)' : 'rgba(0,0,0,0.3)';
  for (const [sx, w] of [[-1, walk], [1, -walk]]) {
    ellipse(g, sx * s * 0.12, s * 0.38 + w * s * 0.05, s * 0.09, s * 0.06, '#ff5a8a');
    ellipse(g, sx * s * 0.12, s * 0.35 + w * s * 0.05, s * 0.06, s * 0.05, SKIN);
  }
  g.fillStyle = '#2b6fb0'; rr(g, -s * 0.17, s * 0.2 - bob, s * 0.34, s * 0.12, s * 0.04); g.fill();   // шорти
  g.fillStyle = col;                                                 // сорочка
  rr(g, -s * 0.21, s * 0.0 - bob, s * 0.42, s * 0.25, s * 0.08); g.fill();
  g.strokeStyle = rim; g.lineWidth = Math.max(1, s * 0.02); g.stroke();
  const fl = luma(col) > 0.75 ? '#ff5a8a' : 'rgba(255,255,255,0.85)';
  for (const [fx, fy] of [[-0.12, 0.07], [0.1, 0.16], [0.13, 0.04], [-0.06, 0.19]]) {
    for (let j = 0; j < 4; j++) circle(g, s * fx + Math.cos(j * TAU / 4) * s * 0.022, s * fy - bob + Math.sin(j * TAU / 4) * s * 0.022, s * 0.02, fl);
  }
  for (const sx of [-1, 1]) circle(g, sx * s * 0.25, s * 0.13 - bob - sx * walk * s * 0.04, s * 0.06, SKIN);
  const hy = -s * 0.15 - bob;
  circle(g, 0, hy, s * 0.22, SKIN);
  if (p.dr !== 1) {                                                  // леї
    const lei = ['#ff3d6e', '#ffd23f', '#ff8a2b', '#ff5ad1', '#7fd36f'];
    for (let j = 0; j < 7; j++) { const a = Math.PI * (0.15 + j * 0.7 / 6); circle(g, Math.cos(a) * s * 0.17, hy + s * 0.08 + Math.sin(a) * s * 0.13, s * 0.04, lei[j % 5]); }
  }
  g.fillStyle = '#4a2c17';                                           // волосся
  g.beginPath();
  if (p.dr === 1) g.arc(0, hy, s * 0.22, 0, TAU);
  else g.arc(0, hy, s * 0.22, Math.PI * 1.05, Math.PI * 1.95);
  g.fill();
  hibiscus(g, -s * 0.14, hy - s * 0.15, s * 0.07, '#ff3d6e');
  if (p.dr === 1) return;
  const fx = (DX[p.dr] || 0) * s * 0.06, fy = p.dr === 3 || !p.dr ? s * 0.02 : 0;
  if (dead) {
    g.strokeStyle = '#1a1208'; g.lineWidth = Math.max(1, s * 0.025);
    for (const ex of [-0.07, 0.07]) {
      const ox = ex * s + fx, oy = hy + fy, e = s * 0.03;
      g.beginPath(); g.moveTo(ox - e, oy - e); g.lineTo(ox + e, oy + e); g.moveTo(ox + e, oy - e); g.lineTo(ox - e, oy + e); g.stroke();
    }
  } else {
    g.fillStyle = '#15110c';
    for (const ex of [-0.075, 0.075]) { rr(g, ex * s + fx - s * 0.065, hy - s * 0.035 + fy, s * 0.13, s * 0.08, s * 0.03); g.fill(); }
    g.fillRect(-s * 0.02 + fx, hy - s * 0.02 + fy, s * 0.04, s * 0.02);
    ellipse(g, -s * 0.1 + fx, hy - s * 0.015 + fy, s * 0.025, s * 0.012, 'rgba(255,255,255,0.5)');
  }
  g.strokeStyle = '#8a3a1a'; g.lineWidth = Math.max(1, s * 0.02);
  g.beginPath(); g.arc(fx, hy + s * 0.07 + fy, s * 0.06, 0.2, Math.PI - 0.2); g.stroke();
}

// Монстри: 0 — краб, 1 — акула (видно згори, повернута за рухом), 2 — медуза
function monster(g, m, s, T, wob) {
  if (m.k === 0) {
    const st = Math.sin(T / 70 + m.i);
    g.strokeStyle = '#b8321e'; g.lineWidth = Math.max(1, s * 0.035); g.lineCap = 'round';
    for (const sx of [-1, 1]) for (let j = 0; j < 3; j++) {
      const ky = s * (0.04 + j * 0.08), ph = (j % 2 ? st : -st) * s * 0.03;
      g.beginPath(); g.moveTo(sx * s * 0.2, ky); g.lineTo(sx * s * 0.33, ky - s * 0.03 + ph); g.lineTo(sx * s * 0.38, ky + s * 0.08 + ph); g.stroke();
    }
    for (const sx of [-1, 1]) {
      line(g, sx * s * 0.16, -s * 0.06, sx * s * 0.26, -s * 0.2 - st * s * 0.02, s * 0.05, '#e2452b');
      circle(g, sx * s * 0.28, -s * 0.24 - st * s * 0.02, s * 0.09, '#e2452b');
      poly(g, [[sx * s * 0.28, -s * 0.24], [sx * s * 0.42, -s * 0.36], [sx * s * 0.34, -s * 0.22]], '#f4d0a0');
    }
    ellipse(g, 0, s * 0.06, s * 0.24, s * 0.16, '#e2452b');
    ellipse(g, -s * 0.06, s * 0.0, s * 0.08, s * 0.04, 'rgba(255,255,255,0.3)');
    for (const sx of [-1, 1]) {
      line(g, sx * s * 0.07, -s * 0.06, sx * s * 0.08, -s * 0.16, s * 0.03, '#b8321e');
      circle(g, sx * s * 0.08, -s * 0.17, s * 0.045, '#fff');
      circle(g, sx * s * 0.08 + (DX[m.d] || 0) * s * 0.015, -s * 0.17, s * 0.022, '#111');
    }
    return;
  }
  if (m.k === 1) {
    const a = Math.atan2(DY[m.d] || 0, DX[m.d] || 1), sw = Math.sin(T / 90 + m.i) * 0.25;
    g.rotate(a);
    g.fillStyle = 'rgba(255,255,255,0.35)';                          // слід у піску
    g.beginPath(); g.ellipse(-s * 0.1, 0, s * 0.4, s * 0.2, 0, 0, TAU); g.fill();
    g.save(); g.translate(-s * 0.26, 0); g.rotate(sw);
    poly(g, [[0, 0], [-s * 0.16, -s * 0.13], [-s * 0.12, 0], [-s * 0.16, s * 0.13]], '#5f7189');
    g.restore();
    for (const sy of [-1, 1]) poly(g, [[s * 0.06, sy * s * 0.08], [-s * 0.08, sy * s * 0.24], [-s * 0.04, sy * s * 0.08]], '#5f7189');
    ellipse(g, 0, 0, s * 0.32, s * 0.12, '#7d8ea3');
    ellipse(g, s * 0.04, 0, s * 0.22, s * 0.06, '#9db0c4');
    poly(g, [[-s * 0.12, -s * 0.02], [s * 0.06, -s * 0.02], [-s * 0.08, s * 0.05]], '#46566b');
    for (const sy of [-1, 1]) { circle(g, s * 0.2, sy * s * 0.07, s * 0.03, '#fff'); circle(g, s * 0.21, sy * s * 0.07, s * 0.017, '#111'); }
    return;
  }
  for (let j = 0; j < 5; j++) {                                      // щупальця
    const x0 = (j - 2) * s * 0.1;
    g.strokeStyle = 'rgba(255,143,209,0.8)'; g.lineWidth = Math.max(1, s * 0.035); g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, s * 0.02);
    g.quadraticCurveTo(x0 + Math.sin(T / 160 + j) * s * 0.08, s * 0.18, x0 + Math.sin(T / 160 + j + 1) * s * 0.05, s * 0.36); g.stroke();
  }
  g.fillStyle = '#ff8fd1';
  g.beginPath(); g.ellipse(0, -s * 0.04 + wob * s * 0.02, s * 0.3, s * 0.24 - wob * s * 0.02, 0, Math.PI, 0); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath(); g.ellipse(0, -s * 0.04, s * 0.18, s * 0.14, 0, Math.PI, 0); g.closePath(); g.fill();
  const ex = (DX[m.d] || 0) * s * 0.04;
  for (const sx of [-1, 1]) { circle(g, sx * s * 0.09 + ex, -s * 0.1, s * 0.035, '#3a0a2a'); circle(g, sx * s * 0.09 + ex - s * 0.01, -s * 0.11, s * 0.012, '#fff'); }
}

export default {
  name: 'Гаваї',
  bg: '#0b4a66',
  backdrop,
  shadow: 'rgba(0,30,50,0.5)',
  emoji: { bomb: '🥥', fire: '🌋', speed: '🍹', pass: '🏄', resist: '🧴' },
  fire: ['#e8401c', '#ff9b21', '#fff0b3'],
  burn: ['#ff6a00', 'rgba(255,200,80,0)'],
  blocks: 4,
  floor, stone, block, wall, item, bomb, player, monster,
};
