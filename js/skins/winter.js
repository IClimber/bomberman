// winter.js — «Зима»: нічний сніг, камені під снігом, крижані брили й подарунки, крижана стіна;
// сніговики в шапках і шарфах кольору гравця; пінгвіни, єті, хурделиці.
import { DX, IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, IT_KICK, IT_REMOTE } from '../sim.js';
import { TAU, rr, bevel, rgba, rnd, luma, shade, circle, ellipse, line, poly, bombBeat, bombFlash, pillarShade, spark, kickIcon } from './common.js';
import { itemTile } from './classic.js';

const SNOW = '#f2f6fb', COAL = '#1d2230', CARROT = '#ff8a2b';

function floor(g, px, py, s, x, y, map) {
  g.fillStyle = (x + y) % 2 ? '#6584ad' : '#6281aa';
  g.fillRect(px, py, s, s);
  const i = y * map.GW + x;
  g.fillStyle = 'rgba(255,255,255,0.1)';                           // замети
  g.beginPath(); g.ellipse(px + s * (0.3 + rnd(i, 1) * 0.4), py + s * (0.3 + rnd(i, 2) * 0.4), s * 0.26, s * 0.12, 0, 0, TAU); g.fill();
  for (let j = 0; j < 3; j++) {                                    // іскри
    if (rnd(i, 10 + j) < 0.5) continue;
    circle(g, px + s * rnd(i, 20 + j), py + s * rnd(i, 30 + j), Math.max(0.6, s * 0.018), 'rgba(255,255,255,0.75)');
  }
  pillarShade(g, map, x, y, px, py, s, 'rgba(20,30,70,0.3)');
}

// Сніговий кучугур зверху клітинки
function snowCap(g, x, y, s, h) {
  g.fillStyle = SNOW;
  g.beginPath();
  g.moveTo(x, y + s * h);
  for (let j = 0; j <= 4; j++) g.quadraticCurveTo(x + s * (j - 0.5) / 4, y + s * (h + (j % 2 ? 0.1 : 0.04)), x + s * j / 4, y + s * h);
  g.lineTo(x + s, y); g.lineTo(x, y);
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(150,180,220,0.45)';
  g.fillRect(x, y + s * h - Math.max(1, s * 0.02), s, Math.max(1, s * 0.02));
}
function stone(g, x, y, s, border) {
  const d = Math.max(1, Math.round(s * 0.09));
  if (border) {
    bevel(g, x, y, s, '#3a4560', '#55627f', '#232a3d', d);
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.fillRect(x + d, y + s * 0.62, s - 2 * d, Math.max(1, d / 2));
    snowCap(g, x, y, s, 0.2);
    return;
  }
  bevel(g, x, y, s, '#4a5878', '#6a7999', '#2b3450', d);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(x + s * 0.25, y + s * 0.5, s * 0.5, s * 0.3);
  snowCap(g, x, y, s, 0.32);
  for (const fx of [0.25, 0.5, 0.72]) {                           // бурульки
    poly(g, [[x + s * (fx - 0.05), y + s * 0.34], [x + s * (fx + 0.05), y + s * 0.34], [x + s * fx, y + s * (0.46 + rnd(fx * 100) * 0.08)]], 'rgba(220,240,255,0.85)');
  }
}

// Блоки: 0, 1 — крижані брили, 2 — червоний подарунок, 3 — зелений
function block(g, s, v) {
  const d = Math.max(1, Math.round(s * 0.08));
  if (v < 2) {
    bevel(g, 0, 0, s, '#9fd8f2', '#dff5ff', '#5ba3cc', d);
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.beginPath(); g.moveTo(s * 0.2, s * 0.15); g.lineTo(s * 0.38, s * 0.15); g.lineTo(s * 0.15, s * 0.6); g.lineTo(s * 0.15, s * 0.32); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(60,120,170,0.55)'; g.lineWidth = Math.max(1, s * 0.025);
    g.beginPath();
    if (v === 0) { g.moveTo(s * 0.55, s * 0.12); g.lineTo(s * 0.62, s * 0.4); g.lineTo(s * 0.8, s * 0.5); g.moveTo(s * 0.62, s * 0.4); g.lineTo(s * 0.5, s * 0.62); }
    else { g.moveTo(s * 0.88, s * 0.6); g.lineTo(s * 0.6, s * 0.7); g.lineTo(s * 0.5, s * 0.88); g.moveTo(s * 0.6, s * 0.7); g.lineTo(s * 0.45, s * 0.6); }
    g.stroke();
    return;
  }
  const box = v === 2 ? '#d93a3a' : '#2e9e5b', rib = v === 2 ? '#ffd23f' : '#e8394a';
  bevel(g, 0, 0, s, box, shade(box, 0.25), shade(box, -0.35), d);
  g.fillStyle = rib;
  g.fillRect(s * 0.43, d, s * 0.14, s - 2 * d);
  g.fillRect(d, s * 0.43, s - 2 * d, s * 0.14);
  for (const sx of [-1, 1]) ellipse(g, s / 2 + sx * s * 0.12, s * 0.38, s * 0.12, s * 0.07, rib, sx * 0.5);
  circle(g, s / 2, s * 0.42, s * 0.05, shade(rib, -0.2));
  snowCap(g, 0, 0, s, 0.12);
}

// Стіна раптової смерті — темна крига з інеєм
function wall(g, s) {
  const d = Math.max(1, Math.round(s * 0.1));
  bevel(g, 0, 0, s, '#2b5a8f', '#5d8cc0', '#163557', d);
  g.strokeStyle = 'rgba(220,240,255,0.55)'; g.lineWidth = Math.max(1, s * 0.03); g.lineCap = 'round';
  g.beginPath();
  for (const [cx, cy] of [[0.3, 0.3], [0.7, 0.68]]) {               // сніжинки-інеї
    for (let a = 0; a < 3; a++) {
      const ang = a * Math.PI / 3, r = s * 0.14;
      g.moveTo(s * cx - Math.cos(ang) * r, s * cy - Math.sin(ang) * r);
      g.lineTo(s * cx + Math.cos(ang) * r, s * cy + Math.sin(ang) * r);
    }
  }
  g.stroke();
}

// Бонуси: 🧨 петарда, 🎆 феєрверк, ⛸ ковзан, 🛷 санчата, 🧣 шарф
const ITEM_BG = { [IT_BOMB]: '#2f6fd6', [IT_FIRE]: '#3b2a6b', [IT_SPEED]: '#16a39a', [IT_PASS]: '#7a3fd0', [IT_RESIST]: '#d9a21b', [IT_KICK]: '#c0392b', [IT_REMOTE]: '#2e7d4f' };
function item(g, k, s) {
  itemTile(g, s, ITEM_BG[k]);
  const cx = s / 2, cy = s / 2 + s * 0.03;
  if (k === IT_BOMB) cracker(g, cx, cy + s * 0.04, s * 0.85);
  else if (k === IT_FIRE) {
    const cols = ['#ff5a4f', '#ffd23f', '#5fd3ff', '#9dff6a', '#ff8ad8', '#ffd23f', '#5fd3ff', '#ff5a4f'];
    for (let j = 0; j < 8; j++) {
      const a = j / 8 * TAU, r1 = s * 0.08, r2 = s * 0.25;
      line(g, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, cx + Math.cos(a) * r2, cy + Math.sin(a) * r2, s * 0.045, cols[j]);
      circle(g, cx + Math.cos(a) * s * 0.29, cy + Math.sin(a) * s * 0.29, s * 0.03, cols[j]);
    }
    circle(g, cx, cy, s * 0.05, '#fff');
  } else if (k === IT_SPEED) {
    poly(g, [[cx - s * 0.18, cy - s * 0.26], [cx - s * 0.02, cy - s * 0.26], [cx, cy - s * 0.02], [cx + s * 0.22, cy + s * 0.04], [cx + s * 0.22, cy + s * 0.14], [cx - s * 0.18, cy + s * 0.14]], '#f4f4f4');
    for (let j = 0; j < 3; j++) line(g, cx - s * 0.14, cy - s * (0.18 - j * 0.07), cx - s * 0.04, cy - s * (0.18 - j * 0.07), s * 0.025, '#d9412b');
    line(g, cx - s * 0.18, cy + s * 0.14, cx + s * 0.22, cy + s * 0.14, s * 0.03, '#9aa3b6');
    line(g, cx - s * 0.12, cy + s * 0.14, cx - s * 0.12, cy + s * 0.22, s * 0.03, '#c8d0dc');
    line(g, cx + s * 0.14, cy + s * 0.14, cx + s * 0.14, cy + s * 0.22, s * 0.03, '#c8d0dc');
    line(g, cx - s * 0.24, cy + s * 0.23, cx + s * 0.26, cy + s * 0.23, s * 0.035, '#e8eef8');
  } else if (k === IT_PASS) {
    g.fillStyle = '#c0392b';
    rr(g, cx - s * 0.26, cy - s * 0.08, s * 0.48, s * 0.12, s * 0.04); g.fill();
    for (const fx of [-0.16, 0.1]) line(g, cx + s * fx, cy + s * 0.04, cx + s * fx, cy + s * 0.15, s * 0.04, '#7a4a24');
    g.strokeStyle = '#c8d0dc'; g.lineWidth = Math.max(1, s * 0.035); g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx - s * 0.28, cy + s * 0.17); g.lineTo(cx + s * 0.2, cy + s * 0.17); g.quadraticCurveTo(cx + s * 0.32, cy + s * 0.17, cx + s * 0.3, cy + s * 0.05); g.stroke();
    line(g, cx - s * 0.2, cy - s * 0.08, cx - s * 0.28, cy - s * 0.2, s * 0.03, '#7a4a24');
  } else if (k === IT_RESIST) {
    g.lineCap = 'round';
    g.strokeStyle = '#e8394a'; g.lineWidth = s * 0.12;
    g.beginPath(); g.arc(cx, cy - s * 0.08, s * 0.16, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
    g.fillStyle = '#e8394a';
    rr(g, cx + s * 0.04, cy, s * 0.12, s * 0.26, s * 0.03); g.fill();
    g.fillStyle = '#fff';
    for (let j = 0; j < 3; j++) g.fillRect(cx + s * 0.04, cy + s * (0.04 + j * 0.08), s * 0.12, s * 0.035);
  } else if (k === IT_KICK) kickIcon(g, cx, cy, s, '#8a5a33', '#3a2414', '#c0392b');
  else if (k === IT_REMOTE) {                                      // дзвоник-детонатор
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.moveTo(cx - s * 0.2, cy + s * 0.14); g.quadraticCurveTo(cx - s * 0.16, cy - s * 0.2, cx, cy - s * 0.22);
    g.quadraticCurveTo(cx + s * 0.16, cy - s * 0.2, cx + s * 0.2, cy + s * 0.14); g.closePath(); g.fill();
    g.fillStyle = '#c99a1a'; g.fillRect(cx - s * 0.22, cy + s * 0.11, s * 0.44, s * 0.06);
    circle(g, cx, cy + s * 0.22, s * 0.06, '#c99a1a');
    circle(g, cx, cy - s * 0.25, s * 0.04, '#c99a1a');
    ellipse(g, cx - s * 0.08, cy - s * 0.06, s * 0.03, s * 0.08, 'rgba(255,255,255,0.5)', 0.3);
  }
  g.save();
  rr(g, s * 0.1, s * 0.1, s * 0.8, s * 0.8, s * 0.16); g.clip();
  snowCap(g, s * 0.1, s * 0.1, s * 0.8, 0.12);
  g.restore();
}

// Петарда: червоний циліндр із золотими смугами й ґнотом
function cracker(g, cx, cy, s, red = '#d93a3a') {
  const w = s * 0.32, h = s * 0.46;
  g.fillStyle = red;
  rr(g, cx - w / 2, cy - h / 2, w, h, w * 0.18); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(cx - w * 0.32, cy - h / 2 + h * 0.08, w * 0.14, h * 0.84);
  g.fillStyle = '#ffd23f';
  g.fillRect(cx - w / 2, cy - h * 0.32, w, h * 0.1);
  g.fillRect(cx - w / 2, cy + h * 0.22, w, h * 0.1);
  g.strokeStyle = '#d9c39a'; g.lineWidth = Math.max(1, s * 0.035); g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx, cy - h / 2); g.quadraticCurveTo(cx + w * 0.1, cy - h * 0.75, cx + w * 0.45, cy - h * 0.72); g.stroke();
  return [cx + w * 0.45, cy - h * 0.72];
}
function bomb(g, x, y, s, k, T) {
  const z = 1 + bombBeat(k, T) * 1.6, cx = x + s / 2, cy = y + s * 0.56;
  ellipse(g, cx, y + s * 0.88, s * 0.24, s * 0.07, 'rgba(0,0,0,0.3)');
  const [sx, sy] = cracker(g, cx, cy, s * z, bombFlash(k, T) ? '#ff7a6a' : '#d93a3a');
  spark(g, sx, sy, s);
}

// Сніговик: дві кулі, вуглинки, ніс-морквина в бік руху, гілочки-руки, циліндр і шарф кольору гравця
function player(g, p, s, T, { col, walk, bob, dead }) {
  const edge = 'rgba(40,60,100,0.5)', rim = luma(col) > 0.8 ? 'rgba(40,50,80,0.7)' : 'rgba(0,0,0,0.35)';
  g.rotate(walk * 0.08);
  for (const sx of [-1, 1]) {                                      // гілочки
    const wy = s * 0.02 - bob - sx * walk * s * 0.05;
    line(g, sx * s * 0.2, s * 0.12 - bob, sx * s * 0.38, wy - s * 0.06, s * 0.035, '#7a4a24');
    line(g, sx * s * 0.32, wy - s * 0.04, sx * s * 0.36, wy - s * 0.14, s * 0.025, '#7a4a24');
  }
  ellipse(g, 0, s * 0.2, s * 0.26, s * 0.2, SNOW);
  g.strokeStyle = edge; g.lineWidth = Math.max(1, s * 0.02); g.stroke();
  if (p.dr !== 1) for (const by of [0.13, 0.25]) circle(g, 0, s * by, s * 0.025, COAL);
  const hy = -s * 0.1 - bob;
  circle(g, 0, hy, s * 0.19, SNOW);
  g.strokeStyle = edge; g.stroke();
  g.fillStyle = col;                                               // шарф
  rr(g, -s * 0.17, hy + s * 0.12, s * 0.34, s * 0.08, s * 0.04); g.fill();
  g.strokeStyle = rim; g.lineWidth = Math.max(1, s * 0.015); g.stroke();
  const tail = p.dr === 4 ? 1 : -1;
  g.fillStyle = col;
  rr(g, tail * s * 0.12 - s * 0.04, hy + s * 0.16, s * 0.08, s * 0.16, s * 0.03); g.fill(); g.stroke();
  g.fillStyle = col;                                               // циліндр
  rr(g, -s * 0.21, hy - s * 0.17, s * 0.42, s * 0.06, s * 0.03); g.fill(); g.stroke();
  rr(g, -s * 0.13, hy - s * 0.38, s * 0.26, s * 0.23, s * 0.03); g.fill(); g.stroke();
  g.fillStyle = shade(col, -0.4);
  g.fillRect(-s * 0.13, hy - s * 0.21, s * 0.26, s * 0.04);
  if (p.dr === 1) return;
  const fx = (DX[p.dr] || 0) * s * 0.06;
  if (dead) {
    g.strokeStyle = COAL; g.lineWidth = Math.max(1, s * 0.025);
    for (const ex of [-0.065, 0.065]) {
      const ox = ex * s + fx, oy = hy - s * 0.03, e = s * 0.03;
      g.beginPath(); g.moveTo(ox - e, oy - e); g.lineTo(ox + e, oy + e); g.moveTo(ox + e, oy - e); g.lineTo(ox - e, oy + e); g.stroke();
    }
  } else for (const ex of [-0.065, 0.065]) circle(g, ex * s + fx, hy - s * 0.03, s * 0.028, COAL);
  const nd = DX[p.dr] || 0;                                        // морквина
  if (nd) poly(g, [[fx, hy + s * 0.01], [fx, hy + s * 0.06], [fx + nd * s * 0.2, hy + s * 0.04]], CARROT);
  else poly(g, [[-s * 0.03, hy + s * 0.02], [s * 0.03, hy + s * 0.02], [s * 0.02, hy + s * 0.12]], CARROT);
}

// Монстри: 0 — пінгвін, 1 — єті, 2 — хурделиця
function monster(g, m, s, T, wob) {
  const ex = (DX[m.d] || 0) * s * 0.05, ey = ((m.d === 3) - (m.d === 1)) * s * 0.03;
  if (m.k === 0) {
    const w = Math.sin(T / 110 + m.i) * 0.12;
    g.rotate(w);
    for (const sx of [-1, 1]) ellipse(g, sx * s * 0.1, s * 0.33, s * 0.08, s * 0.04, CARROT);
    ellipse(g, 0, s * 0.02, s * 0.25, s * 0.32, '#1d2230');
    ellipse(g, ex * 0.6, s * 0.08, s * 0.17, s * 0.23, '#f4f6fa');
    for (const sx of [-1, 1]) ellipse(g, sx * s * 0.24, s * 0.06, s * 0.05, s * 0.14, '#1d2230', sx * 0.3);
    for (const sx of [-1, 1]) { circle(g, sx * s * 0.08 + ex, -s * 0.14 + ey, s * 0.05, '#fff'); circle(g, sx * s * 0.08 + ex * 1.3, -s * 0.13 + ey, s * 0.025, '#111'); }
    poly(g, [[ex - s * 0.05, -s * 0.07 + ey], [ex + s * 0.05, -s * 0.07 + ey], [ex * 1.6, s * 0.0 + ey]], CARROT);
    return;
  }
  if (m.k === 1) {
    g.fillStyle = '#dbe8f4';                                       // кудлате хутро
    g.beginPath();
    const n = 14;
    for (let j = 0; j <= n * 2; j++) {
      const a = j / (n * 2) * TAU, r = s * (j % 2 ? 0.31 : 0.38 + wob * 0.015);
      j ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.95) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.95);
    }
    g.fill();
    g.strokeStyle = 'rgba(80,110,150,0.45)'; g.lineWidth = Math.max(1, s * 0.02); g.stroke();
    for (const sx of [-1, 1]) poly(g, [[sx * s * 0.14, -s * 0.28], [sx * s * 0.24, -s * 0.3], [sx * s * 0.26, -s * 0.46]], '#c9b48a');
    ellipse(g, ex, -s * 0.02 + ey, s * 0.2, s * 0.16, '#6f86a3');
    for (const sx of [-1, 1]) { circle(g, sx * s * 0.08 + ex, -s * 0.06 + ey, s * 0.045, '#ffe23d'); circle(g, sx * s * 0.08 + ex * 1.3, -s * 0.06 + ey, s * 0.02, '#111'); }
    g.strokeStyle = '#2b3245'; g.lineWidth = Math.max(1, s * 0.03);
    g.beginPath(); g.moveTo(-s * 0.15 + ex, -s * 0.14 + ey); g.lineTo(-s * 0.03 + ex, -s * 0.1 + ey); g.moveTo(s * 0.15 + ex, -s * 0.14 + ey); g.lineTo(s * 0.03 + ex, -s * 0.1 + ey); g.stroke();
    g.fillStyle = '#2b3245'; rr(g, -s * 0.08 + ex, s * 0.04 + ey, s * 0.16, s * 0.06, s * 0.02); g.fill();
    g.fillStyle = '#fff'; g.fillRect(-s * 0.06 + ex, s * 0.04 + ey, s * 0.03, s * 0.03); g.fillRect(s * 0.03 + ex, s * 0.04 + ey, s * 0.03, s * 0.03);
    return;
  }
  for (let j = 0; j < 6; j++) {                                    // клубки снігу по колу
    const a = T / 500 + j * TAU / 6 + m.i;
    circle(g, Math.cos(a) * s * 0.16, Math.sin(a) * s * 0.12 + wob * s * 0.02, s * (0.17 + 0.03 * Math.sin(T / 200 + j)), 'rgba(235,245,255,0.55)');
  }
  circle(g, 0, 0, s * 0.2, 'rgba(240,248,255,0.8)');
  g.strokeStyle = 'rgba(150,200,255,0.8)'; g.lineWidth = Math.max(1, s * 0.03);
  g.beginPath(); g.arc(0, s * 0.02, s * 0.3, T / 300, T / 300 + 2); g.stroke();
  for (const sx of [-1, 1]) { ellipse(g, sx * s * 0.08 + ex, -s * 0.04 + ey, s * 0.05, s * 0.07, '#2b6fd6'); circle(g, sx * s * 0.08 + ex, -s * 0.05 + ey, s * 0.02, '#e0f4ff'); }
}

export default {
  name: 'Зима',
  bg: '#0c1424',
  emoji: { bomb: '🧨', fire: '🎆', speed: '⛸️', pass: '🛷', resist: '🧣', kick: '🥾', remote: '🔔' },
  fire: ['#ff4a3d', '#ffb347', '#fffbe6'],
  burn: ['#ff5a2a', 'rgba(255,200,80,0)'],
  blocks: 4,
  floor, stone, block, wall, item, bomb, player, monster,
};
