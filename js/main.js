// main.js — головний цикл: клавіатура, свій гравець (рух, бомби, бонуси, смерть), розсилка pos,
// плавний вигляд інших, звуки подій, малювання; запуск мережі.
import { S, q8 } from './state.js';
import { net, hooks, nameOf, GRACE_MS } from './net.js';
import { createRoom, startHostLoop } from './host.js';
import { moveActor, speedOf, canPlace, makeMap, hashStr, DX, DY, MON } from './sim.js';
import { deadlyAt, kill, applyItem, RES_WIN, RES_TEAM_WIN, RES_TEAM_LOSS } from './round.js';
import { createRenderer } from './render.js';
import { initLobby, renderLobby } from './lobby.js';
import { renderHud, renderNet, toast } from './hud.js';
import { sfx, unlock, isMuted, setMuted } from './audio.js';

const $ = (id) => document.getElementById(id);
const renderer = createRenderer($('c'));
addEventListener('resize', () => renderer.resize());
const decor = makeMap(hashStr('decor:' + S.roomId), 0);              // тло лоббі

// ================= Попередження мережі =================
const TURN_MISSING = 'Без TURN-сервера: гравці з інших мереж можуть не під\'єднатися.';
const SERVER_DOWN = 'Немає зв\'язку з сервером: нові гравці не під\'єднаються.';
const WARN = {
  link: ['Не вдалося з\'єднатися з одним із гравців, пробуємо ще.', 8000],
  full: ['Кімната заповнена.', 1e9],
  outdated: ['Гра оновилася — перезавантаж сторінку.', 1e9],
  version: ['У кімнаті гравець з іншою версією гри — комусь треба перезавантажити сторінку.', 15000],
};
let netWarn = '', netWarnUntil = 0;
function statusHtml() {
  const n = net.liveCount() + 1;
  let s = n > 1 ? `У кімнаті: <b>${n}</b>${net.isHost() ? ' (ти хост)' : ''}` : 'У кімнаті поки нікого, крім тебе. Надішли посилання друзям або грай з ботами.';
  const st = net.status();
  const w = performance.now() < netWarnUntil ? netWarn
    : st.downMs > GRACE_MS ? SERVER_DOWN
    : st.welcomed && !st.turn ? TURN_MISSING : '';
  if (w) s += `<span class="warn">${w}</span>`;                     // лише власні константні рядки
  return s;
}

// ================= Колбеки мережі =================
const ITEM_TEXT = ['', '+1 бомба', '+1 до вогню', 'Швидкість', 'Прохід крізь бомби', 'Стійкість до вогню 10 с'];
let cue = { r: 0, beep: 99, sd: false, end: false };
hooks.room = () => { renderLobby(); renderNet(nameOf); };
hooks.hud = () => { renderLobby(); renderNet(nameOf); };
hooks.warn = (code) => {
  const [text, ms] = WARN[code] || [];
  if (!text) return;
  netWarn = text;
  netWarnUntil = performance.now() + ms;
  toast(text, true, Math.min(ms, 6000));
  renderLobby();
};
hooks.round = () => {
  const R = S.R;
  if (R && cue.r !== R.r) {
    cue = { r: R.r, beep: 99, sd: false, end: false };
    R.board.onBlast = () => sfx.blast();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    held.length = 0;
  }
  renderLobby();
};
hooks.bomb = () => sfx.place();
hooks.death = (o) => {
  const R = S.R, s = R?.sl[o];
  if (!s) return;
  sfx.death();
  if (o !== S.mySlot) toast(`${s.n} вибуває 💀`);
};
hooks.hidden = () => { held.length = 0; };

// ================= Клавіатура =================
const KEY_DIR = { ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3, ArrowLeft: 4, KeyA: 4 };
const held = [];                                                       // напрями в порядку натискання; діє останній
let wantBomb = false;
addEventListener('keydown', (e) => {
  unlock();
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const d = KEY_DIR[e.code];
  if (d) {
    if (!held.includes(d)) held.push(d);
    if (S.R) e.preventDefault();
  } else if (e.code === 'Space') {
    if (S.R) { e.preventDefault(); if (!e.repeat) wantBomb = true; }
  } else if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) toggleFs();
  else if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey) toggleMute();
});
addEventListener('keyup', (e) => {
  const d = KEY_DIR[e.code];
  if (d) { const k = held.indexOf(d); if (k >= 0) held.splice(k, 1); }
});
addEventListener('blur', () => { held.length = 0; });
addEventListener('pointerdown', unlock);

function toggleFs() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
function toggleMute() {
  setMuted(!isMuted());
  $('soundBtn').textContent = isMuted() ? '🔇' : '🔊';
}
$('fsBtn').onclick = (e) => { e.currentTarget.blur(); toggleFs(); };
$('soundBtn').onclick = (e) => { e.currentTarget.blur(); unlock(); toggleMute(); };
$('soundBtn').textContent = isMuted() ? '🔇' : '🔊';
document.addEventListener('fullscreenchange', () => { $('fsBtn').textContent = document.fullscreenElement ? '🗗' : '⛶'; });

// ================= Свій гравець =================
function stepMe(R, now, dt) {
  const s = R.sl[S.mySlot];
  if (!s) return;
  if (!s.a || R.p !== 0 || now < R.t0) { s.mv = false; wantBomb = false; return; }
  const B = R.board, dir = held[held.length - 1] || 0;
  s.mv = false;
  if (dir) {
    s.dr = dir;
    s.mv = moveActor(s, dir, speedOf(s.sp) * dt, (x, y) => B.solid(x, y, false, s.ps)) > 0;
  }
  if (wantBomb) {
    wantBomb = false;
    const x = Math.round(s.x), y = Math.round(s.y);
    if (B.activeOf(s.o) < s.nb && canPlace(B, x, y)) {
      const b = { o: s.o, n: ++s.bn, x, y, t: now, p: s.fp };
      B.addBomb(b);
      B.advance(now);
      net.send('bomb', { r: R.r, ...b });
      sfx.place();
    }
  }
  const cx = Math.round(s.x), cy = Math.round(s.y), it = B.itemAt(B.idx(cx, cy));
  if (it) {
    const p = { o: s.o, x: cx, y: cy, t: now };
    B.addPick(p);
    B.advance(now);
    applyItem(s, it, now);
    net.send('pick', { r: R.r, ...p });
    sfx.pick();
    toast(ITEM_TEXT[it]);
  }
  if (deadlyAt(R, s.x, s.y, now, s.rs, R.mons.map(viewOfMon)) && kill(R, s.o, now)) {
    net.send('dead', { r: R.r, o: s.o, t: now });
    sfx.death();
  }
}

// Розсилка своєї пози: зміни — одразу (до 20 Гц), інакше раз на секунду; ім'я — раз на 4 с
let lastPos = '', lastPosT = 0;
setInterval(() => {
  const R = S.R, s = R && R.sl[S.mySlot];
  if (!s || !s.a || !net.linkCount() || S.room?.g !== R.r) return;
  const p = { r: R.r, x: q8(s.x), y: q8(s.y), dr: s.dr, mv: s.mv, nb: s.nb, fp: s.fp, sp: s.sp, ps: s.ps, rs: s.rs > net.sharedNow() };
  const key = JSON.stringify(p), t = performance.now();
  if (key !== lastPos || t - lastPosT > 1000) {
    lastPos = key;
    lastPosT = t;
    net.send('pos', p);
  }
}, 50);
setInterval(() => { if (net.linkCount()) net.send('hi', { n: S.myName }); }, 4000);

// ================= Вигляд інших =================
// Чужі гравці (pos ~20 Гц), боти й монстри (world ~10 Гц; у хоста — щотіку 20 Гц) — з коротким прогнозом
// за напрямом і плавним наближенням. Свій гравець — як є.
const PREDICT = 0.3;                                                   // прогноз не далі стількох клітинок
function smooth(o, tx, ty, dt) {
  if (o.vx == null || Math.abs(o.vx - tx) + Math.abs(o.vy - ty) > 2) { o.vx = tx; o.vy = ty; return; }
  const k = 1 - Math.exp(-dt * 18);
  o.vx += (tx - o.vx) * k;
  o.vy += (ty - o.vy) * k;
}
function updateViews(R, dt) {
  const pnow = performance.now(), host = net.isHost();
  for (const s of R.sl) {
    if (s.o === S.mySlot || !s.a) { s.vx = s.x; s.vy = s.y; continue; }
    let tx = s.x, ty = s.y;
    if (!host || !s.b) {
      const at = s.b ? R.worldAt : S.pos.get(s.i)?.at;
      if (s.mv && at) {
        const ahead = Math.min(PREDICT, speedOf(s.sp) * (pnow - at) / 1000);
        tx += DX[s.dr] * ahead; ty += DY[s.dr] * ahead;
      }
    }
    smooth(s, tx, ty, dt);
  }
  for (const m of R.mons) {
    if (!m.a) continue;
    let tx = m.x, ty = m.y;
    if (!host && R.worldAt && m.d) {
      const ahead = Math.min(PREDICT, MON[m.k].speed * (pnow - R.worldAt) / 1000);
      tx += DX[m.d] * ahead; ty += DY[m.d] * ahead;
    }
    smooth(m, tx, ty, dt);
  }
}
const viewOfMon = (m) => ({ i: m.i, k: m.k, x: m.vx ?? m.x, y: m.vy ?? m.y, d: m.d, a: m.a, dt: m.dt });

// ================= Звуки раунду =================
function roundCues(R, now) {
  if (R.p === 0 && now < R.t0 + 200) {
    const sec = Math.ceil((R.t0 - now) / 1000);
    if (sec !== cue.beep && sec <= 3) { cue.beep = sec; sfx.beep(sec <= 0); }
  }
  if (!cue.sd && R.p === 0 && now >= R.board.sdAt) { cue.sd = true; sfx.sudden(); }
  if (!cue.end && R.p === 1) {
    cue.end = true;
    if (S.mySlot >= 0) {
      const won = R.res === RES_TEAM_WIN || (R.res === RES_WIN && R.wn === S.mySlot);
      if (won) sfx.win(); else if (R.res === RES_TEAM_LOSS || R.res === RES_WIN) sfx.lose();
    }
  }
  for (const m of R.mons) {
    if (!m.a && !m.popped) { m.popped = true; sfx.monster(); }
  }
}

// ================= Кадр =================
let lastFrame = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const pnow = performance.now(), dt = Math.min(0.1, (pnow - lastFrame) / 1000);
  lastFrame = pnow;
  const now = net.sharedNow(), R = S.R;
  const playing = !!R && !!S.room && S.room.g === R.r;
  if (playing) {
    R.board.advance(now);
    if (S.mySlot >= 0) stepMe(R, now, dt);
    updateViews(R, dt);
    roundCues(R, now);
  }
  renderer.draw({
    R: playing ? R : null, now, mySlot: S.mySlot, decor,
    slots: playing ? R.sl.map(s => ({
      x: s.vx ?? s.x, y: s.vy ?? s.y, dr: s.dr, mv: s.mv, a: s.a, dt: s.dt, c: s.c,
      resist: s.o === S.mySlot || s.b ? s.rs > now : !!s.rsOn,
    })) : [],
    mons: playing ? R.mons.map(viewOfMon) : [],
  });
  renderHud(now);
}

// ================= Старт =================
initLobby(statusHtml);
renderLobby();
setTimeout(() => { if (!net.status().welcomed && !S.room) createRoom(); }, GRACE_MS);   // сервер мовчить — граємо самі
addEventListener('hashchange', () => location.reload());              // інша кімната в тій самій вкладці
startHostLoop();
net.start();
requestAnimationFrame(frame);
