// common.js — спільні примітиви малювання для стилів графіки (скінів). Без DOM, крім створення canvas.
import { DX, DY, PILLAR } from '../sim.js';

export const TAU = Math.PI * 2;

export function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }

export function rr(g, x, y, w, h, r) {
  w = Math.max(0, w); h = Math.max(0, h);
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
export function bevel(g, x, y, s, base, hi, lo, d) {
  g.fillStyle = lo; g.fillRect(x, y, s, s);
  g.fillStyle = hi; g.fillRect(x, y, s - d, s - d);
  g.fillStyle = base; g.fillRect(x + d, y + d, s - 2 * d, s - 2 * d);
}
export function circle(g, x, y, r, color) {
  g.fillStyle = color;
  g.beginPath(); g.arc(x, y, Math.max(0.5, r), 0, TAU); g.fill();
}
export function ellipse(g, x, y, rx, ry, color, rot = 0) {
  g.fillStyle = color;
  g.beginPath(); g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, TAU); g.fill();
}
export function line(g, x1, y1, x2, y2, w, color, cap = 'round') {
  g.strokeStyle = color; g.lineWidth = Math.max(1, w); g.lineCap = cap;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}
export function poly(g, pts, color) {
  g.fillStyle = color;
  g.beginPath();
  pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath(); g.fill();
}

// Світліше (k > 0) чи темніше (k < 0)
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
// Яскравість кольору 0..1 — щоб світлому кольору гравця дати темний контур
export function luma(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// Стале «випадкове» 0..1 від клітинки — для різноманітності підлоги й блоків
export function rnd(i, salt = 0) {
  let h = Math.imul(i ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Тінь на підлозі від стовпа зверху й ліворуч
export function pillarShade(g, map, x, y, px, py, s, color) {
  const i = y * map.GW + x;
  g.fillStyle = color;
  if (map.cell[i - map.GW] === PILLAR) g.fillRect(px, py, s, s * 0.16);
  if (map.cell[i - 1] === PILLAR) g.fillRect(px, py, s * 0.12, s);
}

export function flameShape(g, cx, cy, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(cx, cy - r * 1.1);
  g.bezierCurveTo(cx + r * 0.9, cy - r * 0.2, cx + r * 0.9, cy + r * 0.9, cx, cy + r * 0.9);
  g.bezierCurveTo(cx - r * 0.9, cy + r * 0.9, cx - r * 0.9, cy - r * 0.2, cx, cy - r * 1.1);
  g.fill();
}
export function bombShape(g, cx, cy, r, light = '#5b6070', dark = '#101219', fuse = '#c9a36b') {
  const grd = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  grd.addColorStop(0, light); grd.addColorStop(1, dark);
  g.fillStyle = grd;
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  if (!fuse) return;
  g.strokeStyle = fuse; g.lineWidth = Math.max(1, r * 0.22); g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx + r * 0.5, cy - r * 0.75); g.quadraticCurveTo(cx + r * 0.9, cy - r * 1.3, cx + r * 1.2, cy - r * 1.05); g.stroke();
}
// Іскра на ґноті
export function spark(g, x, y, s, outer = '#ffd23f', inner = '#fff') {
  const r = s * (0.07 + 0.04 * Math.random());
  circle(g, x, y, r, outer);
  circle(g, x, y, r * 0.45, inner);
}
// Пульсація бомби (частішає до вибуху)
export const bombBeat = (k, T) => Math.sin(T / (180 - 120 * k)) * (0.05 + 0.05 * k);
export const bombFlash = (k, T) => k > 0.7 && Math.floor(T / 80) % 2 === 1;

// Вогонь: вид 0 — центр, 1 — промінь, 2 — кінець, 11 — згорілий бонус (як кінець). layers — кольори від зовнішнього
// до внутрішнього; step — розмір «пікселя» (піксельний стиль: без заокруглень, товщина кратна кроку)
const LAYER_W = [0.92, 0.62, 0.3];
export function drawFlame(g, x, y, s, kind, d, k, T, layers, step = 0) {
  const w = Math.sin(Math.min(1, k * 1.15) * Math.PI);                // спалах і згасання
  if (w <= 0.02) return;
  const cx = x + s / 2, cy = y + s / 2, jit = step ? 0 : Math.sin(T / 37 + x + y) * s * 0.03;
  layers.forEach((color, n) => {
    let h = Math.max(1, s * LAYER_W[n] * w + jit);
    if (step) h = Math.max(step, Math.round(h / step / 2) * step * 2);
    const rad = step ? 0 : h / 2;
    g.fillStyle = color;
    if (kind === 0) {
      rr(g, x, cy - h / 2, s, h, rad); g.fill();
      rr(g, cx - h / 2, y, h, s, rad); g.fill();
      if (step) g.fillRect(cx - h * 0.62, cy - h * 0.62, h * 1.24, h * 1.24);
      else { g.beginPath(); g.arc(cx, cy, h * 0.62, 0, TAU); g.fill(); }
      return;
    }
    const horiz = DX[d] !== 0, end = kind !== 1;
    if (!end) {
      if (horiz) g.fillRect(x, cy - h / 2, s, h); else g.fillRect(cx - h / 2, y, h, s);
      return;
    }
    const len = s * 0.88;                                            // від центру до кінця з закругленням
    const bx = DX[d] > 0 ? x : DX[d] < 0 ? x + s - len : cx - h / 2;
    const by = DY[d] > 0 ? y : DY[d] < 0 ? y + s - len : cy - h / 2;
    if (horiz) { rr(g, bx, cy - h / 2, len, h, rad); g.fill(); g.fillRect(DX[d] > 0 ? x : x + s - h / 2, cy - h / 2, h / 2, h); }
    else { rr(g, cx - h / 2, by, h, len, rad); g.fill(); g.fillRect(cx - h / 2, DY[d] > 0 ? y : y + s - h / 2, h, h / 2); }
  });
}

// Блок, що горить: спрайт блоку згасає, язики полум'я кольорів burn [низ, верх (прозорий)]
export function drawBurning(g, spr, x, y, s, k, burn) {
  k = Math.max(0, Math.min(1, k));
  g.save();
  g.globalAlpha = 1 - k * 0.85;
  g.drawImage(spr, x, y);
  g.globalAlpha = 1;
  g.fillStyle = `rgba(30,10,0,${0.25 + k * 0.4})`;
  g.fillRect(x, y, s, s);
  for (let j = 0; j < 4; j++) {
    const fx = x + s * (0.2 + 0.2 * j), fh = s * (0.35 + 0.3 * Math.sin(k * 9 + j * 2)) * (1 - k * 0.6);
    const grd = g.createLinearGradient(fx, y + s, fx, y + s - fh);
    grd.addColorStop(0, burn[0]); grd.addColorStop(1, burn[1]);
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(fx, y + s - fh / 2, s * 0.12, fh / 2, 0, 0, TAU);
    g.fill();
  }
  g.restore();
}

// Піксель-арт: rows — рядки однакової довжини, символ → колір з pal ('.' і пробіл — прозоро).
// Розмір «пікселя» — s / ширина; межі округлюються, щоб без щілин. flip — дзеркально по горизонталі.
export function pix(g, x, y, s, rows, pal, flip = false) {
  const n = rows[0].length, m = rows.length, sy = s * m / n;
  const X = (c) => Math.round(x + c * s / n), Y = (r) => Math.round(y + r * sy / m);
  for (let r = 0; r < m; r++) {
    const row = flip ? [...rows[r]].reverse().join('') : rows[r];
    for (let c = 0; c < n;) {
      const ch = row[c];
      let e = c + 1;
      while (e < n && row[e] === ch) e++;
      if (ch !== '.' && ch !== ' ' && pal[ch]) {
        g.fillStyle = pal[ch];
        g.fillRect(X(c), Y(r), X(e) - X(c), Y(r + 1) - Y(r));
      }
      c = e;
    }
  }
}

// Силует привида: купол і хвилястий низ (wob — фаза хвиль), w — піврозмах у частках клітинки
export function ghostPath(g, s, wob, w = 0.3) {
  g.beginPath();
  g.arc(0, -s * 0.08, s * w, Math.PI, 0);
  const bottom = s * 0.3, n = 4, step = 2 * w / n;
  g.lineTo(s * w, bottom);
  for (let j = 0; j < n; j++) {
    const x1 = s * (w - (j + 0.5) * step), x2 = s * (w - (j + 1) * step);
    g.quadraticCurveTo(x1, bottom - s * 0.1 - wob * s * 0.04 * (j % 2 ? 1 : -1), x2, bottom);
  }
  g.closePath();
}
