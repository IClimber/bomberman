// state.js — спільний стан клієнта (лоббі, раунд, імена, позиції інших) і дрібні утиліти.

// Версія — кількість комітів у main разом із тим, що її змінює; видно в лоббі (чи оновились GitHub Pages)
export const VERSION = 52;

// Палітра гравців (8 — щоб у лоббі кольори не повторювались); боти беруть вільні
export const COLORS = ['#f4f4f4', '#3b3b46', '#e53935', '#1e88e5', '#fdd835', '#ec407a', '#26c6da', '#fb8c00'];
export const MODE_NAMES = ['Один проти одного', 'Команда'];
export const DIFF_NAMES = ['Легко', 'Нормально', 'Важко'];
export const EMOJI = ['👋', '😂', '😡', '😱', '👍'];   // реакції: клавіші 1–5
export const ID_RE = /^[A-Za-z0-9]{8,32}$/;
export const cleanName = (s) => String(s).replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim().slice(0, 16);
export const q8 = (v) => Math.round(v * 256);              // координата → u16 (1/256 клітинки)
export const uq8 = (v) => v / 256;

const NAMES = ['Андрій', 'Тарас', 'Богдан', 'Остап', 'Микола', 'Сашко', 'Діма', 'Юрко', 'Вітя', 'Женя', 'Олег', 'Макс', 'Назар', 'Ігор'];
let saved = '';
try { saved = cleanName(localStorage.getItem('bomberman-name') || ''); } catch {}

// Кімната — хеш URL; немає — генеруємо
let roomId = location.hash.slice(1);
if (!/^[A-Za-z0-9_-]{1,64}$/.test(roomId)) {
  roomId = Math.random().toString(36).slice(2, 10);
  history.replaceState(null, '', '#' + roomId);
}

export const S = {
  roomId,
  myName: saved || NAMES[Math.floor(Math.random() * NAMES.length)],
  // Стан кімнати від хоста: m — режим, s — розмір (індекс SIZES), d — складність, b — боти на вільні місця, v — стиль графіки (індекс SKINS),
  // g — id раунду, що йде (0 — лоббі), pp — люди { i, c (колір), r (готовий), rt (коли натиснув, спільний час) },
  // w — таблиця перемог { n (ім'я), a (перемоги), c (командні) }
  room: null,
  names: new Map(),                  // id → ім'я (з hi)
  pos: new Map(),                    // id → остання поза з pos
  emo: new Map(),                    // id → остання реакція { e (індекс EMOJI), at (performance.now) }
  gone: new Set(),                   // хто вийшов (onPeerGone) — запам'ятовує кожен, щоб прибрав і майбутній хост
  R: null,                           // поточний раунд (round.js); null — лоббі
  mySlot: -1,                        // мій слот у раунді; -1 — глядач
  waiting: false,                    // у кімнаті хтось є — чекаємо стан від хоста
  waitLong: false,                   // чекаємо довго — показати «Почати без них»
};

export function saveName(n) {
  S.myName = n;
  try { localStorage.setItem('bomberman-name', n); } catch {}
}
