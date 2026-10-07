// main.js — головний цикл: клавіатура, свій гравець (рух, бомби, бонуси, смерть), розсилка pos,
// плавний вигляд інших, звуки подій, малювання; запуск мережі.
import { S, EMOJI, q8 } from './state.js';
import { net, hooks, act, nameOf, GRACE_MS } from './net.js';
import { createRoom, startHostLoop } from './host.js';
import { moveActor, speedOf, canPlace, makeMap, hashStr, DX, DY, MON } from './sim.js';
import { killerAt, kill, applyItem, orphanDets, roundNow, canPause, RES_WIN, RES_TEAM_WIN, RES_TEAM_LOSS, RES_GOING } from './round.js';
import { createRenderer } from './render.js';
import { initLobby, renderLobby } from './lobby.js';
import { renderHud, renderNet, toast, initHud, hudBottom, feedDeath, feedEmo } from './hud.js';
import { sfx, unlock, isMuted, setMuted, audioCtx } from './audio.js';
import { initMusic, isMusicOff, setMusicOff } from './music.js';
import { initTouch, isTouch, touch, resetTouch } from './touch.js';

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
const ITEM_TEXT = ['', '+1 бомба', '+1 до вогню', 'Швидкість', 'Прохід крізь бомби', 'Стійкість до вогню 10 с',
  isTouch ? 'Детонатор: кнопка 📡' : 'Детонатор: E або Enter'];
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
    R.board.onRevive = (cells, by) => console.warn('crossbomb: блоки відновились після перерахунку', {
      cells: cells.map(i => [i % R.board.map.GW, Math.floor(i / R.board.map.GW)]), lateBy: by, now: roundNow(R, net.sharedNow()), T: R.board.T });
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    held.length = 0;
  }
  renderLobby();
};
hooks.bomb = () => sfx.place();
hooks.death = (o) => {
  const R = S.R;
  if (!R?.sl[o]) return;
  sfx.death();
  feedDeath(R, o);
};
// Реакція: живого учасника раунду — бульбашкою над ним (див. frame), інших — у стрічку подій
const EMO_MS = 2600;
hooks.emo = (id, e) => {
  const R = S.R, playing = !!R && S.room?.g === R.r;
  if (!playing) return;
  const s = R.sl.find(x => !x.b && x.i === id);
  if (s?.a) return;
  feedEmo(s ? s.c : S.room.pp.find(p => p.i === id)?.c, s ? s.n : nameOf(id), e);
};
hooks.hidden = () => { held.length = 0; resetTouch(); };

// ================= Клавіатура =================
const KEY_DIR = { ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3, ArrowLeft: 4, KeyA: 4 };
const KEY_EMO = /^(?:Digit|Numpad)([1-9])$/;
const held = [];                                                       // напрями в порядку натискання; діє останній
let wantBomb = false, wantDet = false;
addEventListener('keydown', (e) => {
  unlock();
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const d = KEY_DIR[e.code];
  if (d) {
    if (!held.includes(d)) held.push(d);
    if (S.R) e.preventDefault();
  } else if (S.R?.pa && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) {   // на паузі — «Продовжити»
    e.preventDefault();
    if (!e.repeat) togglePause();
  } else if (e.code === 'Space') {                                    // на підсумку пробіл і Enter — кнопкам («Грати»)
    if (S.R?.p === 0) { e.preventDefault(); if (!e.repeat) wantBomb = true; }
  } else if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (S.R?.p === 0) { e.preventDefault(); if (!e.repeat) wantDet = true; }
  } else if (e.code === 'KeyP' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (!e.repeat) togglePause();
  } else if (KEY_EMO.test(e.code) && S.R && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const k = Number(KEY_EMO.exec(e.code)[1]) - 1;
    if (k < EMOJI.length && S.room?.g === S.R.r) act.emo(k);
  } else if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) toggleFs();
  else if (e.code === 'KeyM' && !e.ctrlKey && !e.metaKey) toggleMute();
  else if (e.code === 'KeyN' && !e.ctrlKey && !e.metaKey) toggleMusic();
});
addEventListener('keyup', (e) => {
  const d = KEY_DIR[e.code];
  if (d) { const k = held.indexOf(d); if (k >= 0) held.splice(k, 1); }
});
addEventListener('blur', () => { held.length = 0; resetTouch(); });
initTouch(() => { if (S.R) wantBomb = true; }, (k) => act.emo(k), () => { if (S.R) wantDet = true; });
for (const type of ['pointerup', 'touchend', 'click']) addEventListener(type, unlock, { capture: true, passive: true });

// Пауза — лише єдина людина раунду (решта — боти); ставить і знімає хост, стан приходить у world
function togglePause() {
  const R = S.R;
  if (!R || S.room?.g !== R.r) return;
  if (R.pa ? S.mySlot >= 0 : canPause(R, net.id)) act.pause(!R.pa);
}
function toggleFs() {
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
function toggleMute() {
  setMuted(!isMuted());
  $('soundBtn').textContent = isMuted() ? '🔇' : '🔊';
}
function toggleMusic() {
  setMusicOff(!isMusicOff());
  $('musicBtn').classList.toggle('off', isMusicOff());
}
$('fsBtn').onclick = (e) => { e.currentTarget.blur(); toggleFs(); };
$('pauseBtn').onclick = (e) => { e.currentTarget.blur(); togglePause(); };
$('resumeBtn').onclick = (e) => { e.currentTarget.blur(); togglePause(); };
$('soundBtn').onclick = (e) => { e.currentTarget.blur(); unlock(); toggleMute(); };
$('soundBtn').textContent = isMuted() ? '🔇' : '🔊';
$('musicBtn').onclick = (e) => { e.currentTarget.blur(); unlock(); toggleMusic(); };
$('musicBtn').classList.toggle('off', isMusicOff());
initMusic(audioCtx, () => S.room?.v || 0);
document.addEventListener('fullscreenchange', () => { $('fsBtn').textContent = document.fullscreenElement ? '🗗' : '⛶'; });

// ================= Свій гравець =================
function stepMe(R, now, dt) {
  const s = R.sl[S.mySlot];
  if (!s) return;
  if (!s.a || R.p !== 0 || now < R.t0 || R.pa) { s.mv = false; wantBomb = false; wantDet = false; return; }
  const B = R.board, dir = touch.dir || held[held.length - 1] || 0;
  s.mv = false;
  if (dir) {
    s.dr = dir;
    s.mv = moveActor(s, dir, speedOf(s.sp) * dt, (x, y) => B.solid(x, y, false, s.ps)) > 0;
  }
  if (wantBomb) {
    wantBomb = false;
    const x = Math.round(s.x), y = Math.round(s.y);
    if (B.activeOf(s.o) < s.nb && canPlace(B, x, y)) {
      // свої події — не в минулому поля (годинник міг піти назад, кадр — випередити тік хоста): інакше перерахунок з початку
      const b = { o: s.o, n: ++s.bn, x, y, t: Math.max(now, B.T), p: s.fp, rc: s.rc };
      B.addBomb(b);
      B.advance(now);
      net.send('bomb', { r: R.r, ...b });
      sfx.place();
    }
  }
  if (wantDet) {                                                       // детонатор: найстарша своя бомба
    wantDet = false;
    const a = B.remoteOf(s.o)[0];
    if (a) {
      const e = { o: s.o, n: a.b.n, b: a.b.t, t: Math.max(now, B.T) };
      B.addDet(e);
      B.advance(now);
      net.send('det', { r: R.r, ...e });
    }
  }
  const cx = Math.round(s.x), cy = Math.round(s.y), it = B.itemAt(B.idx(cx, cy));
  if (it) {
    const p = { o: s.o, x: cx, y: cy, t: Math.max(now, B.T) };
    B.addPick(p);
    B.advance(now);
    applyItem(s, it, now);
    net.send('pick', { r: R.r, ...p });
    sfx.pick();
    toast(ITEM_TEXT[it]);
  }
  checkMe(R, s, now, R.mons.map(viewOfMon));
}
// Чи не загинув свій гравець у момент now (mons — монстри, як їх видно)
function checkMe(R, s, now, mons) {
  const kb = killerAt(R, s.x, s.y, now, s.rs, mons);
  if (kb < 0 || !kill(R, s.o, now, kb)) return;
  net.send('dead', { r: R.r, o: s.o, t: now, k: kb });
  for (const e of orphanDets(R, s.o, now)) { R.board.addDet(e); net.send('det', { r: R.r, ...e }); }   // бомби з детонатором — за запал
  sfx.death();
  feedDeath(R, s.o);
}
// Прихована вкладка: requestAnimationFrame стоїть, таймери — не частіше ніж раз на секунду, а вогонь горить FLAME_MS. Тож свою
// смерть перевіряємо таймером по всьому пропущеному часу, кроками CATCH_MS (і в першому кадрі після повернення, і коли кадр
// забарився): інакше гравець у фоні був безсмертний — вогонь і монстри минали, стіни раптової смерті чекали його повернення
const CATCH_MS = 100;
let meAt = 0;                                                          // до якого моменту (спільний час) себе перевірено
function catchUp(R, now) {
  const s = R.sl[S.mySlot];
  if (s && s.a && R.p === 0) {
    for (let t = Math.max(meAt, R.t0) + CATCH_MS; t < now && s.a; t += CATCH_MS) {
      R.board.advance(t);
      checkMe(R, s, t, R.mons);
    }
  }
  meAt = now;
}
setInterval(() => {
  const R = S.R, s = R && R.sl[S.mySlot];
  if (!document.hidden || !s || !s.a || R.p !== 0 || S.room?.g !== R.r) return;
  const now = roundNow(R, net.sharedNow());
  catchUp(R, now);
  R.board.advance(now);
  if (now >= R.t0) checkMe(R, s, now, R.mons);
}, 250);

// Розсилка своєї пози: зміни — одразу (до 20 Гц), інакше раз на секунду; ім'я — раз на 4 с
let lastPos = '', lastPosT = 0;
setInterval(() => {
  const R = S.R, s = R && R.sl[S.mySlot];
  if (!s || !s.a || !net.linkCount() || S.room?.g !== R.r) return;
  const p = { r: R.r, x: q8(s.x), y: q8(s.y), dr: s.dr, mv: s.mv, nb: s.nb, fp: s.fp, sp: s.sp, ps: s.ps, rs: s.rs, rc: s.rc };
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
      if (s.mv && at && !R.pa) {
        const ahead = Math.min(PREDICT, speedOf(s.sp) * (pnow - at) / 1000);
        tx += DX[s.dr] * ahead; ty += DY[s.dr] * ahead;
      }
    }
    smooth(s, tx, ty, dt);
  }
  for (const m of R.mons) {
    if (!m.a) continue;
    let tx = m.x, ty = m.y;
    if (!host && R.worldAt && m.d && !R.pa) {
      const ahead = Math.min(PREDICT, MON[m.k].speed * (pnow - R.worldAt) / 1000);
      tx += DX[m.d] * ahead; ty += DY[m.d] * ahead;
    }
    smooth(m, tx, ty, dt);
  }
}
// Реакція над гравцем: { ch (емодзі), k (0..1 — частка показу) } або null
function emoOf(s, pnow) {
  const e = !s.b && S.emo.get(s.o === S.mySlot ? net.id : s.i);
  return e && pnow - e.at < EMO_MS ? { ch: EMOJI[e.e], k: (pnow - e.at) / EMO_MS } : null;
}
const viewOfMon = (m) => ({ i: m.i, k: m.k, x: m.vx ?? m.x, y: m.vy ?? m.y, d: m.d, a: m.a, dt: m.dt });

// ================= Звуки раунду =================
function roundCues(R, now) {
  if (R.p === 0 && now < R.t0 + 200) {
    const sec = Math.ceil((R.t0 - now) / 1000);
    if (sec !== cue.beep && sec <= 3) { cue.beep = sec; sfx.beep(sec <= 0); }
  }
  if (!cue.sd && R.p === 0 && R.board.sdStarted(now)) { cue.sd = true; sfx.sudden(); }
  if (!cue.end && R.p === 1 && R.res !== RES_GOING) {
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
  const R = S.R, playing = !!R && !!S.room && S.room.g === R.r;
  const now = playing ? roundNow(R, net.sharedNow()) : net.sharedNow();   // час раунду: на паузі стоїть
  if (playing) {
    if (S.mySlot >= 0) catchUp(R, now);
    R.board.advance(now);
    if (S.mySlot >= 0) stepMe(R, now, dt);
    updateViews(R, dt);
    roundCues(R, now);
  }
  renderHud(now);
  const me = playing && R.sl[S.mySlot];
  $('controls').classList.toggle('show', !!me && me.a && R.p === 0 && !R.pa);
  const noDet = !(me && me.rc);
  if ($('detBtn').hidden !== noDet) $('detBtn').hidden = noDet;
  renderer.draw({
    R: playing ? R : null, now, mySlot: S.mySlot, decor, insets: insets(), skin: S.room?.v ?? 0,
    slots: playing ? R.sl.map(s => ({
      x: s.vx ?? s.x, y: s.vy ?? s.y, dr: s.dr, mv: s.mv, a: s.a, dt: s.dt, c: s.c,
      resist: s.rs > now, emo: emoOf(s, pnow),
    })) : [],
    mons: playing ? R.mons.map(viewOfMon) : [],
  });
}
// Місце під інтерфейс навколо поля (CSS px): HUD зверху; на комп'ютері — напис глядача знизу,
// на телефоні — стрілки й бомба (портрет — знизу, альбом — з боків). На комп'ютері в повноекранному
// режимі поле — до країв екрана, HUD і напис глядача лягають на рамку (under; див. layoutFor)
let padSize = { pad: 150, btn: 96, w: 0, h: 0 };
function insets() {
  const top = $('hud').classList.contains('show') ? hudBottom() + 6 : 62;
  if (!isTouch && document.fullscreenElement) return { top: hudBottom(), bottom: 0, left: 0, right: 0, under: true };
  if (!isTouch) return { top, bottom: 48, left: 14, right: 14 };
  if (padSize.w !== innerWidth || padSize.h !== innerHeight) {
    const css = getComputedStyle(document.documentElement);
    padSize = { pad: parseFloat(css.getPropertyValue('--pad')) || 150, btn: parseFloat(css.getPropertyValue('--btn')) || 96, w: innerWidth, h: innerHeight };
  }
  return innerWidth > innerHeight
    ? { top, bottom: 10, left: padSize.pad + 24, right: padSize.btn + 24 }
    : { top, bottom: padSize.pad + 24, left: 8, right: 8 };
}

// ================= Старт =================
initLobby(statusHtml);
initHud();
renderLobby();
setTimeout(() => { if (!net.status().welcomed && !S.room) createRoom(); }, GRACE_MS);   // сервер мовчить — граємо самі
addEventListener('hashchange', () => location.reload());              // інша кімната в тій самій вкладці
startHostLoop();
net.start();
requestAnimationFrame(frame);
