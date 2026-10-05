// halloween.js — «Хелловін»: цвинтар уночі, стовпи — кладка склепу на всю клітинку (як мур рамки), блоки — гарбузи
// й труни з тінню,
// стіна з черепом; відьми й чаклуни в капелюхах кольору гравця; скелети, кажани, привиди; зелений відьмин вогонь.
import { DX, IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, IT_REMOTE, mulberry32 } from '../sim.js';
import { TAU, rr, bevel, rnd, luma, shade, circle, ellipse, line, poly, bombShape, bombBeat, bombFlash, pillarShade, spark, flameShape, ghostPath } from './common.js';

const BONE = '#e9e3d3', ORANGE = '#ff8a1f';

// Павутина в куті (cx, cy): sx, sy — у який бік (±1), r — розмір
function web(g, cx, cy, sx, sy, r, w) {
  g.strokeStyle = 'rgba(220,215,235,0.45)'; g.lineWidth = w; g.lineCap = 'round';
  const N = 6, ang = (k) => (k / (N - 1)) * Math.PI / 2;
  const pt = (k, d) => [cx + sx * Math.cos(ang(k)) * d, cy + sy * Math.sin(ang(k)) * d];
  g.beginPath();
  for (let k = 0; k < N; k++) { g.moveTo(cx, cy); g.lineTo(...pt(k, r)); }
  for (let ring = 1; ring <= 5; ring++) {
    const d = r * ring / 5.4;
    g.moveTo(...pt(0, d));
    for (let k = 1; k < N; k++) {
      const [x1, y1] = pt(k - 1, d), [x2, y2] = pt(k, d), [mx, my] = pt(k - 0.5, d * 0.86);
      g.quadraticCurveTo(mx, my, x2, y2);
    }
  }
  g.stroke();
}
// Павук на нитці
function spider(g, x, y0, y, r, w) {
  line(g, x, y0, x, y, w, 'rgba(220,215,235,0.45)');
  g.strokeStyle = '#3b2a4f'; g.lineWidth = w * 2;
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
    const a = -0.6 + k * 0.4;
    g.beginPath(); g.moveTo(x, y + r * 0.3); g.lineTo(x + sx * r * 1.3, y + r * (a - 0.2)); g.lineTo(x + sx * r * 1.9, y + r * (a + 0.9)); g.stroke();
  }
  circle(g, x, y + r * 0.4, r, '#3b2a4f'); circle(g, x, y - r * 0.5, r * 0.6, '#3b2a4f');
  circle(g, x - r * 0.22, y - r * 0.55, r * 0.15, '#9dff4a'); circle(g, x + r * 0.22, y - r * 0.55, r * 0.15, '#9dff4a');
}
// Череп під кутом
function skullAt(g, x, y, r, rot) {
  g.save(); g.translate(x, y); g.rotate(rot); skull(g, 0, 0, r, BONE, '#1a0f22'); g.restore();
}
function bone(g, x1, y1, x2, y2, w) {
  line(g, x1, y1, x2, y2, w, BONE);
  const a = Math.atan2(y2 - y1, x2 - x1), n = w * 0.55;
  for (const [x, y] of [[x1, y1], [x2, y2]]) for (const s of [-1, 1]) circle(g, x + Math.cos(a + s * Math.PI / 2) * n, y + Math.sin(a + s * Math.PI / 2) * n, w * 0.6, BONE);
}
// Скелет сидить, спершись спиною ліворуч; (x, y) — де таз
function skeleton(g, x, y, u) {
  bone(g, x, y, x + 3 * u, y - 46 * u, 7 * u);                             // хребет
  for (let k = 0; k < 4; k++) {                                            // ребра
    const ry = y - (40 - k * 8) * u, w = (17 - k * 2) * u;
    g.strokeStyle = BONE; g.lineWidth = 3.5 * u;
    g.beginPath(); g.ellipse(x + 3 * u, ry, w, 4 * u, 0, 0.15, Math.PI - 0.15); g.stroke();
  }
  ellipse(g, x, y, 16 * u, 7 * u, BONE);                                   // таз
  bone(g, x + 8 * u, y, x + 40 * u, y - 18 * u, 6 * u); bone(g, x + 40 * u, y - 18 * u, x + 62 * u, y + 4 * u, 5 * u);   // ноги
  bone(g, x - 6 * u, y + 2 * u, x + 30 * u, y + 2 * u, 6 * u); bone(g, x + 30 * u, y + 2 * u, x + 56 * u, y + 12 * u, 5 * u);
  bone(g, x + 14 * u, y - 42 * u, x + 26 * u, y - 18 * u, 5 * u); bone(g, x + 26 * u, y - 18 * u, x + 44 * u, y - 22 * u, 4.5 * u);   // рука на коліні
  skullAt(g, x + 8 * u, y - 62 * u, 15 * u, 0.25);
}

function backdrop(g, W, H, dpr) {
  const x = W * 0.88, y = H * 0.12, r = Math.min(W, H) * 0.09;
  const glow = g.createRadialGradient(x, y, r * 0.8, x, y, r * 3);
  glow.addColorStop(0, 'rgba(255,240,200,0.18)'); glow.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  circle(g, x, y, r, '#f3e9c6');
  circle(g, x - r * 0.3, y + r * 0.2, r * 0.18, 'rgba(180,170,140,0.35)');
  circle(g, x + r * 0.35, y - r * 0.3, r * 0.1, 'rgba(180,170,140,0.35)');
  const rng = mulberry32(31337);
  for (let j = 0; j < 60; j++) {
    g.fillStyle = `rgba(255,255,255,${0.2 + rng() * 0.4})`;
    g.fillRect(rng() * W, rng() * H * 0.6, dpr, dpr);
  }
  const u = H / 900;
  web(g, 0, 0, 1, 1, 190 * u, 1.3 * u);
  web(g, W, H, -1, -1, 150 * u, 1.3 * u);
  spider(g, W * 0.085, 0, H * 0.32, 13 * u, 1.3 * u);
  ellipse(g, W * 0.09, H * 0.99, 150 * u, 30 * u, '#1d1426');
  skeleton(g, W * 0.04, H * 0.95, u * 1.5);
  bone(g, W * 0.89, H * 0.97, W * 0.93, H * 0.935, 8 * u);
  skullAt(g, W * 0.955, H * 0.935, 20 * u, -0.3);
}

function floor(g, px, py, s, x, y, map) {
  const i = y * map.GW + x;
  g.fillStyle = (x + y) % 2 ? '#2b2339' : '#282035';
  g.fillRect(px, py, s, s);
  const r = rnd(i, 6);
  if (r < 0.35) {                                                  // трава
    g.strokeStyle = 'rgba(70,110,60,0.55)'; g.lineWidth = Math.max(1, s * 0.025); g.lineCap = 'round';
    const bx = px + s * (0.2 + rnd(i, 7) * 0.6), by = py + s * (0.3 + rnd(i, 8) * 0.5);
    g.beginPath();
    for (const a of [-0.5, 0, 0.5]) { g.moveTo(bx, by); g.lineTo(bx + a * s * 0.1, by - s * 0.12); }
    g.stroke();
  } else if (r < 0.42) {                                           // кісточка
    const bx = px + s * 0.5, by = py + s * 0.6;
    line(g, bx - s * 0.1, by, bx + s * 0.1, by - s * 0.04, s * 0.035, 'rgba(233,227,211,0.5)');
    for (const [dx, dy] of [[-0.1, 0], [0.1, -0.04]]) circle(g, bx + dx * s, by + dy * s, s * 0.03, 'rgba(233,227,211,0.5)');
  }
  pillarShade(g, map, x, y, px, py, s, 'rgba(0,0,0,0.35)');
}

// Рамка — мур склепу; стовп — кам'яна кладка склепу на всю клітинку з вирізьбленим хрестом чи готичною аркою
function masonry(g, x, y, s, cx, cy, base, brick) {
  g.fillStyle = base; g.fillRect(x, y, s, s);
  g.fillStyle = brick;
  const h = s / 2, gap = Math.max(1, s * 0.05);
  for (let r = 0; r < 2; r++) {
    const off = (r + cx + cy) % 2 ? s / 2 : 0;
    for (let k = -1; k < 2; k++) {
      const bx = x + off + k * s, w = s - gap;
      const x0 = Math.max(x, bx + gap / 2), x1 = Math.min(x + s, bx + w + gap / 2);
      if (x1 > x0) g.fillRect(x0, y + r * h + gap / 2, x1 - x0, h - gap);
    }
  }
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, y, s, Math.max(1, s * 0.05));
}
function stone(g, x, y, s, border, cx, cy, map) {
  if (border) return masonry(g, x, y, s, cx, cy, '#2a2433', '#463d55');
  const d = Math.max(1, Math.round(s * 0.07)), i = cy * map.GW + cx;
  masonry(g, x, y, s, cx, cy, '#211b29', '#4b4259');
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + s - d, s, d); g.fillRect(x + s - d, y, d, s);
  g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x, y, s, d * 0.6); g.fillRect(x, y, d * 0.6, s);
  g.fillStyle = '#2a2433';                                         // різьба: хрест або арка
  if (rnd(i, 9) < 0.5) { g.fillRect(x + s * 0.45, y + s * 0.2, s * 0.1, s * 0.58); g.fillRect(x + s * 0.32, y + s * 0.34, s * 0.36, s * 0.1); }
  else { g.beginPath(); g.moveTo(x + s * 0.34, y + s * 0.78); g.lineTo(x + s * 0.34, y + s * 0.42); g.arc(x + s / 2, y + s * 0.42, s * 0.16, Math.PI, 0); g.lineTo(x + s * 0.66, y + s * 0.78); g.closePath(); g.fill(); }
  if (rnd(i, 4) < 0.4) { circle(g, x + s * 0.2, y + s * 0.84, s * 0.06, 'rgba(90,140,70,0.6)'); circle(g, x + s * 0.3, y + s * 0.88, s * 0.04, 'rgba(90,140,70,0.6)'); }
}

// Блоки: 0 — гарбуз-ліхтар, 1 — гарбуз, 2 — труна
function pumpkin(g, s, face) {
  ellipse(g, s / 2, s * 0.88, s * 0.36, s * 0.08, 'rgba(0,0,0,0.35)');
  line(g, s / 2, s * 0.2, s * 0.56, s * 0.08, s * 0.08, '#4a7a2a', 'butt');
  for (const [dx, w, c] of [[-0.2, 0.2, '#d9640f'], [0.2, 0.2, '#d9640f'], [-0.08, 0.2, '#f07a1a'], [0.08, 0.2, '#f07a1a'], [0, 0.17, ORANGE]]) {
    ellipse(g, s * (0.5 + dx), s * 0.55, s * w, s * 0.34, c);
  }
  if (!face) { ellipse(g, s * 0.42, s * 0.4, s * 0.05, s * 0.12, 'rgba(255,255,255,0.2)'); return; }
  const glow = '#ffe066';
  poly(g, [[s * 0.3, s * 0.5], [s * 0.42, s * 0.5], [s * 0.36, s * 0.38]], glow);
  poly(g, [[s * 0.58, s * 0.5], [s * 0.7, s * 0.5], [s * 0.64, s * 0.38]], glow);
  g.fillStyle = glow;
  g.beginPath(); g.moveTo(s * 0.28, s * 0.62); g.quadraticCurveTo(s * 0.5, s * 0.82, s * 0.72, s * 0.62);
  g.lineTo(s * 0.62, s * 0.66); g.lineTo(s * 0.58, s * 0.62); g.lineTo(s * 0.5, s * 0.67); g.lineTo(s * 0.42, s * 0.62); g.lineTo(s * 0.38, s * 0.66); g.closePath(); g.fill();
}
function block(g, s, v) {
  if (v < 2) return pumpkin(g, s, v === 0);
  ellipse(g, s / 2, s * 0.92, s * 0.3, s * 0.07, 'rgba(0,0,0,0.4)');
  const pts = [[0.36, 0.04], [0.64, 0.04], [0.82, 0.3], [0.7, 0.96], [0.3, 0.96], [0.18, 0.3]].map(([a, b]) => [a * s, b * s]);
  poly(g, pts, '#5a3520');
  g.strokeStyle = '#2e1a0f'; g.lineWidth = Math.max(1, s * 0.04); g.stroke();
  poly(g, pts.map(([a, b]) => [s / 2 + (a - s / 2) * 0.78, s / 2 + (b - s / 2) * 0.84]), '#6e4428');
  g.strokeStyle = '#c9a26b'; g.lineWidth = Math.max(1, s * 0.05);
  g.beginPath(); g.moveTo(s / 2, s * 0.24); g.lineTo(s / 2, s * 0.62); g.moveTo(s * 0.38, s * 0.36); g.lineTo(s * 0.62, s * 0.36); g.stroke();
}

// Стіна — камінь з черепом
function wall(g, s) {
  const d = Math.max(1, Math.round(s * 0.09));
  bevel(g, 0, 0, s, '#3e3650', '#5a5070', '#1f1a2a', d);
  skull(g, s / 2, s * 0.46, s * 0.26, '#cfc8b6', '#1f1a2a');
}
function skull(g, cx, cy, r, bone, hole) {
  circle(g, cx, cy, r, bone);
  g.fillStyle = bone; rr(g, cx - r * 0.55, cy + r * 0.5, r * 1.1, r * 0.6, r * 0.2); g.fill();
  for (const sx of [-1, 1]) ellipse(g, cx + sx * r * 0.4, cy + r * 0.05, r * 0.24, r * 0.28, hole);
  poly(g, [[cx, cy + r * 0.38], [cx - r * 0.1, cy + r * 0.56], [cx + r * 0.1, cy + r * 0.56]], hole);
  g.fillStyle = hole;
  for (const dx of [-0.3, 0, 0.3]) g.fillRect(cx + dx * r - r * 0.04, cy + r * 0.78, r * 0.08, r * 0.3);
}

// Бонуси: 💣 бомба з черепом, 🕯 свічка, 🧹 мітла, 👻 привид, 🧪 зілля
function item(g, k, s) {
  const p = s * 0.1, cx = s / 2, cy = s / 2;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  rr(g, p + s * 0.03, p + s * 0.05, s - 2 * p, s - 2 * p, s * 0.16); g.fill();
  g.fillStyle = '#2d1745';
  rr(g, p, p, s - 2 * p, s - 2 * p, s * 0.16); g.fill();
  g.strokeStyle = ORANGE; g.lineWidth = Math.max(1, s * 0.045);
  rr(g, p, p, s - 2 * p, s - 2 * p, s * 0.16); g.stroke();
  if (k === IT_BOMB) skullBomb(g, cx, cy + s * 0.04, s * 0.2);
  else if (k === IT_FIRE) {
    g.fillStyle = '#f3e6c4';
    rr(g, cx - s * 0.09, cy - s * 0.04, s * 0.18, s * 0.3, s * 0.03); g.fill();
    ellipse(g, cx + s * 0.05, cy, s * 0.03, s * 0.07, '#f3e6c4');
    line(g, cx, cy - s * 0.04, cx, cy - s * 0.09, s * 0.02, '#333');
    flameShape(g, cx, cy - s * 0.17, s * 0.09, ORANGE);
    flameShape(g, cx, cy - s * 0.15, s * 0.05, '#ffe066');
  } else if (k === IT_SPEED) {
    line(g, cx + s * 0.24, cy - s * 0.24, cx - s * 0.06, cy + s * 0.06, s * 0.05, '#8a5a33');
    g.fillStyle = '#d9a441';
    g.beginPath(); g.moveTo(cx - s * 0.02, cy + s * 0.02); g.lineTo(cx - s * 0.3, cy + s * 0.12); g.lineTo(cx - s * 0.18, cy + s * 0.3); g.lineTo(cx + s * 0.04, cy + s * 0.1); g.closePath(); g.fill();
    line(g, cx - s * 0.04, cy + s * 0.04, cx + s * 0.03, cy + s * 0.1, s * 0.05, '#a8322a');
  } else if (k === IT_PASS) {
    g.save(); g.translate(cx, cy + s * 0.04); g.scale(0.75, 0.75);
    ghostPath(g, s, 0.5, 0.3);
    g.fillStyle = '#f0f0ff'; g.fill();
    for (const sx of [-1, 1]) ellipse(g, sx * s * 0.1, -s * 0.08, s * 0.05, s * 0.08, '#1d1430');
    g.restore();
  } else if (k === IT_RESIST) {
    g.fillStyle = '#7dff5a';
    g.beginPath(); g.arc(cx, cy + s * 0.08, s * 0.17, 0, TAU); g.fill();
    g.fillStyle = 'rgba(220,240,255,0.5)';
    g.beginPath(); g.arc(cx, cy + s * 0.08, s * 0.17, Math.PI * 1.05, Math.PI * 1.95); g.fill();
    g.fillStyle = 'rgba(220,240,255,0.5)'; g.fillRect(cx - s * 0.06, cy - s * 0.2, s * 0.12, s * 0.14);
    g.fillStyle = '#8a5a33'; g.fillRect(cx - s * 0.07, cy - s * 0.26, s * 0.14, s * 0.07);
    circle(g, cx - s * 0.05, cy + s * 0.1, s * 0.03, '#d4ffc4');
    circle(g, cx + s * 0.06, cy + s * 0.04, s * 0.02, '#d4ffc4');
  } else if (k === IT_REMOTE) {                                      // кришталева куля
    ellipse(g, cx, cy + s * 0.22, s * 0.16, s * 0.05, '#5a3a1f');
    g.fillStyle = '#7a4a24'; g.fillRect(cx - s * 0.12, cy + s * 0.12, s * 0.24, s * 0.1);
    const grd = g.createRadialGradient(cx - s * 0.06, cy - s * 0.08, s * 0.02, cx, cy - s * 0.02, s * 0.2);
    grd.addColorStop(0, '#f4d9ff'); grd.addColorStop(0.5, '#b25cff'); grd.addColorStop(1, '#4a1a7a');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy - s * 0.02, s * 0.2, 0, TAU); g.fill();
    circle(g, cx + s * 0.04, cy, s * 0.04, '#7dff5a');
  }
}
function skullBomb(g, cx, cy, r, red) {
  bombShape(g, cx, cy, r, '#4a4458', '#0d0b12', '#8a7a5a');
  skull(g, cx, cy - r * 0.05, r * 0.42, red ? '#ff8a7a' : BONE, '#0d0b12');
}
function bomb(g, x, y, s, k, T) {
  const r = s * (0.33 + bombBeat(k, T)), cx = x + s / 2, cy = y + s * 0.55;
  ellipse(g, cx, y + s * 0.87, s * 0.3, s * 0.09, 'rgba(0,0,0,0.35)');
  skullBomb(g, cx, cy, r, bombFlash(k, T));
  spark(g, cx + r * 1.2, cy - r * 1.05, s, '#9dff4a', '#f2ffd6');
}

// Відьма / чаклун: капелюх і мантія кольору гравця, обличчя з очима в бік руху
function player(g, p, s, T, { col, walk, bob, dead }) {
  const rim = luma(col) < 0.3 ? 'rgba(220,210,255,0.6)' : 'rgba(0,0,0,0.4)';
  for (const [sx, w] of [[-1, walk], [1, -walk]]) ellipse(g, sx * s * 0.12, s * 0.37 + w * s * 0.05, s * 0.09, s * 0.06, '#15121c');
  g.fillStyle = shade(col, -0.15);                                 // мантія
  g.beginPath(); g.moveTo(-s * 0.13, -s * 0.02 - bob); g.lineTo(s * 0.13, -s * 0.02 - bob); g.lineTo(s * 0.25, s * 0.36); g.lineTo(-s * 0.25, s * 0.36); g.closePath(); g.fill();
  g.strokeStyle = rim; g.lineWidth = Math.max(1, s * 0.02); g.stroke();
  g.fillStyle = shade(col, -0.45); g.fillRect(-s * 0.15, s * 0.1 - bob, s * 0.3, s * 0.04);
  for (const sx of [-1, 1]) circle(g, sx * s * 0.22, s * 0.14 - bob - sx * walk * s * 0.04, s * 0.06, '#c9f2b0');
  const hy = -s * 0.06 - bob;
  if (p.dr === 1) ellipse(g, 0, hy + s * 0.02, s * 0.2, s * 0.18, '#3b2350');   // зі спини — волосся
  else {
    circle(g, 0, hy, s * 0.17, '#c9f2b0');
    const fx = (DX[p.dr] || 0) * s * 0.06;
    if (dead) {
      g.strokeStyle = '#15121c'; g.lineWidth = Math.max(1, s * 0.025);
      for (const ex of [-0.06, 0.06]) {
        const ox = ex * s + fx, oy = hy + s * 0.01, e = s * 0.03;
        g.beginPath(); g.moveTo(ox - e, oy - e); g.lineTo(ox + e, oy + e); g.moveTo(ox + e, oy - e); g.lineTo(ox - e, oy + e); g.stroke();
      }
    } else for (const ex of [-0.06, 0.06]) circle(g, ex * s + fx, hy + s * 0.01, s * 0.028, '#15121c');
    circle(g, fx * 1.3, hy + s * 0.06, s * 0.025, '#9ad67a');
  }
  g.fillStyle = col;                                               // капелюх
  g.beginPath(); g.ellipse(0, hy - s * 0.1, s * 0.3, s * 0.07, 0, 0, TAU); g.fill();
  g.strokeStyle = rim; g.stroke();
  const tip = (DX[p.dr] || 0.6) * -s * 0.12;
  g.beginPath(); g.moveTo(-s * 0.15, hy - s * 0.12); g.lineTo(s * 0.15, hy - s * 0.12);
  g.quadraticCurveTo(s * 0.06, hy - s * 0.3, tip, hy - s * 0.46); g.quadraticCurveTo(-s * 0.04, hy - s * 0.3, -s * 0.15, hy - s * 0.12);
  g.fill(); g.stroke();
  g.fillStyle = shade(col, -0.5); g.fillRect(-s * 0.14, hy - s * 0.17, s * 0.28, s * 0.05);
  g.fillStyle = '#ffd23f'; g.fillRect(-s * 0.03, hy - s * 0.17, s * 0.06, s * 0.05);
}

// Монстри: 0 — скелет, 1 — кажан, 2 — привид
function monster(g, m, s, T, wob) {
  const ex = (DX[m.d] || 0) * s * 0.05, ey = ((m.d === 3) - (m.d === 1)) * s * 0.03;
  if (m.k === 0) {
    const st = Math.sin(T / 120 + m.i);
    for (const sx of [-1, 1]) line(g, sx * s * 0.07, s * 0.16, sx * s * 0.1 + sx * st * s * 0.04, s * 0.38, s * 0.045, BONE);
    line(g, 0, -s * 0.02, 0, s * 0.18, s * 0.04, BONE);
    for (let j = 0; j < 3; j++) line(g, -s * 0.12 + j * s * 0.01, s * (0.02 + j * 0.055), s * 0.12 - j * s * 0.01, s * (0.02 + j * 0.055), s * 0.03, BONE);
    for (const sx of [-1, 1]) line(g, sx * s * 0.13, s * 0.02, sx * s * 0.24, s * 0.16 + sx * st * s * 0.05, s * 0.035, BONE);
    circle(g, 0, -s * 0.17, s * 0.17, BONE);
    g.fillStyle = BONE; rr(g, -s * 0.09, -s * 0.06, s * 0.18, s * 0.08, s * 0.02); g.fill();
    for (const sx of [-1, 1]) { ellipse(g, sx * s * 0.065 + ex, -s * 0.17 + ey, s * 0.045, s * 0.05, '#1a1424'); circle(g, sx * s * 0.065 + ex, -s * 0.17 + ey, s * 0.018, '#ff4a3d'); }
    return;
  }
  if (m.k === 1) {
    const f = Math.sin(T / 55 + m.i);
    for (const sx of [-1, 1]) {
      g.fillStyle = '#3a2550';
      g.beginPath();
      g.moveTo(sx * s * 0.08, -s * 0.06);
      g.lineTo(sx * s * 0.42, -s * 0.16 - f * s * 0.12);
      g.quadraticCurveTo(sx * s * 0.36, s * 0.0, sx * s * 0.3, s * 0.06 - f * s * 0.04);
      g.quadraticCurveTo(sx * s * 0.24, -s * 0.0, sx * s * 0.18, s * 0.08 - f * s * 0.02);
      g.quadraticCurveTo(sx * s * 0.14, s * 0.02, sx * s * 0.06, s * 0.08);
      g.closePath(); g.fill();
    }
    ellipse(g, 0, 0, s * 0.12, s * 0.15, '#4a2f66');
    for (const sx of [-1, 1]) poly(g, [[sx * s * 0.04, -s * 0.12], [sx * s * 0.12, -s * 0.12], [sx * s * 0.1, -s * 0.24]], '#4a2f66');
    for (const sx of [-1, 1]) circle(g, sx * s * 0.045 + ex * 0.5, -s * 0.04 + ey, s * 0.03, '#ff4a3d');
    g.fillStyle = '#fff';
    for (const sx of [-1, 1]) poly(g, [[sx * s * 0.035, s * 0.04], [sx * s * 0.015, s * 0.04], [sx * s * 0.025, s * 0.08]], '#fff');
    return;
  }
  ghostPath(g, s, wob, 0.3);
  g.fillStyle = '#f0f0ff'; g.fill();
  for (const sx of [-1, 1]) ellipse(g, sx * s * 0.1 + ex, -s * 0.1 + ey, s * 0.06, s * 0.09, '#1d1430');
  ellipse(g, ex, s * 0.06 + ey, s * 0.05, s * 0.07, '#1d1430');
}

export default {
  name: 'Хелловін',
  bg: '#0d0814',
  backdrop,
  emoji: { bomb: '💣', fire: '🕯️', speed: '🧹', pass: '👻', resist: '🧪', remote: '🔮' },
  fire: ['#2fae3a', '#9dff4a', '#f2ffd6'],
  burn: ['#58d63a', 'rgba(157,255,74,0)'],
  blocks: 3,
  floor, stone, block, wall, item, bomb, player, monster,
};
