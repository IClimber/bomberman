// monsters.js — монстри «Команди». Рухає їх лише хост, клієнти отримують позиції у world.
// Монстр { i, k (вид, див. MON у sim.js), x, y, d (напрям), tx, ty (клітинка, куди йде), a (живий) }
// ходить від центру до центру клітинки; у центрі вибирає, куди далі.
import { MON, DX, DY } from './sim.js';

const BACK = [0, 3, 4, 1, 2];
const KEEP = 0.75;                   // блукач іде прямо, якщо може, з такою ймовірністю
const GHOST_HUNT = 0.3;              // привид у центрі клітинки повертає до найближчого гравця з такою ймовірністю

// targets — живі гравці { x, y }
export function monsterStep(m, dt, board, targets) {
  const kind = MON[m.k];
  const solid = (x, y) => board.solid(x, y, !!kind.ghost);
  if (m.tx == null) { m.tx = Math.round(m.x); m.ty = Math.round(m.y); }   // новий хост: спершу до центру клітинки
  let dist = kind.speed * dt;
  for (let g = 0; g < 4 && dist > 1e-9; g++) {
    if (m.x === m.tx && m.y === m.ty) {
      m.d = chooseDir(m, kind, solid, targets);
      if (!m.d) return;
      m.tx = m.x + DX[m.d]; m.ty = m.y + DY[m.d];
    } else if (solid(m.tx, m.ty)) {                                // попереду з'явилась бомба — назад
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

function chooseDir(m, kind, solid, targets) {
  const x = m.x, y = m.y;
  const open = [1, 2, 3, 4].filter(d => !solid(x + DX[d], y + DY[d]));
  if (!open.length) return 0;
  if (kind.sight) {                                                // переслідувач: гравець на одній лінії, між нами порожньо
    for (const p of targets) {
      const px = Math.round(p.x), py = Math.round(p.y);
      let d = 0;
      if (px === x && py !== y && Math.abs(py - y) <= kind.sight) d = py < y ? 1 : 3;
      else if (py === y && px !== x && Math.abs(px - x) <= kind.sight) d = px < x ? 4 : 2;
      if (!d || !open.includes(d)) continue;
      let clear = true;
      for (let cx = x + DX[d], cy = y + DY[d]; cx !== px || cy !== py; cx += DX[d], cy += DY[d]) {
        if (solid(cx, cy)) { clear = false; break; }
      }
      if (clear) return d;
    }
  }
  if (kind.ghost && targets.length && Math.random() < GHOST_HUNT) {
    let best = null, bd = Infinity;
    for (const p of targets) {
      const dd = Math.abs(p.x - x) + Math.abs(p.y - y);
      if (dd < bd) { bd = dd; best = p; }
    }
    const toward = open.filter(d => Math.abs(best.x - x - DX[d]) + Math.abs(best.y - y - DY[d]) < bd);
    if (toward.length) return toward[Math.floor(Math.random() * toward.length)];
  }
  if (m.d && open.includes(m.d) && Math.random() < KEEP) return m.d;
  const turn = open.filter(d => d !== BACK[m.d]);
  const from = turn.length ? turn : open;
  return from[Math.floor(Math.random() * from.length)];
}
