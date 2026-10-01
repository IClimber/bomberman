// bots.js — боти. Рахує їх лише хост. Бот — це слот раунду { x, y, dr, mv, nb, fp, sp, ps, rs, ... }
// з пам'яттю bot.ai; ходить від центру до центру клітинки за шляхом, знайденим пошуком у ширину.
// Раз на LEVEL.think мс: у небезпеці — тікає до найближчої безпечної клітинки; інакше обирає ціль
// (бонус, клітинку, звідки вибух зачепить блоки чи суперників / монстрів) і ставить бомбу,
// лише якщо після неї є куди втекти.
import { DX, DY, FUSE_MS, FLAME_MS, BLOCK, PILLAR, WALL, speedOf, canPlace } from './sim.js';
import { stepTo } from './monsters.js';

// Складність: think — як часто думає (мс); slip — імовірність не помітити небезпеку цього разу;
// aggro — імовірність поставити бомбу, коли є ціль; spare — запас часу на втечу (мс)
const LEVEL = [
  { think: 450, slip: 0.3, aggro: 0.35, spare: 650 },
  { think: 250, slip: 0.08, aggro: 0.7, spare: 400 },
  { think: 120, slip: 0, aggro: 1, spare: 350 },
];
const LOOK = 14;                     // ціль шукаємо не далі стількох кроків
const STEP_COST = 0.35;              // ціна кроку в балах цілі
const WALL_SOON = 4000;              // клітинка, куди за стільки впаде стіна, — небезпечна

const BACK = [0, 3, 4, 1, 2];

// ctx: { board, now, diff, coop, enemies [{x, y}], allies [{x, y}], monsters [{x, y}], danger() → Float64Array,
//   threat Uint8Array | null (клітинки біля монстрів) }
// Повертає true, якщо бот хоче поставити бомбу тут і зараз (хост перевірить і поставить).
export function botTick(bot, dt, ctx) {
  const L = LEVEL[ctx.diff] ?? LEVEL[1];
  const ai = bot.ai || (bot.ai = { next: 0, seen: -1, path: [], bomb: false, tx: null, ty: null });
  if (ai.tx == null) { ai.tx = Math.round(bot.x); ai.ty = Math.round(bot.y); }
  const atCenter = bot.x === ai.tx && bot.y === ai.ty;
  const fresh = ctx.board.bombs.size !== ai.seen;                  // з'явилась нова бомба — подумати одразу
  if (atCenter && (ctx.now >= ai.next || fresh)) {
    ai.next = ctx.now + L.think * (0.8 + Math.random() * 0.4);
    ai.seen = ctx.board.bombs.size;
    think(bot, ai, ctx, L);
  }
  if (atCenter && ai.bomb) {
    ai.bomb = false;
    ai.next = 0;                                                   // одразу шукати, куди тікати
    return true;
  }
  follow(bot, ai, dt, ctx.board);
  return false;
}

function think(bot, ai, ctx, L) {
  const { board, now } = ctx, GW = board.map.GW;
  const c = ai.ty * GW + ai.tx;
  const ms = 1000 / speedOf(bot.sp);
  const danger = ctx.danger();
  const standOk = (i, t) => danger[i] === Infinity && board.wallAt[i] > t + WALL_SOON && !(ctx.threat && ctx.threat[i]) && !board.fireAt(i);
  if (!standOk(c, now)) {
    if (ai.path.length && Math.random() < L.slip) return;          // «не помітив» — іде, куди йшов
    const r = bfs(bot, board, c, now, ms, danger, null, ctx.threat, L.spare);
    // без виходу — туди, де вибухне найпізніше, а при рівності — найдалі від монстрів
    let best = -1, late = c, lateK = -Infinity;
    for (let i = 0; i < r.dist.length; i++) {
      if (r.dist[i] < 0) continue;
      if (standOk(i, now + r.dist[i] * ms)) { if (best < 0 || r.dist[i] < r.dist[best]) best = i; continue; }
      const k = Math.min(danger[i] - now, 1e6) + farFrom(ctx.monsters, i, GW) * 100;
      if (k > lateK) { lateK = k; late = i; }
    }
    ai.path = pathTo(r, best >= 0 ? best : late);
    ai.bomb = false;
    return;
  }
  // Безпечно: шукаємо ціль
  const r = bfs(bot, board, c, now, ms, danger, null, ctx.threat, L.spare);
  const canBomb = board.activeOf(bot.o) < bot.nb;
  const cand = [];
  for (let i = 0; i < r.dist.length; i++) {
    const d = r.dist[i];
    if (d < 0 || d > LOOK || !standOk(i, now + d * ms)) continue;
    let v = 0;
    const it = board.itemAt(i);
    if (it) v += 5;
    const bv = canBomb ? blastValue(board, i, bot.fp, ctx) : 0;
    if (!ctx.coop && ctx.enemies.length) {                         // суперників трохи «тягне»
      let md = Infinity;
      for (const e of ctx.enemies) md = Math.min(md, Math.abs(Math.round(e.x) - i % GW) + Math.abs(Math.round(e.y) - Math.floor(i / GW)));
      v -= md * 0.12;
    }
    cand.push({ i, d, v, bv, score: v + Math.max(0, bv) - d * STEP_COST });
  }
  cand.sort((a, b) => b.score - a.score);
  for (const k of cand.slice(0, 6)) {
    if (k.bv > 0 && !(k.v > 4 && k.i !== c)) {                     // ціль — вибух: має бути куди втекти
      if (!canEscape(bot, board, k.i, now + k.d * ms, ms, danger, ctx.threat, L.spare)) continue;
      if (k.i === c) {
        if (Math.random() < L.aggro) { ai.bomb = true; ai.path = []; return; }
        continue;
      }
    } else if (k.v <= 0 && k.bv <= 0) continue;
    ai.path = pathTo(r, k.i);
    return;
  }
  // Нічого цікавого — блукаємо (у «Один проти одного» — ближче до суперників)
  const any = cand.filter(k => k.d > 0);
  ai.path = any.length ? pathTo(r, any[Math.floor(Math.random() * Math.min(any.length, 4))].i) : [];
}

function farFrom(list, i, GW) {
  if (!list || !list.length) return 0;
  const x = i % GW, y = (i - x) / GW;
  let d = Infinity;
  for (const m of list) d = Math.min(d, Math.abs(m.x - x) + Math.abs(m.y - y));
  return d;
}

// Цінність вибуху з клітинки i: блоки +1, суперники (монстри в «Команді») +4, свої в «Команді» −8, бонус −1
function blastValue(board, i, p, ctx) {
  const GW = board.map.GW, x0 = i % GW, y0 = Math.floor(i / GW);
  let v = 0;
  const near = (list, x, y) => { let n = 0; for (const e of list) if (Math.round(e.x) === x && Math.round(e.y) === y) n++; return n; };
  v += near(ctx.enemies, x0, y0) * 4 - (ctx.coop ? near(ctx.allies, x0, y0) * 8 : 0);
  for (let d = 1; d <= 4; d++) {
    for (let s = 1; s <= p; s++) {
      const x = x0 + DX[d] * s, y = y0 + DY[d] * s, j = y * GW + x, c = board.cell[j];
      if (c === PILLAR || c === WALL) break;
      if (c === BLOCK) { if (!board.burn.has(j)) v += 1; break; }
      if (board.active.has(j)) break;
      if (board.itemAt(j)) { v -= 1; break; }
      v += near(ctx.enemies, x, y) * 4;
      if (ctx.coop) v -= near(ctx.allies, x, y) * 8;
    }
  }
  return v;
}

// Чи буде куди втекти, якщо поставити бомбу в клітинці i в момент t
function canEscape(bot, board, i, t, ms, danger, threat, spare) {
  const GW = board.map.GW, x0 = i % GW, y0 = Math.floor(i / GW);
  const te = Math.min(t + FUSE_MS, danger[i]);
  const hypo = new Map([[i, te]]);
  for (let d = 1; d <= 4; d++) {
    for (let s = 1; s <= bot.fp; s++) {
      const j = (y0 + DY[d] * s) * GW + x0 + DX[d] * s, c = board.cell[j];
      if (c === PILLAR || c === WALL) break;
      hypo.set(j, Math.min(te, danger[j]));
      if (c === BLOCK || board.active.has(j)) break;
    }
  }
  const r = bfs(bot, board, i, t, ms, danger, hypo, threat, spare, i);
  for (let j = 0; j < r.dist.length; j++) {
    if (r.dist[j] < 0 || hypo.has(j) || danger[j] !== Infinity || (threat && threat[j])) continue;
    if (board.wallAt[j] > t + r.dist[j] * ms + WALL_SOON) return true;
  }
  return false;
}

// Пошук у ширину від клітинки start (час t0): у клітинку можна, якщо вона прохідна, не горить,
// а вибух у ній (danger / hypo) буде вже після того, як ми з неї вийдемо (або вже минув).
// bombAt — клітинка гіпотетичної бомби: стоїмо на ній, тож з неї вийти можна, а повернутися — ні.
function bfs(bot, board, start, t0, ms, danger, hypo, threat, spare, bombAt = -1) {
  const { GW, GH } = board.map, n = GW * GH;
  const dist = new Int16Array(n).fill(-1), prev = new Int32Array(n).fill(-1);
  const q = [start];
  dist[start] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % GW, y = (i - x) / GW;
    const ta = t0 + (dist[i] + 1) * ms;
    for (let d = 1; d <= 4; d++) {
      const nx = x + DX[d], ny = y + DY[d], j = ny * GW + nx;
      if (dist[j] >= 0 || j === bombAt || board.solid(nx, ny, false, bot.ps)) continue;
      if (threat && threat[j]) continue;
      let dj = danger[j];
      if (hypo && hypo.has(j)) dj = Math.min(dj, hypo.get(j));
      if (board.fireAt(j) && !(ta > board.fireUntil[j] + 100)) continue;
      if (dj !== Infinity && !(ta + ms + spare < dj || ta > dj + FLAME_MS + 150)) continue;
      if (board.wallAt[j] < ta + ms + 500) continue;
      dist[j] = dist[i] + 1;
      prev[j] = i;
      q.push(j);
    }
  }
  return { dist, prev };
}
function pathTo(r, goal) {
  const path = [];
  for (let i = goal; i >= 0 && r.dist[i] > 0; i = r.prev[i]) path.push(i);
  return path.reverse();
}

// Рух за шляхом: від центру до центру; якщо попереду з'явилась бомба — назад і думати знову
function follow(bot, ai, dt, board) {
  const GW = board.map.GW;
  let dist = speedOf(bot.sp) * dt;
  bot.mv = false;
  for (let g = 0; g < 4 && dist > 1e-9; g++) {
    if (bot.x === ai.tx && bot.y === ai.ty) {
      if (!ai.path.length) return;
      const j = ai.path[0], jx = j % GW, jy = (j - jx) / GW;
      const d = jx === ai.tx + 1 && jy === ai.ty ? 2 : jx === ai.tx - 1 && jy === ai.ty ? 4
        : jy === ai.ty + 1 && jx === ai.tx ? 3 : jy === ai.ty - 1 && jx === ai.tx ? 1 : 0;
      if (!d || board.solid(jx, jy, false, bot.ps)) { ai.path = []; ai.next = 0; return; }
      ai.path.shift();
      ai.tx = jx; ai.ty = jy; bot.dr = d;
    } else if (board.solid(ai.tx, ai.ty, false, bot.ps) && Math.abs(bot.x - ai.tx) + Math.abs(bot.y - ai.ty) > 0.5) {
      ai.tx -= DX[bot.dr]; ai.ty -= DY[bot.dr]; bot.dr = BACK[bot.dr];
      ai.path = []; ai.next = 0;
    }
    dist = stepTo(bot, ai.tx, ai.ty, dist);
    bot.mv = true;
  }
}

// Чи можна боту поставити бомбу тут (для хоста)
export const botCanPlace = (bot, board) => board.activeOf(bot.o) < bot.nb && canPlace(board, Math.round(bot.x), Math.round(bot.y));
