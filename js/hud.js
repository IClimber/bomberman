// hud.js — інтерфейс під час раунду: учасники з бонусами, таймер до раптової смерті, напис для глядача,
// підсумок раунду, тости, рядок «Зв'язок».
import { S } from './state.js';
import { net, act, startNeed } from './net.js';
import { sfx } from './audio.js';
import { dot } from './lobby.js';
import { RES_WIN, RES_DRAW, RES_NOBODY, RES_TEAM_WIN, RES_TEAM_LOSS } from './round.js';
import { MAX_BOMBS, MAX_FIRE, MAX_SPEED_UPS } from './sim.js';

const $ = (id) => document.getElementById(id);

export function toast(text, bad = false, ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = text;
  $('toasts').append(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 450);
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

const statsText = (nb, fp, sp, ps, rs) => `💣${nb} 🔥${fp}${sp ? ` 👟${sp}` : ''}${ps ? ' 👻' : ''}${rs ? ' 🛡' : ''}`;
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
  if (!playing) {
    $('banner').classList.remove('show');
    $('result').classList.remove('show');
    chipsKey = '';
    return;
  }
  const items = R.sl.map((s, k) => {
    const me = k === S.mySlot;
    const stats = s.a ? statsText(s.nb, s.fp, s.sp, s.ps, me || s.b ? s.rs > now : s.rsOn) : '💀';
    return [s.c, `${s.n}${me ? ' (ти)' : ''}`, stats, s.a, me];
  });
  const timer = $('timer');
  const rk = `${innerWidth}x${innerHeight}:${document.fonts?.status}:${items.map(e => e[1]).join('\n')}`;
  if (rk !== reserveKey) {                                           // вимірюємо найгірший випадок; нижче все перемалюється
    reserveKey = rk;
    chipsKey = '';
    const worst = statsText(MAX_BOMBS, MAX_FIRE, MAX_SPEED_UPS, true, true);
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
  const key = `${R.r}:${R.res}:${R.wn}`;
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
  $('resList').replaceChildren(...R.sl.map((s, k) => {
    const el = document.createElement('span');
    const what = R.res === RES_WIN && k === R.wn ? '🏆' : s.a ? '❤️' : '💀';
    el.append(dot(s.c), `${s.n}${s.b ? ' (бот)' : ''}${k === S.mySlot ? ' (ти)' : ''} ${what}`);
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
