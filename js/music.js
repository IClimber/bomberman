// music.js — фонова мелодія стилю графіки (Web Audio, без файлів): мелодії — у tunes.js, рушій — тут.
// Секвенсор планує ноти на AHEAD с наперед таймером; у прихованій вкладці музика стихає й починається знову, коли вкладку відкрили.
// Вимкнення — окремо від звуків (localStorage `bomberman-music`; немає — як звуки).
import { TUNES } from './tunes.js';

const VOL = 0.14, AHEAD = 0.35, FADE = 0.5;

// ================= Ноти =================
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function freq(n) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(n);
  if (!m) throw new Error('нота: ' + n);
  const k = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return 440 * 2 ** ((k - 69) / 12);
}
// Доріжка: токени через пробіл; кожен триває `len` кроків або `_n`. Нота — `C5`, `F#4`, `Bb3`, акорд — `C4+E4+G4`,
// `.` — пауза, `-` — подовжує попередню ноту, `|` — риска такту (лише для читання). → { ev [{ s, l, f [Гц] }], L (кроків) }
export function parse(src, len = 1) {
  const ev = [];
  let s = 0, rest = true;
  for (const tok of src.trim().split(/\s+/)) {
    if (tok === '|') continue;
    const [body, l] = tok.split('_'), n = l ? Number(l) : len;
    if (!(n > 0)) throw new Error('тривалість: ' + tok);
    if (body === '-') { if (!rest) ev[ev.length - 1].l += n; }
    else if (body === '.') rest = true;
    else { ev.push({ s, l: n, f: body.split('+').map(freq) }); rest = false; }
    s += n;
  }
  return { ev, L: s };
}
// Ударні: символ на крок — `X` акцент, `x` звичайно, `o` тихо, `.` нічого (пробіли й `|` — для читання)
const HIT = { X: 1.35, x: 1, o: 0.5, '.': 0 };
export const parseDrum = (src) => [...src.replace(/[\s|]/g, '')].map(c => {
  if (!(c in HIT)) throw new Error('ударні: ' + c);
  return HIT[c];
});

// Мелодія → доріжки з нотами за кроком (at[k] — що починається на кроці k циклу доріжки)
const compiled = new Map();
export function compile(tune) {
  let c = compiled.get(tune);
  if (c) return c;
  const tracks = tune.tracks.map(tr => {
    if (tr.d) { const p = parseDrum(tr.p); return { ...tr, p, L: p.length }; }
    const { ev, L } = parse(tr.n, tr.len), at = Array.from({ length: L }, () => []);
    for (const e of ev) at[e.s].push(e);
    return { ...INST[tr.i], ...tr, at, L };
  });
  c = { ...tune, tracks, dt: 60 / tune.bpm / (tune.beat || 4) };
  compiled.set(tune, c);
  return c;
}

// ================= Інструменти =================
// w — хвиля (sine, square, sawtooth, triangle або pulse25 / pulse12), vol, a — атака, dc — спад до s (частка), r — згасання після ноти (с),
// lp — фільтр низьких частот, vib [Гц, центів, через скільки с], h [[кратність, гучність]] — додаткові обертони (дзвіночки)
const INST = {
  lead: { w: 'pulse25', vol: 0.32, a: 0.005, dc: 0.18, s: 0.55, r: 0.06, lp: 4200, vib: [5.5, 12, 0.18] },
  pulse: { w: 'pulse12', vol: 0.12, a: 0.004, dc: 0.08, s: 0.35, r: 0.04, lp: 3500 },
  bass: { w: 'triangle', vol: 0.55, a: 0.004, dc: 0.15, s: 0.7, r: 0.04 },
  bell: { w: 'sine', vol: 0.3, a: 0.002, dc: 0.9, s: 0, r: 0.3, h: [[2.76, 0.35], [5.4, 0.12]] },
};
const waves = new WeakMap();
function wave(ac, w) {
  if (!w.startsWith('pulse')) return null;
  let m = waves.get(ac);
  if (!m) waves.set(ac, m = {});
  if (!m[w]) {                                                     // прямокутник зі шпаруватістю 25 % чи 12,5 % — як у NES
    const duty = w === 'pulse25' ? 0.25 : 0.125, N = 40, re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) re[n] = 2 / (n * Math.PI) * Math.sin(n * Math.PI * duty);
    m[w] = ac.createPeriodicWave(re, im);
  }
  return m[w];
}
function osc(ac, w, f, t) {
  const o = ac.createOscillator(), pw = wave(ac, w);
  if (pw) o.setPeriodicWave(pw); else o.type = w;
  o.frequency.setValueAtTime(f, t);
  return o;
}
function voice(ac, p, tr, f, t, dur, v) {
  const g = ac.createGain(), pk = tr.vol * v, end = t + dur, stop = end + tr.r * 3 + 0.05;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(pk, t + tr.a);
  g.gain.setTargetAtTime(pk * tr.s, t + tr.a, tr.dc / 3);
  g.gain.setTargetAtTime(0, Math.max(end, t + tr.a), tr.r / 3);
  let into = g;
  if (tr.lp) {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = tr.lp;
    lp.connect(g);
    into = lp;
  }
  const parts = [[1, 1], ...(tr.h || [])];
  let lfo = null;
  if (tr.vib) {
    const [rate, cents, after] = tr.vib, lg = ac.createGain();
    lfo = ac.createOscillator();
    lfo.frequency.value = rate;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(cents, t + after);
    lfo.connect(lg);
    lfo.start(t);
    lfo.stop(stop);
    lfo = lg;
  }
  for (const [k, amp] of parts) {
    const o = osc(ac, tr.w, f * k, t);
    if (lfo) lfo.connect(o.detune);
    if (amp === 1) o.connect(into);
    else {                                                         // обертон згасає швидше за основний тон
      const pg = ac.createGain();
      pg.gain.setValueAtTime(amp, t);
      pg.gain.setTargetAtTime(0, t, tr.dc / (3 * k));
      o.connect(pg).connect(into);
    }
    o.start(t);
    o.stop(stop);
  }
  g.connect(p.out);
}

// ================= Ударні =================
const noises = new WeakMap();
function noiseBuf(ac) {
  let b = noises.get(ac);
  if (!b) {
    b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noises.set(ac, b);
  }
  return b;
}
function nz(ac, out, t, dur, v, type, f, q = 0.8) {
  const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf(ac);
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}
function tn(ac, out, t, f0, f1, dur, v, w = 'sine') {
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = w;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}
const DRUM = {
  kick: (ac, out, t, v) => tn(ac, out, t, 150, 42, 0.22, 0.9 * v),
  snare: (ac, out, t, v) => { nz(ac, out, t, 0.15, 0.45 * v, 'bandpass', 1900, 0.7); tn(ac, out, t, 200, 150, 0.07, 0.3 * v, 'triangle'); },
  hat: (ac, out, t, v) => nz(ac, out, t, 0.035, 0.22 * v, 'highpass', 7500),
};

// ================= Програвач =================
let off = null;
try {
  const v = localStorage.getItem('bomberman-music');
  off = v === null ? localStorage.getItem('bomberman-mute') === '1' : v === '0';
} catch { off = false; }
export const isMusicOff = () => off;
export function setMusicOff(v) {
  off = !!v;
  try { localStorage.setItem('bomberman-music', off ? '0' : '1'); } catch {}
  tick();
}

let ctx = () => null, which = () => 0, bus = null, cur = null;
// Запускає програвач: ac() — аудіоконтекст (з'являється після дії користувача), idx() — номер стилю кімнати
export function initMusic(ac, idx) {
  ctx = ac;
  which = idx;
  setInterval(tick, 100);
  document.addEventListener('visibilitychange', tick);
}

// Нова мелодія з початку: свій вихід (щоб при зміні стилю стара стихала окремо)
export function startTune(ac, dest, tune, t) {
  const out = ac.createGain();
  out.gain.value = tune.vol ?? 1;
  out.connect(dest);
  const c = compile(tune);
  return { tune, c, out, t, s: 0 };
}
// Планує кроки до часу `until`
export function schedule(ac, p, until) {
  const { c } = p;
  for (; p.t < until; p.s++, p.t += c.dt)
    for (const tr of c.tracks) {
      const k = p.s % tr.L;
      if (tr.d) { if (tr.p[k]) DRUM[tr.d](ac, p.out, p.t, tr.p[k] * (tr.vol ?? 1)); continue; }
      for (const e of tr.at[k])
        for (const f of e.f) voice(ac, p, tr, f, p.t, e.l * c.dt * (tr.gate ?? 0.9), 1);
    }
}

function tick() {
  const ac = ctx();
  if (!ac || ac.state !== 'running') return;
  if (!bus) {
    bus = ac.createGain();
    bus.gain.value = VOL;
    bus.connect(ac.destination);
  }
  const tune = off || document.hidden ? null : TUNES[which()] || null;
  if (cur && cur.tune !== tune) {
    const o = cur.out;
    o.gain.setTargetAtTime(0, ac.currentTime, FADE / 4);
    setTimeout(() => o.disconnect(), (FADE + AHEAD) * 1000 + 200);
    cur = null;
  }
  if (!tune) return;
  if (!cur) cur = startTune(ac, bus, tune, ac.currentTime + 0.1);
  if (cur.t < ac.currentTime) cur.t = ac.currentTime + 0.05;     // таймер забарився — не надолужуємо купою нот
  schedule(ac, cur, ac.currentTime + AHEAD);
}
