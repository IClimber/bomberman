// hud.js — інтерфейс під час раунду: учасники з бонусами, таймер до раптової смерті, напис для глядача,
// підсумок раунду, тости, стрічка подій (хто кого вбив, реакції), рядок «Зв'язок».
import { S, EMOJI } from './state.js';
import { net, act, startNeed } from './net.js';
import { sfx } from './audio.js';
import { dot } from './lobby.js';
import { RES_WIN, RES_DRAW, RES_NOBODY, RES_TEAM_WIN, RES_TEAM_LOSS, KB_WALL, KB_MON, KB_LEFT } from './round.js';
import { MAX_BOMBS, MAX_FIRE, MAX_SPEED_UPS } from './sim.js';
import { skinOf } from './skins/index.js';

const $ = (id) => document.getElementById(id);

export function toast(text, bad = false, ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = text;
  $('toasts').append(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 450);
}

// Стрічка подій праворуч угорі: рядок — текст і кружечки кольорів (dot); зникає за FEED_MS, видно не більше FEED_MAX
const FEED_MS = 6000, FEED_MAX = 5;
export function feed(parts) {
  const el = document.createElement('div');
  el.className = 'line';
  el.append(...parts);
  const box = $('feed');
  box.append(el);
  while (box.children.length > FEED_MAX) box.firstChild.remove();
  setTimeout(() => el.classList.add('out'), FEED_MS);
  setTimeout(() => el.remove(), FEED_MS + 450);
}
const who = (s) => {                                                   // кружечок кольору й ім'я слоту
  const nm = document.createElement('b');
  nm.textContent = s.o === S.mySlot ? 'ти' : s.n;
  return [dot(s.c), nm];
};
// Хто кого вбив: «Петро 💣 Оля», «💣 Оля — своя бомба», «👾 Оля», «🧱 Оля», «Оля залишає гру»
export function feedDeath(R, o) {
  const s = R.sl[o], k = s?.kb;
  if (!s) return;
  const bomb = skinOf().emoji.bomb, killer = R.sl[k];
  if (k === o) feed([`${bomb} `, ...who(s), ' — своя бомба']);
  else if (killer) feed([...who(killer), ` ${bomb} `, ...who(s)]);
  else if (k === KB_WALL) feed(['🧱 ', ...who(s)]);
  else if (k >= KB_MON && k < KB_MON + 3) feed(['👾 ', ...who(s)]);
  else if (k === KB_LEFT) feed([...who(s), ' залишає гру']);
  else feed(['💀 ', ...who(s)]);
}
// Реакція того, кого не видно на полі (загинув, дивиться): у стрічку
export function feedEmo(c, name, e) {
  const nm = document.createElement('b');
  nm.textContent = name;
  feed([dot(c), nm, ` ${EMOJI[e]}`]);
}

// Кнопки підсумку: «Грати» — готовий до наступного раунду (ще раз — скасувати), «Вийти в лоббі» — усіх у лоббі
export function initHud() {
  $('playBtn').onclick = () => { sfx.click(); act.ready(!S.room?.pp.find(p => p.i === net.id)?.r); };
  $('toLobbyBtn').onclick = () => { sfx.click(); act.back(); };
}

const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// Бонуси гравця — емодзі стилю графіки (e)
const statsText = (e, nb, fp, sp, ps, rs) => `${e.bomb}${nb} ${e.fire}${fp}${sp ? ` ${e.speed}${sp}` : ''}${ps ? ` ${e.pass}` : ''}${rs ? ` ${e.resist}` : ''}`;
const SD_TEXT = 'РАПТОВА СМЕРТЬ';
function chipEls(items) {
  return items.map(([c, name, stats, alive, me]) => {
    const el = document.createElement('div');
    el.className = 'chip' + (me ? ' me' : '') + (alive ? '' : ' dead');
    const nm = document.createElement('span'), st = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = name;
    st.className = 'st';
    st.textContent = stats;
    el.append(dot(c), nm, st);
    return el;
  });
}

// Нижній край HUD для відступу поля — не менший, ніж за найширших чіпів (усі бонуси в усіх) і «РАПТОВА СМЕРТЬ».
// Інакше на телефоні смерть, бонус чи раптова смерть міняють кількість рядків чіпів, і поле стрибає по вертикалі.
let reserveKey = '', reserve = 0;
export const hudBottom = () => Math.max($('hud').getBoundingClientRect().bottom, reserve);

let chipsKey = '';
// Викликається щокадру: оновлює лише те, що змінилось
export function renderHud(now) {
  const R = S.R, playing = !!R && !!S.room && S.room.g === R.r;
  $('hud').classList.toggle('show', playing);
  $('feed').style.top = `${(playing ? hudBottom() : 56) + 8}px`;
  if (!playing) {
    $('banner').classList.remove('show');
    $('result').classList.remove('show');
    chipsKey = '';
    return;
  }
  const em = skinOf().emoji;
  if ($('bombBtn').textContent !== em.bomb) $('bombBtn').textContent = em.bomb;
  const items = R.sl.map((s, k) => {
    const me = k === S.mySlot;
    const stats = s.a ? statsText(em, s.nb, s.fp, s.sp, s.ps, me || s.b ? s.rs > now : s.rsOn) : '💀';
    return [s.c, `${s.n}${me ? ' (ти)' : ''}`, stats, s.a, me];
  });
  const timer = $('timer');
  const rk = `${innerWidth}x${innerHeight}:${document.fonts?.status}:${Object.values(em).join('')}:${items.map(e => e[1]).join('\n')}`;
  if (rk !== reserveKey) {                                           // вимірюємо найгірший випадок; нижче все перемалюється
    reserveKey = rk;
    chipsKey = '';
    const worst = statsText(em, MAX_BOMBS, MAX_FIRE, MAX_SPEED_UPS, true, true);
    $('chips').replaceChildren(...chipEls(items.map(([c, name, , , me]) => [c, name, worst, true, me])));
    timer.textContent = SD_TEXT;
    timer.classList.add('sd');
    reserve = $('hud').getBoundingClientRect().bottom;
  }
  const key = JSON.stringify(items);
  if (key !== chipsKey) {
    chipsKey = key;
    $('chips').replaceChildren(...chipEls(items));
  }
  const sd = R.board.sdAt, left = now < R.t0 ? sd - R.t0 : sd - now;
  timer.classList.toggle('sd', left <= 0);
  timer.textContent = left > 0 ? fmt(left) : SD_TEXT;

  const me = R.sl[S.mySlot];
  const banner = S.mySlot < 0 ? 'Раунд уже йде — ти дивишся. Зіграєш у наступному.'
    : !me.a && R.p === 0 ? 'Для тебе раунд скінчився — дивишся до кінця.' : '';
  $('banner').textContent = banner;
  $('banner').classList.toggle('show', !!banner);

  const ended = R.p === 1;
  $('result').classList.toggle('show', ended);
  if (ended) renderResult(R);
}

let resKey = '';
function renderResult(R) {
  const mine = !!S.room?.pp.find(p => p.i === net.id)?.r, { need, ready, members } = startNeed();
  const play = $('playBtn');
  play.textContent = mine ? `Граю ✓ · ${ready} / ${need}` : need > 1 ? `Грати · ${ready} / ${need}` : 'Грати';
  play.classList.toggle('on', mine);
  play.title = mine ? 'Натисни ще раз, щоб скасувати' : '';
  const who = need >= members ? 'щойно всі натиснуть «Грати»' : `щойно «Грати» натиснуть ${need}`;
  $('resNote').textContent = `Наступний раунд — ${who}.`;
  const kills = (o) => R.sl.filter(e => e.o !== o && e.kb === o).length, mons = (o) => R.mons.filter(m => !m.a && m.kb === o).length;
  const key = `${R.r}:${R.res}:${R.wn}:${R.sl.map(s => `${+s.a}${s.kb}${kills(s.o)}${mons(s.o)}`).join(',')}`;   // боти можуть грати й після кінця
  if (key === resKey) return;
  resKey = key;
  const w = R.sl[R.wn];
  const title = {
    [RES_WIN]: w ? `Перемога — ${w.n}!` : 'Перемога!',
    [RES_DRAW]: 'Нічия — загинули всі',
    [RES_NOBODY]: 'Без переможця',
    [RES_TEAM_WIN]: 'Перемога команди!',
    [RES_TEAM_LOSS]: 'Монстри перемогли',
  }[R.res] || 'Кінець раунду';
  const good = R.res === RES_TEAM_WIN || (R.res === RES_WIN && R.wn === S.mySlot);
  const bad = R.res === RES_TEAM_LOSS || (R.res === RES_WIN && S.mySlot >= 0 && R.wn !== S.mySlot);
  const h = $('resTitle');
  h.textContent = title;
  h.className = good ? 'good' : bad ? 'bad' : '';
  const bomb = skinOf().emoji.bomb;
  $('resList').replaceChildren(...R.sl.map((s, k) => {
    const el = document.createElement('span');
    const what = R.res === RES_WIN && k === R.wn ? '🏆' : s.a ? '❤️' : '💀';
    el.append(dot(s.c), `${s.n}${s.b ? ' (бот)' : ''}${k === S.mySlot ? ' (ти)' : ''} ${what}`);
    const by = R.sl[s.kb];                                          // хто вбив
    const cause = s.a ? '' : s.kb === k ? `${bomb} своя бомба` : by ? `${bomb} ${by.n}` : s.kb === KB_WALL ? '🧱 стіна'
      : s.kb >= KB_MON && s.kb < KB_MON + 3 ? '👾 монстр' : s.kb === KB_LEFT ? '🚪 вихід з гри' : '';
    const n = kills(k), m = mons(k);                                // кого вбив сам
    const info = [cause && `← ${cause}`, n && (R.coop ? `своїх: ${n}` : `жертв: ${n}`), m && `монстрів: ${m}`].filter(Boolean).join(' · ');
    if (info) { const i = document.createElement('small'); i.textContent = info; el.append(i); }
    return el;
  }));
}

// З'єднання з кожним гравцем: тип і пінг або «через гравця», якщо прямого з'єднання немає
let netKey = '';
export function renderNet(nameOf) {
  const items = net.peers().map(({ id, direct, stat: st }) => {
    const text = !direct ? 'через гравця' : !st ? '…' : st.rtt === null ? st.type : `${st.type} ${st.rtt} мс`;
    const c = S.room?.pp.find(p => p.i === id)?.c ?? null;
    return [c, `${nameOf(id)}: ${text}`];
  });
  const key = JSON.stringify(items);
  if (key === netKey) return;
  netKey = key;
  const el = $('net');
  el.hidden = !items.length;
  el.replaceChildren(document.createTextNode('Зв\'язок:'), ...items.map(([c, text]) => {
    const s = document.createElement('span');
    s.append(dot(c), text);
    return s;
  }));
}
