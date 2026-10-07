// render.js — малювання на canvas: поле, бонуси, бомби, вогонь, гравці, монстри, відлік. Усе кодом, без картинок.
// Як виглядає кожна річ — у стилі графіки (skins/*.js); тут — розкладка, кеш, порядок шарів, анімації смерті.
// Розмір клітинки — від вікна й карти (уся карта на екрані), з урахуванням devicePixelRatio.
// Статичний шар (тло, підлога, стовпи, рамка) і спрайти клітинок кешуються під поточний розмір і стиль.
import { PILLAR, BLOCK, WALL, FUSE_MS, FLAME_MS } from './sim.js';
import { COLORS } from './state.js';
import { SKINS } from './skins/index.js';
import { TAU, makeCanvas, rnd, drawFlame, drawBurning, remoteMark } from './skins/common.js';

const MARGIN = 14;
const PAD = 30;                      // поле тіні навколо карти в кеші (CSS px)
const WALL_WARN_MS = 1500;           // клітинка, куди скоро впаде стіна, блимає

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let dpr = 1, W = 0, H = 0;
  let cacheKey = '', stat = null, sprites = null, backKey = '', back = null;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = Math.round(innerWidth * dpr);
    H = Math.round(innerHeight * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    cacheKey = '';
  }
  resize();

  // ins — місце під інтерфейс з боків поля (CSS px): HUD зверху, напис або кнопки телефона знизу / з боків
  function layoutFor(map, ins) {
    const { top, bottom, left, right } = ins || { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN };
    const t = top * dpr, b = bottom * dpr, l = left * dpr, r = right * dpr;
    if (ins?.under) {
      // поле на весь екран, а HUD (висота t) закриває лише верхній ряд рамки: вищий за клітинку —
      // клітинка менша, щоб верхній ігровий ряд починався не вище t
      const ts = Math.max(6, Math.floor(Math.min(W / map.GW, H / map.GH, (H - t) / (map.GH - 1))));
      return { ts, ox: Math.floor((W - ts * map.GW) / 2), oy: Math.floor(Math.max(t - ts, (H - ts * map.GH) / 2)) };
    }
    const ts = Math.max(6, Math.floor(Math.min((W - l - r) / map.GW, (H - t - b) / map.GH)));
    return { ts, ox: Math.floor(l + (W - l - r - ts * map.GW) / 2), oy: Math.floor(t + (H - t - b - ts * map.GH) / 2) };
  }

  // ---------- Кеш: статичний шар і спрайти клітинок ----------
  function ensureCache(map, L, sk) {
    const key = `${sk.name}:${map.seed}:${map.GW}:${map.GH}:${L.ts}`;
    if (key === cacheKey) return;
    cacheKey = key;
    const ts = L.ts, pad = PAD * dpr;
    stat = makeCanvas(ts * map.GW + 2 * pad, ts * map.GH + 2 * pad);
    stat.pad = pad;
    const g = stat.getContext('2d');
    g.shadowColor = sk.shadow || 'rgba(0,0,0,0.55)';               // тінь під полем — один раз, у кеш
    g.shadowBlur = pad * 0.8;
    g.fillStyle = '#000';
    g.fillRect(pad, pad, ts * map.GW, ts * map.GH);
    g.shadowBlur = 0;
    g.translate(pad, pad);
    for (let y = 0; y < map.GH; y++) {
      for (let x = 0; x < map.GW; x++) {
        const i = y * map.GW + x, px = x * ts, py = y * ts;
        g.save();
        if (map.cell[i] === PILLAR) sk.stone(g, px, py, ts, x === 0 || y === 0 || x === map.GW - 1 || y === map.GH - 1, x, y, map);
        else sk.floor(g, px, py, ts, x, y, map);
        g.restore();
      }
    }
    sprites = {
      seed: map.seed,
      blocks: Array.from({ length: sk.blocks || 1 }, (_, v) => sprite(ts, (s) => sk.block(s, ts, v))),
      wall: sprite(ts, (s) => sk.wall(s, ts)),
      items: [null, 1, 2, 3, 4, 5, 6].map(k => k && sprite(ts, (s) => sk.item(s, k, ts))),
    };
  }
  // Блок клітинки i — один з варіантів стилю (сталий для клітинки в межах карти)
  const blockAt = (i) => sprites.blocks[sprites.blocks.length > 1 ? Math.floor(rnd(i, sprites.seed) * sprites.blocks.length) : 0];

  // Тло навколо поля — заливка або власний рисунок стилю (у кеш під розмір вікна)
  function background(sk) {
    if (!sk.backdrop) { ctx.fillStyle = sk.bg; ctx.fillRect(0, 0, W, H); return; }
    const key = `${sk.name}:${W}:${H}`;
    if (key !== backKey) {
      backKey = key;
      back = makeCanvas(W, H);
      const g = back.getContext('2d');
      g.fillStyle = sk.bg; g.fillRect(0, 0, W, H);
      sk.backdrop(g, W, H, dpr);
    }
    ctx.drawImage(back, 0, 0);
  }

  // ---------- Кадр ----------
  // v: { R, now, mySlot, slots [{x, y, dr, mv, a, dt, c, rs}] — як малювати слоти, mons — як малювати монстрів,
  //      decor — карта для тла лоббі (коли раунду немає), insets — місце під інтерфейс (див. layoutFor),
  //      skin — стиль графіки (індекс SKINS) }
  function draw(v) {
    const sk = SKINS[v.skin] || SKINS[0];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    background(sk);
    const map = v.R ? v.R.map : v.decor;
    if (!map) return;
    const L = layoutFor(map, v.R ? v.insets : null);
    ensureCache(map, L, sk);
    const { ts, ox, oy } = L, T = v.now;
    ctx.save();
    ctx.translate(ox, oy);
    ctx.drawImage(stat, -stat.pad, -stat.pad);
    if (!v.R) {
      for (let i = 0; i < map.cell.length; i++) {
        if (map.cell[i] === BLOCK) ctx.drawImage(blockAt(i), (i % map.GW) * ts, Math.floor(i / map.GW) * ts);
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
        if (until !== undefined) drawBurning(ctx, blockAt(i), x, y, ts, 1 - (until - T) / FLAME_MS, sk.burn);
        else ctx.drawImage(blockAt(i), x, y);
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

    // бомби; з детонатором — без запалу (k = 0), з антенкою, доки не підірвали
    for (const a of B.active.values()) {
      const x = a.b.x * ts, y = a.b.y * ts, remote = a.te === Infinity;
      sk.bomb(ctx, x, y, ts, remote ? 0 : Math.max(0, Math.min(1, 1 - (a.te - T) / FUSE_MS)), T);
      if (remote) remoteMark(ctx, x, y, ts, T);
    }

    // вогонь
    for (const f of B.flames) {
      const k = (T - f.t0) / FLAME_MS;
      if (k < 0 || k >= 1) continue;
      for (const [i, kind, d] of f.cells) {
        if (kind !== 9 && kind !== 10) drawFlame(ctx, (i % GW) * ts, Math.floor(i / GW) * ts, ts, kind, d, k, T, sk.fire, sk.pixel ? ts / 16 : 0);
      }
    }

    // монстри (привиди — поверх блоків, тож разом з усіма після клітинок)
    for (const m of v.mons) drawMonster(ctx, sk, m, ts, T);
    // гравці: спершу мертві, згори — живі, свій — найвище
    const order = v.slots.map((s, k) => k).sort((a, b) => (v.slots[a].a - v.slots[b].a) || ((a === v.mySlot) - (b === v.mySlot)));
    for (const k of order) drawPlayer(ctx, sk, v.slots[k], ts, T, k === v.mySlot && T < R.t0 + 2500);
    for (const k of order) if (v.slots[k].a && v.slots[k].emo) drawEmo(ctx, v.slots[k], ts, dpr);
    ctx.restore();

    // відлік і написи
    if (T < R.t0 + 700 && R.p === 0) {
      const left = R.t0 - T;
      bigText(left > 0 ? String(Math.ceil(left / 1000)) : 'СТАРТ!', 1 - ((left % 1000) + 1000) % 1000 / 1000);
    } else if (R.p === 0 && B.sdStarted(T) && T < B.sdAt + 2200) {
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

function sprite(ts, fn) { const c = makeCanvas(ts, ts); fn(c.getContext('2d')); return c; }

// Гравець: тінь, сяйво стійкості, сам гравець (стиль), «це ти» на початку раунду; мертвий — згасає, обертаючись
function drawPlayer(g, sk, p, s, T, mark) {
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
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath(); g.ellipse(0, s * 0.4, s * 0.28, s * 0.08, 0, 0, TAU); g.fill();
  if (p.resist && !dead) {
    const a = 0.35 + 0.2 * Math.sin(T / 90);
    g.fillStyle = `rgba(120,220,255,${a})`;
    g.beginPath(); g.arc(0, 0, s * 0.52, 0, TAU); g.fill();
  }
  sk.player(g, p, s, T, { col, walk, bob, dead });
  g.restore();
  if (mark && !dead) {
    const ay = base - s * 0.85 + Math.sin(T / 120) * s * 0.06;
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(cx - s * 0.14, ay - s * 0.14); g.lineTo(cx + s * 0.14, ay - s * 0.14); g.lineTo(cx, ay); g.closePath(); g.fill();
  }
}

// Реакція над гравцем: бульбашка з емодзі (p.emo { ch, k — частка показу 0..1 }) — вискакує, піднімається, згасає
const EMO_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
function drawEmo(g, p, s, dpr) {
  const { ch, k } = p.emo;
  const r = Math.max(s * 0.4, 13 * dpr) * (k < 0.06 ? 0.5 + 0.5 * k / 0.06 : 1);
  const cx = (p.x + 0.5) * s, cy = (p.y + 0.5) * s - s * 0.55 - r - k * s * 0.15;
  g.save();
  g.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1;
  g.fillStyle = 'rgba(255,255,255,0.94)';
  g.strokeStyle = 'rgba(20,23,34,0.5)'; g.lineWidth = Math.max(1, r * 0.08);
  g.beginPath();
  g.arc(cx, cy, r, Math.PI * 0.62, Math.PI * 0.38);
  g.lineTo(cx, cy + r * 1.35);
  g.closePath();
  g.fill(); g.stroke();
  g.font = `${Math.round(r * 1.15)}px ${EMO_FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#000';
  g.fillText(ch, cx, cy + r * 0.08);
  g.restore();
}

// Монстр (стиль малює тіло й очі); привид напівпрозорий і без тіні; загиблий — лопається
function drawMonster(g, sk, m, s, T) {
  const dk = m.a ? 0 : Math.min(1, (T - m.dt) / 500);
  if (dk >= 1) return;
  g.save();
  g.translate((m.x + 0.5) * s, (m.y + 0.5) * s);
  g.globalAlpha = (m.k === 2 ? 0.78 : 1) * (1 - dk);
  if (dk) g.scale(1 + dk * 0.6, 1 + dk * 0.6);
  if (m.k !== 2) {
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); g.ellipse(0, s * 0.38, s * 0.26, s * 0.07, 0, 0, TAU); g.fill();
  }
  sk.monster(g, m, s, T, Math.sin(T / 140 + m.i * 1.7));
  g.restore();
}
