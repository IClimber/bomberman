// index.js — стилі графіки (спільні для кімнати: S.room.v — індекс тут). Кожен стиль — об'єкт:
//   name, bg (тло навколо поля), backdrop? (g, W, H, dpr) — рисунок тла, shadow? — тінь під полем,
//   emoji { bomb, fire, speed, pass, resist, kick, remote } — бонуси в HUD, кнопки бомби й детонатора, fire [3 кольори вогню, ззовні всередину],
//   burn [низ, верх] — язики на блоці, що горить, pixel? — вогонь «пікселями»,
//   floor(g, px, py, s, x, y, map), stone(g, px, py, s, border, x, y, map) — у статичний шар,
//   blocks (скільки варіантів), block(g, s, v), wall(g, s), item(g, k, s) — спрайти клітинки,
//   bomb(g, x, y, s, k, T) (k — частка запалу), player(g, p, s, T, { col, walk, bob, dead }), monster(g, m, s, T, wob) —
//   щокадру, у координатах від центру клітинки (гравець, монстр) чи від її кута (бомба).
import { S } from '../state.js';
import classic from './classic.js';
import cyber from './cyber.js';
import retro from './retro.js';
import winter from './winter.js';
import space from './space.js';
import halloween from './halloween.js';
import hawaii from './hawaii.js';
import notebook from './notebook.js';
import village from './village.js';
import egypt from './egypt.js';
import west from './west.js';
import candy from './candy.js';
import ocean from './ocean.js';

export const SKINS = [classic, cyber, retro, winter, space, halloween, hawaii, notebook, village, egypt, west, candy, ocean];
export const skinOf = () => SKINS[S.room?.v] || SKINS[0];               // стиль кімнати
