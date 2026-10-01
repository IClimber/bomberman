// lobby.js — екран підключення і лоббі: нік, люди кімнати, налаштування, «Я готовий», «Старт», таблиця перемог.
import { S, COLORS, MODE_NAMES, DIFF_NAMES, cleanName, saveName } from './state.js';
import { net, act, lobbyMembers, startNeed, botsForced, nameOf } from './net.js';
import { createRoom } from './host.js';
import { SIZES } from './sim.js';
import { sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
let statusFn = () => '';

export function dot(c) {
  const el = document.createElement('i');
  el.className = 'sw';
  el.style.background = c == null ? '#777' : COLORS[c];
  return el;
}

// status() — рядок стану кімнати з попередженнями (HTML лише з власних константних рядків)
export function initLobby(status) {
  statusFn = status;
  const nick = $('nick');
  nick.value = S.myName;
  nick.addEventListener('input', () => {
    const n = cleanName(nick.value);
    if (!n) return;
    saveName(n);
    act.name(n);
    renderLobby();
  });
  nick.addEventListener('keydown', (e) => { if (e.key === 'Enter') nick.blur(); e.stopPropagation(); });

  $('modeSeg').replaceChildren(...MODE_NAMES.map((name, k) => {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => { sfx.click(); act.cfg({ m: k }); };
    return b;
  }));
  $('diffSeg').replaceChildren(...DIFF_NAMES.map((name, k) => {
    const b = document.createElement('button');
    b.textContent = name;
    b.onclick = () => { sfx.click(); act.cfg({ d: k }); };
    return b;
  }));
  $('size').replaceChildren(...SIZES.map(([w, h], k) => {
    const o = document.createElement('option');
    o.value = String(k);
    o.textContent = `${w} × ${h}`;
    return o;
  }));
  $('size').onchange = (e) => act.cfg({ s: Number(e.target.value) });
  $('bots').onchange = (e) => act.cfg({ b: e.target.checked });
  $('startBtn').onclick = () => { sfx.click(); act.ready(!myEntry()?.r); };   // «Старт» — я готовий; ще раз — скасувати
  const copy = $('copyBtn');
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); copy.textContent = 'Скопійовано'; }
    catch { copy.textContent = location.href; }
    setTimeout(() => { copy.textContent = 'Скопіювати лінк'; }, 1500);
  };
  $('soloBtn').onclick = () => createRoom();
}

const myEntry = () => S.room?.pp.find(p => p.i === net.id);

export function renderLobby() {
  const wait = !S.room;
  $('wait').classList.toggle('show', wait);
  $('waitText').textContent = S.waiting ? 'Підключаємось до гравців кімнати…' : 'Підключаємось до кімнати…';
  $('soloBtn').hidden = !S.waitLong;
  const show = !!S.room && !S.room.g;
  $('lobby').classList.toggle('show', show);
  if (!show) return;
  const room = S.room;
  $('lobbyStatus').innerHTML = statusFn();

  // люди
  const live = new Set(lobbyMembers().map(p => p.i));
  $('people').replaceChildren(...room.pp.map(p => {
    const el = document.createElement('div');
    el.className = 'person';
    const st = document.createElement('span');
    const away = !live.has(p.i);
    st.className = 'st' + (away ? ' away' : p.r ? ' ready' : '');
    st.textContent = away ? 'у фоні' : p.r ? 'готовий' : 'не готовий';
    el.append(dot(p.c), `${nameOf(p.i)}${p.i === net.id ? ' (ти)' : ''}`, st);
    return el;
  }));

  // налаштування
  [...$('modeSeg').children].forEach((b, k) => b.classList.toggle('sel', k === room.m));
  [...$('diffSeg').children].forEach((b, k) => b.classList.toggle('sel', k === room.d));
  if (document.activeElement !== $('size')) $('size').value = String(room.s);
  const forced = botsForced();
  $('bots').checked = room.b || forced;
  $('bots').disabled = forced;
  $('botsLabel').classList.toggle('dis', forced);
  $('botsLabel').title = forced ? 'У «Один проти одного» самому потрібен хоча б один суперник' : '';

  // «Старт» — як «Грати» після раунду: раунд почнеться сам, щойно натиснуть усі (до 4)
  const mine = !!myEntry()?.r, { need, ready, members } = startNeed();
  const sb = $('startBtn');
  sb.textContent = need > 1 ? `Старт${mine ? ' ✓' : ''} · ${ready} / ${need}` : 'Старт';
  sb.classList.toggle('on', mine);
  sb.classList.toggle('primary', !mine);
  sb.title = (mine ? 'Натисни ще раз, щоб скасувати. ' : '') + (members > 4 ? 'У гру підуть перші 4, хто натиснув «Старт».' : '');

  // таблиця перемог
  const rows = [...room.w].sort((a, b) => (b.a + b.c) - (a.a + a.c) || b.a - a.a);
  $('wins').hidden = !rows.length;
  $('winsBody').replaceChildren(...rows.map(w => {
    const tr = document.createElement('tr');
    for (const v of [w.n, w.a, w.c]) { const td = document.createElement('td'); td.textContent = String(v); tr.append(td); }
    return tr;
  }));
}
