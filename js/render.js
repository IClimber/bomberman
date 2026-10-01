// render.js — малювання на canvas: поле, бонуси, бомби, вогонь, гравці, монстри, відлік. Усе кодом, без картинок.
// Розмір клітинки — від вікна й карти (уся карта на екрані), з урахуванням devicePixelRatio.
// Статичний шар (підлога, стовпи, рамка) і спрайти клітинок кешуються під поточний розмір.
import { PILLAR, BLOCK, WALL, FUSE_MS, FLAME_MS, DX, DY, IT_BOMB, IT_FIRE, IT_SPEED, IT_PASS, IT_RESIST } from './sim.js';
import { COLORS } from './state.js';

const TOP = 62;                      // місце під HUD зверху (CSS px)
const BOTTOM = 48;                   // місце під напис для глядача знизу
const MARGIN = 14;
const PAD = 30;                      // поле тіні навколо карти в кеші (CSS px)
const WALL_WARN_MS = 1500;           // клітинка, куди скоро впаде стіна, блимає
const TAU = Math.PI * 2;

const C = {
  floorA: '#3d8a47', floorB: '#398342', floorShadow: 'rgba(0,0,0,0.22)',
  pillar: '#7a8294', pillarHi: '#a9b0bf', pillarLo: '#4e5464', pillarTop: '#8b93a5',
  border: '#596072', borderHi: '#7d8597', borderLo: '#3b404d',
  brick: '#c8743c', brickHi: '#e19a5c', brickLo: '#8c4a22', mortar: '#7a3f1d',
  wall: '#454b5a', wallHi: '#6b7387', wallLo: '#2b2f39', rivet: '#9aa3b6',
  skin: '#ffd2a8', glove: '#ff8fb1', visor: '#1d2030',
};

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let dpr = 1, W = 0, H = 0;
  let cacheKey = '', stat = null, sprites = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = Math.round(innerWidth * dpr);
    H = Math.round(innerHeight * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    cacheKey = '';
  }
  resize();

  function layoutFor(map, hud) {
    const top = (hud ? TOP : MARGIN) * dpr, bot = (hud ? BOTTOM : MARGIN) * dpr, m = MARGIN * dpr;
    const ts = Math.max(8, Math.floor(Math.min((W - 2 * m) / map.GW, (H - top - bot) / map.GH)));
    return { ts, ox: Math.floor((W - ts * map.GW) / 2), oy: Math.floor(top + (H - top - bot - ts * map.GH) / 2) };
  }

  // ---------- Кеш: статичний шар і спрайти клітинок ----------
  function ensureCache(map, L) {
    const key = `${map.seed}:${map.GW}:${map.GH}:${L.ts}`;
    if (key === cacheKey) return;
    cacheKey = key;
    const ts = L.ts, pad = PAD * dpr;
    stat = makeCanvas(ts * map.GW + 2 * pad, ts * map.GH + 2 * pad);
    stat.pad = pad;
    const g = stat.getContext('2d');
    g.shadowColor = 'rgba(0,0,0,0.55)';                            // тінь під полем — один раз, у кеш
    g.shadowBlur = pad * 0.8;
    g.fillStyle = '#000';
    g.fillRect(pad, pad, ts * map.GW, ts * map.GH);
    g.shadowBlur = 0;
    g.translate(pad, pad);
    for (let y = 0; y < map.GH; y++) {
      for (let x = 0; x < map.GW; x++) {
        const i = y * map.GW + x, px = x * ts, py = y * ts;
        if (map.cell[i] === PILLAR) {
          const border = x === 0 || y === 0 || x === map.GW - 1 || y === map.GH - 1;
          drawStone(g, px, py, ts, border);
        } else {
          g.fillStyle = (x + y) % 2 ? C.floorA : C.floorB;
          g.fillRect(px, py, ts, ts);
          g.fillStyle = 'rgba(255,255,255,0.035)';
          g.fillRect(px + ts * 0.1, py + ts * 0.1, ts * 0.12, ts * 0.12);
          g.fillRect(px + ts * 0.62, py + ts * 0.55, ts * 0.1, ts * 0.1);
          // тінь від стовпа зверху й ліворуч
          g.fillStyle = C.floorShadow;
          if (map.cell[i - map.GW] === PILLAR) g.fillRect(px, py, ts, ts * 0.16);
          if (map.cell[i - 1] === PILLAR) g.fillRect(px, py, ts * 0.12, ts);
        }
      }
    }
    sprites = {
      block: sprite(ts, (s) => drawBrick(s, 0, 0, ts)),
      wall: sprite(ts, (s) => drawWall(s, 0, 0, ts)),
      items: [null, 1, 2, 3, 4, 5].map(k => k && sprite(ts, (s) => drawItem(s, k, ts))),
    };
  }

  // ---------- Кадр ----------
  // v: { R, now, mySlot, slots [{x, y, dr, mv, a, dt, c, rs}] — як малювати слоти, mons — як малювати монстрів,
  //      decor — карта для тла лоббі (коли раунду немає) }
  function draw(v) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#141722';
    ctx.fillRect(0, 0, W, H);
    const map = v.R ? v.R.map : v.decor;
    if (!map) return;
    const L = layoutFor(map, !!v.R);
    ensureCache(map, L);
    const { ts, ox, oy } = L, T = v.now;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.drawImage(stat, -stat.pad, -stat.pad);
    if (!v.R) {
      for (let i = 0; i < map.cell.length; i++) {
        if (map.cell[i] === BLOCK) ctx.drawImage(sprites.block, (i % map.GW) * ts, Math.floor(i / map.GW) * ts);
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(12,14,22,0.55)';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    const R = v.R, B = R.board, GW = map.GW;

    // клітинки: блоки (що горять — з вогнем), бонуси, стіни (і попередження)
    for (let i = 0; i < B.cell.length; i++) {
      const c = B.cell[i], x = (i % GW) * ts, y = Math.floor(i / GW) * ts;
      if (c === PILLAR) continue;
      if (c === BLOCK) {
        const until = B.burn.get(i);
        if (until !== undefined) drawBurning(ctx, x, y, ts, 1 - (until - T) / FLAME_MS);
        else ctx.drawImage(sprites.block, x, y);
      } else if (c === WALL) {
        const k = Math.min(1, (T - B.wallAt[i]) / 180);
        if (k >= 1) ctx.drawImage(sprites.wall, x, y);
        else {
          ctx.globalAlpha = Math.max(0, k);
          const s = ts * (1.6 - 0.6 * k);
          ctx.drawImage(sprites.wall, x + (ts - s) / 2, y + (ts - s) / 2 - ts * (1 - k) * 0.8, s, s);
          ctx.globalAlpha = 1;
        }
      } else {
        const it = B.itemAt(i);
        if (it) {
          const p = 1 + Math.sin(T / 160 + i) * 0.04;
          const s = ts * p;
          ctx.drawImage(sprites.items[it], x + (ts - s) / 2, y + (ts - s) / 2, s, s);
        }
        const wt = B.wallAt[i];
        if (wt - T < WALL_WARN_MS && wt > T && Math.floor((wt - T) / 120) % 2 === 0) {
          ctx.fillStyle = 'rgba(255,60,50,0.35)';
          ctx.fillRect(x, y, ts, ts);
        }
      }
    }

    // бомби
    for (const a of B.active.values()) drawBomb(ctx, a.b.x * ts, a.b.y * ts, ts, (T - a.b.t) / FUSE_MS, T);

    // вогонь
    for (const f of B.flames) {
      const k = (T - f.t0) / FLAME_MS;
      if (k < 0 || k >= 1) continue;
      for (const [i, kind, d] of f.cells) drawFlame(ctx, (i % GW) * ts, Math.floor(i / GW) * ts, ts, kind, d, k, T);
    }

    // монстри (привиди — поверх блоків, тож разом з усіма після клітинок)
    for (const m of v.mons) drawMonster(ctx, m, ts, T);
    // гравці: спершу мертві, згори — живі, свій — найвище
    const order = v.slots.map((s, k) => k).sort((a, b) => (v.slots[a].a - v.slots[b].a) || ((a === v.mySlot) - (b === v.mySlot)));
    for (const k of order) drawPlayer(ctx, v.slots[k], ts, T, k === v.mySlot && T < R.t0 + 2500);
    ctx.restore();

    // відлік і написи
    if (T < R.t0 + 700 && R.p === 0) {
      const left = R.t0 - T;
      bigText(left > 0 ? String(Math.ceil(left / 1000)) : 'СТАРТ!', 1 - ((left % 1000) + 1000) % 1000 / 1000);
    } else if (R.p === 0 && T >= B.sdAt && T < B.sdAt + 2200) {
      bigText('РАПТОВА СМЕРТЬ!', 0, '#ff5a4f');
    }
  }

  function bigText(text, pulse, color = '#ffb020') {
    const size = Math.min(W / (text.length * 0.9 + 2), 96 * dpr) * (1 + pulse * 0.15);
    ctx.save();
    ctx.font = `${Math.round(size)}px "Press Start 2P", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(4, size * 0.14);
    ctx.strokeStyle = '#141722';
    ctx.strokeText(text, W / 2, H / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, H / 2);
    ctx.restore();
  }

  return { draw, resize };
}

// ================= Примітиви =================
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }
function sprite(ts, fn) { const c = makeCanvas(ts, ts); fn(c.getContext('2d')); return c; }
function rr(g, x, y, w, h, r) {
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
function bevel(g, x, y, s, base, hi, lo, d) {
  g.fillStyle = lo; g.fillRect(x, y, s, s);
  g.fillStyle = hi; g.fillRect(x, y, s - d, s - d);
  g.fillStyle = base; g.fillRect(x + d, y + d, s - 2 * d, s - 2 * d);
}

function drawStone(g, x, y, s, border) {
  const d = Math.max(1, Math.round(s * 0.09));
  if (border) {
    bevel(g, x, y, s, C.border, C.borderHi, C.borderLo, d);
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.fillRect(x + d, y + s / 2 - d / 2, s - 2 * d, Math.max(1, d / 2));
    return;
  }
  bevel(g, x, y, s, C.pillar, C.pillarHi, C.pillarLo, d);
  g.fillStyle = C.pillarTop;
  g.fillRect(x + s * 0.28, y + s * 0.28, s * 0.44, s * 0.44);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(x + s * 0.28, y + s * 0.28, s * 0.44, Math.max(1, d / 2));
}

function drawBrick(g, x, y, s) {
  const d = Math.max(1, Math.round(s * 0.07));
  bevel(g, x, y, s, C.brick, C.brickHi, C.brickLo, d);
  g.fillStyle = C.mortar;
  const lw = Math.max(1, Math.round(s * 0.05));
  for (let r = 1; r < 3; r++) g.fillRect(x + d, y + Math.round(s * r / 3) - lw / 2, s - 2 * d, lw);
  const xs = [[0.5], [0.25, 0.75], [0.5]];
  for (let r = 0; r < 3; r++) {
    for (const fx of xs[r]) g.fillRect(x + Math.round(s * fx) - lw / 2, y + Math.round(s * r / 3) + (r ? lw / 2 : d), lw, Math.round(s / 3) - lw);
  }
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(x + d, y + d, s - 2 * d, Math.max(1, d / 2));
}
function drawBurning(g, x, y, s, k) {
  k = Math.max(0, Math.min(1, k));
  g.save();
  g.globalAlpha = 1 - k * 0.85;
  drawBrick(g, x, y, s);
  g.globalAlpha = 1;
  g.fillStyle = `rgba(30,10,0,${0.25 + k * 0.4})`;
  g.fillRect(x, y, s, s);
  for (let j = 0; j < 4; j++) {
    const fx = x + s * (0.2 + 0.2 * j), fh = s * (0.35 + 0.3 * Math.sin(k * 9 + j * 2)) * (1 - k * 0.6);
    const grd = g.createLinearGradient(fx, y + s, fx, y + s - fh);
    grd.addColorStop(0, '#ff6a00'); grd.addColorStop(1, 'rgba(255,220,80,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(fx, y + s - fh / 2, s * 0.12, fh / 2, 0, 0, TAU);
    g.fill();
  }
  g.restore();
}
function drawWall(g, x, y, s) {
  const d = Math.max(1, Math.round(s * 0.1));
  bevel(g, x, y, s, C.wall, C.wallHi, C.wallLo, d);
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = Math.max(1, s * 0.04);
  g.beginPath(); g.moveTo(x + d, y + d); g.lineTo(x + s - d, y + s - d); g.moveTo(x + s - d, y + d); g.lineTo(x + d, y + s - d); g.stroke();
  g.fillStyle = C.rivet;
  const r = Math.max(1, s * 0.05);
  for (const [fx, fy] of [[0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) { g.beginPath(); g.arc(x + s * fx, y + s * fy, r, 0, TAU); g.fill(); }
}

// Бонуси: кольорова плитка з піктограмою
const ITEM_BG = { [IT_BOMB]: '#2f6fd6', [IT_FIRE]: '#d9412b', [IT_SPEED]: '#7a3fd0', [IT_PASS]: '#16a39a', [IT_RESIST]: '#d9a21b' };
function drawItem(g, k, s) {
  const p = s * 0.1;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  rr(g, p + s * 0.04, p + s * 0.06, s - 2 * p, s - 2 * p, s * 0.16); g.fill();
  g.fillStyle = ITEM_BG[k];
  rr(g, p, p, s - 2 * p, s - 2 * p, s * 0.16); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = Math.max(1, s * 0.04);
  rr(g, p, p, s - 2 * p, s - 2 * p, s * 0.16); g.stroke();
  const cx = s / 2, cy = s / 2;
  if (k === IT_BOMB || k === IT_PASS) {
    if (k === IT_PASS) {                                           // бомба-привид і стрілка крізь неї
      g.globalAlpha = 0.55;
      bombShape(g, cx - s * 0.06, cy + s * 0.04, s * 0.2);
      g.globalAlpha = 1;
      g.strokeStyle = '#fff'; g.lineWidth = s * 0.07; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - s * 0.3, cy + s * 0.04); g.lineTo(cx + s * 0.26, cy + s * 0.04);
      g.moveTo(cx + s * 0.12, cy - s * 0.1); g.lineTo(cx + s * 0.26, cy + s * 0.04); g.lineTo(cx + s * 0.12, cy + s * 0.18); g.stroke();
    } else bombShape(g, cx, cy + s * 0.04, s * 0.22);
  } else if (k === IT_FIRE) {
    flameShape(g, cx, cy, s * 0.3, '#ff7a1a');
    flameShape(g, cx, cy + s * 0.08, s * 0.18, '#ffe066');
  } else if (k === IT_SPEED) {                                     // блискавка
    g.fillStyle = '#ffe066';
    g.beginPath();
    g.moveTo(cx + s * 0.06, cy - s * 0.3); g.lineTo(cx - s * 0.18, cy + s * 0.04); g.lineTo(cx - s * 0.01, cy + s * 0.04);
    g.lineTo(cx - s * 0.08, cy + s * 0.3); g.lineTo(cx + s * 0.18, cy - s * 0.06); g.lineTo(cx + s * 0.01, cy - s * 0.06);
    g.closePath(); g.fill();
  } else if (k === IT_RESIST) {                                    // щит
    g.fillStyle = '#fff6d0';
    g.beginPath();
    g.moveTo(cx, cy - s * 0.28); g.lineTo(cx + s * 0.24, cy - s * 0.18); g.quadraticCurveTo(cx + s * 0.22, cy + s * 0.16, cx, cy + s * 0.3);
    g.quadraticCurveTo(cx - s * 0.22, cy + s * 0.16, cx - s * 0.24, cy - s * 0.18); g.closePath(); g.fill();
    flameShape(g, cx, cy + s * 0.02, s * 0.13, '#e2571e');
  }
}
function bombShape(g, cx, cy, r) {
  const grd = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r);
  grd.addColorStop(0, '#5b6070'); grd.addColorStop(1, '#101219');
  g.fillStyle = grd;
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  g.strokeStyle = '#c9a36b'; g.lineWidth = Math.max(1, r * 0.22); g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx + r * 0.5, cy - r * 0.75); g.quadraticCurveTo(cx + r * 0.9, cy - r * 1.3, cx + r * 1.2, cy - r * 1.05); g.stroke();
}
function flameShape(g, cx, cy, r, color) {
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(cx, cy - r * 1.1);
  g.bezierCurveTo(cx + r * 0.9, cy - r * 0.2, cx + r * 0.9, cy + r * 0.9, cx, cy + r * 0.9);
  g.bezierCurveTo(cx - r * 0.9, cy + r * 0.9, cx - r * 0.9, cy - r * 0.2, cx, cy - r * 1.1);
  g.fill();
}

function drawBomb(g, x, y, s, k, T) {
  k = Math.max(0, Math.min(1, k));
  const beat = Math.sin(T / (180 - 120 * k)) * (0.05 + 0.05 * k);
  const r = s * (0.34 + beat), cx = x + s / 2, cy = y + s * 0.54;
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(cx, y + s * 0.86, s * 0.3, s * 0.09, 0, 0, TAU); g.fill();
  bombShape(g, cx, cy, r);
  if (k > 0.7 && Math.floor(T / 80) % 2) {                        // перед вибухом червоніє
    g.fillStyle = 'rgba(255,60,40,0.35)';
    g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
  }
  const sx = cx + r * 1.2, sy = cy - r * 1.05, sr = s * (0.07 + 0.04 * Math.random());   // іскра
  g.fillStyle = '#ffd23f';
  g.beginPath(); g.arc(sx, sy, sr, 0, TAU); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(sx, sy, sr * 0.45, 0, TAU); g.fill();
}

// Вогонь: вид 0 — центр, 1 — промінь, 2 — кінець, 11 — згорілий бонус (як кінець); блок (9) і бомба (10) — свої
function drawFlame(g, x, y, s, kind, d, k, T) {
  if (kind === 9 || kind === 10) return;
  const w = Math.sin(Math.min(1, k * 1.15) * Math.PI);                // спалах і згасання
  if (w <= 0.02) return;
  const layers = [['#ff6a1a', 0.92], ['#ffc533', 0.62], ['#fff6c8', 0.3]];
  const cx = x + s / 2, cy = y + s / 2, jit = Math.sin(T / 37 + x + y) * s * 0.03;
  for (const [color, f] of layers) {
    const h = Math.max(1, s * f * w + jit);
    g.fillStyle = color;
    if (kind === 0) {
      rr(g, x, cy - h / 2, s, h, h / 2); g.fill();
      rr(g, cx - h / 2, y, h, s, h / 2); g.fill();
      g.beginPath(); g.arc(cx, cy, h * 0.62, 0, TAU); g.fill();
    } else {
      const horiz = DX[d] !== 0, end = kind !== 1;
      if (!end) {
        if (horiz) g.fillRect(x, cy - h / 2, s, h); else g.fillRect(cx - h / 2, y, h, s);
      } else {                                                     // від центру до кінця з закругленням
        const len = s * 0.88;
        const bx = DX[d] > 0 ? x : DX[d] < 0 ? x + s - len : cx - h / 2;
        const by = DY[d] > 0 ? y : DY[d] < 0 ? y + s - len : cy - h / 2;
        if (horiz) { rr(g, bx, cy - h / 2, len, h, h / 2); g.fill(); g.fillRect(DX[d] > 0 ? x : x + s - h / 2, cy - h / 2, h / 2, h); }
        else { rr(g, cx - h / 2, by, h, len, h / 2); g.fill(); g.fillRect(cx - h / 2, DY[d] > 0 ? y : y + s - h / 2, h, h / 2); }
      }
    }
  }
}

// Гравець: шолом кольору гравця, обличчя з очима в бік руху, руки й ноги; мертвий — згасає з хрестиками
function drawPlayer(g, p, s, T, mark) {
  const dead = !p.a;
  const dk = dead ? Math.min(1, (T - p.dt) / 900) : 0;
  if (dk >= 1) return;
  const col = COLORS[p.c] || '#fff';
  const cx = (p.x + 0.5) * s, base = (p.y + 0.5) * s;
  const walk = p.mv && !dead ? Math.sin(T / 70) : 0;
  const bob = Math.abs(walk) * s * 0.03;
  g.save();
  g.globalAlpha = 1 - dk;
  g.translate(cx, base);
  if (dead) { g.rotate(dk * 0.6); g.scale(1 - dk * 0.4, 1 - dk * 0.4); }
  // тінь
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, s * 0.4, s * 0.28, s * 0.08, 0, 0, TAU); g.fill();
  // стійкість до вогню — сяйво
  if (p.resist && !dead) {
    const a = 0.35 + 0.2 * Math.sin(T / 90);
    g.fillStyle = `rgba(120,220,255,${a})`;
    g.beginPath(); g.arc(0, 0, s * 0.52, 0, TAU); g.fill();
  }
  // ноги
  g.fillStyle = C.glove;
  g.beginPath(); g.ellipse(-s * 0.13, s * 0.36 + walk * s * 0.05, s * 0.1, s * 0.07, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(s * 0.13, s * 0.36 - walk * s * 0.05, s * 0.1, s * 0.07, 0, 0, TAU); g.fill();
  // тулуб
  g.fillStyle = shade(col, -0.15);
  rr(g, -s * 0.2, s * 0.04 - bob, s * 0.4, s * 0.3, s * 0.12); g.fill();
  g.fillStyle = '#1e2130';
  g.fillRect(-s * 0.2, s * 0.17 - bob, s * 0.4, s * 0.05);
  // руки
  g.fillStyle = C.glove;
  g.beginPath(); g.arc(-s * 0.25, s * 0.16 - bob - walk * s * 0.04, s * 0.075, 0, TAU); g.fill();
  g.beginPath(); g.arc(s * 0.25, s * 0.16 - bob + walk * s * 0.04, s * 0.075, 0, TAU); g.fill();
  // голова-шолом
  const hy = -s * 0.14 - bob;
  g.fillStyle = col;
  g.beginPath(); g.arc(0, hy, s * 0.27, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = Math.max(1, s * 0.025);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath(); g.ellipse(-s * 0.1, hy - s * 0.13, s * 0.08, s * 0.045, -0.5, 0, TAU); g.fill();
  // антена
  g.strokeStyle = shade(col, -0.35); g.lineWidth = Math.max(1, s * 0.03);
  g.beginPath(); g.moveTo(0, hy - s * 0.26); g.lineTo(0, hy - s * 0.36); g.stroke();
  g.fillStyle = C.glove;
  g.beginPath(); g.arc(0, hy - s * 0.38, s * 0.055, 0, TAU); g.fill();
  // обличчя (у бік руху), зі спини — без обличчя
  const fx = (DX[p.dr] || 0) * s * 0.07, fy = (p.dr === 3 || !p.dr) ? s * 0.02 : 0;
  if (p.dr !== 1) {
    g.fillStyle = C.skin;
    rr(g, -s * 0.17 + fx, hy - s * 0.08 + fy, s * 0.34, s * 0.2, s * 0.08); g.fill();
    g.fillStyle = C.visor;
    if (dead) {
      g.strokeStyle = C.visor; g.lineWidth = Math.max(1, s * 0.03);
      for (const ex of [-0.07, 0.07]) {
        const ox = ex * s + fx, oy = hy + s * 0.02 + fy, e = s * 0.035;
        g.beginPath(); g.moveTo(ox - e, oy - e); g.lineTo(ox + e, oy + e); g.moveTo(ox + e, oy - e); g.lineTo(ox - e, oy + e); g.stroke();
      }
    } else {
      for (const ex of [-0.07, 0.07]) { rr(g, ex * s + fx - s * 0.025, hy - s * 0.03 + fy, s * 0.05, s * 0.1, s * 0.025); g.fill(); }
    }
  }
  g.restore();
  if (mark && !dead) {                                             // «це ти» на початку раунду
    const ay = base - s * 0.85 + Math.sin(T / 120) * s * 0.06;
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(cx - s * 0.14, ay - s * 0.14); g.lineTo(cx + s * 0.14, ay - s * 0.14); g.lineTo(cx, ay); g.closePath(); g.fill();
  }
}

// Монстри: 0 — помаранчева кулька, 1 — фіолетовий колючий, 2 — привид; загиблий — лопається
function drawMonster(g, m, s, T) {
  const dk = m.a ? 0 : Math.min(1, (T - m.dt) / 500);
  if (dk >= 1) return;
  const cx = (m.x + 0.5) * s, cy = (m.y + 0.5) * s;
  g.save();
  g.translate(cx, cy);
  g.globalAlpha = (m.k === 2 ? 0.78 : 1) * (1 - dk);
  if (dk) g.scale(1 + dk * 0.6, 1 + dk * 0.6);
  const wob = Math.sin(T / 140 + m.i * 1.7);
  if (m.k !== 2) {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); g.ellipse(0, s * 0.38, s * 0.26, s * 0.07, 0, 0, TAU); g.fill();
  }
  if (m.k === 0) {
    g.fillStyle = '#ff8a3d';
    g.beginPath(); g.ellipse(0, -wob * s * 0.03, s * 0.34, s * 0.32 + wob * s * 0.02, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.beginPath(); g.ellipse(-s * 0.12, -s * 0.15, s * 0.08, s * 0.05, -0.6, 0, TAU); g.fill();
  } else if (m.k === 1) {
    g.fillStyle = '#8e44ad';
    g.beginPath();
    const n = 10;
    for (let j = 0; j <= n * 2; j++) {
      const a = j / (n * 2) * TAU + T / 900, r = s * (j % 2 ? 0.27 : 0.38 + wob * 0.02);
      j ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
    g.fillStyle = '#b26ad1';
    g.beginPath(); g.arc(0, 0, s * 0.24, 0, TAU); g.fill();
  } else {
    g.fillStyle = '#dbe9ff';
    g.beginPath();
    g.arc(0, -s * 0.08, s * 0.3, Math.PI, 0);
    const bottom = s * 0.3;
    g.lineTo(s * 0.3, bottom);
    for (let j = 0; j < 4; j++) {
      const x1 = s * 0.3 - (j + 0.5) * s * 0.15, x2 = s * 0.3 - (j + 1) * s * 0.15;
      g.quadraticCurveTo(x1, bottom - s * 0.1 - wob * s * 0.04 * (j % 2 ? 1 : -1), x2, bottom);
    }
    g.closePath(); g.fill();
  }
  // очі в бік руху
  const ex = (DX[m.d] || 0) * s * 0.05, ey = (DY[m.d] || 0) * s * 0.04;
  const eyeY = m.k === 2 ? -s * 0.1 : -s * 0.04;
  for (const sx of [-1, 1]) {
    g.fillStyle = '#fff';
    g.beginPath(); g.ellipse(sx * s * 0.1, eyeY, s * 0.075, s * 0.095, 0, 0, TAU); g.fill();
    g.fillStyle = '#16131f';
    g.beginPath(); g.arc(sx * s * 0.1 + ex, eyeY + ey + s * 0.01, s * 0.04, 0, TAU); g.fill();
  }
  if (m.k === 1) {                                                // сердиті брови
    g.strokeStyle = '#2b1236'; g.lineWidth = Math.max(1, s * 0.035);
    g.beginPath(); g.moveTo(-s * 0.18, eyeY - s * 0.14); g.lineTo(-s * 0.04, eyeY - s * 0.08);
    g.moveTo(s * 0.18, eyeY - s * 0.14); g.lineTo(s * 0.04, eyeY - s * 0.08); g.stroke();
  }
  g.restore();
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
