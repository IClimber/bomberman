// sim.js — правила гри без DOM: карта від зерна, рух по клітинках, бомби, вибухи, бонуси, раптова смерть.
// Усе детерміноване: однакове зерно й однакові події (бомби, підбори) дають однаковий стан у всіх гравців.
// Координати — у клітинках, центр клітинки (x, y) має координати (x, y); рамка — x = 0 і x = w + 1.

// ================= Правила =================
export const SIZES = [[13, 11], [17, 13], [21, 15], [25, 17], [31, 21]];   // ігрова зона без рамки
export const FUSE_MS = 2500;         // запал бомби
export const FLAME_MS = 500;         // скільки тримається вогонь (і горить блок)
export const RESIST_MS = 10000;      // стійкість до вогню з бонуса
export const BLOCK_FILL = 0.7;       // частка вільних клітинок під блоками
export const BASE_SPEED = 3.2;       // клітинок за секунду
export const SPEED_STEP = 0.5;       // за кожен бонус швидкості
export const MAX_SPEED_UPS = 4, MAX_BOMBS = 8, MAX_FIRE = 8;
export const SD_BASE_MS = 180000;    // раптова смерть на 13×11; росте як √площі
export const SD_STEP_BASE_MS = 250;  // крок спіралі на 13×11; на більших картах — частіше
export const MONSTER_PER = 25;       // на «Нормально» — один монстр на стільки вільних клітинок
export const DIFF_K = [0.6, 1, 1.5]; // множник кількості монстрів: легко, нормально, важко

// Клітинки
export const EMPTY = 0, PILLAR = 1, BLOCK = 2, WALL = 3;
// Бонуси
export const IT_BOMB = 1, IT_FIRE = 2, IT_SPEED = 3, IT_PASS = 4, IT_RESIST = 5;
const ITEM_PER_100 = [0, 6, 6, 3, 1.5, 2.5];     // скільки бонусів кожного виду на 100 блоків (не менше одного)
// Монстри: 0 — блукач, 1 — переслідувач, 2 — привид (крізь блоки)
export const MON = [
  { speed: 1.5 },
  { speed: 2.3, sight: 6 },
  { speed: 1.3, ghost: true },
];
const MON_MIX = [[0.6, 0.3, 0.1], [0.45, 0.35, 0.2], [0.3, 0.4, 0.3]];
const MON_SAFE = 5;                  // монстри з'являються не ближче (по сітці) до місць старту

// Напрями: 0 — стоїть, 1 вгору, 2 вправо, 3 вниз, 4 вліво
export const DX = [0, 0, 1, 0, -1], DY = [0, -1, 0, 1, 0];

// ================= Утиліти =================
export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function hashStr(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const speedOf = (ups) => BASE_SPEED + SPEED_STEP * ups;
const bombKey = (b) => b.o * 65536 + b.n;
const bombLess = (a, b) => a.t < b.t || (a.t === b.t && bombKey(a) < bombKey(b));

// ================= Карта =================
// Зерно — від кімнати й раунду. Старт — у кутах (слоти 0–3), біля кожного кута три вільні клітинки.
// Для «Команди» тут же розставляються монстри (місця від зерна, тож однакові в усіх).
export function makeMap(seed, sizeIdx, coop = false, diff = 1) {
  const [w, h] = SIZES[sizeIdx] || SIZES[0];
  const GW = w + 2, GH = h + 2, n = GW * GH;
  const cell = new Uint8Array(n), item = new Uint8Array(n);
  const rnd = mulberry32(seed);
  const spawns = [[1, 1], [w, h], [w, 1], [1, h]];
  const keep = new Set();
  for (const [x, y] of spawns) {
    const dx = x === 1 ? 1 : -1, dy = y === 1 ? 1 : -1;
    keep.add(y * GW + x); keep.add(y * GW + x + dx); keep.add((y + dy) * GW + x);
  }
  let free = 0;
  for (let y = 0; y < GH; y++) {
    for (let x = 0; x < GW; x++) {
      const i = y * GW + x;
      if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1 || (x % 2 === 0 && y % 2 === 0)) { cell[i] = PILLAR; continue; }
      free++;
      if (!keep.has(i) && rnd() < BLOCK_FILL) cell[i] = BLOCK;
    }
  }
  // Монстри — до бонусів: звичайним монстрам блок на місці появи прибираємо
  const mons = [];
  if (coop) {
    const count = Math.max(1, Math.round(free / MONSTER_PER * (DIFF_K[diff] ?? 1)));
    const far = [];
    for (let y = 1; y <= h; y++) {
      for (let x = 1; x <= w; x++) {
        if (cell[y * GW + x] === PILLAR) continue;
        if (spawns.every(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) >= MON_SAFE)) far.push(y * GW + x);
      }
    }
    shuffle(far, rnd);
    far.sort((a, b) => (cell[a] === EMPTY ? 0 : 1) - (cell[b] === EMPTY ? 0 : 1));   // спершу порожні
    const mix = MON_MIX[diff] ?? MON_MIX[1];
    for (let k = 0; k < count && k < far.length; k++) {
      const i = far[k], u = rnd();
      const kind = u < mix[0] ? 0 : u < mix[0] + mix[1] ? 1 : 2;
      if (cell[i] === BLOCK && !MON[kind].ghost) cell[i] = EMPTY;
      mons.push({ i: k + 1, k: kind, x: i % GW, y: Math.floor(i / GW) });
    }
  }
  const blocks = [];
  for (let i = 0; i < n; i++) if (cell[i] === BLOCK) blocks.push(i);
  shuffle(blocks, rnd);
  let p = 0;
  for (let k = 1; k < ITEM_PER_100.length; k++) {
    const c = Math.max(1, Math.round(blocks.length * ITEM_PER_100[k] / 100));
    for (let j = 0; j < c && p < blocks.length; j++) item[blocks[p++]] = k;
  }
  return { w, h, GW, GH, cell, item, spawns, mons, free, seed };
}
function shuffle(a, rnd) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Спіраль раптової смерті: від лівого верхнього кута за годинниковою стрілкою до центру, стовпи пропускаємо
export function spiral(map) {
  const out = [], { GW, cell } = map;
  const push = (x, y) => { const i = y * GW + x; if (cell[i] !== PILLAR) out.push(i); };
  let x0 = 1, y0 = 1, x1 = map.w, y1 = map.h;
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) push(x, y0);
    for (let y = y0 + 1; y <= y1; y++) push(x1, y);
    if (y1 > y0) for (let x = x1 - 1; x >= x0; x--) push(x, y1);
    if (x1 > x0) for (let y = y1 - 1; y > y0; y--) push(x0, y);
    x0++; y0++; x1--; y1--;
  }
  return out;
}
// Коли починається раптова смерть і як часто падають стіни (мс)
export function suddenDeath(map) {
  const k = Math.sqrt(map.w * map.h / 143);
  return { after: Math.round(SD_BASE_MS * k), step: SD_STEP_BASE_MS / k };
}

// ================= Рух =================
// Рух по клітинках з довороттям: поперек руху спершу вирівнюємось по центру ряду; якщо попереду глухо,
// а ми вже трохи зсунулися в сусідній ряд, де прохід є, — доводимо туди. solid(x, y) — чи не можна зайти в клітинку
// (у свою клітинку, де стоїмо, можна завжди — тож зі щойно поставленої бомби можна зійти).
// pos { x, y } змінюється на місці; dist — шлях у клітинках. Повертає пройдений шлях.
export function moveActor(pos, dir, dist, solid) {
  if (!dir || dist <= 0) return 0;
  const dx = DX[dir], dy = DY[dir], s = dx || dy;
  const A = dx ? 'x' : 'y', B = dx ? 'y' : 'x';
  const blocked = (a, b) => dx ? solid(a, b) : solid(b, a);      // a — уздовж руху, b — поперек
  const total = dist;
  for (let guard = 0; dist > 1e-9 && guard < 8; guard++) {
    const ca = Math.round(pos[A]), cb = Math.round(pos[B]);
    const off = pos[B] - cb;
    const aheadFree = !blocked(ca + s, cb);
    const toCenter = (ca - pos[A]) * s;                          // > 0 — центр своєї клітинки ще попереду
    if (aheadFree || toCenter > 1e-9) {
      if (Math.abs(off) > 1e-9) {                                 // спершу вирівнятися поперек
        const st = Math.min(dist, Math.abs(off));
        pos[B] -= Math.sign(off) * st;
        dist -= st;
        continue;
      }
      const st = aheadFree ? dist : Math.min(dist, toCenter);
      pos[A] += s * st;
      dist -= st;
      if (!aheadFree) break;
      continue;
    }
    if (Math.abs(off) > 1e-9) {                                   // доворот у сусідній ряд
      const sb = Math.sign(off), nb = cb + sb;
      if (!blocked(ca + s, nb) && !blocked(ca, nb)) {
        const st = Math.min(dist, 1 - Math.abs(off));
        pos[B] += sb * st;
        dist -= st;
        continue;
      }
    }
    break;
  }
  pos.x = Math.round(pos.x * 1e6) / 1e6;                          // без накопичення похибок
  pos.y = Math.round(pos.y * 1e6) / 1e6;
  return total - dist;
}
export const cellOf = (map, x, y) => Math.round(y) * map.GW + Math.round(x);

// ================= Поле: бомби, вибухи, бонуси, стіни =================
// Стан — чиста функція від карти (або знімка хоста), подій раунду (бомби, підбори) і часу.
// advance(T) обробляє події до T за порядком часу; подія, що прийшла із запізненням (час уже минув), —
// перерахунок з початку (reset). Порядок при рівному часі: вибухи, догоряння блоків, бомби, підбори, стіни.
export class Board {
  constructor(map, t0) {
    this.map = map;
    this.t0 = t0;
    const sd = suddenDeath(map);
    this.sdAt = t0 + sd.after;
    this.sdStep = sd.step;
    this.order = spiral(map);
    this.wallAt = new Float64Array(map.GW * map.GH).fill(Infinity);
    this.order.forEach((i, k) => { this.wallAt[i] = this.sdAt + k * sd.step; });
    this.bombs = new Map();          // усі відомі бомби раунду: ключ → { o, n, x, y, t, p }
    this.picks = new Map();          // усі підбори: ключ → { o, x, y, t }
    this.base = { cell: map.cell, item: map.item, shown: new Uint8Array(map.cell.length), T: -Infinity, active: [] };
    this.onBlast = null;             // (bomb) — вибух при «живій» обробці (не при перерахунку), для звуку
    this.blasted = new Set();        // ключі бомб, що вже вибухали «наживо»
    this.reset();
  }

  // Знімок хоста для глядача, що зайшов посеред раунду: клітинки (див. snapshot), активні бомби, час знімка
  setBase(bytes, active, T) {
    const n = this.map.cell.length;
    if (bytes.length !== n) return false;
    const cell = new Uint8Array(n), item = new Uint8Array(n), shown = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      cell[i] = bytes[i] & 3;
      item[i] = (bytes[i] >> 2) & 7;
      shown[i] = (bytes[i] >> 5) & 1;
      if (this.map.cell[i] === PILLAR) cell[i] = PILLAR;
    }
    this.base = { cell, item, shown, T, active: active.map(b => ({ ...b })) };
    for (const b of active) this.bombs.set(bombKey(b), { ...b });
    this.reset();
    return true;
  }

  reset() {
    const b = this.base, n = b.cell.length;
    this.cell = Uint8Array.from(b.cell);
    this.item = Uint8Array.from(b.item);
    this.shown = Uint8Array.from(b.shown);
    this.fireUntil = new Float64Array(n);
    this.burn = new Map();           // клітинка → коли догорить блок
    this.active = new Map();         // клітинка → { b, i, te }
    // { cells: [[клітинка, вид, напрям]], t0, t1, o }; вид: 0 центр, 1 промінь, 2 кінець, 9 блок, 10 бомба, 11 бонус
    this.flames = [];
    this.T = b.T;
    this.dirty = false;
    this.live = false;
    const inBase = new Set();
    for (const bb of b.active) {
      const i = bb.y * this.map.GW + bb.x;
      this.active.set(i, { b: bb, i, te: bb.t + FUSE_MS });
      inBase.add(bombKey(bb));
    }
    this.queue = [...this.bombs.values()].filter(x => x.t > b.T && !inBase.has(bombKey(x))).sort((x, y) => bombLess(y, x));   // з кінця — найраніша
    this.pickQ = [...this.picks.values()].filter(x => x.t > b.T).sort((x, y) => y.t - x.t);
    this.wallK = 0;
    while (this.wallK < this.order.length && this.wallAt[this.order[this.wallK]] <= b.T) {
      this.dropWall(this.order[this.wallK++]);
    }
  }

  // Нова бомба (своя, чужа з мережі, бота). false — уже відома.
  addBomb(b) {
    const k = bombKey(b);
    if (this.bombs.has(k)) return false;
    const bb = { o: b.o, n: b.n, x: b.x, y: b.y, t: b.t, p: b.p };
    this.bombs.set(k, bb);
    if (bb.t < this.T) this.dirty = true;
    else {
      let j = this.queue.length;
      while (j > 0 && bombLess(this.queue[j - 1], bb)) j--;
      this.queue.splice(j, 0, bb);
    }
    return true;
  }
  addPick(p) {
    const k = `${p.o}:${p.x}:${p.y}:${p.t}`;
    if (this.picks.has(k)) return false;
    const pp = { o: p.o, x: p.x, y: p.y, t: p.t };
    this.picks.set(k, pp);
    if (pp.t < this.T) this.dirty = true;
    else {
      let j = this.pickQ.length;
      while (j > 0 && this.pickQ[j - 1].t < pp.t) j--;
      this.pickQ.splice(j, 0, pp);
    }
    return true;
  }

  advance(T) {
    if (this.dirty) this.reset();
    this.live = true;
    this.run(T);
    if (T > this.T) this.T = T;
    this.flames = this.flames.filter(f => f.t1 > this.T);
  }

  run(T) {
    for (;;) {
      let t = Infinity, kind = 0, ref = null;
      for (const a of this.active.values()) {
        if (a.te < t || (a.te === t && bombLess(a.b, ref.b))) { t = a.te; kind = 1; ref = a; }
      }
      for (const [i, until] of this.burn) {
        if (until < t || (until === t && kind === 2 && i < ref)) { t = until; kind = 2; ref = i; }
      }
      const q = this.queue[this.queue.length - 1];
      if (q && q.t < t) { t = q.t; kind = 3; ref = q; }
      const pk = this.pickQ[this.pickQ.length - 1];
      if (pk && pk.t < t) { t = pk.t; kind = 4; ref = pk; }
      if (this.wallK < this.order.length) {
        const wt = this.wallAt[this.order[this.wallK]];
        if (wt < t) { t = wt; kind = 5; ref = this.order[this.wallK]; }
      }
      if (t > T || !kind) return;
      if (t > this.T) this.T = t;
      if (kind === 1) this.explode(ref, t);
      else if (kind === 2) this.burnOut(ref);
      else if (kind === 3) { this.queue.pop(); this.place(ref); }
      else if (kind === 4) { this.pickQ.pop(); this.pick(ref); }
      else { this.wallK++; this.dropWall(ref); }
    }
  }

  place(b) {
    const i = b.y * this.map.GW + b.x;
    if (this.cell[i] !== EMPTY || this.active.has(i)) return;    // зайнято (інша бомба раніше, стіна) — бомби немає
    this.active.set(i, { b, i, te: this.fireUntil[i] > b.t ? b.t : b.t + FUSE_MS });   // у вогонь — одразу вибух
  }

  explode(a, t) {
    const { GW } = this.map, x = a.b.x, y = a.b.y;
    this.active.delete(a.i);
    const cells = [[a.i, 0, 0]];                                   // [клітинка, вид, напрям]
    this.hit(a.i, t);
    for (let d = 1; d <= 4; d++) {
      for (let s = 1; s <= a.b.p; s++) {
        const i = (y + DY[d] * s) * GW + x + DX[d] * s, c = this.cell[i];
        if (c === PILLAR || c === WALL) break;
        if (c === BLOCK) {                                          // блок горить і зупиняє вогонь
          if (!this.burn.has(i)) this.burn.set(i, t + FLAME_MS);
          cells.push([i, 9, d]);
          this.hit(i, t);
          break;
        }
        const other = this.active.get(i);
        if (other) {                                                // ланцюжок
          if (t < other.te) other.te = t;
          cells.push([i, 10, d]);
          this.hit(i, t);
          break;
        }
        if (this.shown[i]) {                                        // бонус згорає
          this.shown[i] = 0; this.item[i] = 0;
          cells.push([i, 11, d]);
          this.hit(i, t);
          break;
        }
        cells.push([i, s === a.b.p ? 2 : 1, d]);                    // 1 — промінь, 2 — кінець променя
        this.hit(i, t);
      }
    }
    this.flames.push({ cells, t0: t, t1: t + FLAME_MS, o: a.b.o });
    const k = bombKey(a.b);
    if (this.live && !this.blasted.has(k)) {
      this.blasted.add(k);
      if (this.onBlast) this.onBlast(a.b, t);
    }
  }
  hit(i, t) { if (this.fireUntil[i] < t + FLAME_MS) this.fireUntil[i] = t + FLAME_MS; }

  burnOut(i) {
    this.burn.delete(i);
    if (this.cell[i] !== BLOCK) return;
    this.cell[i] = EMPTY;
    if (this.item[i]) this.shown[i] = 1;
  }
  pick(p) {
    const i = p.y * this.map.GW + p.x;
    if (this.shown[i]) { this.shown[i] = 0; this.item[i] = 0; }
  }
  dropWall(i) {
    this.cell[i] = WALL;
    this.active.delete(i);                                          // бомбу розчавило — без вибуху
    this.burn.delete(i);
    this.item[i] = 0; this.shown[i] = 0;
  }

  // ---------- Запити (стан на this.T) ----------
  idx(x, y) { return y * this.map.GW + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.map.GW && y < this.map.GH; }
  // Чи не можна зайти: стовп, стіна, блок (крім привида), бомба (крім бонуса «прохід крізь бомби»)
  solid(x, y, ghost = false, pass = false) {
    if (!this.inside(x, y)) return true;
    const i = y * this.map.GW + x, c = this.cell[i];
    if (c === PILLAR || c === WALL) return true;
    if (c === BLOCK && !ghost) return true;
    return !pass && this.active.has(i);
  }
  fireAt(i, T = this.T) { return this.fireUntil[i] > T; }
  bombAt(i) { return this.active.get(i)?.b || null; }
  itemAt(i) { return this.shown[i] ? this.item[i] : 0; }
  activeOf(o) { let n = 0; for (const a of this.active.values()) if (a.b.o === o) n++; return n; }
  sdStarted(T = this.T) { return T >= this.sdAt; }

  // Знімок для глядачів: на клітинку байт — вид (2 біти), бонус (3 біти), бонус видно (1 біт); блок, що горить, — уже порожньо
  snapshot() {
    const n = this.cell.length, out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let c = this.cell[i], s = this.shown[i];
      if (c === BLOCK && this.burn.has(i)) { c = EMPTY; s = this.item[i] ? 1 : 0; }
      out[i] = c | (this.item[i] << 2) | (s << 5);
    }
    return out;
  }
  activeList() { return [...this.active.values()].map(a => a.b); }

  // Небезпека для ботів: коли (найраніше) в клітинці буде вогонь від уже поставлених бомб (з ланцюжками й стінами)
  // протягом horizon мс; Infinity — безпечно. Рахується на копії поля.
  danger(horizon = FUSE_MS + FLAME_MS) {
    const n = this.cell.length, d = new Float64Array(n).fill(Infinity);
    for (let i = 0; i < n; i++) if (this.fireUntil[i] > this.T) d[i] = this.T;
    const c = Object.create(Board.prototype);
    Object.assign(c, this, {
      cell: Uint8Array.from(this.cell), item: Uint8Array.from(this.item), shown: Uint8Array.from(this.shown),
      fireUntil: Float64Array.from(this.fireUntil), burn: new Map(this.burn), flames: [], live: false,
      active: new Map([...this.active].map(([i, a]) => [i, { ...a }])), queue: [], pickQ: [],
    });
    c.hit = (i, t) => { if (t < d[i]) d[i] = t; };
    c.dropWall = (i) => { if (c.wallAt[i] < d[i]) d[i] = c.wallAt[i]; Board.prototype.dropWall.call(c, i); };
    c.run(this.T + horizon);
    return d;
  }
}

// Розстановка бомби: клітинка, де стоїть гравець; не можна, якщо там уже бомба чи стіна
export function canPlace(board, x, y) {
  const i = board.idx(x, y);
  return board.cell[i] === EMPTY && !board.active.has(i);
}
