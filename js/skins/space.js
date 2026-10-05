// space.js — «Космос»: зорі навколо, палуба станції, стовпи — темні переборки на всю клітинку (як корпус з ілюмінаторами),
// блоки — яскраві контейнери з тінню,
// гермодвері замість стін; астронавти в скафандрах кольору гравця; слизняки, тарілки, примари порожнечі.
import { DX, IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST, IT_REMOTE, mulberry32 } from '../sim.js';
import { TAU, rr, bevel, rgba, rnd, luma, shade, circle, ellipse, line, poly, bombShape, bombBeat, bombFlash, pillarShade, ghostPath } from './common.js';

const GLOW = '#4fc3ff';

// Невеличка спіральна галактика: ядро, рукави з зір, нахил (стиснення по y)
function galaxy(g, x, y, r, tilt, rot, hue, dpr, seed) {
  g.save(); g.translate(x, y); g.rotate(rot); g.scale(1, tilt);
  const core = g.createRadialGradient(0, 0, 0, 0, 0, r);
  core.addColorStop(0, `hsla(${hue},80%,92%,0.9)`); core.addColorStop(0.15, `hsla(${hue},70%,70%,0.45)`);
  core.addColorStop(0.6, `hsla(${hue},70%,55%,0.12)`); core.addColorStop(1, `hsla(${hue},70%,50%,0)`);
  g.fillStyle = core; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  const rng = mulberry32(seed);
  for (let arm = 0; arm < 2; arm++) {
    for (let k = 0; k < 140; k++) {
      const t = rng(), a = arm * Math.PI + t * 4.2, d = r * (0.12 + t * 0.88);
      const jx = (rng() - 0.5) * r * 0.22 * (0.4 + t), jy = (rng() - 0.5) * r * 0.22 * (0.4 + t);
      g.fillStyle = rng() < 0.2 ? `hsla(${hue + 40},90%,80%,${0.5 + rng() * 0.5})` : `rgba(235,240,255,${0.25 + rng() * 0.6 * (1 - t)})`;
      const sz = (rng() < 0.85 ? 0.9 : 1.6) * dpr;
      g.fillRect(Math.cos(a) * d + jx, Math.sin(a) * d + jy, sz, sz);
    }
  }
  g.restore();
}

function backdrop(g, W, H, dpr) {
  const rng = mulberry32(12345);
  const neb = g.createRadialGradient(W * 0.8, H * 0.2, 0, W * 0.8, H * 0.2, Math.max(W, H) * 0.6);
  neb.addColorStop(0, 'rgba(110,60,200,0.25)'); neb.addColorStop(1, 'rgba(110,60,200,0)');
  g.fillStyle = neb; g.fillRect(0, 0, W, H);
  const n = Math.round(W * H / (9000 * dpr * dpr));
  for (let j = 0; j < n; j++) {
    const r = (rng() < 0.9 ? 0.6 : 1.3) * dpr, c = rng();
    g.fillStyle = c < 0.1 ? '#ffd9a0' : c < 0.2 ? '#a8d4ff' : `rgba(255,255,255,${0.4 + rng() * 0.6})`;
    g.fillRect(rng() * W, rng() * H, r, r);
  }
  const u = H / 900;
  for (const [fx, fy, r, tilt, rot, hue] of [[0.07, 0.22, 60, 0.45, 0.5, 220], [0.94, 0.68, 70, 0.6, -0.4, 290], [0.06, 0.84, 34, 0.35, -0.9, 30], [0.9, 0.16, 28, 0.8, 1.2, 190], [0.96, 0.42, 24, 0.5, 0.3, 0]]) {
    galaxy(g, W * fx, H * fy, r * u, tilt, rot, hue, dpr, Math.round(fx * 1000 + fy * 100));
  }
  const ex = W * 0.05, ey = H * 0.5, er = 22 * u;                          // еліптична — розмита пляма
  const el = g.createRadialGradient(ex, ey, 0, ex, ey, er);
  el.addColorStop(0, 'rgba(255,225,190,0.55)'); el.addColorStop(1, 'rgba(255,225,190,0)');
  g.save(); g.translate(ex, ey); g.scale(1.6, 1); g.translate(-ex, -ey); g.fillStyle = el; g.beginPath(); g.arc(ex, ey, er, 0, TAU); g.fill(); g.restore();
}

function floor(g, px, py, s, x, y, map) {
  const i = y * map.GW + x;
  g.fillStyle = (x + y) % 2 ? '#2a3143' : '#282f40';
  g.fillRect(px, py, s, s);
  g.fillStyle = 'rgba(0,0,0,0.35)';                               // шви між плитами
  g.fillRect(px, py + s - Math.max(1, s * 0.04), s, Math.max(1, s * 0.04));
  g.fillRect(px + s - Math.max(1, s * 0.04), py, Math.max(1, s * 0.04), s);
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(px, py, s, Math.max(1, s * 0.03));
  if (rnd(i, 4) < 0.22) {                                          // решітка вентиляції
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let j = 0; j < 4; j++) g.fillRect(px + s * 0.25, py + s * (0.28 + j * 0.13), s * 0.5, s * 0.06);
  } else for (const [fx, fy] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) circle(g, px + s * fx, py + s * fy, s * 0.025, 'rgba(255,255,255,0.12)');
  pillarShade(g, map, x, y, px, py, s, 'rgba(0,0,0,0.3)');
}

function stone(g, x, y, s, border, cx, cy, map) {
  const d = Math.max(1, Math.round(s * 0.09));
  if (border) {
    bevel(g, x, y, s, '#3b4356', '#59627a', '#20252f', d);
    if (rnd(cy * map.GW + cx, 5) < 0.3) {                          // ілюмінатор
      circle(g, x + s / 2, y + s / 2, s * 0.26, '#8a93a8');
      circle(g, x + s / 2, y + s / 2, s * 0.2, '#0b1030');
      circle(g, x + s * 0.44, y + s * 0.44, s * 0.05, 'rgba(255,255,255,0.6)');
      circle(g, x + s * 0.58, y + s * 0.55, s * 0.015, '#fff');
    } else {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x + d, y + s * 0.48, s - 2 * d, Math.max(1, d / 2));
    }
    return;
  }
  // стовп — темна переборка корпусу (як рамка) на всю клітинку, з тьмяним вогником: яскраві лише контейнери
  bevel(g, x, y, s, '#3e4659', '#5c667e', '#1c2029', d);
  g.fillStyle = '#343b4c'; g.fillRect(x + s * 0.2, y + s * 0.2, s * 0.6, s * 0.6);
  g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + s * 0.2, y + s * 0.2, s * 0.6, Math.max(1, s * 0.03));
  for (const [fx, fy] of [[0.12, 0.12], [0.88, 0.12], [0.12, 0.88], [0.88, 0.88]]) circle(g, x + s * fx, y + s * fy, s * 0.035, '#1c2029');
  g.fillStyle = '#1c2029'; g.fillRect(x + s * 0.3, y + s * 0.47, s * 0.4, s * 0.06);
  circle(g, x + s / 2, y + s / 2, s * 0.05, rgba(GLOW, 0.55));
}

// Блоки — яскраві вантажні контейнери трьох кольорів: предмети з тінню (перед і верх), менші за клітинку
const CRATE = ['#f08a2b', '#2b9af0', '#9ab83a'];
function block(g, s, v) {
  const c = CRATE[v], x0 = s * 0.12, y0 = s * 0.26, w = s * 0.76, h = s * 0.6;
  ellipse(g, s / 2, s * 0.9, s * 0.4, s * 0.08, 'rgba(0,0,0,0.5)');
  g.fillStyle = shade(c, 0.35); g.fillRect(x0, y0 - s * 0.14, w, s * 0.14);       // верх
  g.fillStyle = c; g.fillRect(x0, y0, w, h);                                       // перед
  g.fillStyle = shade(c, -0.2);
  for (let j = 1; j < 5; j++) g.fillRect(x0 + w * j / 5 - s * 0.015, y0 + s * 0.04, s * 0.03, h - s * 0.08);
  g.fillStyle = shade(c, -0.45);
  for (const fx of [0, 1]) for (const fy of [0, 1]) g.fillRect(fx ? x0 + w - s * 0.1 : x0, fy ? y0 + h - s * 0.1 : y0 - s * 0.14, s * 0.1, s * 0.1);
  g.strokeStyle = shade(c, -0.55); g.lineWidth = Math.max(1, s * 0.025);
  g.strokeRect(x0, y0 - s * 0.14, w, h + s * 0.14);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + w, y0); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(s * 0.32, y0 + h * 0.36, s * 0.36, s * 0.1);
  g.fillStyle = shade(c, -0.4); g.fillRect(s * 0.36, y0 + h * 0.36 + s * 0.03, s * 0.28, s * 0.04);
}

// Стіна — гермодвері зі смугами небезпеки
function wall(g, s) {
  const d = Math.max(1, Math.round(s * 0.09));
  bevel(g, 0, 0, s, '#565d6e', '#7d8598', '#2c3039', d);
  g.save();
  g.beginPath(); g.rect(d, s * 0.36, s - 2 * d, s * 0.28); g.clip();
  g.fillStyle = '#ffc61a'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#1d1d1d';
  for (let k = -2; k < 6; k++) { g.beginPath(); g.moveTo(k * s * 0.2, s * 0.64); g.lineTo(k * s * 0.2 + s * 0.1, s * 0.64); g.lineTo(k * s * 0.2 + s * 0.38, s * 0.36); g.lineTo(k * s * 0.2 + s * 0.28, s * 0.36); g.closePath(); g.fill(); }
  g.restore();
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(s / 2 - Math.max(1, s * 0.015), d, Math.max(1, s * 0.03), s - 2 * d);
  circle(g, s / 2, s * 0.2, s * 0.06, '#ff3b3b');
}

// Бонуси: 💣 міна, ☄️ комета, 🚀 ракета, 🌀 червоточина, 🛡 силове поле
const EDGE = { [IT_BOMB]: '#ff6b5a', [IT_FIRE]: '#ffb347', [IT_SPEED]: '#5fd3ff', [IT_PASS]: '#b48cff', [IT_RESIST]: '#5fffb4', [IT_REMOTE]: '#ffe066' };
function item(g, k, s) {
  const p = s * 0.1, c = EDGE[k], cx = s / 2, cy = s / 2;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  rr(g, p + s * 0.03, p + s * 0.05, s - 2 * p, s - 2 * p, s * 0.14); g.fill();
  g.fillStyle = '#0f1830';
  rr(g, p, p, s - 2 * p, s - 2 * p, s * 0.14); g.fill();
  g.strokeStyle = c; g.lineWidth = Math.max(1, s * 0.045);
  rr(g, p, p, s - 2 * p, s - 2 * p, s * 0.14); g.stroke();
  if (k === IT_BOMB) mine(g, cx, cy + s * 0.02, s * 0.17, 1);
  else if (k === IT_FIRE) {
    g.save(); g.translate(cx, cy); g.rotate(-Math.PI / 4);
    const grd = g.createLinearGradient(0, 0, s * 0.42, 0);
    grd.addColorStop(0, 'rgba(255,170,60,0.9)'); grd.addColorStop(1, 'rgba(255,90,40,0)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(-s * 0.02, -s * 0.12); g.lineTo(s * 0.4, 0); g.lineTo(-s * 0.02, s * 0.12); g.closePath(); g.fill();
    g.restore();
    circle(g, cx - s * 0.06, cy + s * 0.06, s * 0.12, '#ffd27a');
    circle(g, cx - s * 0.08, cy + s * 0.08, s * 0.06, '#fff4d6');
  } else if (k === IT_SPEED) {
    g.save(); g.translate(cx, cy); g.rotate(Math.PI / 4);
    flame(g, 0, s * 0.27, s * 0.07, '#ff8a2b');
    poly(g, [[-s * 0.13, s * 0.15], [-s * 0.07, s * 0.02], [-s * 0.07, s * 0.2]], '#e2452b');
    poly(g, [[s * 0.13, s * 0.15], [s * 0.07, s * 0.02], [s * 0.07, s * 0.2]], '#e2452b');
    g.fillStyle = '#e8edf5';
    g.beginPath(); g.moveTo(0, -s * 0.3); g.quadraticCurveTo(s * 0.1, -s * 0.15, s * 0.08, s * 0.2); g.lineTo(-s * 0.08, s * 0.2); g.quadraticCurveTo(-s * 0.1, -s * 0.15, 0, -s * 0.3); g.fill();
    poly(g, [[0, -s * 0.3], [s * 0.06, -s * 0.18], [-s * 0.06, -s * 0.18]], '#e2452b');
    circle(g, 0, -s * 0.04, s * 0.045, '#2b8fd9');
    g.restore();
  } else if (k === IT_PASS) {
    g.strokeStyle = c; g.lineWidth = Math.max(1, s * 0.045); g.lineCap = 'round';
    g.beginPath();
    for (let a = 0; a < TAU * 2.2; a += 0.15) {
      const r = s * 0.02 + a * s * 0.019;
      const X = cx + Math.cos(a) * r, Y = cy + Math.sin(a) * r;
      a ? g.lineTo(X, Y) : g.moveTo(X, Y);
    }
    g.stroke();
    circle(g, cx, cy, s * 0.04, '#fff');
  } else if (k === IT_RESIST) {
    circle(g, cx, cy, s * 0.26, rgba(c, 0.25));
    g.strokeStyle = c; g.lineWidth = Math.max(1, s * 0.04);
    g.beginPath(); g.arc(cx, cy, s * 0.26, 0, TAU); g.stroke();
    g.strokeStyle = rgba(c, 0.6); g.lineWidth = Math.max(1, s * 0.025);
    g.beginPath(); g.ellipse(cx, cy, s * 0.26, s * 0.09, 0, 0, TAU); g.stroke();
    ellipse(g, cx - s * 0.09, cy - s * 0.12, s * 0.07, s * 0.04, 'rgba(255,255,255,0.7)', -0.6);
  } else if (k === IT_REMOTE) {                                      // супутник
    g.save(); g.translate(cx, cy); g.rotate(-0.6);
    for (const sx of [-1, 1]) {
      const x0 = sx > 0 ? s * 0.09 : -s * 0.29;
      g.fillStyle = '#2b5fd9'; g.fillRect(x0, -s * 0.07, s * 0.2, s * 0.14);
      g.strokeStyle = '#8fb4ff'; g.lineWidth = Math.max(1, s * 0.015);
      for (let j = 1; j < 3; j++) { g.beginPath(); g.moveTo(x0 + j * s * 0.067, -s * 0.07); g.lineTo(x0 + j * s * 0.067, s * 0.07); g.stroke(); }
    }
    g.fillStyle = '#c8ccd6'; rr(g, -s * 0.09, -s * 0.09, s * 0.18, s * 0.18, s * 0.03); g.fill();
    line(g, 0, -s * 0.09, 0, -s * 0.2, s * 0.03, '#c8ccd6');
    circle(g, 0, -s * 0.21, s * 0.035, '#ffe066');
    g.restore();
  }
}
function flame(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath(); g.moveTo(x - r, y - r * 0.6); g.quadraticCurveTo(x, y + r * 2.4, x + r, y - r * 0.6); g.closePath(); g.fill();
  g.fillStyle = '#ffe066';
  g.beginPath(); g.moveTo(x - r * 0.5, y - r * 0.6); g.quadraticCurveTo(x, y + r * 1.4, x + r * 0.5, y - r * 0.6); g.closePath(); g.fill();
}

// Міна: сфера з шипами і червоним вогником (блимає частіше до вибуху)
function mine(g, cx, cy, r, blink) {
  g.strokeStyle = '#8a93a8'; g.lineWidth = Math.max(1, r * 0.22); g.lineCap = 'round';
  g.beginPath();
  for (let j = 0; j < 8; j++) {
    const a = j * TAU / 8;
    g.moveTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9);
    g.lineTo(cx + Math.cos(a) * r * 1.35, cy + Math.sin(a) * r * 1.35);
  }
  g.stroke();
  bombShape(g, cx, cy, r, '#6c7491', '#141826', null);
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(cx - r, cy - r * 0.08, r * 2, r * 0.16);
  circle(g, cx, cy - r * 0.45, r * 0.24, blink ? '#ff3b3b' : '#5a1d1d');
  if (blink) circle(g, cx, cy - r * 0.45, r * 0.45, 'rgba(255,59,59,0.3)');
}
function bomb(g, x, y, s, k, T) {
  const r = s * (0.26 + bombBeat(k, T)), cx = x + s / 2, cy = y + s * 0.53;
  ellipse(g, cx, y + s * 0.87, s * 0.28, s * 0.08, 'rgba(0,0,0,0.35)');
  mine(g, cx, cy, r, Math.floor(T / (260 - 200 * k)) % 2 === 0);
  if (bombFlash(k, T)) circle(g, cx, cy, r, 'rgba(255,60,40,0.35)');
}

// Астронавт: скафандр кольору гравця, білий шолом з темним візором у бік руху, рюкзак
function player(g, p, s, T, { col, walk, bob, dead }) {
  const rim = luma(col) > 0.8 ? 'rgba(40,50,80,0.6)' : luma(col) < 0.3 ? 'rgba(200,210,240,0.6)' : 'rgba(0,0,0,0.35)';
  for (const [sx, w] of [[-1, walk], [1, -walk]]) ellipse(g, sx * s * 0.13, s * 0.37 + w * s * 0.05, s * 0.1, s * 0.07, '#9aa3b6');
  if (p.dr === 1 || p.dr === 2 || p.dr === 4) {                    // рюкзак видно зі спини й збоку
    const bx = p.dr === 2 ? -s * 0.28 : p.dr === 4 ? s * 0.08 : -s * 0.17;
    g.fillStyle = '#b9c1d3'; rr(g, bx, -s * 0.02 - bob, s * (p.dr === 1 ? 0.34 : 0.2), s * 0.3, s * 0.05); g.fill();
  }
  g.fillStyle = col;
  rr(g, -s * 0.2, s * 0.04 - bob, s * 0.4, s * 0.31, s * 0.12); g.fill();
  g.strokeStyle = rim; g.lineWidth = Math.max(1, s * 0.02); g.stroke();
  if (p.dr !== 1) {                                                 // пульт на грудях
    g.fillStyle = '#2b3245'; g.fillRect(-s * 0.09, s * 0.12 - bob, s * 0.18, s * 0.09);
    circle(g, -s * 0.04, s * 0.165 - bob, s * 0.022, '#ff3b3b');
    circle(g, s * 0.04, s * 0.165 - bob, s * 0.022, Math.floor(T / 400) % 2 ? '#3bff7a' : '#1d6b3a');
  }
  for (const sx of [-1, 1]) {
    const ay = s * 0.17 - bob - sx * walk * s * 0.04;
    circle(g, sx * s * 0.25, ay, s * 0.075, col);
    circle(g, sx * s * 0.25, ay + s * 0.04, s * 0.05, '#e8edf5');
  }
  const hy = -s * 0.14 - bob;
  line(g, s * 0.12, hy - s * 0.2, s * 0.17, hy - s * 0.36, s * 0.025, '#9aa3b6');
  circle(g, s * 0.17, hy - s * 0.37, s * 0.035, Math.floor(T / 500) % 2 ? '#ff3b3b' : '#ffb0b0');
  circle(g, 0, hy, s * 0.27, '#e8edf5');
  g.strokeStyle = 'rgba(40,50,80,0.5)'; g.lineWidth = Math.max(1, s * 0.025); g.stroke();
  g.strokeStyle = col; g.lineWidth = Math.max(1, s * 0.04);         // кільце шолома кольору гравця
  g.beginPath(); g.arc(0, hy, s * 0.255, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
  if (p.dr === 1) return;
  const fx = (DX[p.dr] || 0) * s * 0.07, fy = (p.dr === 3 || !p.dr) ? s * 0.02 : 0;
  const grd = g.createLinearGradient(0, hy - s * 0.12, 0, hy + s * 0.1);
  grd.addColorStop(0, '#2b3a66'); grd.addColorStop(1, '#0b1024');
  g.fillStyle = grd;
  rr(g, -s * 0.19 + fx, hy - s * 0.12 + fy, s * 0.38, s * 0.22, s * 0.1); g.fill();
  if (dead) {
    g.strokeStyle = '#ff5a5a'; g.lineWidth = Math.max(1, s * 0.03);
    for (const ex of [-0.07, 0.07]) {
      const ox = ex * s + fx, oy = hy + fy, e = s * 0.035;
      g.beginPath(); g.moveTo(ox - e, oy - e); g.lineTo(ox + e, oy + e); g.moveTo(ox + e, oy - e); g.lineTo(ox - e, oy + e); g.stroke();
    }
    return;
  }
  ellipse(g, -s * 0.08 + fx, hy - s * 0.06 + fy, s * 0.07, s * 0.035, 'rgba(255,255,255,0.55)', -0.3);
  ellipse(g, s * 0.1 + fx, hy + s * 0.03 + fy, s * 0.03, s * 0.02, 'rgba(255,214,120,0.6)');
}

// Монстри: 0 — зелений слизняк з одним оком, 1 — літаюча тарілка, 2 — примара порожнечі
function monster(g, m, s, T, wob) {
  const ex = (DX[m.d] || 0) * s * 0.06, ey = ((m.d === 3) - (m.d === 1)) * s * 0.05;
  if (m.k === 0) {
    for (const sx of [-1, 1]) {
      line(g, sx * s * 0.08, -s * 0.2, sx * s * 0.16, -s * 0.36 - wob * s * 0.03, s * 0.03, '#3fae4a');
      circle(g, sx * s * 0.16, -s * 0.37 - wob * s * 0.03, s * 0.045, '#9dff6a');
    }
    g.fillStyle = '#4fc95a';
    g.beginPath();
    g.moveTo(-s * 0.33, s * 0.3);
    g.bezierCurveTo(-s * 0.36, -s * 0.1, -s * 0.2, -s * 0.28 - wob * s * 0.03, 0, -s * 0.28 - wob * s * 0.03);
    g.bezierCurveTo(s * 0.2, -s * 0.28 - wob * s * 0.03, s * 0.36, -s * 0.1, s * 0.33, s * 0.3);
    g.closePath(); g.fill();
    ellipse(g, -s * 0.14, -s * 0.12, s * 0.07, s * 0.04, 'rgba(255,255,255,0.35)', -0.6);
    circle(g, ex * 0.5, s * 0.0, s * 0.13, '#fff');
    circle(g, ex * 1.1, ey, s * 0.065, '#2a0f3a');
    return;
  }
  if (m.k === 1) {
    const tilt = (DX[m.d] || 0) * 0.18;
    g.rotate(tilt);
    ellipse(g, 0, -s * 0.06, s * 0.17, s * 0.17, 'rgba(143,227,255,0.55)');
    circle(g, 0, -s * 0.06, s * 0.08, '#6fdc5f');
    for (const sx of [-1, 1]) circle(g, sx * s * 0.03, -s * 0.08, s * 0.022, '#111');
    ellipse(g, 0, s * 0.06, s * 0.4, s * 0.13, '#9aa3b8');
    ellipse(g, 0, s * 0.03, s * 0.4, s * 0.06, '#c3cad8');
    const cols = ['#ff3b3b', '#ffd23f', '#3bff7a', '#4fc3ff'];
    for (let j = 0; j < 5; j++) circle(g, (j - 2) * s * 0.15, s * 0.1, s * 0.03, cols[(j + Math.floor(T / 150)) % 4]);
    return;
  }
  ghostPath(g, s, wob, 0.31);
  const grd = g.createLinearGradient(0, -s * 0.38, 0, s * 0.3);
  grd.addColorStop(0, '#c9a8ff'); grd.addColorStop(1, '#5a2db0');
  g.fillStyle = grd; g.fill();
  for (let j = 0; j < 5; j++) circle(g, Math.sin(j * 2.3 + m.i) * s * 0.18, Math.cos(j * 1.7) * s * 0.15 + s * 0.05, s * 0.018, '#fff');
  for (const sx of [-1, 1]) { ellipse(g, sx * s * 0.1 + ex, -s * 0.1 + ey, s * 0.06, s * 0.08, '#1a0838'); circle(g, sx * s * 0.1 + ex, -s * 0.1 + ey, s * 0.025, '#7ff0ff'); }
}

export default {
  name: 'Космос',
  bg: '#05060f',
  backdrop,
  shadow: 'rgba(79,195,255,0.25)',
  emoji: { bomb: '💣', fire: '☄️', speed: '🚀', pass: '🌀', resist: '🛡', remote: '🛰️' },
  fire: ['#6a3dff', '#36c8ff', '#eafcff'],
  burn: ['#36c8ff', 'rgba(106,61,255,0)'],
  blocks: 3,
  floor, stone, block, wall, item, bomb, player, monster,
};
