// The child's drawing studio (W18-P3, rebuilt in C510): the drawing maths, kept apart from the canvas so it can be tested
// without one (the test runner has no canvas). Everything here is plain data in, plain data out: the tools' ink, the
// smoothing of a finger's path, the ready-made shapes, the fill bucket, the undo history, the paper's lines, the sizes of
// the drawing and of the picture sent to the tutor, the cap on drawings kept on the device and the download path.
// Coordinates are in the drawing's own pixels (its backing store), never in screen pixels.

import { colors, deepColors, lessonColors, lessonTints } from '@/lib/design-tokens';

export type Point = { x: number; y: number };

// ---- tools -------------------------------------------------------------------------------------------------------

// C513 adds the crayon (textured) and the watercolour (see-through, darker at its edges); src/lib/family/draw-brush.ts.
export const FREEHAND_TOOLS = ['pencil', 'brush', 'marker', 'highlighter', 'crayon', 'watercolour', 'eraser'] as const;
export const SHAPE_TOOLS = ['line', 'rect', 'ellipse', 'triangle', 'star', 'arrow'] as const;
export type FreehandTool = (typeof FREEHAND_TOOLS)[number];
export type ShapeTool = (typeof SHAPE_TOOLS)[number];
export type SketchTool = FreehandTool | ShapeTool | 'fill' | 'text' | 'sticker';
export const isFreehand = (t: SketchTool): t is FreehandTool => (FREEHAND_TOOLS as readonly string[]).includes(t);
export const isShape = (t: SketchTool): t is ShapeTool => (SHAPE_TOOLS as readonly string[]).includes(t);

// Five stroke sizes, in CSS pixels at the drawing's display size (multiplied by the drawing's own scale).
export const SKETCH_SIZES = [2, 5, 10, 18, 30] as const;

// The palette: eighteen child-friendly paints, the Family identity first (ink, saffron, teal, plum, sunshine, tangerine)
// and the colours a child reaches for (red, green, blue, pink, brown). A custom colour picker adds any other.
export type SketchPaint = { id: string; hex: string };
export const SKETCH_PALETTE: readonly SketchPaint[] = [
  { id: 'ink', hex: lessonColors.ink },
  { id: 'grey', hex: '#6B7280' },
  { id: 'white', hex: '#FFFFFF' },
  { id: 'brown', hex: lessonTints.butter.accent },
  { id: 'red', hex: deepColors.coralDeep },
  { id: 'coral', hex: colors.coral },
  { id: 'tangerine', hex: colors.tangerine },
  { id: 'saffron', hex: lessonColors.saffron },
  { id: 'sunshine', hex: colors.sunshine },
  { id: 'leaf', hex: colors.leaf },
  { id: 'teal', hex: lessonColors.teal },
  { id: 'turquoise', hex: colors.turquoise },
  { id: 'sky', hex: '#38BDF8' },
  { id: 'blue', hex: lessonTints.sky.accent },
  { id: 'plum', hex: lessonColors.plum },
  { id: 'grape', hex: colors.grape },
  { id: 'pink', hex: '#EC4899' },
  { id: 'peach', hex: colors.peach },
];
export const isHexColour = (v: string): boolean => /^#[0-9a-fA-F]{6}$/.test(v);

// How each freehand tool lays its ink: width from the chosen size, how see-through, the line's end, a soft edge.
export type InkStyle = { width: number; alpha: number; cap: 'round' | 'butt' | 'square'; blur: number; erase: boolean };
export function inkStyle(tool: FreehandTool, size: number): InkStyle {
  switch (tool) {
    case 'pencil':
      return { width: Math.max(1, size * 0.7), alpha: 1, cap: 'round', blur: 0, erase: false };
    case 'brush':
      return { width: size * 1.3, alpha: 0.85, cap: 'round', blur: size * 0.6, erase: false };
    case 'marker':
      return { width: size * 1.5, alpha: 1, cap: 'square', blur: 0, erase: false };
    case 'highlighter':
      return { width: size * 2.5 + 4, alpha: 0.35, cap: 'butt', blur: 0, erase: false };
    case 'crayon':
      return { width: size * 1.6, alpha: 0.95, cap: 'round', blur: 0, erase: false };
    case 'watercolour':
      return { width: size * 2.2, alpha: 0.5, cap: 'round', blur: size * 0.4, erase: false };
    case 'eraser':
      return { width: size * 2.5 + 4, alpha: 1, cap: 'round', blur: 0, erase: true };
  }
}

// A finger's points, thinned: a point closer than `min` to the last kept one adds nothing but weight.
export function addPoint(points: readonly Point[], p: Point, min = 1.5): Point[] {
  const last = points[points.length - 1];
  if (last && Math.hypot(p.x - last.x, p.y - last.y) < min) return points as Point[];
  return [...points, p];
}

// A smooth line through the points: quadratic curves through the midpoints (each point is a control point), so a
// finger's corners become round. One point is a dot.
export type Smooth = { kind: 'dot'; at: Point } | { kind: 'path'; start: Point; curves: { c: Point; to: Point }[] };
export function smoothPath(points: readonly Point[]): Smooth | null {
  if (points.length === 0) return null;
  if (points.length === 1) return { kind: 'dot', at: points[0] };
  if (points.length === 2) return { kind: 'path', start: points[0], curves: [{ c: points[0], to: points[1] }] };
  const curves: { c: Point; to: Point }[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    curves.push({ c: points[i], to: mid });
  }
  const last = points[points.length - 1];
  curves.push({ c: last, to: last });
  return { kind: 'path', start: points[0], curves };
}

// ---- ready-made shapes, drawn by dragging from a to b -------------------------------------------------------------

export type ShapeGeom =
  | { kind: 'poly'; points: Point[]; closed: boolean }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'arrow'; shaft: [Point, Point]; head: [Point, Point, Point] };

export function shapeGeometry(tool: ShapeTool, a: Point, b: Point, lineWidth = 4): ShapeGeom {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  switch (tool) {
    case 'line':
      return { kind: 'poly', points: [a, b], closed: false };
    case 'rect':
      return { kind: 'poly', points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true };
    case 'ellipse':
      return { kind: 'ellipse', cx, cy, rx: (x1 - x0) / 2, ry: (y1 - y0) / 2 };
    case 'triangle':
      return { kind: 'poly', points: [{ x: cx, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], closed: true };
    case 'star':
      return { kind: 'poly', points: starPoints(cx, cy, (x1 - x0) / 2, (y1 - y0) / 2), closed: true };
    case 'arrow': {
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const head = Math.min(len * 0.45, Math.max(14, lineWidth * 4));
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const wing = (turn: number): Point => ({ x: b.x - head * Math.cos(angle + turn), y: b.y - head * Math.sin(angle + turn) });
      return { kind: 'arrow', shaft: [a, b], head: [wing(0.5), b, wing(-0.5)] };
    }
  }
}

// A five-pointed star in a box: ten points, the first at the top, the inner points at 0.45 of the outer.
export function starPoints(cx: number, cy: number, rx: number, ry: number, inner = 0.45): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const k = i % 2 === 0 ? 1 : inner;
    out.push({ x: cx + rx * k * Math.cos(angle), y: cy + ry * k * Math.sin(angle) });
  }
  return out;
}

// ---- the fill bucket ---------------------------------------------------------------------------------------------

export type Rgba = [number, number, number, number];
export function hexToRgba(hex: string, alpha = 255): Rgba {
  const h = isHexColour(hex) ? hex : '#000000';
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), alpha];
}

// Fills the area around (x, y) whose colour is within `tolerance` (0 to 255 on each channel, alpha included) of the
// colour there, with `rgba`, in place. A scanline fill with its own stack and a mark per pixel, so each pixel is looked
// at a bounded number of times: it cannot hang on a large drawing. `maxPixels` caps the area (the whole drawing by
// default); `stopped` says the cap was reached. Fully see-through pixels count as one colour whatever their RGB.
export type FillResult = { filled: number; stopped: boolean };
// C513: `read`, when given, is what the fill looks at to find its edges (the drawing with a template's outline over it),
// while the colour still goes into `data` (the drawing alone): the outline stops the paint and is never painted on.
export function floodFill(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, rgba: Rgba, tolerance = 40, maxPixels = width * height, read: Uint8ClampedArray = data): FillResult {
  const sx = Math.floor(x);
  const sy = Math.floor(y);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height || data.length < width * height * 4 || read.length < width * height * 4) return { filled: 0, stopped: false };
  const s = (sy * width + sx) * 4;
  const seed: Rgba = [read[s], read[s + 1], read[s + 2], read[s + 3]];
  const tol = Math.max(0, Math.min(255, tolerance));
  const same = (i: number) => {
    const a = read[i + 3];
    if (seed[3] === 0 && a === 0) return true;
    return Math.abs(read[i] - seed[0]) <= tol && Math.abs(read[i + 1] - seed[1]) <= tol && Math.abs(read[i + 2] - seed[2]) <= tol && Math.abs(a - seed[3]) <= tol;
  };
  // Filling with the colour already there changes nothing.
  if (seed[0] === rgba[0] && seed[1] === rgba[1] && seed[2] === rgba[2] && seed[3] === rgba[3]) return { filled: 0, stopped: false };
  const done = new Uint8Array(width * height);
  const stack: number[] = [sx, sy];
  let filled = 0;
  while (stack.length > 0) {
    const py = stack.pop()!;
    const px = stack.pop()!;
    if (done[py * width + px] || !same((py * width + px) * 4)) continue;
    let lx = px;
    while (lx > 0 && !done[py * width + lx - 1] && same((py * width + lx - 1) * 4)) lx--;
    let rx = px;
    while (rx < width - 1 && !done[py * width + rx + 1] && same((py * width + rx + 1) * 4)) rx++;
    for (let cx = lx; cx <= rx; cx++) {
      const k = py * width + cx;
      if (done[k]) continue;
      done[k] = 1;
      const i = k * 4;
      data[i] = rgba[0];
      data[i + 1] = rgba[1];
      data[i + 2] = rgba[2];
      data[i + 3] = rgba[3];
      if (++filled >= maxPixels) return { filled, stopped: true };
    }
    // One seed per run of fillable pixels above and below.
    for (const ny of [py - 1, py + 1]) {
      if (ny < 0 || ny >= height) continue;
      let inRun = false;
      for (let cx = lx; cx <= rx; cx++) {
        const k = ny * width + cx;
        const ok = !done[k] && same(k * 4);
        if (ok && !inRun) stack.push(cx, ny);
        inRun = ok;
      }
    }
  }
  return { filled, stopped: false };
}

// ---- undo and redo -----------------------------------------------------------------------------------------------

// The history keeps the last `cap` steps as steps; an older one is "baked" into the picture underneath (the caller
// draws it there and forgets it), so memory stays bounded however long the child draws. `weight` adds a second bound:
// the steps' total weight (for a stroke, its points) stays under `maxWeight`, baking the oldest first.
export const UNDO_STEPS = 40;
export const MAX_HISTORY_WEIGHT = 200_000;
export type History<T> = { done: T[]; undone: T[] };
export const emptyHistory = <T>(): History<T> => ({ done: [], undone: [] });

export function record<T>(h: History<T>, step: T, cap = UNDO_STEPS, weight: (s: T) => number = () => 1, maxWeight = MAX_HISTORY_WEIGHT): { history: History<T>; baked: T[] } {
  const done = [...h.done, step];
  const baked: T[] = [];
  let total = done.reduce((n, s) => n + weight(s), 0);
  while (done.length > 1 && (done.length > cap || total > maxWeight)) {
    const old = done.shift()!;
    total -= weight(old);
    baked.push(old);
  }
  return { history: { done, undone: [] }, baked };
}
export function undoStep<T>(h: History<T>): History<T> {
  if (h.done.length === 0) return h;
  return { done: h.done.slice(0, -1), undone: [...h.undone, h.done[h.done.length - 1]] };
}
export function redoStep<T>(h: History<T>): History<T> {
  if (h.undone.length === 0) return h;
  return { done: [...h.done, h.undone[h.undone.length - 1]], undone: h.undone.slice(0, -1) };
}

// ---- the paper ---------------------------------------------------------------------------------------------------

export const PAPERS = ['plain', 'ruled', 'squares', 'dots'] as const;
export type Paper = (typeof PAPERS)[number];
export const isPaper = (v: unknown): v is Paper => (PAPERS as readonly unknown[]).includes(v);
// The paper's printed lines, in drawing pixels: `unit` is the gap (about 32 CSS px times the drawing's scale). Ruled
// paper has a margin line; dots are bounded so a huge drawing cannot ask for millions.
export type PaperLines = { lines: [Point, Point][]; margin: [Point, Point] | null; dots: Point[] };
export const MAX_PAPER_DOTS = 12_000;
export function paperLines(paper: Paper, width: number, height: number, unit: number): PaperLines {
  const out: PaperLines = { lines: [], margin: null, dots: [] };
  const gap = Math.max(4, unit);
  if (paper === 'ruled') {
    for (let y = gap * 1.5; y < height; y += gap) out.lines.push([{ x: 0, y }, { x: width, y }]);
    out.margin = [{ x: gap * 1.5, y: 0 }, { x: gap * 1.5, y: height }];
  } else if (paper === 'squares') {
    const g = gap * 0.75;
    for (let y = g; y < height; y += g) out.lines.push([{ x: 0, y }, { x: width, y }]);
    for (let x = g; x < width; x += g) out.lines.push([{ x, y: 0 }, { x, y: height }]);
  } else if (paper === 'dots') {
    let g = gap * 0.75;
    while ((width / g) * (height / g) > MAX_PAPER_DOTS) g *= 1.25;
    for (let y = g; y < height; y += g) for (let x = g; x < width; x += g) out.dots.push({ x, y });
  }
  return out;
}

// ---- sizes -------------------------------------------------------------------------------------------------------

// The drawing's own pixels: the canvas' box at the screen's pixel ratio (at most 2), then made smaller if it would be
// over DRAWING_MAX_PIXELS (memory for the drawing, the undo picture and the fill bucket). `scale`: drawing pixels per
// CSS pixel, so a size of 10 is 10 CSS px on screen.
export const DRAWING_MAX_PIXELS = 2_400_000;
export function drawingSize(cssWidth: number, cssHeight: number, dpr: number): { width: number; height: number; scale: number } {
  const w = Math.max(1, cssWidth);
  const h = Math.max(1, cssHeight);
  let scale = Math.min(Math.max(dpr || 1, 1), 2);
  if (w * scale * h * scale > DRAWING_MAX_PIXELS) scale = Math.sqrt(DRAWING_MAX_PIXELS / (w * h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}

// A picture's size inside a longest side of `max`, keeping its shape; never larger than it is.
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const k = Math.min(1, max / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

// The picture sent to the tutor: at most 1600 px on its longest side (enough to read a child's labels; far under the
// file door's limit for a PNG of a drawing). If it is still over the limit it is made again, smaller.
export const SEND_MAX_SIDE = 1600;
export const MIN_EXPORT_SCALE = 0.25;

// A PNG over the file door's limit is made again, smaller. A PNG's size follows its pixel count, so the next scale is
// the current one times the square root of limit / size, with a margin; never above three quarters of the current
// scale, never below MIN_EXPORT_SCALE. null: it fits already, or there is nowhere smaller to go.
export function smallerScale(bytes: number, limit: number, scale: number): number | null {
  if (bytes <= limit || scale <= MIN_EXPORT_SCALE) return null;
  const next = scale * Math.sqrt(limit / bytes) * 0.85;
  return Math.max(MIN_EXPORT_SCALE, Math.min(next, scale * 0.75));
}

// ---- text and stickers -------------------------------------------------------------------------------------------

export const TEXT_MAX = 40;
// The text's height from the stroke size: from 18 px (size 2) to 74 px (size 30), in CSS px.
export const textPx = (size: number): number => Math.round(14 + size * 2);
export const STICKER_MIN = 40;
export const STICKER_MAX = 480;
export const STICKER_START = 120;
export const clampSticker = (size: number): number => Math.min(STICKER_MAX, Math.max(STICKER_MIN, Math.round(size)));

// ---- drawings kept on the device ---------------------------------------------------------------------------------

// At most DRAWINGS_CAP drawings in My drawings. Full: nothing is removed by itself; the oldest is shown so the child
// can delete it (or overwrite the drawing that is open).
export const DRAWINGS_CAP = 40;
export type DrawingMeta = { id: string; name: string; updatedAt: number };
export const canSave = (count: number, replacing: boolean, cap = DRAWINGS_CAP): boolean => replacing || count < cap;
export const oldestFirst = <T extends DrawingMeta>(list: readonly T[]): T[] => [...list].sort((a, b) => a.updatedAt - b.updatedAt);
export const newestFirst = <T extends DrawingMeta>(list: readonly T[]): T[] => [...list].sort((a, b) => b.updatedAt - a.updatedAt);
// A copy's name: the name and the next free number ("Cat 2", "Cat 3").
export function copyName(name: string, taken: readonly string[]): string {
  const base = name.replace(/\s+\d+$/, '').trim() || name;
  for (let n = 2; n < 1000; n++) {
    const next = `${base} ${n}`;
    if (!taken.includes(next)) return next;
  }
  return base;
}
export const NAME_MAX = 40;
export const cleanName = (raw: string): string => raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

// ---- download ----------------------------------------------------------------------------------------------------

// Where Download goes: the phone's share sheet when it can share a file (the child saves it to Files or Photos), a
// plain download link in a browser, and nothing in the Android app's web view (it has neither: a blob link opens
// nothing there), where the button is hidden and a line says why.
export type DownloadRoute = 'share' | 'link' | 'none';
export function downloadRoute(env: { inApp: boolean; shareFiles: boolean }): DownloadRoute {
  if (env.shareFiles) return 'share';
  return env.inApp ? 'none' : 'link';
}
// The Android app names itself in its user agent (capacitor.config.json appendUserAgent).
export const inFamilyApp = (userAgent: string): boolean => /NetCyberAIFamily\//.test(userAgent);
