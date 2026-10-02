// bots.js — боти. Рахує їх лише хост. Бот — це слот раунду { x, y, dr, mv, nb, fp, sp, ps, rs, ... }
// з пам'яттю bot.ai; ходить від центру до центру клітинки за шляхом, знайденим пошуком у ширину.
// Раз на LEVEL.think мс: у небезпеці — тікає до найближчої безпечної клітинки; інакше обирає ціль
// (бонус, клітинку, звідки вибух зачепить блоки чи суперників / монстрів) і ставить бомбу,
// лише якщо після неї є куди втекти.
import { DX, DY, FUSE_MS, FLAME_MS, BLOCK, PILLAR, WALL, speedOf, canPlace } from './sim.js';
import { stepTo } from './monsters.js';

// Складність: think — як часто думає (мс; vsThink — у «Один проти одного»); slip — імовірність не помітити небезпеку цього разу;
// aggro — імовірність поставити бомбу, коли є ціль; spare — запас часу на втечу (мс);
// react — («Один проти одного») через скільки мс бот помічає чужу бомбу: без цього рівні там майже не відрізнялись —
// усі тікали від вогню однаково досконало; tame — («Один проти одного») «смирний»: не полює на суперників (у вогні —
// як блок, без бомби «для тиску» і тяги до них), одна бомба за раз, по бонуси не йде;
// монстри («Нормально», «Важко», див. monsterReach): cross — запас (мс), з яким пройти клітинку раніше за монстра,
// hold — скільки (мс) монстр не повинен устигнути дійти туди, де бот стоїть;
// detAge — бомбу з детонатором, у вогні якої суперник (монстр), підриває не раніше, ніж за стільки мс після того, як поставив
// (інакше людина не встигає й помітити бомбу); без суперника у вогні — коли вибухнула б звичайна (FUSE_MS)
const LEVEL = [
  { think: 450, vsThink: 600, slip: 0.3, aggro: 0.5, spare: 650, react: 1600, tame: true, detAge: FUSE_MS },
  { think: 250, slip: 0.08, aggro: 0.8, spare: 400, react: 600, cross: 200, hold: 700, detAge: 1800 },
  { think: 120, slip: 0, aggro: 1, spare: 350, cross: 0, hold: 800, detAge: 1000 },
];
const LOOK = 14;                     // ціль шукаємо не далі стількох кроків
const NEAR = 4;                      // суперників і монстрів враховуємо лише для клітинок за стільки кроків: далі вони встигнуть піти
const ALLY_WAIT = 1500;              // свій на лінії вогню — стільки чекаємо, поки відійде
const TABU_MS = 4000;                // дійшли до цілі, а бомби там не вийшло — стільки туди не вертаємось
const STEP_COST = 0.35;              // ціна кроку в балах цілі
const WALL_SOON = 4000;              // клітинка, куди за стільки впаде стіна, — небезпечна
const ROOM_DEPTH = 6;                // «Нормально», «Важко»: з клітинки, до якої може дійти монстр, має бути куди відступити —
const ROOM_SLACK = 1000;             // за ROOM_DEPTH кроків, раніше за монстрів, туди, де до них ще стільки мс
const MON_FAR = 3000;                // монстр дійде не раніше, ніж за стільки мс, — простір не перевіряємо
const LAST_SPARE = 120;              // втеча без запасу spare: з клітинки, що вибухне, вийти (пів кроку) хоч за стільки мс до вибуху

const BACK = [0, 3, 4, 1, 2];

// ctx: { board, now, diff, coop, enemies [{x, y}], allies [{x, y}], monsters [{x, y}], danger() → Float64Array,
//   threat Uint8Array | null (клітинки біля монстрів, «Легко»), reach Float64Array | null (коли туди може дійти монстр) }
// Повертає true, якщо бот хоче поставити бомбу тут і зараз (хост перевірить і поставить).
export function botTick(bot, dt, ctx) {
  const L = LEVEL[ctx.diff] ?? LEVEL[1];
  const ai = bot.ai || (bot.ai = { next: 0, seen: -1, path: [], bomb: false, tx: null, ty: null, goal: -1, roam: false, allyWait: 0, tabu: new Map() });
  if (ai.tx == null) { ai.tx = Math.round(bot.x); ai.ty = Math.round(bot.y); }
  const board = ctx.board, GW = board.map.GW;
  // Реакція («Один проти одного», react): чужу бомбу бот помічає через react мс після того, як її поставили, —
  // доти не тікає від неї й не зважає на неї, вибираючи шлях
  let bombs = board.bombs.size;
  if (L.react && !ctx.coop) {
    const fresh = b => b.o !== bot.o && b.t + L.react > ctx.now;
    for (const b of board.bombs.values()) if (fresh(b)) bombs--;
    if (bombs < board.bombs.size) { let d = null; ctx = { ...ctx, danger: () => d || (d = board.danger(undefined, fresh, true, bot.o)) }; }
  }
  let dist = speedOf(bot.sp) * dt;
  bot.mv = false;
  // Рух за шляхом від центру до центру. Стоїть — думає раз на think мс; іде — в центрі клітинки (і посеред тіку), лише
  // коли нова бомба робить шлях небезпечним (одразу), клітинка під вибухом або, без цілі, суперник за NEAR кроків
  // (раз на think мс): інакше на довгому шляху не бачив нових бомб і заходив у їхній вогонь, а двоє без цілей ішли
  // одне в одного клітинку, розминались і так без кінця; якби думав у кожному центрі — перемикався б між цілями й тупцяв
  for (let g = 0; g < 4; g++) {
    if (bot.x === ai.tx && bot.y === ai.ty) {
      if (bombs !== ai.seen && ai.path.length && pathOk(bot, ai, ctx, L)) ai.seen = bombs;
      if (bombs !== ai.seen
        || ctx.now >= ai.next && (!ai.path.length || ctx.danger()[ai.ty * GW + ai.tx] !== Infinity
          || ai.roam && ctx.enemies.some(e => Math.abs(e.x - ai.tx) + Math.abs(e.y - ai.ty) <= NEAR))) {
        ai.next = ctx.now + (!ctx.coop && L.vsThink || L.think) * (0.8 + Math.random() * 0.4);
        ai.seen = bombs;
        think(bot, ai, ctx, L);
      }
      if (ai.bomb) {
        ai.bomb = false;
        ai.next = 0;                                               // одразу шукати, куди тікати
        return true;
      }
      if (!ai.path.length || dist <= 1e-9) return false;
      const j = ai.path[0], jx = j % GW, jy = (j - jx) / GW;
      const d = jx === ai.tx + 1 && jy === ai.ty ? 2 : jx === ai.tx - 1 && jy === ai.ty ? 4
        : jy === ai.ty + 1 && jx === ai.tx ? 3 : jy === ai.ty - 1 && jx === ai.tx ? 1 : 0;
      if (!d || board.solid(jx, jy, false, bot.ps)) { ai.path = []; ai.next = 0; return false; }
      ai.path.shift();
      ai.tx = jx; ai.ty = jy; bot.dr = d;
    } else if (board.solid(ai.tx, ai.ty, false, bot.ps) && Math.abs(bot.x - ai.tx) + Math.abs(bot.y - ai.ty) > 0.5) {
      ai.tx -= DX[bot.dr]; ai.ty -= DY[bot.dr]; bot.dr = BACK[bot.dr];   // попереду з'явилась бомба — назад і думати знову
      ai.path = []; ai.next = 0;
    }
    if (dist <= 1e-9) return false;
    dist = stepTo(bot, ai.tx, ai.ty, dist);
    bot.mv = true;
  }
  return false;
}

function think(bot, ai, ctx, L) {
  const { board, now } = ctx, GW = board.map.GW;
  const c = ai.ty * GW + ai.tx;
  const ms = 1000 / speedOf(bot.sp);
  const danger = ctx.danger();
  const mon = monOf(ctx, L);
  const standOk = (i, t) => danger[i] === Infinity && !danger.mine[i] && board.wallAt[i] > t + WALL_SOON && monOk(mon, i, t) && !board.fireAt(i);
  // не глухий кут, куди йде монстр: є куди відступити раніше за монстрів (для втечі й сховку від своєї бомби)
  const roomy = (i, t) => !ctx.reach || ctx.reach[i] > t + MON_FAR || room(bot, board, i, t, ms, danger, mon, L.spare) >= ROOM_SLACK;
  const tame = !ctx.coop && L.tame;                                 // «Один проти одного», «Легко»: див. LEVEL
  const canBomb = board.activeOf(bot.o) < (tame ? 1 : bot.nb);
  const foe = tame ? 1 : 4;                                        // цінність суперника у вогні
  const here = standOk(c, now), cramped = here && !roomy(c, now);   // cramped — глухий кут, до якого йде монстр
  ai.roam = false;
  if (!here || cramped) {
    if (ai.path.length && Math.random() < L.slip) return;          // «не помітив» — іде, куди йшов
    // монстр близько, а бомба є — ставимо заслін (крізь бомбу монстр не пройде) і тікаємо від неї
    if (ctx.reach && danger[c] === Infinity && !danger.mine[c] && canBomb && canPlace(board, ai.tx, ai.ty) && !hitsAlly(board, c, bot.fp, ctx)
      && canEscape(bot, board, c, now, ms, danger, mon, L.spare, roomy)) {
      ai.path = []; ai.bomb = true;
      return;
    }
    let spare = L.spare, r = bfs(bot, board, c, now, ms, danger, null, mon, spare);
    // із запасом spare не втекти — без нього: стояти на місці під вибухом — напевно загинути
    if (danger[c] !== Infinity && !r.dist.some((d, i) => d > 0 && standOk(i, now + d * ms))) {
      spare = Math.min(spare, LAST_SPARE - ms / 2);
      r = bfs(bot, board, c, now, ms, danger, null, mon, spare);
    }
    // без виходу — туди, де вибухне найпізніше, а при рівності — найдалі від монстрів
    let late = c, lateK = -Infinity;
    const safe = [];
    for (let i = 0; i < r.dist.length; i++) {
      if (r.dist[i] < 0) continue;
      if (standOk(i, now + r.dist[i] * ms)) { if (!cramped || i !== c) safe.push(i); continue; }
      const k = (board.fireAt(i) ? 0 : Math.min(danger[i] - now, 1e6)) + (ctx.reach ? Math.min(ctx.reach[i] - now - r.dist[i] * ms, 1e5) : farFrom(ctx.monsters, i, GW) * 100);
      if (k > lateK) { lateK = k; late = i; }
    }
    safe.sort((a, b) => r.dist[a] - r.dist[b]);
    let best = safe.slice(0, 10).find(i => roomy(i, now + r.dist[i] * ms)) ?? -1;  // найближча, де не затиснуть
    if (best >= 0 || !cramped) {                                   // тісно, а просторіше ніде — далі як звичайно
      if (best < 0 && safe.length) best = safe[0];
      if (best < 0 && ctx.reach && danger[c] !== Infinity) {       // від вогню не втекти, не ризикнувши з монстром, — ризикуємо
        const r2 = bfs(bot, board, c, now, ms, danger, null, null, spare);
        let pick = -1, pickK = -Infinity;
        for (let i = 0; i < r2.dist.length; i++) {
          const t = now + r2.dist[i] * ms;
          if (r2.dist[i] <= 0 || danger[i] !== Infinity || danger.mine[i] || board.wallAt[i] < t + WALL_SOON || board.fireAt(i)) continue;
          const k = Math.min(ctx.reach[i] - t, 5000) - r2.dist[i] * 50;
          if (k > pickK) { pickK = k; pick = i; }
        }
        if (pick >= 0) { ai.path = pathTo(r2, pick); ai.bomb = false; return; }
      }
      ai.path = pathTo(r, best >= 0 ? best : late);
      if (best < 0 && late === c && ctx.reach) ai.path = cornered(bot, board, c, now, ms, danger, ctx.reach);
      ai.bomb = false;
      return;
    }
  }
  // Безпечно: шукаємо ціль
  const r = bfs(bot, board, c, now, ms, danger, null, mon, L.spare);
  // Спершу — бомба тут, якщо є що зачепити і куди втекти (інакше бот бігає туди-назад між «кращими» клітинками)
  const esc = canBomb && canEscape(bot, board, c, now, ms, danger, mon, L.spare, roomy);
  if (esc && blastValue(board, c, bot.fp, ctx, foe) + (tame ? 0 : pressure(ctx, c, GW)) > 0) {
    ai.path = []; ai.goal = -1; ai.allyWait = 0;
    if (Math.random() < L.aggro) ai.bomb = true;                   // не наважився — вагається тут
    return;
  }
  // «Команда»: бот-товариш чекає, поки ми зійдемо з лінії його вогню, — відходимо (чекаємо й ми на нього — відходить той,
  // у кого номер слоту більший): інакше обидва стояли, чекаючи одне одного, потім крокували одне одному назустріч — і знову
  const wait = ctx.coop && ctx.allies.find(e => e.ai && e.ai.allyWait > now && (e.o < bot.o || !(ai.allyWait > now))
    && blastCells(board, Math.round(e.y) * GW + Math.round(e.x), e.fp).has(c));
  if (wait) {
    const fire = blastCells(board, Math.round(wait.y) * GW + Math.round(wait.x), wait.fp);
    let best = -1;
    for (let i = 0; i < r.dist.length; i++) {
      if (r.dist[i] > 0 && !fire.has(i) && standOk(i, now + r.dist[i] * ms) && (best < 0 || r.dist[i] < r.dist[best])) best = i;
    }
    if (best >= 0) { ai.path = pathTo(r, best); ai.goal = -1; ai.allyWait = 0; return; }
  }
  if (esc && ctx.coop && blastValue(board, c, bot.fp, { ...ctx, allies: [] }, foe) > 0) {
    if (!ai.allyWait) ai.allyWait = now + ALLY_WAIT;
    if (now < ai.allyWait) { ai.path = []; return; }               // свій на лінії вогню — чекаємо, поки відійде
  }
  if (ai.goal === c) ai.tabu.set(c, now + TABU_MS);
  for (const [i, until] of ai.tabu) if (until <= now) ai.tabu.delete(i);
  const cand = [];
  for (let i = 0; i < r.dist.length; i++) {
    const d = r.dist[i];
    if (d <= 0 || d > LOOK || ai.tabu.has(i) || !standOk(i, now + d * ms)) continue;
    let v = 0;
    const it = board.itemAt(i);
    if (it && !tame) v += 5;
    const bv = canBomb ? blastValue(board, i, bot.fp, ctx, d <= NEAR ? foe : 0) : 0;
    if (!ctx.coop && !tame && ctx.enemies.length) {                // суперників трохи «тягне»
      let md = Infinity;
      for (const e of ctx.enemies) md = Math.min(md, Math.abs(Math.round(e.x) - i % GW) + Math.abs(Math.round(e.y) - Math.floor(i / GW)));
      v -= md * 0.12;
    }
    cand.push({ i, d, v, bv, score: v + Math.max(0, bv) - d * STEP_COST });
  }
  cand.sort((a, b) => b.score - a.score);
  for (const k of cand.slice(0, 6)) {
    if (k.bv > 0 && k.v <= 4) {                                    // ціль — вибух: має бути куди втекти
      if (!canEscape(bot, board, k.i, now + k.d * ms, ms, danger, mon, L.spare, roomy)) continue;
    } else if (k.v <= 0 && k.bv <= 0) continue;
    ai.path = pathTo(r, k.i);
    ai.goal = k.i; ai.allyWait = 0;
    return;
  }
  ai.goal = -1; ai.allyWait = 0;
  // Поруч нічого цікавого — туди, звідки найближче до блоків і суперників (у «Команді» — монстрів); tame — лише до блоків,
  // а їх немає — навмання поблизу
  const goals = tame ? [] : ctx.enemies.map(e => [Math.round(e.x), Math.round(e.y)]);
  for (let i = 0; i < board.cell.length; i++) if (board.cell[i] === BLOCK && !board.burn.has(i)) goals.push([i % GW, (i - i % GW) / GW]);
  let best = null, bestK = Infinity;
  for (const k of cand) {
    if (!k.d) continue;
    const x = k.i % GW, y = (k.i - x) / GW;
    let md = goals.length ? Infinity : 0;
    for (const [gx, gy] of goals) md = Math.min(md, Math.abs(gx - x) + Math.abs(gy - y));
    const key = md + k.d * 0.1 + Math.random() * 0.5;
    if (key < bestK) { bestK = key; best = k; }
  }
  ai.path = best ? pathTo(r, best.i) : [];
  ai.roam = true;
}

// «Один проти одного»: суперник за 2 кроки, хоч і не на лінії, — бомба змусить його тікати
function pressure(ctx, i, GW) {
  if (ctx.coop) return 0;
  const x = i % GW, y = (i - x) / GW;
  return ctx.enemies.some(e => Math.abs(Math.round(e.x) - x) + Math.abs(Math.round(e.y) - y) <= 2) ? 1 : 0;
}

const monOf = (ctx, L) => ({ threat: ctx.threat, reach: ctx.reach, cross: L.cross, hold: L.hold });

// Нова бомба: чи можна йти далі за шляхом (так, як його пропустив би bfs) і стояти там, куди він веде
function pathOk(bot, ai, ctx, L) {
  const { board, now } = ctx, GW = board.map.GW, danger = ctx.danger(), mon = monOf(ctx, L), ms = 1000 / speedOf(bot.sp);
  if (danger[ai.ty * GW + ai.tx] !== Infinity) return false;
  let t = now, from = ai.ty * GW + ai.tx;
  for (const j of ai.path) {
    t += ms;
    if (!canEnter(bot, board, j, t, ms, danger, null, mon, L.spare, from)) return false;
    from = j;
  }
  const j = ai.path[ai.path.length - 1];
  return danger[j] === Infinity && !danger.mine[j] && board.wallAt[j] > t + WALL_SOON && monOk(mon, j, t) && !board.fireAt(j);
}

// Чи можна стояти в клітинці i з моменту t з огляду на монстрів
function monOk(mon, i, t) {
  if (mon.reach) return mon.reach[i] > t + mon.hold;
  return !(mon.threat && mon.threat[i]);
}

// Затиснутий монстрами (жодної клітинки, куди встигнути): крок до сусідньої, куди монстр дійде найпізніше
function cornered(bot, board, c, now, ms, danger, reach) {
  const GW = board.map.GW, x = c % GW, y = (c - x) / GW;
  let best = -1, bestT = reach[c];
  for (let d = 1; d <= 4; d++) {
    const nx = x + DX[d], ny = y + DY[d], j = ny * GW + nx;
    if (board.solid(nx, ny, false, bot.ps) || board.fireAt(j) || danger[j] < now + ms + FLAME_MS) continue;
    if (reach[j] > bestT) { bestT = reach[j]; best = j; }
  }
  return best >= 0 ? [best] : [];
}

function farFrom(list, i, GW) {
  if (!list || !list.length) return 0;
  const x = i % GW, y = (i - x) / GW;
  let d = Infinity;
  for (const m of list) d = Math.min(d, Math.abs(m.x - x) + Math.abs(m.y - y));
  return d;
}

// Цінність вибуху з клітинки i: блоки +1, суперники (монстри в «Команді») +foes кожен, свої в «Команді» −8, бонус −1
function blastValue(board, i, p, ctx, foes) {
  const GW = board.map.GW, x0 = i % GW, y0 = Math.floor(i / GW);
  let v = 0;
  const near = (list, x, y) => { let n = 0; for (const e of list) if (Math.round(e.x) === x && Math.round(e.y) === y) n++; return n; };
  const enemies = foes ? ctx.enemies : [];
  v += near(enemies, x0, y0) * foes - (ctx.coop ? near(ctx.allies, x0, y0) * 8 : 0);
  for (let d = 1; d <= 4; d++) {
    for (let s = 1; s <= p; s++) {
      const x = x0 + DX[d] * s, y = y0 + DY[d] * s, j = y * GW + x, c = board.cell[j];
      if (c === PILLAR || c === WALL) break;
      if (c === BLOCK) { if (!board.burn.has(j)) v += 1 + (ctx.diff ? near(enemies, x, y) * foes : 0); break; }   // привид у блоці теж згорить
      if (board.active.has(j)) break;
      if (board.itemAt(j)) { v -= 1; break; }
      v += near(enemies, x, y) * foes;
      if (ctx.coop) v -= near(ctx.allies, x, y) * 8;
    }
  }
  return v;
}

// Найбільший запас часу до монстрів (мс) серед клітинок, куди з i можна дійти (до ROOM_DEPTH кроків) раніше за них і вогонь
function room(bot, board, i, t, ms, danger, mon, spare) {
  const r = bfs(bot, board, i, t, ms, danger, null, mon, spare, -1, ROOM_DEPTH);
  let best = -Infinity;
  for (let j = 0; j < r.dist.length; j++) if (r.dist[j] >= 0) best = Math.max(best, mon.reach[j] - t - r.dist[j] * ms);
  return best;
}

// Чи зачепить вибух із клітинки i когось зі своїх («Команда»)
function hitsAlly(board, i, p, ctx) {
  const mine = { ...ctx, enemies: [] };
  return ctx.coop && blastValue(board, i, p, mine, 0) < blastValue(board, i, p, { ...mine, allies: [] }, 0);
}

// Клітинки, куди дістане вогонь бомби з клітинки i дальністю p (з нею самою)
function blastCells(board, i, p) {
  const GW = board.map.GW, x0 = i % GW, y0 = (i - x0) / GW, cells = new Set([i]);
  for (let d = 1; d <= 4; d++) {
    for (let s = 1; s <= p; s++) {
      const j = (y0 + DY[d] * s) * GW + x0 + DX[d] * s, c = board.cell[j];
      if (c === PILLAR || c === WALL) break;
      cells.add(j);
      if (c === BLOCK || board.active.has(j)) break;
    }
  }
  return cells;
}

// Чи буде куди втекти, якщо поставити бомбу в клітинці i в момент t. Вогонь — з ланцюжком: зачеплені бомби вибухнуть разом
// із нею (зокрема своя з детонатором, крізь вогонь якої інакше можна пройти). Сховок, до якого монстр може дійти,
// поки бомба не догорить, — лише якщо з нього є куди відступити (roomy).
function canEscape(bot, board, i, t, ms, danger, mon, spare, roomy) {
  const te = Math.min(t + FUSE_MS, danger[i]);
  const hypo = new Map([...chainCells(board, i, bot.fp)].map(j => [j, Math.min(te, danger[j])]));
  const r = bfs(bot, board, i, t, ms, danger, hypo, mon, spare, i);
  for (let j = 0; j < r.dist.length; j++) {
    const tj = t + r.dist[j] * ms;
    if (r.dist[j] < 0 || hypo.has(j) || danger[j] !== Infinity || danger.mine[j] || board.fireAt(j) || !monOk(mon, j, tj)) continue;
    if (mon.reach && !(mon.reach[j] > te + FLAME_MS) && !roomy(j, tj)) continue;
    if (board.wallAt[j] > tj + WALL_SOON) return true;
  }
  return false;
}

// Чи можна зайти в клітинку j (з клітинки from), дійшовши до її центру в момент ta: вона прохідна, не горить, а перший вибух
// у ній (danger / hypo) буде вже після того, як ми з неї вийдемо (або останній уже минув). Під чужою бомбою з детонатором
// (danger.any) — лише зсередини її ж вогню, коли тікаємо: ззовні туди не заходимо. Крізь вогонь своєї (danger.mine) — можна.
// Монстри (mon): «Легко» — не заходимо в клітинки поруч із ними; інакше — лише в ті, які встигнемо пройти раніше за них.
function canEnter(bot, board, j, ta, ms, danger, hypo, mon, spare, from) {
  const GW = board.map.GW, x = j % GW;
  if (board.solid(x, (j - x) / GW, false, bot.ps)) return false;
  if (danger.any && danger.any[j] && !danger.any[from]) return false;
  if (mon && (mon.reach ? !(mon.reach[j] > ta + ms * 0.5 + mon.cross) : mon.threat && mon.threat[j])) return false;
  let dj = danger[j], dl = danger.last[j];                        // перший і останній вибух у клітинці
  if (hypo && hypo.has(j)) { const h = hypo.get(j); dj = Math.min(dj, h); dl = Math.max(dl, h); }
  if (board.fireAt(j) && !(ta > board.fireUntil[j] + 100 && ta > board.T + FLAME_MS + 150)) return false;   // догорить до нас
  if (dj !== Infinity && !(ta + ms + spare < dj || ta > dl + FLAME_MS + 150)) return false;
  return board.wallAt[j] >= ta + ms + 500;
}

// Пошук у ширину від клітинки start (час t0) клітинками, куди можна зайти (canEnter).
// bombAt — клітинка гіпотетичної бомби: стоїмо на ній, тож з неї вийти можна, а повернутися — ні.
function bfs(bot, board, start, t0, ms, danger, hypo, mon, spare, bombAt = -1, maxD = Infinity) {
  const { GW, GH } = board.map, n = GW * GH;
  const dist = new Int16Array(n).fill(-1), prev = new Int32Array(n).fill(-1);
  const q = [start];
  dist[start] = 0;
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % GW, y = (i - x) / GW;
    if (dist[i] >= maxD) continue;
    const ta = t0 + (dist[i] + 1) * ms;
    for (let d = 1; d <= 4; d++) {
      const j = (y + DY[d]) * GW + x + DX[d];
      if (dist[j] >= 0 || j === bombAt || !canEnter(bot, board, j, ta, ms, danger, hypo, mon, spare, i)) continue;
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

// Чи можна боту поставити бомбу тут (для хоста)
export const botCanPlace = (bot, board) => board.activeOf(bot.o) < bot.nb && canPlace(board, Math.round(bot.x), Math.round(bot.y));

// Детонатор: яку свою бомбу підірвати зараз (null — жодну). Підриваємо, щойно самі (де стоїмо, куди йдемо і куди за шляхом
// зайдемо, поки горітиме) і, в «Команді», свої поза її вогнем (з ланцюжком): коли вибухнула б звичайна або, якщо у вогні
// суперник (монстр), — після detAge. З вогню своєї такої бомби бот іде (стояти там не можна, пройти — можна: Board.danger),
// тож потім підриває її здалеку.
export function botDetonate(bot, ctx) {
  const { board, now } = ctx, GW = board.map.GW, L = LEVEL[ctx.diff] ?? LEVEL[1];
  const at = (e) => Math.round(e.y) * GW + Math.round(e.x);
  const ms = 1000 / speedOf(bot.sp);
  const soon = bot.ai ? [bot.ai.ty * GW + bot.ai.tx, ...bot.ai.path.filter((j, k) => (k + 0.5) * ms < FLAME_MS + 150)] : [];
  for (const a of board.remoteOf(bot.o)) {
    const fire = chainCells(board, a.i, a.b.p);
    if (fire.has(at(bot)) || soon.some(j => fire.has(j))) continue;
    if (ctx.coop && ctx.allies.some(e => fire.has(at(e)))) continue;
    const age = now - a.b.t;
    if (age >= FUSE_MS || (age >= L.detAge && ctx.enemies.some(e => fire.has(at(e))))) return a;
  }
  return null;
}
// Клітинки вогню бомби з клітинки i дальністю p разом із ланцюжком (бомби, які він зачепить, — і їхній вогонь)
function chainCells(board, i, p) {
  const cells = new Set(), seen = new Set([i]), q = [[i, p]];
  while (q.length) {
    const [k, pk] = q.pop();
    for (const j of blastCells(board, k, pk)) {
      cells.add(j);
      const o = board.active.get(j);
      if (o && !seen.has(j)) { seen.add(j); q.push([j, o.b.p]); }
    }
  }
  return cells;
}
