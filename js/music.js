// music.js — фонова мелодія стилю графіки (Web Audio, без файлів): мелодії — у tunes.js, рушій — тут.
// Секвенсор планує ноти на AHEAD с наперед таймером; у прихованій вкладці музика стихає й починається знову, коли вкладку відкрили.
// Вимкнення — окремо від звуків (localStorage `crossbomb-music`; немає — як звуки).
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
// w — хвиля (sine, square, sawtooth, triangle, pulse25 / pulse12 — як у NES, organ), vol, a — атака, dc — спад до s (частка), r — згасання після ноти (с),
// lp — фільтр низьких частот, vib [Гц, центів, через скільки с], h [[кратність, гучність]] — обертони (згасають швидше), det — два розстроєні
// генератори (центів між ними), gl — під'їзд знизу на півтону за стільки с, strum — акорд «перебором» (с між нотами), echo — частка в луну мелодії
const INST = {
  lead: { w: 'pulse25', vol: 0.32, a: 0.005, dc: 0.18, s: 0.55, r: 0.06, lp: 4200, vib: [5.5, 12, 0.18] },
  pulse: { w: 'pulse12', vol: 0.12, a: 0.004, dc: 0.08, s: 0.35, r: 0.04, lp: 3500 },
  bass: { w: 'triangle', vol: 0.55, a: 0.004, dc: 0.15, s: 0.7, r: 0.04 },
  bell: { w: 'sine', vol: 0.3, a: 0.002, dc: 0.9, s: 0, r: 0.3, h: [[2.76, 0.35], [5.4, 0.12]] },
  saw: { w: 'sawtooth', vol: 0.15, a: 0.01, dc: 0.3, s: 0.6, r: 0.15, lp: 2600, vib: [5, 10, 0.25], echo: 0.35 },
  arp: { w: 'sawtooth', vol: 0.09, a: 0.003, dc: 0.18, s: 0, r: 0.05, lp: 2000, echo: 0.3 },
  sbass: { w: 'sawtooth', vol: 0.22, a: 0.005, dc: 0.12, s: 0.5, r: 0.05, lp: 600 },
  pad: { w: 'sawtooth', vol: 0.045, a: 0.6, dc: 1, s: 0.8, r: 0.8, lp: 1200, det: 12 },
  pad2: { w: 'triangle', vol: 0.09, a: 0.9, dc: 1, s: 0.85, r: 1.2, lp: 1400, det: 8 },
  glass: { w: 'sine', vol: 0.16, a: 0.003, dc: 0.5, s: 0, r: 0.2, h: [[3, 0.2]], echo: 0.5 },
  theremin: { w: 'sine', vol: 0.22, a: 0.12, dc: 0.4, s: 0.85, r: 0.4, vib: [5, 25, 0.25], gl: 0.05, echo: 0.35 },
  sub: { w: 'sine', vol: 0.3, a: 0.3, dc: 1, s: 0.9, r: 0.6 },
  organ: { w: 'organ', vol: 0.15, a: 0.01, dc: 0.2, s: 0.8, r: 0.08, vib: [6, 10, 0.2] },
  pizzb: { w: 'triangle', vol: 0.55, a: 0.003, dc: 0.35, s: 0, r: 0.05 },
  pizz: { w: 'triangle', vol: 0.14, a: 0.003, dc: 0.25, s: 0, r: 0.05 },
  uke: { w: 'triangle', vol: 0.13, a: 0.002, dc: 0.4, s: 0, r: 0.05, lp: 3000, h: [[2, 0.3]], strum: 0.018 },
  steel: { w: 'triangle', vol: 0.3, a: 0.03, dc: 0.5, s: 0.7, r: 0.25, gl: 0.08, vib: [5.5, 18, 0.2], echo: 0.3 },
  marimba: { w: 'sine', vol: 0.32, a: 0.002, dc: 0.35, s: 0, r: 0.06, h: [[4, 0.25], [10, 0.05]] },
  accord: { w: 'sawtooth', vol: 0.12, a: 0.02, dc: 0.2, s: 0.8, r: 0.06, lp: 2400, det: 10, vib: [6, 6, 0.1] },
  oud: { w: 'sawtooth', vol: 0.2, a: 0.003, dc: 0.35, s: 0.12, r: 0.08, lp: 1700 },
  drone: { w: 'sawtooth', vol: 0.05, a: 0.8, dc: 1, s: 1, r: 0.5, lp: 600, det: 7 },
  whistle: { w: 'sine', vol: 0.26, a: 0.04, dc: 0.3, s: 0.85, r: 0.08, vib: [6, 22, 0.15], echo: 0.3 },
  twang: { w: 'square', vol: 0.1, a: 0.003, dc: 0.2, s: 0.1, r: 0.05, lp: 1500, gl: 0.015 },
  bounce: { w: 'square', vol: 0.18, a: 0.003, dc: 0.14, s: 0.25, r: 0.04, lp: 900 },
};
export const INSTRUMENTS = Object.keys(INST);
const ORGAN = [0, 1, 0.5, 0.25, 0.35, 0, 0.15, 0, 0.12];        // обертони органа (синусні)
const waves = new WeakMap();
function wave(ac, w) {
  if (!w.startsWith('pulse') && w !== 'organ') return null;
  let m = waves.get(ac);
  if (!m) waves.set(ac, m = {});
  if (!m[w]) {
    const N = 40, re = new Float32Array(N), im = new Float32Array(N);
    if (w === 'organ') ORGAN.forEach((v, n) => { im[n] = v; });
    else {                                                         // прямокутник зі шпаруватістю 25 % чи 12,5 %
      const duty = w === 'pulse25' ? 0.25 : 0.125;
      for (let n = 1; n < N; n++) re[n] = 2 / (n * Math.PI) * Math.sin(n * Math.PI * duty);
    }
    m[w] = ac.createPeriodicWave(re, im);
  }
  return m[w];
}
function osc(ac, w, f, t, gl) {
  const o = ac.createOscillator(), pw = wave(ac, w);
  if (pw) o.setPeriodicWave(pw); else o.type = w;
  o.frequency.setValueAtTime(gl ? f * 0.944 : f, t);
  if (gl) o.frequency.exponentialRampToValueAtTime(f, t + gl);
  return o;
}
function voice(ac, p, tr, f, t, dur) {
  const g = ac.createGain(), pk = tr.vol, end = t + dur, stop = end + tr.r * 3 + 0.05;
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
  const add = (k, cents, pg) => {
    const o = osc(ac, tr.w, f * k, t, tr.gl);
    o.detune.value = cents;
    if (lfo) lfo.connect(o.detune);
    o.connect(pg || into);
    o.start(t);
    o.stop(stop);
  };
  if (tr.det) { add(1, -tr.det / 2); add(1, tr.det / 2); } else add(1, 0);
  for (const [k, amp] of tr.h || []) {                             // обертон згасає швидше за основний тон
    const pg = ac.createGain();
    pg.gain.setValueAtTime(amp, t);
    pg.gain.setTargetAtTime(0, t, tr.dc / (3 * k));
    pg.connect(into);
    add(k, 0, pg);
  }
  g.connect(p.out);
  if (tr.echo && p.echo) {
    const sg = ac.createGain();
    sg.gain.value = tr.echo;
    g.connect(sg).connect(p.echo);
  }
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
  clap: (ac, out, t, v) => {
    for (const k of [0, 0.011, 0.022]) nz(ac, out, t + k, 0.02, 0.35 * v, 'bandpass', 1300, 1.2);
    nz(ac, out, t + 0.033, 0.13, 0.3 * v, 'bandpass', 1300, 1);
  },
  nkick: (ac, out, t, v) => nz(ac, out, t, 0.1, 0.9 * v, 'lowpass', 700, 1),     // ударні «шумом», як у NES
  nsnare: (ac, out, t, v) => nz(ac, out, t, 0.12, 0.4 * v, 'lowpass', 7000, 0.5),
  shaker: (ac, out, t, v) => nz(ac, out, t, 0.06, 0.14 * v, 'bandpass', 6500, 1.5),
  tamb: (ac, out, t, v) => { nz(ac, out, t, 0.16, 0.14 * v, 'highpass', 8500); nz(ac, out, t, 0.05, 0.12 * v, 'bandpass', 5000, 3); },
  sleigh: (ac, out, t, v) => { for (const k of [0, 0.03, 0.06]) nz(ac, out, t + k, 0.09, 0.12 * v, 'bandpass', 8500, 4); },
  wood: (ac, out, t, v) => tn(ac, out, t, 950, 900, 0.06, 0.35 * v),
  clop: (ac, out, t, v) => { tn(ac, out, t, 620, 560, 0.05, 0.35 * v, 'triangle'); nz(ac, out, t, 0.02, 0.15 * v, 'bandpass', 2000, 2); },
  tick: (ac, out, t, v) => tn(ac, out, t, 3200, 3000, 0.015, 0.12 * v),
  dum: (ac, out, t, v) => tn(ac, out, t, 110, 65, 0.35, 0.8 * v),
  tek: (ac, out, t, v) => { nz(ac, out, t, 0.05, 0.3 * v, 'bandpass', 3500, 1.5); tn(ac, out, t, 900, 700, 0.025, 0.2 * v); },
  tom: (ac, out, t, v) => tn(ac, out, t, 170, 95, 0.3, 0.6 * v),
  bub: (ac, out, t, v) => tn(ac, out, t, 350, 1300, 0.08, 0.12 * v),
};
export const DRUMS = Object.keys(DRUM);

// ================= Програвач =================
let off = null;
try {
  const v = localStorage.getItem('crossbomb-music');
  off = v === null ? localStorage.getItem('crossbomb-mute') === '1' : v === '0';
} catch { off = false; }
export const isMusicOff = () => off;
export function setMusicOff(v) {
  off = !!v;
  try { localStorage.setItem('crossbomb-music', off ? '0' : '1'); } catch {}
  tick();
}

let ctx = () => null, which = () => 0, bus = null, cur = null;
// Запускає програвач: ac() — аудіоконтекст (грає, лише коли він `running`), idx() — номер стилю кімнати
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
  const p = { tune, c: compile(tune), out, t, s: 0, echo: null, nodes: [out] };
  if (tune.echo) {                                                 // луна: затримка зі згасанням і глухішим звуком
    const [time, fb] = tune.echo, inp = ac.createGain(), dl = ac.createDelay(2), lp = ac.createBiquadFilter(), back = ac.createGain();
    dl.delayTime.value = time;
    lp.type = 'lowpass';
    lp.frequency.value = 2800;
    back.gain.value = fb;
    inp.connect(dl).connect(lp).connect(back).connect(dl);
    lp.connect(out);
    p.echo = inp;
    p.nodes.push(inp, dl, lp, back);
  }
  return p;
}
// Стишує й відключає мелодію
export function stopTune(ac, p, fade) {
  p.out.gain.setTargetAtTime(0, ac.currentTime, fade / 4);
  setTimeout(() => { for (const n of p.nodes) n.disconnect(); }, (fade + AHEAD) * 1000 + 200);
}
// Планує кроки до часу `until`
export function schedule(ac, p, until) {
  const { c } = p;
  for (; p.t < until; p.s++, p.t += c.dt)
    for (const tr of c.tracks) {
      const k = p.s % tr.L;
      if (tr.d) { if (tr.p[k]) DRUM[tr.d](ac, p.out, p.t, tr.p[k] * (tr.vol ?? 1)); continue; }
      for (const e of tr.at[k])
        e.f.forEach((f, j) => voice(ac, p, tr, f, p.t + j * (tr.strum || 0), e.l * c.dt * (tr.gate ?? 0.9)));
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
  if (cur && cur.tune !== tune) { stopTune(ac, cur, FADE); cur = null; }
  if (!tune) return;
  if (!cur) cur = startTune(ac, bus, tune, ac.currentTime + 0.1);
  if (cur.t < ac.currentTime) cur.t = ac.currentTime + 0.05;     // таймер забарився — не надолужуємо купою нот
  schedule(ac, cur, ac.currentTime + AHEAD);
}
