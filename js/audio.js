// audio.js — звуки, згенеровані Web Audio (без файлів). Вимкнення запам'ятовується в localStorage; музика — окремо (music.js).
let ac = null, master = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('bomberman-mute') === '1'; } catch {}

export const isMuted = () => muted;
export const audioCtx = () => ac;                                  // для музики (music.js), з'являється після unlock
export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem('bomberman-mute', muted ? '1' : '0'); } catch {}
  if (master) master.gain.value = muted ? 0 : 0.55;
}
// Браузер дозволяє звук лише після дії користувача: клавіша, клік, а на тачскріні — коли палець відпускають
// (pointerup / touchend, але не pointerdown). Викликаємо на кожній такій дії, доки звук не запрацює.
export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'running') return;
  ac.resume().catch(() => {});
  const s = ac.createBufferSource();                                // iOS: звук «відмикається» лише відтворенням у самій дії
  s.buffer = ac.createBuffer(1, 1, ac.sampleRate);
  s.connect(ac.destination);
  s.start(0);
}
const ready = () => ac && !muted && ac.state === 'running';

function tone(f0, f1, dur, type = 'square', vol = 0.15, delay = 0) {
  const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(dur, vol, fFrom, fTo, delay = 0) {
  const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf;
  f.type = 'lowpass';
  f.frequency.setValueAtTime(fFrom, t);
  f.frequency.exponentialRampToValueAtTime(fTo, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

let lastBlast = 0;
export const sfx = {
  place() { if (ready()) tone(200, 110, 0.09, 'square', 0.12); },
  blast() {
    if (!ready()) return;
    const now = ac.currentTime;
    if (now - lastBlast < 0.05) return;                        // ланцюжок — один гучний вибух, а не десять
    lastBlast = now;
    noise(0.55, 0.6, 2200, 160);
    tone(90, 38, 0.45, 'sine', 0.5);
  },
  pick() { if (ready()) [660, 880, 1320].forEach((f, k) => tone(f, f, 0.07, 'triangle', 0.16, k * 0.06)); },
  death() { if (ready()) tone(560, 90, 0.7, 'sawtooth', 0.14); },
  monster() { if (ready()) tone(260, 900, 0.14, 'triangle', 0.14); },
  win() { if (ready()) [523, 659, 784, 1046].forEach((f, k) => tone(f, f, k === 3 ? 0.4 : 0.13, 'square', 0.11, k * 0.13)); },
  lose() { if (ready()) [392, 330, 262, 196].forEach((f, k) => tone(f, f, k === 3 ? 0.5 : 0.18, 'triangle', 0.16, k * 0.2)); },
  sudden() { if (ready()) for (let k = 0; k < 4; k++) tone(k % 2 ? 660 : 880, k % 2 ? 660 : 880, 0.22, 'square', 0.09, k * 0.24); },
  beep(hi) { if (ready()) tone(hi ? 1046 : 660, hi ? 1046 : 660, hi ? 0.3 : 0.12, 'square', 0.1); },
  click() { if (ready()) tone(900, 700, 0.04, 'triangle', 0.08); },
};
