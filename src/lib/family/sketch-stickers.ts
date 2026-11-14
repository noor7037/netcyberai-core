// The drawing studio's stickers (C510; 109 in ten groups since C517): simple pictures a child taps to place, drawn for NetCyberAI as plain
// SVG paths on a 64 x 64 box (original line art: circles, curves and straight lines, nothing traced or copied). Each
// part is filled with a paint from the studio's palette (or left open) and outlined in ink. The same paths draw the
// sticker sheet (inline SVG) and stamp the sticker on the canvas (Path2D), so what the child picks is what lands.

import { SKETCH_PALETTE } from './sketch';

export const STICKER_BOX = 64;
export const STICKER_LINE = 2.5;
export type StickerPart = { d: string; fill: string | null };
export type Sticker = { id: string; parts: StickerPart[] };

const paint = (id: string): string => SKETCH_PALETTE.find((p) => p.id === id)?.hex ?? SKETCH_PALETTE[0].hex;
const n = (v: number) => String(Math.round(v * 100) / 100);
// A circle as two half arcs (a path, so Path2D and <path> both draw it).
export const circle = (cx: number, cy: number, r: number): string => `M${n(cx - r)} ${n(cy)} A${n(r)} ${n(r)} 0 1 0 ${n(cx + r)} ${n(cy)} A${n(r)} ${n(r)} 0 1 0 ${n(cx - r)} ${n(cy)} Z`;
const box = (x: number, y: number, w: number, h: number): string => `M${n(x)} ${n(y)} L${n(x + w)} ${n(y)} L${n(x + w)} ${n(y + h)} L${n(x)} ${n(y + h)} Z`;
function star(cx: number, cy: number, r: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 === 0 ? r : inner;
    pts.push(`${i === 0 ? 'M' : 'L'}${n(cx + k * Math.cos(a))} ${n(cy + k * Math.sin(a))}`);
  }
  return `${pts.join(' ')} Z`;
}
const part = (d: string, fill: string | null = null): StickerPart => ({ d, fill: fill === null ? null : paint(fill) });
// C517: an ellipse (two half arcs), a closed polygon from x, y pairs, and a pair of round eyes.
const ell = (cx: number, cy: number, rx: number, ry: number): string => `M${n(cx - rx)} ${n(cy)} A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)} A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)} Z`;
const poly = (...v: number[]): string => `M${v.reduce<string[]>((a, x, i) => (i % 2 ? a : [...a, `${n(x)} ${n(v[i + 1])}`]), []).join(' L')} Z`;
const eyes = (x1: number, x2: number, y: number, r = 2): StickerPart[] => [part(circle(x1, y, r), 'ink'), part(circle(x2, y, r), 'ink')];
const face = (): StickerPart => part(circle(32, 32, 25), 'sunshine');
const tile = 'M14 8 L50 8 Q56 8 56 14 L56 50 Q56 56 50 56 L14 56 Q8 56 8 50 L8 14 Q8 8 14 8 Z';
const dots = (pts: number[][], fill: string): StickerPart[] => [part(tile, 'white'), ...pts.map(([x, y]) => part(circle(x, y, 5), fill))];

export const STICKERS: readonly Sticker[] = [
  { id: 'house', parts: [part(box(15, 32, 34, 22), 'peach'), part('M10 33 L32 12 L54 33 Z', 'red'), part('M28 54 L28 41 L36 41 L36 54 Z', 'brown'), part(box(18, 37, 7, 7), 'sky'), part(box(39, 37, 7, 7), 'sky')] },
  { id: 'tree', parts: [part(box(28, 40, 8, 18), 'brown'), part(circle(32, 26, 17), 'leaf')] },
  { id: 'sun', parts: [part(circle(32, 32, 12), 'sunshine'), part('M32 4 L32 13 M32 51 L32 60 M4 32 L13 32 M51 32 L60 32 M12 12 L18 18 M46 46 L52 52 M52 12 L46 18 M12 52 L18 46')] },
  { id: 'cloud', parts: [part('M16 46 A10 10 0 0 1 17 26 A14 14 0 0 1 43 21 A12 12 0 0 1 49 46 Z', 'white')] },
  {
    id: 'flower',
    parts: [
      part('M32 34 L32 60'),
      part('M32 50 Q22 42 17 47 Q23 56 32 50 Z', 'leaf'),
      ...[[32, 12], [41.5, 18.9], [37.9, 30.1], [26.1, 30.1], [22.5, 18.9]].map(([x, y]) => part(circle(x, y, 7), 'pink')),
      part(circle(32, 22, 6), 'sunshine'),
    ],
  },
  {
    id: 'cat',
    parts: [
      part('M18 29 L19 11 L31 21 Z M46 29 L45 11 L33 21 Z', 'tangerine'),
      part(circle(32, 37, 17), 'tangerine'),
      part(circle(25, 34, 2), 'ink'),
      part(circle(39, 34, 2), 'ink'),
      part('M30 41 L34 41 L32 43.5 Z', 'pink'),
      part('M32 43.5 Q29 48 26 45.5 M32 43.5 Q35 48 38 45.5 M19 40 L8 38 M19 44 L8 46 M45 40 L56 38 M45 44 L56 46'),
    ],
  },
  {
    id: 'dog',
    parts: [
      part(circle(32, 35, 16), 'peach'),
      part('M18 22 Q8 30 13 46 Q20 42 21 28 Z M46 22 Q56 30 51 46 Q44 42 43 28 Z', 'brown'),
      part(circle(26, 32, 2), 'ink'),
      part(circle(38, 32, 2), 'ink'),
      part(circle(32, 40, 3), 'ink'),
      part('M32 43 Q28 48 25 45 M32 43 Q36 48 39 45'),
    ],
  },
  { id: 'fish', parts: [part('M45 32 L58 21 L58 43 Z', 'sky'), part('M8 32 Q28 12 48 32 Q28 52 8 32 Z', 'sky'), part(circle(19, 30, 2), 'ink'), part('M27 22 Q33 28 30 33 M36 28 Q38 32 36 36')] },
  {
    id: 'bird',
    parts: [
      part('M12 38 Q14 22 32 22 Q46 22 50 34 Q44 50 26 50 Q14 48 12 38 Z', 'blue'),
      part('M49 31 L59 35 L49 39 Z', 'tangerine'),
      part('M20 37 Q30 29 38 38 Q30 45 20 37 Z', 'sky'),
      part(circle(42, 30, 2), 'ink'),
      part('M28 50 L26 58 M35 50 L37 58'),
    ],
  },
  {
    id: 'butterfly',
    parts: [
      part('M30 31 Q12 4 7 21 Q5 36 30 35 Z M34 31 Q52 4 57 21 Q59 36 34 35 Z', 'grape'),
      part('M30 37 Q13 38 13 50 Q21 59 30 43 Z M34 37 Q51 38 51 50 Q43 59 34 43 Z', 'pink'),
      part(box(30, 18, 4, 33), 'ink'),
      part('M31 18 Q27 11 23 7 M33 18 Q37 11 41 7'),
    ],
  },
  { id: 'apple', parts: [part('M32 20 Q46 12 52 26 Q56 44 42 54 Q36 58 32 54 Q28 58 22 54 Q8 44 12 26 Q18 12 32 20 Z', 'red'), part('M32 20 L33 9'), part('M33 13 Q42 5 47 11 Q39 18 33 13 Z', 'leaf')] },
  { id: 'banana', parts: [part('M11 17 Q15 47 44 51 Q55 51 57 44 Q40 44 28 34 Q20 26 18 15 Z', 'sunshine'), part('M11 17 L18 15')] },
  { id: 'ball', parts: [part(circle(32, 32, 22), 'coral'), part('M10 32 Q32 22 54 32 M32 10 Q22 32 32 54')] },
  { id: 'bicycle', parts: [part(circle(16, 42, 11)), part(circle(48, 42, 11)), part('M16 42 L28 26 L40 42 Z M28 26 L44 26 L48 42 M24 21 L32 21 M28 21 L28 26 M44 26 L42 17 L49 17'), part(circle(40, 42, 2.5), 'ink')] },
  {
    id: 'car',
    parts: [
      part('M6 42 L10 29 L20 29 L26 18 L44 18 L52 29 L58 31 L58 44 L6 44 Z', 'red'),
      part('M24 29 L28 21 L35 21 L35 29 Z M38 29 L38 21 L43 21 L48 29 Z', 'sky'),
      part(circle(18, 45, 6), 'ink'),
      part(circle(46, 45, 6), 'ink'),
    ],
  },
  {
    id: 'bus',
    parts: [
      part('M9 13 L55 13 Q58 13 58 16 L58 47 L6 47 L6 16 Q6 13 9 13 Z', 'sunshine'),
      part(`${box(10, 18, 10, 10)} ${box(23, 18, 10, 10)} ${box(36, 18, 9, 10)} ${box(48, 18, 6, 22)}`, 'sky'),
      part('M6 34 L46 34'),
      part(circle(18, 48, 5), 'ink'),
      part(circle(46, 48, 5), 'ink'),
    ],
  },
  { id: 'boat', parts: [part('M32 40 L32 8'), part('M35 10 L53 36 L35 36 Z', 'white'), part('M6 40 L58 40 L50 52 L14 52 Z', 'brown'), part('M4 58 Q12 54 20 58 Q28 62 36 58 Q44 54 52 58 Q56 60 60 58')] },
  { id: 'kite', parts: [part('M32 4 L50 24 L32 44 L14 24 Z', 'tangerine'), part('M32 4 L32 44 M14 24 L50 24'), part('M32 44 Q24 50 32 54 Q40 58 32 62'), part('M28 52 L24 50 L25 55 Z M36 58 L40 56 L39 61 Z', 'teal')] },
  { id: 'balloon', parts: [part('M32 6 Q50 6 50 24 Q50 40 32 46 Q14 40 14 24 Q14 6 32 6 Z', 'pink'), part('M29 49 L35 49 L32 46 Z', 'pink'), part('M32 49 Q26 54 32 58 Q38 61 33 63'), part('M22 18 Q24 12 29 11')] },
  {
    id: 'book',
    parts: [
      part('M32 16 Q20 10 6 14 L6 50 Q20 46 32 52 Z M32 16 Q44 10 58 14 L58 50 Q44 46 32 52 Z', 'white'),
      part('M32 16 L32 52 M12 22 Q20 20 27 23 M12 30 Q20 28 27 31 M12 38 Q20 36 27 39 M37 23 Q44 20 52 22 M37 31 Q44 28 52 30 M37 39 Q44 36 52 38'),
    ],
  },
  { id: 'pencil', parts: [part('M14 42 L46 10 L54 18 L22 50 Z', 'sunshine'), part('M10 54 L14 42 L22 50 Z', 'peach'), part('M10 54 L12 48 L16 52 Z', 'ink'), part('M42 14 L46 10 L54 18 L50 22 Z', 'pink')] },
  { id: 'heart', parts: [part('M32 54 Q8 38 8 22 Q8 10 20 10 Q28 10 32 18 Q36 10 44 10 Q56 10 56 22 Q56 38 32 54 Z', 'red')] },
  { id: 'star', parts: [part(star(32, 34, 27, 11.5), 'sunshine')] },
  { id: 'smiley', parts: [part(circle(32, 32, 25), 'sunshine'), part(circle(24, 26, 3), 'ink'), part(circle(40, 26, 3), 'ink'), part('M19 37 Q32 51 45 37')] },
  // ---- C517: more stickers, in groups (STICKER_GROUPS below). Original line art, like the first twenty-four. ----------
  // Animals
  { id: 'elephant', parts: [part(`${box(22, 42, 7, 14)} ${box(40, 42, 7, 14)}`, 'grey'), part(ell(36, 36, 20, 14), 'grey'), part('M8 30 Q2 44 8 54 L13 53 Q9 44 13 34 Z', 'grey'), part(circle(16, 30, 11), 'grey'), part(ell(22, 28, 6, 9), 'grey'), part(circle(13, 27, 1.8), 'ink')] },
  { id: 'cow', parts: [part(`${box(16, 44, 5, 12)} ${box(42, 44, 5, 12)}`, 'white'), part(box(14, 24, 38, 22), 'white'), part(ell(36, 32, 6, 5), 'brown'), part('M52 28 Q58 34 56 40'), part('M8 13 L6 7 M20 13 L22 7'), part(circle(14, 22, 10), 'white'), part(ell(13, 29, 7, 4.5), 'pink'), ...eyes(10, 18, 20, 1.6)] },
  { id: 'lion', parts: [part(circle(32, 32, 26), 'tangerine'), part(`${circle(21, 18, 5)} ${circle(43, 18, 5)}`, 'sunshine'), part(circle(32, 34, 15), 'sunshine'), ...eyes(27, 37, 31), part('M30 37 L34 37 L32 40 Z', 'brown'), part('M32 40 Q29 44 26 42 M32 40 Q35 44 38 42')] },
  { id: 'rabbit', parts: [part(`${ell(25, 16, 5, 13)} ${ell(39, 16, 5, 13)}`, 'white'), part(`${ell(25, 16, 2.2, 9)} ${ell(39, 16, 2.2, 9)}`, 'pink'), part(circle(32, 40, 16), 'white'), ...eyes(26, 38, 37), part('M30 43 L34 43 L32 45.5 Z', 'pink'), part('M24 46 L14 45 M40 46 L50 45')] },
  { id: 'peacock', parts: [part('M10 40 A22 22 0 1 1 54 40 Z', 'teal'), part(`${circle(20, 24, 3.5)} ${circle(32, 16, 3.5)} ${circle(44, 24, 3.5)} ${circle(14, 34, 3)} ${circle(50, 34, 3)}`, 'blue'), part(ell(32, 44, 7, 12), 'blue'), part(circle(32, 30, 5), 'blue'), part('M32 25 L32 19 M29 26 L27 20 M35 26 L37 20'), part('M36 30 L40 31 L36 32 Z', 'sunshine'), part('M29 56 L28 61 M35 56 L36 61')] },
  { id: 'monkey', parts: [part(`${circle(14, 30, 7)} ${circle(50, 30, 7)}`, 'brown'), part(circle(32, 30, 16), 'brown'), part(ell(32, 35, 11, 10), 'peach'), ...eyes(27, 37, 30), part('M27 40 Q32 44 37 40'), part('M38 46 Q46 56 40 62')] },
  { id: 'frog', parts: [part(`${circle(20, 26, 7)} ${circle(44, 26, 7)}`, 'leaf'), part(ell(32, 42, 22, 14), 'leaf'), part(`${circle(20, 26, 4)} ${circle(44, 26, 4)}`, 'white'), ...eyes(20, 44, 26), part('M18 44 Q32 54 46 44'), part(`${circle(14, 40, 2)} ${circle(50, 40, 2)}`, 'pink')] },
  { id: 'owl', parts: [part('M16 18 L18 8 L25 15 Z M48 18 L46 8 L39 15 Z', 'brown'), part(ell(32, 36, 18, 22), 'brown'), part(ell(32, 42, 11, 13), 'peach'), part(`${circle(25, 26, 7)} ${circle(39, 26, 7)}`, 'white'), ...eyes(25, 39, 26, 3), part('M30 32 L34 32 L32 37 Z', 'sunshine'), part('M26 58 L26 62 M38 58 L38 62')] },
  { id: 'duck', parts: [part('M4 58 Q12 54 20 58 Q28 62 36 58 Q44 54 52 58 Q56 60 60 58'), part(ell(30, 42, 20, 12), 'sunshine'), part(circle(46, 24, 10), 'sunshine'), part('M54 24 L62 27 L54 30 Z', 'tangerine'), part(circle(48, 22, 1.8), 'ink'), part('M18 40 Q28 34 36 42 Q28 48 18 40 Z', 'saffron')] },
  { id: 'tortoise', parts: [part(`${box(14, 42, 7, 8)} ${box(42, 42, 7, 8)}`, 'peach'), part(circle(56, 40, 5), 'peach'), part('M10 42 A22 22 0 0 1 54 42 Z', 'leaf'), part('M20 42 L26 30 L38 30 L44 42 M26 30 L32 22 L38 30 M8 42 L56 42'), part(circle(57, 38, 1.2), 'ink')] },
  { id: 'snail', parts: [part('M6 52 Q6 46 14 46 L54 46 Q60 46 60 52 Z', 'peach'), part(circle(38, 32, 15), 'tangerine'), part('M38 32 Q38 26 44 28 Q48 34 42 40 Q34 44 28 38 Q24 30 32 22'), part('M12 46 L8 36 M16 46 L16 36'), part(`${circle(8, 35, 2)} ${circle(16, 35, 2)}`, 'ink')] },
  { id: 'bee', parts: [part(`${ell(24, 18, 8, 10)} ${ell(38, 18, 8, 10)}`, 'white'), part(ell(32, 36, 18, 13), 'sunshine'), part('M26 24 Q22 36 26 48 M36 24 Q32 36 36 48 M14 36 L8 36 M44 24 L48 14 M40 24 L40 14'), part(circle(44, 32, 2), 'ink'), part('M42 40 Q45 42 48 40')] },
  // Sea
  { id: 'whale', parts: [part('M50 34 L60 24 L62 30 L56 34 L62 40 L60 44 Z', 'blue'), part('M6 34 Q6 18 28 18 Q50 18 52 34 Q50 48 28 48 Q10 48 6 34 Z', 'blue'), part('M10 38 Q28 46 46 40 M26 18 L26 10 M26 12 Q22 6 18 8 M26 12 Q30 6 34 8'), part(circle(18, 30, 2), 'ink')] },
  { id: 'octopus', parts: [part('M14 32 Q8 48 16 56 Q14 46 22 34 Z M26 34 Q22 50 28 60 Q30 48 32 34 Z M38 34 Q42 50 36 60 Q34 48 32 34 Z M50 32 Q56 48 48 56 Q50 46 42 34 Z', 'grape'), part('M14 34 Q14 8 32 8 Q50 8 50 34 Z', 'grape'), part(`${circle(25, 22, 5)} ${circle(39, 22, 5)}`, 'white'), ...eyes(25, 39, 22, 2.5), part('M27 30 Q32 33 37 30')] },
  { id: 'crab', parts: [part('M14 32 L12 28 M50 32 L52 28 M16 42 L6 48 M18 46 L10 54 M48 42 L58 48 M46 46 L54 54 M26 28 L24 18 M38 28 L40 18'), part(`${circle(10, 22, 7)} ${circle(54, 22, 7)}`, 'red'), part('M6 18 L12 22 M58 18 L52 22'), part(ell(32, 38, 18, 11), 'red'), part(`${circle(24, 17, 3)} ${circle(40, 17, 3)}`, 'white'), ...eyes(24, 40, 17, 1.4)] },
  { id: 'starfish', parts: [part(star(32, 34, 28, 12), 'coral'), part(`${circle(32, 30, 2)} ${circle(26, 36, 1.6)} ${circle(38, 36, 1.6)}`, 'peach')] },
  { id: 'jellyfish', parts: [part('M18 34 Q14 44 20 52 Q24 58 18 62 M28 36 Q24 48 30 58 M36 36 Q40 48 34 58 M46 34 Q50 44 44 52 Q40 58 46 62'), part('M10 32 Q10 8 32 8 Q54 8 54 32 Q48 36 42 32 Q37 36 32 32 Q27 36 22 32 Q16 36 10 32 Z', 'pink'), ...eyes(26, 38, 22), part('M28 27 Q32 30 36 27')] },
  { id: 'shell', parts: [part('M26 56 L38 56 L36 60 L28 60 Z', 'peach'), part('M32 56 L8 30 Q10 10 32 8 Q54 10 56 30 Z', 'peach'), part('M32 56 L18 14 M32 56 L32 8 M32 56 L46 14 M32 56 L10 26 M32 56 L54 26')] },
  { id: 'wave', parts: [part('M4 44 Q12 18 34 18 Q50 18 52 32 Q44 26 38 32 Q34 40 44 44 L60 44 L60 58 L4 58 Z', 'sky'), part('M14 50 Q30 46 46 50')] },
  // Nature and home
  { id: 'rainbow', parts: [part('M4 52 A28 28 0 0 1 60 52 L52 52 A20 20 0 0 0 12 52 Z', 'red'), part('M12 52 A20 20 0 0 1 52 52 L46 52 A14 14 0 0 0 18 52 Z', 'sunshine'), part('M18 52 A14 14 0 0 1 46 52 L40 52 A8 8 0 0 0 24 52 Z', 'sky'), part(`${circle(9, 52, 6)} ${circle(55, 52, 6)}`, 'white')] },
  { id: 'mountain', parts: [part(circle(50, 14, 6), 'sunshine'), part('M2 56 L22 18 L34 36 L42 26 L62 56 Z', 'grey'), part('M22 18 L28 30 L24 28 L20 31 L16 29 Z', 'white')] },
  { id: 'leaf', parts: [part('M10 54 Q8 20 52 10 Q58 50 10 54 Z', 'leaf'), part('M10 54 L46 18 M24 40 L22 28 M24 40 L38 40 M34 30 L32 20 M34 30 L46 30')] },
  { id: 'mushroom', parts: [part('M24 34 L40 34 L42 56 L22 56 Z', 'peach'), part('M8 34 Q8 10 32 10 Q56 10 56 34 Z', 'red'), part(`${circle(22, 22, 4)} ${circle(38, 18, 3)} ${circle(45, 28, 3)}`, 'white')] },
  { id: 'cactus', parts: [part('M26 54 L26 14 Q26 8 32 8 Q38 8 38 14 L38 54 Z M26 38 L18 38 Q14 38 14 34 L14 24 Q14 20 18 20 Q22 20 22 24 L22 32 L26 32 Z M38 30 L44 30 L44 22 Q44 18 48 18 Q52 18 52 22 L52 32 Q52 36 48 36 L38 36 Z', 'leaf'), part('M18 54 L46 54 L42 62 L22 62 Z', 'brown'), part(circle(32, 8, 3), 'pink')] },
  { id: 'raindrop', parts: [part('M32 6 Q48 30 48 40 Q48 56 32 56 Q16 56 16 40 Q16 30 32 6 Z', 'sky'), part('M24 40 Q24 32 28 28')] },
  { id: 'snowflake', parts: [part('M32 6 L32 58 M9.5 19 L54.5 45 M9.5 45 L54.5 19 M26 10 L32 16 L38 10 M26 54 L32 48 L38 54 M8 26 L16 28 L14 20 M56 38 L48 36 L50 44 M8 38 L16 36 L14 44 M56 26 L48 28 L50 20'), part(circle(32, 32, 4), 'sky')] },
  { id: 'lightning', parts: [part(poly(36, 4, 14, 36, 30, 36, 24, 60, 50, 24, 34, 24, 42, 4), 'sunshine')] },
  { id: 'umbrella', parts: [part('M32 32 L32 54 Q32 60 26 60 Q22 60 22 56 M32 8 L32 4'), part('M6 32 Q6 8 32 8 Q58 8 58 32 Q52 28 45 32 Q38 28 32 32 Q26 28 19 32 Q12 28 6 32 Z', 'coral')] },
  // Food
  { id: 'mango', parts: [part('M20 14 Q44 6 52 30 Q56 52 34 56 Q12 56 12 36 Q12 22 20 14 Z', 'saffron'), part('M30 12 Q40 2 50 8 Q42 16 30 12 Z', 'leaf'), part('M28 14 L26 8')] },
  { id: 'watermelon', parts: [part('M4 22 A28 28 0 0 0 60 22 Z', 'leaf'), part('M9 22 A23 23 0 0 0 55 22 Z', 'red'), part(`${circle(20, 30, 1.8)} ${circle(32, 38, 1.8)} ${circle(44, 30, 1.8)} ${circle(26, 27, 1.8)} ${circle(38, 27, 1.8)}`, 'ink')] },
  { id: 'carrot', parts: [part('M28 20 Q22 6 26 4 Q30 10 30 20 Z M34 20 Q34 4 40 4 Q40 14 36 20 Z', 'leaf'), part('M22 20 L42 20 L33 60 Z', 'tangerine'), part('M26 30 L32 30 M30 40 L35 40 M30 50 L33 50')] },
  { id: 'icecream', parts: [part('M20 30 L44 30 L32 60 Z', 'peach'), part('M24 34 L36 50 M40 34 L28 50'), part(circle(32, 24, 13), 'pink'), part(circle(32, 9, 3.5), 'red')] },
  { id: 'cupcake', parts: [part('M14 36 L50 36 L44 58 L20 58 Z', 'sky'), part('M22 40 L24 56 M32 40 L32 56 M42 40 L40 56'), part('M10 36 Q10 22 22 22 Q24 12 32 12 Q40 12 42 22 Q54 22 54 36 Z', 'pink'), part(circle(32, 10, 3.5), 'red')] },
  { id: 'laddoo', parts: [part(ell(32, 52, 26, 7), 'white'), part(`${circle(21, 40, 10)} ${circle(43, 40, 10)}`, 'saffron'), part(circle(32, 25, 10), 'saffron'), part(`${circle(18, 38, 1)} ${circle(24, 42, 1)} ${circle(40, 38, 1)} ${circle(46, 43, 1)} ${circle(30, 22, 1)} ${circle(35, 27, 1)}`, 'brown')] },
  { id: 'milk', parts: [part('M18 10 L46 10 L42 58 L22 58 Z', 'white'), part('M19.5 20 L44.5 20 M24 28 L24 48')] },
  { id: 'orange', parts: [part(circle(32, 36, 22), 'tangerine'), part('M32 14 Q40 4 50 8 Q42 16 32 14 Z', 'leaf'), part('M32 14 L31 10'), part(`${circle(24, 30, 1)} ${circle(40, 38, 1)} ${circle(30, 46, 1)}`, 'saffron')] },
  { id: 'grapes', parts: [part('M32 18 L32 8'), part('M32 10 Q40 2 48 8 Q40 14 32 10 Z', 'leaf'), part([[26, 24], [38, 24], [20, 34], [32, 34], [44, 34], [26, 44], [38, 44], [32, 54]].map(([x, y]) => circle(x, y, 6)).join(' '), 'grape')] },
  { id: 'pizza', parts: [part('M32 60 L8 12 Q32 2 56 12 Z', 'sunshine'), part('M8 12 Q32 2 56 12 L54 18 Q32 9 10 18 Z', 'brown'), part(`${circle(32, 22, 4)} ${circle(25, 33, 4)} ${circle(38, 38, 4)} ${circle(32, 49, 3)}`, 'red')] },
  { id: 'chai', parts: [part(ell(28, 58, 22, 4), 'white'), part('M44 28 Q56 28 54 38 Q52 46 42 44 M22 18 Q18 13 22 9 M32 18 Q28 13 32 9'), part('M12 22 L44 22 L40 52 Q38 56 34 56 L22 56 Q18 56 16 52 Z', 'white'), part('M13.5 28 L42.5 28')] },
  // Transport
  { id: 'train', parts: [part(box(10, 14, 7, 12), 'ink'), part(box(6, 26, 24, 22), 'red'), part(box(28, 14, 16, 34), 'red'), part(box(32, 19, 8, 8), 'sky'), part(box(48, 24, 14, 24), 'sunshine'), part(box(51, 29, 8, 7), 'sky'), part(`${circle(14, 50, 6)} ${circle(30, 50, 6)} ${circle(55, 50, 5)}`, 'ink'), part('M2 58 L62 58 M44 40 L48 40')] },
  { id: 'plane', parts: [part('M28 26 L34 10 L40 10 L38 26 Z M8 26 L6 14 L14 14 L18 26 Z', 'sky'), part('M6 32 Q6 26 14 26 L50 26 Q60 28 60 32 Q60 36 50 38 L14 38 Q6 38 6 32 Z', 'white'), part('M26 34 L40 34 L28 54 L20 54 Z', 'sky'), part(`${circle(44, 31, 2)} ${circle(50, 31, 2)} ${circle(20, 31, 2)}`, 'sky')] },
  { id: 'rickshaw', parts: [part('M8 46 L8 26 L56 26 L56 46 Z', 'sunshine'), part('M8 26 Q8 14 22 14 L46 14 Q56 14 56 26 Z', 'leaf'), part(`${box(14, 29, 14, 10)} ${box(36, 29, 14, 10)}`, 'sky'), part(`${circle(16, 48, 6)} ${circle(48, 48, 6)}`, 'ink'), part(circle(56, 38, 2.5), 'white')] },
  { id: 'truck', parts: [part(box(4, 18, 36, 28), 'teal'), part('M40 26 L52 26 L60 36 L60 46 L40 46 Z', 'red'), part('M44 29 L51 29 L56 36 L44 36 Z', 'sky'), part(`${circle(14, 48, 6)} ${circle(50, 48, 6)}`, 'ink')] },
  { id: 'helicopter', parts: [part('M8 12 L56 12 M30 12 L30 20 M16 52 L44 52 M22 44 L22 52 M38 44 L38 52 M60 22 L60 36'), part('M46 30 L60 26 L60 32 L46 36 Z', 'sunshine'), part('M10 34 Q10 20 28 20 L38 20 Q48 20 48 34 Q48 44 30 44 Q10 44 10 34 Z', 'sunshine'), part('M14 32 Q14 24 24 24 L24 34 Z', 'sky')] },
  { id: 'scooter', parts: [part('M44 22 L44 10 M38 10 L52 10'), part('M14 44 L44 44 L44 38 L14 38 Z M40 44 L52 44 L50 22 L44 22 Z', 'teal'), part('M14 38 L28 38 L28 34 L14 34 Z', 'ink'), part(`${circle(18, 50, 7)} ${circle(50, 50, 7)}`, 'ink')] },
  // School and play
  { id: 'bag', parts: [part('M24 14 Q24 6 32 6 Q40 6 40 14'), part('M12 22 Q12 14 20 14 L44 14 Q52 14 52 22 L52 56 L12 56 Z', 'red'), part('M12 22 Q12 14 20 14 L44 14 Q52 14 52 22 L52 32 L12 32 Z', 'coral'), part(box(22, 40, 20, 10), 'coral'), part(box(29, 29, 6, 6), 'sunshine')] },
  { id: 'crayon', parts: [part('M12 46 L40 18 L48 26 L20 54 Z', 'blue'), part('M40 18 L54 10 L48 26 Z', 'blue'), part('M17 41 L25 49 M33 25 L41 33')] },
  { id: 'ruler', parts: [part('M4 40 L50 6 L60 20 L14 54 Z', 'sunshine'), part('M12 34 L16 40 M20 28 L22 32 M28 22 L32 28 M36 16 L38 20 M44 10 L48 16')] },
  { id: 'clock', parts: [part(`${circle(14, 12, 6)} ${circle(50, 12, 6)}`, 'red'), part(circle(32, 34, 24), 'white'), part('M32 34 L32 18 M32 34 L44 34 M32 12 L32 15 M32 53 L32 56 M10 34 L13 34 M51 34 L54 34'), part(circle(32, 34, 2), 'ink')] },
  { id: 'globe', parts: [part('M32 48 L32 56 M22 58 L42 58'), part(circle(32, 28, 20), 'sky'), part('M20 18 Q26 14 30 20 Q28 28 22 26 Z M36 30 Q44 26 46 34 Q40 42 36 36 Z', 'leaf')] },
  { id: 'paintbrush', parts: [part('M10 56 L36 30 L42 36 L16 62 Z', 'brown'), part('M36 30 L42 24 L48 30 L42 36 Z', 'grey'), part('M42 24 Q50 10 60 4 Q56 16 48 30 Z', 'red')] },
  { id: 'drum', parts: [part('M40 16 L56 4 M24 16 L8 4'), part('M10 24 L10 48 Q10 56 32 56 Q54 56 54 48 L54 24 Z', 'red'), part(ell(32, 24, 22, 7), 'white'), part('M10 32 L20 48 L30 32 L40 48 L50 32')] },
  { id: 'trophy', parts: [part('M18 12 Q8 12 10 22 Q12 28 20 28 M46 12 Q56 12 54 22 Q52 28 44 28'), part('M18 8 L46 8 L44 28 Q42 38 32 38 Q22 38 20 28 Z', 'sunshine'), part('M28 38 L36 38 L36 48 L28 48 Z', 'sunshine'), part(box(20, 48, 24, 8), 'brown')] },
  // Festivals
  { id: 'diya', parts: [part('M32 38 Q22 26 32 10 Q42 26 32 38 Z', 'sunshine'), part('M32 36 Q28 30 32 22 Q36 30 32 36 Z', 'tangerine'), part('M6 40 Q32 64 58 40 Z', 'tangerine'), part(`${circle(20, 46, 1.6)} ${circle(32, 50, 1.6)} ${circle(44, 46, 1.6)}`, 'red')] },
  { id: 'rangoli', parts: [...[[46, 32], [41.9, 41.9], [32, 46], [22.1, 41.9], [18, 32], [22.1, 22.1], [32, 18], [41.9, 22.1]].map(([x, y], i) => part(circle(x, y, 8), ['red', 'sunshine', 'teal', 'grape'][i % 4])), part(circle(32, 32, 7), 'pink'), part(`${circle(32, 5, 2.5)} ${circle(59, 32, 2.5)} ${circle(32, 59, 2.5)} ${circle(5, 32, 2.5)}`, 'tangerine')] },
  { id: 'lantern', parts: [part('M32 8 L32 2 M32 48 L32 60 M28 44 L24 56 M36 44 L40 56'), part('M32 8 L52 28 L32 48 L12 28 Z', 'red'), part('M32 16 L44 28 L32 40 L20 28 Z', 'sunshine')] },
  { id: 'firework', parts: [part('M32 32 L32 6 M32 32 L50 14 M32 32 L58 32 M32 32 L50 50 M32 32 L32 58 M32 32 L14 50 M32 32 L6 32 M32 32 L14 14'), ...[[32, 6, 'red'], [50, 14, 'sunshine'], [58, 32, 'teal'], [50, 50, 'pink'], [32, 58, 'grape'], [14, 50, 'sky'], [6, 32, 'leaf'], [14, 14, 'tangerine']].map(([x, y, c]) => part(circle(x as number, y as number, 3), c as string)), part(circle(32, 32, 4), 'sunshine')] },
  { id: 'gift', parts: [part(box(10, 28, 44, 28), 'grape'), part(box(6, 20, 52, 10), 'plum'), part(box(29, 20, 6, 36), 'sunshine'), part('M32 20 Q20 6 18 14 Q18 20 32 20 Z M32 20 Q44 6 46 14 Q46 20 32 20 Z', 'sunshine')] },
  { id: 'cake', parts: [part('M4 58 L60 58'), part(box(10, 36, 44, 20), 'pink'), part(box(18, 22, 28, 14), 'white'), part('M10 40 Q16 46 22 40 Q28 46 34 40 Q40 46 46 40 Q50 44 54 40'), part(`${box(24, 12, 4, 10)} ${box(36, 12, 4, 10)}`, 'sky'), part('M26 12 Q23 8 26 4 Q29 8 26 12 Z M38 12 Q35 8 38 4 Q41 8 38 12 Z', 'sunshine')] },
  { id: 'flag', parts: [part('M10 6 L10 60'), part(box(10, 8, 44, 10), 'saffron'), part(box(10, 18, 44, 10), 'white'), part(box(10, 28, 44, 10), 'leaf'), part(circle(32, 23, 4)), part(circle(32, 23, 0.8), 'blue')] },
  { id: 'rakhi', parts: [part('M2 32 L62 32'), part(`${circle(32, 20, 7)} ${circle(44, 32, 7)} ${circle(32, 44, 7)} ${circle(20, 32, 7)}`, 'red'), part(circle(32, 32, 9), 'sunshine'), part(circle(32, 32, 4), 'grape')] },
  // Space
  { id: 'moon', parts: [part('M40 6 A26 26 0 1 0 58 44 A20 20 0 1 1 40 6 Z', 'sunshine'), part(`${circle(22, 34, 3)} ${circle(30, 46, 2)}`)] },
  { id: 'rocket', parts: [part('M24 44 Q32 64 40 44 Z', 'tangerine'), part('M18 30 L8 46 L18 42 Z M46 30 L56 46 L46 42 Z', 'red'), part('M32 4 Q46 16 46 38 L18 38 Q18 16 32 4 Z', 'white'), part(box(22, 38, 20, 6), 'grey'), part(circle(32, 22, 6), 'sky')] },
  { id: 'planet', parts: [part(circle(32, 32, 16), 'tangerine'), part('M18 26 Q32 30 46 26'), part(ell(32, 34, 28, 7))] },
  { id: 'comet', parts: [part('M60 4 L22 30 M56 14 L26 38 M48 4 L18 28'), part(circle(18, 42, 12), 'sunshine'), part(star(50, 46, 6, 2.5), 'white')] },
  { id: 'ufo', parts: [part('M24 42 L16 60 L48 60 L40 42 Z', 'sunshine'), part('M20 30 Q20 14 32 14 Q44 14 44 30 Z', 'sky'), part(ell(32, 34, 26, 8), 'grey'), part(`${circle(18, 34, 2)} ${circle(32, 36, 2)} ${circle(46, 34, 2)}`, 'sunshine')] },
  { id: 'telescope', parts: [part('M30 28 L20 58 M30 28 L40 58 M30 28 L30 58'), part('M8 30 L46 14 L50 24 L12 40 Z', 'blue'), part('M46 14 L54 10 L58 20 L50 24 Z', 'grey')] },
  { id: 'earth', parts: [part(circle(32, 32, 24), 'blue'), part('M18 18 Q26 12 32 18 Q34 26 26 28 Q20 30 16 26 Z M34 34 Q44 30 50 38 Q46 50 38 48 Q32 44 34 34 Z M14 40 Q20 38 22 44 Q18 48 14 44 Z', 'leaf')] },
  // Feelings
  { id: 'sad', parts: [face(), ...eyes(24, 40, 26, 3), part('M20 46 Q32 34 44 46'), part('M22 31 Q19 37 22 39 Q25 37 22 31 Z', 'sky')] },
  { id: 'laugh', parts: [face(), part('M19 26 Q24 20 29 26 M35 26 Q40 20 45 26'), part('M18 36 L46 36 Q44 52 32 52 Q20 52 18 36 Z', 'red')] },
  { id: 'surprised', parts: [face(), ...eyes(24, 40, 26, 4), part(circle(32, 44, 6), 'ink'), part('M18 18 Q24 14 28 18 M36 18 Q40 14 46 18')] },
  { id: 'sleepy', parts: [face(), part('M19 28 Q24 32 29 28 M35 28 Q40 32 45 28 M48 4 L56 4 L48 12 L56 12'), part(circle(32, 42, 3), 'ink')] },
  { id: 'cool', parts: [face(), part('M14 24 L50 24 L48 32 Q44 36 38 32 L34 26 L30 26 L26 32 Q20 36 16 32 Z', 'ink'), part('M22 42 Q32 50 42 42')] },
  { id: 'wink', parts: [face(), part(circle(24, 26, 3), 'ink'), part('M35 27 Q40 22 45 27 M19 38 Q32 50 45 38')] },
  // Shapes and numbers
  { id: 'triangle', parts: [part(poly(32, 8, 58, 54, 6, 54), 'red')] },
  { id: 'square', parts: [part(box(10, 10, 44, 44), 'blue')] },
  { id: 'round', parts: [part(circle(32, 32, 24), 'leaf')] },
  { id: 'hexagon', parts: [part(poly(56, 32, 44, 11.2, 20, 11.2, 8, 32, 20, 52.8, 44, 52.8), 'sunshine')] },
  { id: 'diamond', parts: [part(poly(32, 4, 54, 32, 32, 60, 10, 32), 'pink')] },
  { id: 'plus', parts: [part(poly(26, 8, 38, 8, 38, 26, 56, 26, 56, 38, 38, 38, 38, 56, 26, 56, 26, 38, 8, 38, 8, 26, 26, 26), 'teal')] },
  { id: 'one', parts: dots([[32, 32]], 'red') },
  { id: 'two', parts: dots([[20, 20], [44, 44]], 'blue') },
  { id: 'three', parts: dots([[20, 20], [32, 32], [44, 44]], 'leaf') },
  { id: 'four', parts: dots([[20, 20], [44, 20], [20, 44], [44, 44]], 'grape') },
  { id: 'five', parts: dots([[20, 20], [44, 20], [32, 32], [20, 44], [44, 44]], 'tangerine') },
];

// C517: the sticker tray's groups, in the order they are offered (every sticker in exactly one).
export const STICKER_GROUPS: readonly { id: string; stickers: readonly string[] }[] = [
  { id: 'animals', stickers: ['cat', 'dog', 'bird', 'butterfly', 'elephant', 'cow', 'lion', 'rabbit', 'peacock', 'monkey', 'frog', 'owl', 'duck', 'tortoise', 'snail', 'bee'] },
  { id: 'sea', stickers: ['fish', 'whale', 'octopus', 'crab', 'starfish', 'jellyfish', 'shell', 'wave'] },
  { id: 'nature', stickers: ['house', 'tree', 'flower', 'sun', 'cloud', 'rainbow', 'mountain', 'leaf', 'mushroom', 'cactus', 'raindrop', 'snowflake', 'lightning', 'umbrella'] },
  { id: 'food', stickers: ['apple', 'banana', 'mango', 'watermelon', 'carrot', 'icecream', 'cupcake', 'laddoo', 'milk', 'orange', 'grapes', 'pizza', 'chai'] },
  { id: 'transport', stickers: ['car', 'bus', 'bicycle', 'boat', 'train', 'plane', 'rickshaw', 'truck', 'helicopter', 'scooter'] },
  { id: 'school', stickers: ['book', 'pencil', 'ball', 'kite', 'balloon', 'bag', 'crayon', 'ruler', 'clock', 'globe', 'paintbrush', 'drum', 'trophy'] },
  { id: 'festivals', stickers: ['diya', 'rangoli', 'lantern', 'firework', 'gift', 'cake', 'flag', 'rakhi'] },
  { id: 'space', stickers: ['star', 'moon', 'rocket', 'planet', 'comet', 'ufo', 'telescope', 'earth'] },
  { id: 'feelings', stickers: ['heart', 'smiley', 'sad', 'laugh', 'surprised', 'sleepy', 'cool', 'wink'] },
  { id: 'shapes', stickers: ['triangle', 'square', 'round', 'hexagon', 'diamond', 'plus', 'one', 'two', 'three', 'four', 'five'] },
];

export const stickerById = (id: string): Sticker | undefined => STICKERS.find((s) => s.id === id);
