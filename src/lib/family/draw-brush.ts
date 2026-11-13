// The art table's brush (C513): how a finger or a stylus becomes a soft, variable-width line. Plain data in, plain data
// out, so it is tested without a canvas. A stroke's raw points pass a stabiliser (each kept point moves part of the way
// towards the finger, a small lag that irons out a shaky hand), then a Catmull-Rom curve through the kept points makes
// the beads the ribbon is filled along. The width at each bead comes from the pen's pressure when the device
// reports it (a stylus), otherwise from the speed (slower is thicker), eased so it never jumps.

export type BrushTool = 'pencil' | 'brush' | 'marker' | 'highlighter' | 'crayon' | 'watercolour' | 'eraser';
export const BRUSH_TOOLS: readonly BrushTool[] = ['pencil', 'brush', 'marker', 'highlighter', 'crayon', 'watercolour', 'eraser'];
export const isBrushTool = (t: string): t is BrushTool => (BRUSH_TOOLS as readonly string[]).includes(t);

// One raw bead from a pointer: drawing pixels, a time in ms, and the pen's pressure when it is a stylus.
export type RawPoint = { x: number; y: number; t: number; pressure?: number; pen?: boolean };
// One point of the ribbon: where, and how wide there (drawing pixels).
export type RibbonPoint = { x: number; y: number; w: number };

// How each tool lays its ink. `widthK`: the line's width as a share of the chosen size. `speedK`: how much speed thins
// it (0: none). `pressureK`: how much a stylus's pressure changes it. `alpha`: see-through; `soft`: a blur at the edge
// (a share of the width); `grain`: a paper-tooth texture (crayon, pencil); `wash`: transparent with darker edges.
export type BrushLook = { widthK: number; speedK: number; pressureK: number; alpha: number; soft: number; grain: number; wash: boolean; erase: boolean; minK: number };
export const BRUSH_LOOK: Readonly<Record<BrushTool, BrushLook>> = {
  pencil: { widthK: 0.7, speedK: 0.25, pressureK: 0.8, alpha: 0.92, soft: 0, grain: 0.25, wash: false, erase: false, minK: 0.5 },
  brush: { widthK: 1.4, speedK: 0.55, pressureK: 1, alpha: 0.9, soft: 0.35, grain: 0, wash: false, erase: false, minK: 0.35 },
  marker: { widthK: 1.5, speedK: 0.15, pressureK: 0.3, alpha: 1, soft: 0, grain: 0, wash: false, erase: false, minK: 0.8 },
  highlighter: { widthK: 2.6, speedK: 0, pressureK: 0, alpha: 0.35, soft: 0, grain: 0, wash: false, erase: false, minK: 1 },
  crayon: { widthK: 1.6, speedK: 0.2, pressureK: 0.6, alpha: 0.95, soft: 0, grain: 0.55, wash: false, erase: false, minK: 0.6 },
  watercolour: { widthK: 2.2, speedK: 0.5, pressureK: 0.9, alpha: 0.5, soft: 0.2, grain: 0, wash: true, erase: false, minK: 0.4 },
  eraser: { widthK: 2.5, speedK: 0, pressureK: 0, alpha: 1, soft: 0, grain: 0, wash: false, erase: true, minK: 1 },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// A stylus's pressure is trusted only from a pen that reports more than nothing: a mouse says 0.5 while pressed and a
// finger 0 or 1 on most phones, which would make every line the same.
export function usablePressure(p: RawPoint): number | null {
  if (!p.pen || typeof p.pressure !== 'number' || !Number.isFinite(p.pressure) || p.pressure <= 0) return null;
  return clamp(p.pressure, 0, 1);
}

// The width a bead asks for (before easing). `size` is the chosen size in drawing pixels; `speed` is drawing pixels
// per ms divided by the drawing's scale (so it reads as CSS px per ms on every screen).
export function targetWidth(tool: BrushTool, size: number, speed: number, pressure: number | null): number {
  const look = BRUSH_LOOK[tool];
  const base = Math.max(1, size * look.widthK);
  let k: number;
  if (pressure !== null && look.pressureK > 0) {
    // A feather touch is thinner, a firm press a little thicker (0.4 to 1.3 of the base for a tool that listens fully).
    k = 1 + look.pressureK * (pressure - 0.7);
  } else {
    // A slow line is thicker (up to 1.25), a fast flick thinner; speeds above about 2.5 px/ms change nothing more.
    k = 1.25 - look.speedK * clamp(speed, 0, 2.5) * 0.6;
  }
  return base * clamp(k, look.minK, 1.35);
}

// The width eases towards what each bead asks for, so a sudden change of speed makes a taper, not a step.
export const WIDTH_EASE = 0.35;
export const easeWidth = (prev: number, target: number, k = WIDTH_EASE): number => prev + (target - prev) * k;

// The stabiliser: the kept point follows the finger by `pull` of the way (1: no lag). 0.5 is a small lag that a child
// does not feel and that removes most of the shake. A point that moved less than `min` from the last kept one is
// dropped (it would add weight and no shape).
export const STABILISER_PULL = 0.5;
export type Stab = { x: number; y: number; t: number; w: number };
export function stabilise(last: Stab | null, raw: RawPoint, width: number, pull = STABILISER_PULL): Stab {
  if (!last) return { x: raw.x, y: raw.y, t: raw.t, w: width };
  return { x: last.x + (raw.x - last.x) * pull, y: last.y + (raw.y - last.y) * pull, t: raw.t, w: width };
}

// Follows one stroke: feed raw points in, read the kept points out. Its own small state, so the studio and the tests
// drive it the same way.
export class StrokeBuilder {
  readonly tool: BrushTool;
  readonly size: number;
  readonly scale: number;
  points: RibbonPoint[] = [];
  private last: Stab | null = null;
  private lastRaw: RawPoint | null = null;
  private width = 0;
  private speed = 0;
  constructor(tool: BrushTool, size: number, scale = 1) {
    this.tool = tool;
    this.size = size;
    this.scale = Math.max(0.01, scale);
  }
  add(raw: RawPoint): boolean {
    const prev = this.lastRaw;
    // A browser can batch events with the same time stamp: at least 4 ms between two, and the speed itself eased, so
    // an uneven clock never makes the line's edge ripple.
    const dt = prev ? Math.max(4, raw.t - prev.t) : 16;
    const now = prev ? Math.hypot(raw.x - prev.x, raw.y - prev.y) / this.scale / dt : 0;
    this.speed = prev ? this.speed + (now - this.speed) * 0.3 : 0;
    const target = targetWidth(this.tool, this.size, this.speed, usablePressure(raw));
    this.width = this.points.length === 0 ? target : easeWidth(this.width, target);
    this.lastRaw = raw;
    const next = stabilise(this.last, raw, this.width);
    if (this.last && Math.hypot(next.x - this.last.x, next.y - this.last.y) < 0.75 * this.scale) {
      // Too close to keep, but the width still eases at the last kept point.
      this.points[this.points.length - 1] = { ...this.points[this.points.length - 1], w: this.width };
      return false;
    }
    this.last = next;
    this.points.push({ x: next.x, y: next.y, w: this.width });
    return true;
  }
  // The finger lifted: the line ends where it was, not where the lag had got to, with a short taper.
  finish(raw?: RawPoint): RibbonPoint[] {
    if (raw && this.last && Math.hypot(raw.x - this.last.x, raw.y - this.last.y) >= 0.75 * this.scale) this.points.push({ x: raw.x, y: raw.y, w: this.width * 0.8 });
    return this.points;
  }
}

// A Catmull-Rom curve through the kept points (centripetal-free, uniform: cheap and smooth enough at these spacings):
// `per` beads between each pair, widths blended the same way. One or two points come back as they are.
export function catmullRom(points: readonly RibbonPoint[], per = 4): RibbonPoint[] {
  if (points.length < 3 || per <= 1) return points.slice();
  const out: RibbonPoint[] = [points[0]];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 1; s <= per; s++) {
      const t = s / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), w: Math.max(0.5, p1.w + (p2.w - p1.w) * t) });
    }
  }
  return out;
}

// The ribbon as discs and the quadrilaterals between them (each joins the two discs' outer tangents). Filled as ONE path
// (non-zero), the overlaps do not darken: a see-through tool stays evenly see-through. `from` lets the live stroke add
// only its newest part each frame.
export type RibbonPiece = { kind: 'disc'; x: number; y: number; r: number } | { kind: 'quad'; pts: [number, number][] };
export function ribbonPieces(beads: readonly RibbonPoint[], from = 0): RibbonPiece[] {
  const out: RibbonPiece[] = [];
  const start = Math.max(0, Math.min(from, beads.length - 1));
  for (let i = start; i < beads.length; i++) {
    const p = beads[i];
    out.push({ kind: 'disc', x: p.x, y: p.y, r: Math.max(0.25, p.w / 2) });
    if (i === 0) continue;
    const a = beads[i - 1];
    const dx = p.x - a.x;
    const dy = p.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const nx = -dy / len;
    const ny = dx / len;
    const ra = a.w / 2;
    const rb = p.w / 2;
    // Wound the same way as the discs (clockwise on screen), so under the non-zero rule their overlaps add up and never
    // cancel into holes.
    out.push({ kind: 'quad', pts: [[a.x - nx * ra, a.y - ny * ra], [p.x - nx * rb, p.y - ny * rb], [p.x + nx * rb, p.y + ny * rb], [a.x + nx * ra, a.y + ny * ra]] });
  }
  return out;
}

// The box a ribbon covers (for drawing a wash or a crayon on a small offscreen canvas, not the whole page).
export function ribbonBounds(beads: readonly RibbonPoint[], pad = 2): { x: number; y: number; w: number; h: number } | null {
  if (beads.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of beads) {
    const r = p.w / 2 + pad;
    x0 = Math.min(x0, p.x - r);
    y0 = Math.min(y0, p.y - r);
    x1 = Math.max(x1, p.x + r);
    y1 = Math.max(y1, p.y + r);
  }
  const x = Math.floor(x0);
  const y = Math.floor(y0);
  return { x, y, w: Math.max(1, Math.ceil(x1) - x), h: Math.max(1, Math.ceil(y1) - y) };
}

// A stroke's weight for the undo history's memory bound, as C510's: its points.
export const strokeWeight = (points: readonly RibbonPoint[]): number => points.length;

// The paper-tooth grain, as numbers (0 to 1 alpha per cell of a small tile), from a fixed seed so every crayon line on
// every phone looks the same and a test can check it. A cheap hash, no Math.random.
export function grainTile(size = 48, seed = 7, density = 0.5): Float32Array {
  const out = new Float32Array(size * size);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < out.length; i++) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    const r = (s % 1000) / 1000;
    // Most cells keep their colour; a share (density) loses some of it, a few lose most: the paper showing through.
    out[i] = r < density ? (r / density) * 0.85 : 0;
  }
  return out;
}
