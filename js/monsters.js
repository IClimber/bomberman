// monsters.js — монстри «Команди». Рухає їх лише хост, клієнти отримують позиції у world.
// Монстр { i, k (вид, див. MON у sim.js), x, y, d (напрям), tx, ty (клітинка, куди йде), a (живий), mem (де бачив гравця) }
// ходить від центру до центру клітинки; у центрі вибирає, куди далі.
import { MON, DX, DY, FLAME_MS, Heap } from './sim.js';

const BACK = [0, 3, 4, 1, 2];
const KEEP = 0.75;                   // блукач іде прямо, якщо може, з такою ймовірністю
const GHOST_CALM = 20000;
const SCENT = 6, LUNGE = 3, WAIT_NEAR = 3, WAIT_DEPTH = 6;            // привид стільки мс від початку раунду не полює: біля старту лише 3 вільні клітинки
// Складність: hunt — імовірність, що привид у центрі клітинки поверне до найближчого гравця, якщо той не далі range клітинок
// (і раунд іде довше GHOST_CALM);
// safe — обходить вибухи: 1 — не заходить у вогонь і туди, де скоро вибухне, 2 — ще й тікає з-під вибуху найкоротшим
// шляхом; look — «скоро» — за стільки мс до вибуху; notice — імовірність помітити вибух, вибираючи, куди йти;
// sight — на скільки клітинок далі бачить переслідувач; memory — скільки мс він іде туди, де востаннє бачив гравця;
// «Нормально» й «Важко»: scent — імовірність, що переслідувач, не бачачи гравця, іде до найближчого за SCENT кроків найкоротшим шляхом;
// wait — помітивши бомбу поруч, не тікає далеко, а стає поза її вогнем якнайближче до гравця й чекає вибуху (інакше гравець
// ховається від нього на своїй бомбі); lunge — імовірність, що блукач повертає до гравця, якого бачить по прямій за LUNGE клітинок
export const LEVEL = [
  { hunt: 0.3, range: 5, safe: 0, look: 0, notice: 0, sight: 0, memory: 0 },
  { hunt: 0.6, range: 8, safe: 2, look: 1500, notice: 0.9, sight: 4, memory: 6000, scent: 0.2, wait: true, lunge: 0.3 },
  { hunt: 0.8, range: 10, safe: 2, look: 1500, notice: 0.9, sight: 4, memory: 6000, scent: 0.3, wait: true, lunge: 0.5 },
];

// targets — живі гравці { x, y }; ctx: { now, t0 (початок раунду), diff, danger() → Float64Array (див. Board.danger) }
export function monsterStep(m, dt, board, targets, ctx) {
  const kind = MON[m.k], L = LEVEL[ctx.diff] ?? LEVEL[1];
  const solid = (x, y) => board.solid(x, y, !!kind.ghost);
  if (m.tx == null) { m.tx = Math.round(m.x); m.ty = Math.round(m.y); }   // новий хост: спершу до центру клітинки
  let dist = kind.speed * dt;
  for (let g = 0; g < 4 && dist > 1e-9; g++) {
    if (m.x === m.tx && m.y === m.ty) {
      m.d = chooseDir(m, kind, solid, targets, board, ctx, L);
      if (!m.d) return;
      m.tx = m.x + DX[m.d]; m.ty = m.y + DY[m.d];
    } else if (solid(m.tx, m.ty) || (L.safe && board.fireAt(board.idx(m.tx, m.ty)))) {   // попереду бомба чи вогонь — назад
      m.tx -= DX[m.d]; m.ty -= DY[m.d]; m.d = BACK[m.d];
    }
    dist = stepTo(m, m.tx, m.ty, dist);
  }
}

// Крок до центру клітинки (tx, ty): спершу по x, потім по y. Повертає невитрачений шлях.
export function stepTo(p, tx, ty, dist) {
  const dx = tx - p.x;
  if (Math.abs(dx) > 1e-9) {
    const st = Math.min(dist, Math.abs(dx));
    p.x += Math.sign(dx) * st;
    dist -= st;
  }
  const dy = ty - p.y;
  if (dist > 1e-9 && Math.abs(dy) > 1e-9) {
    const st = Math.min(dist, Math.abs(dy));
    p.y += Math.sign(dy) * st;
    dist -= st;
  }
  if (Math.abs(p.x - tx) < 1e-9 && Math.abs(p.y - ty) < 1e-9) { p.x = tx; p.y = ty; }
  return dist;
}

function chooseDir(m, kind, solid, targets, board, ctx, L) {
  const x = m.x, y = m.y, GW = board.map.GW, now = ctx.now;
  let open = [1, 2, 3, 4].filter(d => !solid(x + DX[d], y + DY[d]));
  if (!open.length) return 0;
  if (L.safe && Math.random() < L.notice) {                       // вибухи: туди, де скоро вибухне чи горить, не йдемо
    const danger = ctx.danger(), step = 1000 / kind.speed;
    const risky = (i) => board.fireAt(i) || danger[i] < now + L.look || board.wallAt[i] < now + 2 * step;
    if (L.wait && targets.length) {
      const d = waitDir(x, y, solid, board, danger, now, step, targets);
      if (d >= 0) return d;
    }
    if (risky(y * GW + x)) {                                       // самі під вибухом — геть звідси
      const d = L.safe > 1 ? escapeDir(x, y, solid, board, danger, now, step, risky) : 0;
      if (d) return d;
      const out = open.filter(d => !risky((y + DY[d]) * GW + x + DX[d]));
      if (out.length) open = out;
      else {                                                       // вибухне скрізь — туди, де пізніше
        const at = (d) => danger[(y + DY[d]) * GW + x + DX[d]];
        const late = open.filter(d => !board.fireAt((y + DY[d]) * GW + x + DX[d]));
        if (!late.length) return 0;
        return late.reduce((a, b) => (at(b) > at(a) ? b : a));
      }
    } else {
      open = open.filter(d => !risky((y + DY[d]) * GW + x + DX[d]));
      if (!open.length) return 0;                                  // чекаємо, поки догорить
    }
  }
  if (kind.sight) {                                                // переслідувач: гравець на одній лінії, між нами порожньо
    const sight = kind.sight + L.sight;
    for (const p of targets) {
      const px = Math.round(p.x), py = Math.round(p.y);
      let d = 0;
      if (px === x && py !== y && Math.abs(py - y) <= sight) d = py < y ? 1 : 3;
      else if (py === y && px !== x && Math.abs(px - x) <= sight) d = px < x ? 4 : 2;
      if (!d || !open.includes(d)) continue;
      let clear = true;
      for (let cx = x + DX[d], cy = y + DY[d]; cx !== px || cy !== py; cx += DX[d], cy += DY[d]) {
        if (solid(cx, cy)) { clear = false; break; }
      }
      if (clear) {
        if (L.memory) m.mem = { x: px, y: py, until: now + L.memory };
        return d;
      }
    }
    if (m.mem && (now > m.mem.until || (m.mem.x === x && m.mem.y === y))) m.mem = null;
    if (m.mem) {                                                   // не бачить — іде туди, де бачив востаннє
      const d = pathDir(x, y, m.mem.x, m.mem.y, solid, GW, board.map.GH);
      if (d && open.includes(d)) return d;
      m.mem = null;
    }
  }
  if (kind.sight && L.scent && targets.length && Math.random() < L.scent) {   // «чує»: найкоротшим шляхом до найближчого
    const d = nearDir(x, y, solid, board, targets, SCENT);
    if (d && open.includes(d)) return d;
  }
  if (!kind.sight && !kind.ghost && L.lunge && Math.random() < L.lunge) {    // блукач: гравець поруч по прямій — до нього
    for (const p of targets) {
      const px = Math.round(p.x), py = Math.round(p.y);
      let d = 0;
      if (px === x && py !== y && Math.abs(py - y) <= LUNGE) d = py < y ? 1 : 3;
      else if (py === y && px !== x && Math.abs(px - x) <= LUNGE) d = px < x ? 4 : 2;
      if (!d || !open.includes(d)) continue;
      let clear = true;
      for (let cx = x + DX[d], cy = y + DY[d]; cx !== px || cy !== py; cx += DX[d], cy += DY[d]) if (solid(cx, cy)) { clear = false; break; }
      if (clear) return d;
    }
  }
  if (kind.ghost && targets.length && now >= ctx.t0 + GHOST_CALM && Math.random() < L.hunt) {
    let best = null, bd = Infinity;
    for (const p of targets) {
      const dd = Math.abs(p.x - x) + Math.abs(p.y - y);
      if (dd < bd) { bd = dd; best = p; }
    }
    const toward = bd > L.range ? [] : open.filter(d => Math.abs(best.x - x - DX[d]) + Math.abs(best.y - y - DY[d]) < bd);
    if (toward.length) return toward[Math.floor(Math.random() * toward.length)];
  }
  if (m.d && open.includes(m.d) && Math.random() < KEEP) return m.d;
  const turn = open.filter(d => d !== BACK[m.d]);
  const from = turn.length ? turn : open;
  return from[Math.floor(Math.random() * from.length)];
}

// Перший крок найкоротшого шляху з-під вибуху: у клітинку можна, якщо вогонь у ній буде вже після того,
// як монстр її пройде (або вже згас)
function escapeDir(x0, y0, solid, board, danger, now, step, risky) {
  const { GW, GH } = board.map, start = y0 * GW + x0;
  const dist = new Int16Array(GW * GH).fill(-1), first = new Uint8Array(GW * GH);
  const q = [start];
  dist[start] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % GW, y = (i - x) / GW;
    if (i !== start && !risky(i)) return first[i];
    if (dist[i] >= 8) continue;
    const ta = now + (dist[i] + 1) * step;
    for (let d = 1; d <= 4; d++) {
      const nx = x + DX[d], ny = y + DY[d], j = ny * GW + nx;
      if (dist[j] >= 0 || solid(nx, ny)) continue;
      if (board.fireUntil[j] > ta - step / 2) continue;
      if (danger[j] !== Infinity && danger[j] < ta + step && danger[j] + FLAME_MS > ta - step) continue;
      dist[j] = dist[i] + 1;
      first[j] = i === start ? d : first[i];
      q.push(j);
    }
  }
  return 0;
}

// Бомба поруч (за WAIT_NEAR клітинок вибухне): перший крок до клітинки поза її вогнем, найближчої до гравця (0 — уже там, стоїмо);
// -1 — бомби поруч немає. Шлях — як у escapeDir: крізь клітинку, лише якщо вогонь у ній не застане
function waitDir(x0, y0, solid, board, danger, now, step, targets) {
  const { GW, GH } = board.map, start = y0 * GW + x0;
  let near = false;
  for (let dy = -WAIT_NEAR; dy <= WAIT_NEAR && !near; dy++) {
    for (let dx = -WAIT_NEAR; dx <= WAIT_NEAR; dx++) {
      const x = x0 + dx, y = y0 + dy;
      if (Math.abs(dx) + Math.abs(dy) <= WAIT_NEAR && x >= 0 && y >= 0 && x < GW && y < GH && danger[y * GW + x] !== Infinity) { near = true; break; }
    }
  }
  if (!near) return -1;
  const far = (i) => { const x = i % GW, y = (i - x) / GW; let d = Infinity; for (const p of targets) d = Math.min(d, Math.abs(Math.round(p.x) - x) + Math.abs(Math.round(p.y) - y)); return d; };
  const dist = new Int16Array(GW * GH).fill(-1), first = new Uint8Array(GW * GH);
  const q = [start];
  dist[start] = 0;
  let best = -1, bestK = Infinity;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % GW, y = (i - x) / GW;
    if (danger[i] === Infinity && !board.fireAt(i)) {
      const k = far(i) * 10 + dist[i];
      if (k < bestK) { bestK = k; best = i; }
    }
    if (dist[i] >= WAIT_DEPTH) continue;
    const ta = now + (dist[i] + 1) * step;
    for (let d = 1; d <= 4; d++) {
      const nx = x + DX[d], ny = y + DY[d], j = ny * GW + nx;
      if (dist[j] >= 0 || solid(nx, ny)) continue;
      if (board.fireUntil[j] > ta - step / 2) continue;
      if (danger[j] !== Infinity && danger[j] < ta + step && danger[j] + FLAME_MS > ta - step) continue;
      dist[j] = dist[i] + 1;
      first[j] = i === start ? d : first[i];
      q.push(j);
    }
  }
  return best < 0 ? -1 : best === start ? 0 : first[best];
}

// Перший крок найкоротшого шляху (не далі max кроків) до найближчого гравця; 0 — немає
function nearDir(x0, y0, solid, board, targets, max) {
  const { GW, GH } = board.map, start = y0 * GW + x0;
  const goal = new Set(targets.map(p => Math.round(p.y) * GW + Math.round(p.x)));
  const dist = new Int16Array(GW * GH).fill(-1), first = new Uint8Array(GW * GH);
  const q = [start];
  dist[start] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (i !== start && goal.has(i)) return first[i];
    if (dist[i] >= max) continue;
    const x = i % GW, y = (i - x) / GW;
    for (let d = 1; d <= 4; d++) {
      const nx = x + DX[d], ny = y + DY[d], j = ny * GW + nx;
      if (dist[j] >= 0 || solid(nx, ny)) continue;
      dist[j] = dist[i] + 1;
      first[j] = i === start ? d : first[i];
      q.push(j);
    }
  }
  return 0;
}

// Перший крок найкоротшого шляху до клітинки (tx, ty) по прохідних для монстра клітинках
function pathDir(x0, y0, tx, ty, solid, GW, GH) {
  const start = y0 * GW + x0, goal = ty * GW + tx;
  const seen = new Uint8Array(GW * GH), first = new Uint8Array(GW * GH);
  const q = [start];
  seen[start] = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    if (i === goal) return first[i];
    const x = i % GW, y = (i - x) / GW;
    for (let d = 1; d <= 4; d++) {
      const nx = x + DX[d], ny = y + DY[d], j = ny * GW + nx;
      if (seen[j] || solid(nx, ny)) continue;
      seen[j] = 1;
      first[j] = i === start ? d : first[i];
      q.push(j);
    }
  }
  return 0;
}

// Коли монстр m найраніше може торкнутися того, хто в клітинці (див. monsterReach у round.js): Дейкстра за часом по клітинках,
// open[i] — з якого часу клітинка для нього прохідна (Infinity — ніколи); out — мінімум з тим, що вже там є.
// block — клітинка (уявна бомба), прохідна не раніше until. Далі 12 кроків — не загроза.
export const TOUCH = 0.6;            // монстр ближче — убиває
let arr = new Float64Array(0), hops = new Float64Array(0);
const heap = new Heap();
export function reachOne(B, m, now, open, out, block = -1, until = 0) {
  const { GW } = B.map, n = out.length, step = 1000 / MON[m.k].speed;
  if (arr.length !== n) { arr = new Float64Array(n); hops = new Float64Array(n); }
  arr.fill(Infinity);
  const tx = m.tx ?? Math.round(m.x), ty = m.ty ?? Math.round(m.y), fx = Math.round(m.x), fy = Math.round(m.y);
  for (const [x, y, d] of [[tx, ty, Math.abs(m.x - tx) + Math.abs(m.y - ty)], [fx, fy, Math.abs(m.x - fx) + Math.abs(m.y - fy)]]) {
    const i = B.idx(x, y), t = now + d * step;
    if (t < arr[i]) { arr[i] = t; hops[i] = d; heap.push(i, t); }
  }
  while (heap.size) {
    const t = heap.top(), i = heap.pop();
    if (t > arr[i]) continue;
    if (t - TOUCH * step < out[i]) out[i] = t - TOUCH * step;
    if (hops[i] > 12) continue;
    const x = i % GW, y = (i - x) / GW;
    for (let d = 1; d <= 4; d++) {
      const j = (y + DY[d]) * GW + x + DX[d];
      let o = open[j];
      if (j === block && o < until) o = until;
      if (o === Infinity) continue;
      const tj = (o > t ? o : t) + step;
      if (tj < arr[j]) { arr[j] = tj; hops[j] = hops[i] + 1; heap.push(j, tj); }
    }
  }
}

// Досяжність, якщо в клітинці i з'явиться бомба, що вибухне й догорить до until: монстрам, які доходять до i,
// шлях перераховуємо (крізь бомбу вони не пройдуть) — так бот бачить, що бомба на відступі — заслін
export function reachBlocked(reach, i, until) {
  if (!reach || !reach.each) return reach;
  const hit = reach.each.filter(([, r]) => r[i] !== Infinity);
  if (!hit.length) return reach;
  const n = reach.length, out = new Float64Array(n).fill(Infinity);
  for (const [, r] of reach.each) if (r[i] === Infinity) for (let j = 0; j < n; j++) if (r[j] < out[j]) out[j] = r[j];
  const { openN, openG } = reach.open;
  for (const [m] of hit) reachOne(reach.board, m, reach.now, MON[m.k].ghost ? openG : openN, out, i, until);
  return out;
}
