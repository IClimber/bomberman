// touch.js — сенсорне керування (як у tck): круг зі стрілками ліворуч — веди пальцем, кнопка 💣 праворуч,
// над нею 🙂 — рядок реакцій.
// Мультитач через Pointer Events: кожен елемент тримає свій палець (setPointerCapture).
// Рух у грі — по клітинках, тож з вектора пальця беремо головну вісь; щоб на діагоналі напрям не смикався,
// поточна вісь лишається, доки інша не переважить у HYST разів.
const DEAD = 0.18;                   // мертва зона в центрі (частка радіуса)
const HYST = 1.3;

export const isTouch = matchMedia('(pointer: coarse)').matches;
export const touch = { dir: 0 };

import { EMOJI } from './state.js';

// onBomb — натиснули «💣», onEmo(k) — реакцію EMOJI[k]
export function initTouch(onBomb, onEmo) {
  if (!isTouch) return;
  document.documentElement.classList.add('touch');
  const dpad = document.getElementById('dpad'), knob = document.getElementById('knob'), bomb = document.getElementById('bombBtn');
  let padId = null;
  const padUpdate = (e) => {
    const r = dpad.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const rad = r.width / 2, len = Math.hypot(dx, dy);
    const shift = Math.min(1, len / rad) * rad * 0.45;
    knob.style.transform = len ? `translate(${dx / len * shift}px, ${dy / len * shift}px)` : '';
    if (len < rad * DEAD) { touch.dir = 0; return; }
    const ax = Math.abs(dx), ay = Math.abs(dy), cur = touch.dir;
    const horiz = cur === 2 || cur === 4 ? ay <= ax * HYST : cur === 1 || cur === 3 ? ax > ay * HYST : ax > ay;
    touch.dir = horiz ? (dx > 0 ? 2 : 4) : (dy > 0 ? 3 : 1);
  };
  const padEnd = (e) => {
    if (e.pointerId !== padId) return;
    padId = null;
    touch.dir = 0;
    knob.style.transform = '';
  };
  dpad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    padId = e.pointerId;
    dpad.setPointerCapture(e.pointerId);
    padUpdate(e);
  });
  dpad.addEventListener('pointermove', (e) => { if (e.pointerId === padId) padUpdate(e); });
  dpad.addEventListener('pointerup', padEnd);
  dpad.addEventListener('pointercancel', padEnd);
  dpad.addEventListener('lostpointercapture', padEnd);

  const up = () => bomb.classList.remove('pressed');
  bomb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    bomb.setPointerCapture(e.pointerId);
    bomb.classList.add('pressed');
    onBomb();
  });
  bomb.addEventListener('pointerup', up);
  bomb.addEventListener('pointercancel', up);
  bomb.addEventListener('lostpointercapture', up);
  addEventListener('contextmenu', (e) => e.preventDefault());

  const emo = document.getElementById('emoBtn'), bar = document.getElementById('emoBar');
  emo.addEventListener('pointerdown', (e) => { e.preventDefault(); bar.classList.toggle('show'); });
  bar.replaceChildren(...EMOJI.map((ch, k) => {
    const b = document.createElement('button');
    b.tabIndex = -1;
    b.textContent = ch;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); bar.classList.remove('show'); onEmo(k); });
    return b;
  }));
}
// Відпустити все (вкладка у фоні, втрата фокусу)
export function resetTouch() {
  touch.dir = 0;
  document.getElementById('emoBar')?.classList.remove('show');
  const knob = document.getElementById('knob');
  if (knob) knob.style.transform = '';
}
