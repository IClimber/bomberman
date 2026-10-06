// tunes.js — фонові мелодії стилів графіки; порядок = SKINS (немає — стиль без музики). Формат доріжок — parse у music.js.
// Мелодія: bpm, beat (кроків на долю, 4 — шістнадцяті), bar (кроків у такті — для перевірки в тестах), vol,
// tracks: [{ i — інструмент (INST у music.js) і його поля на заміну, n — ноти, len — тривалість токена за замовчуванням }
//          | { d — ударний (DRUM), p — візерунок, vol }]. Кожна доріжка повторюється за своєю довжиною.

// «За замовчуванням» — бадьорий чіптюн до мажору: C Am F G ×2, потім F G Em Am F G C G
const classic = {
  name: 'За замовчуванням', bpm: 150, beat: 4, bar: 16,
  tracks: [
    { i: 'lead', len: 2, n: `
      C5 E5 G5 C6 - G5 E5 G5 | A5 - E5 C5 A4 C5 E5 A5 | F5 A5 C6 A5 F5 - E5 F5 | G5 - B5 - D6 - B5 G5 |
      E6 - D6 C6 G5 - E5 G5 | A5 C6 B5 A5 E5 - C5 E5 | F5 - A5 C6 F6 - E6 D6 | D6 C6 B5 A5 G5 - . . |
      C6 - - - A5 - F5 - | D6 - - - B5 - G5 - | E6 - D6 - B5 - G5 - | C6 - - - A5 - - - |
      A5 C6 F6 - E6 - C6 - | D6 B5 G5 - A5 B5 D6 - | C6 - G5 - E5 - G5 - | F5 - D5 - B4 - G4 - ` },
    { i: 'pulse', len: 2, n: `
      . E4+G4 . E4+G4 . E4+G4 . E4+G4 | . E4+A4 . E4+A4 . E4+A4 . E4+A4 | . F4+A4 . F4+A4 . F4+A4 . F4+A4 | . D4+G4 . D4+G4 . D4+G4 . D4+G4 |
      . E4+G4 . E4+G4 . E4+G4 . E4+G4 | . E4+A4 . E4+A4 . E4+A4 . E4+A4 | . F4+A4 . F4+A4 . F4+A4 . F4+A4 | . D4+G4 . D4+G4 . D4+G4 . D4+G4 |
      . F4+A4 . F4+A4 . F4+A4 . F4+A4 | . D4+G4 . D4+G4 . D4+G4 . D4+G4 | . G4+B4 . G4+B4 . G4+B4 . G4+B4 | . E4+A4 . E4+A4 . E4+A4 . E4+A4 |
      . F4+A4 . F4+A4 . F4+A4 . F4+A4 | . D4+G4 . D4+G4 . D4+G4 . D4+G4 | . E4+G4 . E4+G4 . E4+G4 . E4+G4 | . D4+F4 . D4+F4 . D4+G4 . D4+G4 ` },
    { i: 'bass', len: 2, n: `
      C3 C4 C3 C4 C3 C4 G2 B2 | A2 A3 A2 A3 A2 A3 E3 G3 | F2 F3 F2 F3 F2 F3 C3 F3 | G2 G3 G2 G3 G2 G3 B2 D3 |
      C3 C4 C3 C4 C3 C4 G2 B2 | A2 A3 A2 A3 A2 A3 E3 G3 | F2 F3 F2 F3 F2 F3 C3 F3 | G2 G3 G2 G3 G2 G3 B2 D3 |
      F2 F3 F2 F3 F2 F3 C3 F3 | G2 G3 G2 G3 G2 G3 D3 G3 | E2 E3 E2 E3 E2 E3 B2 E3 | A2 A3 A2 A3 A2 A3 E3 A3 |
      F2 F3 F2 F3 F2 F3 C3 F3 | G2 G3 G2 G3 G2 G3 D3 G3 | C3 C4 C3 C4 C3 C4 G2 C3 | G2 G3 G2 G3 G2 G3 B2 D3 ` },
    { d: 'kick', p: 'x.......x.......' },
    { d: 'snare', p: '....x.......x...' },
    { d: 'hat', p: 'o.x.o.x.o.x.o.x.' },
  ],
};

export const TUNES = [classic];
