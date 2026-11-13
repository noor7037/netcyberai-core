// The drawing studio's stickers (C510): twenty-four simple pictures a child taps to place, drawn for NetCyberAI as plain
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
];

export const stickerById = (id: string): Sticker | undefined => STICKERS.find((s) => s.id === id);
