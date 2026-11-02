// The child's sketch pad (W18-P3): the stroke model, kept apart from the canvas so it can be tested without one (jsdom
// has no canvas). Points are fractions of the paper's width and height (0 to 1), so the same strokes are redrawn at any
// screen size and exported at any scale.

import { colors, deepColors, lessonColors } from '@/lib/design-tokens';

export type SketchColour = 'ink' | 'blue' | 'coral';
export type SketchTool = 'pen' | 'eraser';
export type Point = { x: number; y: number };
export type Stroke = { tool: SketchTool; colour: SketchColour; points: Point[] };

// The family colours (design tokens only). Coral is the deep variant: it stays readable on white paper (6.57:1).
export const SKETCH_COLOURS: Record<SketchColour, string> = { ink: lessonColors.ink, blue: colors.royal, coral: deepColors.coralDeep };
// White paper; the eraser paints it, so an erased stroke is simply covered and undo still removes strokes in order.
export const PAPER = 'white';
// Line widths as a fraction of the paper's width (about 3 px and 16 px on a 390 px phone).
export const PEN_WIDTH = 0.008;
export const ERASER_WIDTH = 0.04;
// 4:3 paper; the PNG is 1200 px wide at full scale.
export const PAPER_RATIO = 3 / 4;
export const EXPORT_WIDTH = 1200;
export const MIN_EXPORT_SCALE = 0.25;

// A stroke needs at least one point; a tap makes a dot.
export const addStroke = (strokes: readonly Stroke[], s: Stroke): Stroke[] => (s.points.length > 0 ? [...strokes, s] : [...strokes]);
export const undo = (strokes: readonly Stroke[]): Stroke[] => strokes.slice(0, -1);
export const clear = (): Stroke[] => [];
// Nothing to send until the pen has made a mark (the eraser alone leaves blank paper).
export const isBlank = (strokes: readonly Stroke[]): boolean => !strokes.some((s) => s.tool === 'pen');

// What the canvas draws, in order, in pixels of a paper `width` x `height`: a dot for a single point, a line through the
// points otherwise. The canvas code only follows this list.
export type DrawOp = { kind: 'dot'; at: Point; colour: string; width: number } | { kind: 'line'; points: Point[]; colour: string; width: number };

export function redrawList(strokes: readonly Stroke[], width: number, height: number): DrawOp[] {
  return strokes.map((s): DrawOp => {
    const colour = s.tool === 'eraser' ? PAPER : SKETCH_COLOURS[s.colour];
    const w = (s.tool === 'eraser' ? ERASER_WIDTH : PEN_WIDTH) * width;
    const points = s.points.map((p) => ({ x: p.x * width, y: p.y * height }));
    return points.length === 1 ? { kind: 'dot', at: points[0], colour, width: w } : { kind: 'line', points, colour, width: w };
  });
}

// The svg-style path of each stroke (M x y L x y ...); a dot is a zero-length line.
export function strokesToPaths(strokes: readonly Stroke[], width: number, height: number): string[] {
  return redrawList(strokes, width, height).map((op) => {
    const pts = op.kind === 'dot' ? [op.at, op.at] : op.points;
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`).join(' ');
  });
}

// The size of the exported picture at a scale (1 = full).
export function exportSize(scale: number): { width: number; height: number } {
  const width = Math.max(1, Math.round(EXPORT_WIDTH * scale));
  return { width, height: Math.round(width * PAPER_RATIO) };
}

// A PNG over the file door's limit is made again, smaller, once. A PNG's size follows its pixel count, so the next scale
// is the current one times the square root of limit / size, with a margin; never above three quarters of the current
// scale, never below MIN_EXPORT_SCALE. null: it fits already, or there is nowhere smaller to go.
export function smallerScale(bytes: number, limit: number, scale: number): number | null {
  if (bytes <= limit || scale <= MIN_EXPORT_SCALE) return null;
  const next = scale * Math.sqrt(limit / bytes) * 0.85;
  return Math.max(MIN_EXPORT_SCALE, Math.min(next, scale * 0.75));
}
