// The drawing studio's canvas code (C510; the art table's brushes and paper, C513): how each step is painted on a
// Canvas 2D context. The maths (ink, smoothing, shapes, fill, paper, the brush model) is src/lib/family/sketch.ts and
// src/lib/family/draw-brush.ts; this file only follows it. Plain Canvas 2D, no library.

import { floodFill, hexToRgba, paperLines, shapeGeometry, textPx, type FreehandTool, type Paper, type Point, type ShapeTool } from '@/lib/family/sketch';
import { BRUSH_LOOK, catmullRom, grainTile, ribbonBounds, ribbonPieces, type RibbonPoint } from '@/lib/family/draw-brush';
import { STICKER_BOX, STICKER_LINE, stickerById } from '@/lib/family/sketch-stickers';
import { lessonColors } from '@/lib/design-tokens';

// A sticker stuck down: its centre, side and turn (radians), in drawing pixels.
export type StuckSticker = { id: string; at: Point; px: number; rot: number };

// One step of a drawing, in the drawing's own pixels. `size` is already in drawing pixels. An ink step's points carry
// their width (the brush model's ribbon); `fill` may read edges from a template's outline (`edges`).
export type Step =
  | { k: 'ink'; tool: FreehandTool; colour: string; size: number; points: RibbonPoint[] }
  | { k: 'shape'; tool: ShapeTool; colour: string; size: number; a: Point; b: Point }
  | { k: 'fill'; colour: string; at: Point }
  | { k: 'text'; colour: string; size: number; text: string; at: Point }
  | { k: 'stickers'; items: StuckSticker[] }
  | { k: 'clear' };

// A step's weight for the undo history's memory bound: a stroke weighs its points.
export const stepWeight = (s: Step): number => (s.k === 'ink' ? s.points.length : s.k === 'stickers' ? s.items.length : 1);
// Whether a step puts colour on the paper (the eraser and Clear do not).
export const inks = (s: Step): boolean => !(s.k === 'clear' || (s.k === 'ink' && s.tool === 'eraser'));

type Ctx = CanvasRenderingContext2D;

// ---- the paper ---------------------------------------------------------------------------------------------------

// Not flat white: a warm sheet with a fine tooth (a tile of specks from a fixed seed) and two or three faint washes,
// drawn here, so no picture file is loaded. Its own canvas, so the eraser and the fill never touch it.
const PAPER_FILL = '#FFFCF6';
const PAPER_LINE = '#B9CCE0';
const PAPER_MARGIN = '#F2A7A0';
const WASHES = ['rgba(169, 214, 245, 0.16)', 'rgba(255, 231, 163, 0.22)', 'rgba(217, 204, 246, 0.14)'];

let toothTile: HTMLCanvasElement | null = null;
function tooth(): HTMLCanvasElement | null {
  if (toothTile || typeof document === 'undefined') return toothTile;
  const size = 96;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  const g = grainTile(size, 31, 0.35);
  for (let i = 0; i < g.length; i++) {
    img.data[i * 4] = 120;
    img.data[i * 4 + 1] = 100;
    img.data[i * 4 + 2] = 80;
    img.data[i * 4 + 3] = Math.round(g[i] * 26);
  }
  ctx.putImageData(img, 0, 0);
  toothTile = c;
  return c;
}

export function paintPaper(ctx: Ctx, paper: Paper, width: number, height: number, unit: number) {
  ctx.save();
  ctx.fillStyle = PAPER_FILL;
  ctx.fillRect(0, 0, width, height);
  // The washes: large soft blooms at fixed places (a share of the sheet), so a saved drawing reopens on the same paper.
  const spots: [number, number, number][] = [
    [0.15, 0.2, 0.55],
    [0.85, 0.75, 0.6],
    [0.6, 0.1, 0.4],
  ];
  spots.forEach(([fx, fy, fr], i) => {
    const r = Math.max(width, height) * fr;
    const g = ctx.createRadialGradient(width * fx, height * fy, 0, width * fx, height * fy, r);
    g.addColorStop(0, WASHES[i % WASHES.length]);
    g.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  });
  const t = tooth();
  const pattern = t ? ctx.createPattern(t, 'repeat') : null;
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, width, height);
  }
  const p = paperLines(paper, width, height, unit);
  ctx.lineWidth = Math.max(1, unit / 32);
  ctx.strokeStyle = PAPER_LINE;
  ctx.beginPath();
  for (const [a, b] of p.lines) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  if (p.margin) {
    ctx.strokeStyle = PAPER_MARGIN;
    ctx.beginPath();
    ctx.moveTo(p.margin[0].x, p.margin[0].y);
    ctx.lineTo(p.margin[1].x, p.margin[1].y);
    ctx.stroke();
  }
  if (p.dots.length) {
    ctx.fillStyle = PAPER_LINE;
    const r = Math.max(1.2, unit / 18);
    ctx.beginPath();
    for (const d of p.dots) {
      ctx.moveTo(d.x + r, d.y);
      ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.restore();
}

// ---- the ribbon --------------------------------------------------------------------------------------------------

// The ribbon's discs and joining quadrilaterals as one path, filled once (non-zero), so overlaps never darken.
export function traceRibbon(ctx: Ctx | Path2D, beads: readonly RibbonPoint[], widthK = 1) {
  for (const piece of ribbonPieces(widthK === 1 ? beads : beads.map((p) => ({ ...p, w: p.w * widthK })))) {
    if (piece.kind === 'disc') {
      ctx.moveTo(piece.x + piece.r, piece.y);
      ctx.arc(piece.x, piece.y, piece.r, 0, Math.PI * 2);
    } else {
      const [a, b, c, d] = piece.pts;
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(d[0], d[1]);
      ctx.closePath();
    }
  }
}

// The tooth a crayon or a pencil leaves: specks of the paper showing through (destination-out), from a fixed tile.
const grains = new Map<number, HTMLCanvasElement>();
function grainCanvas(strength: number): HTMLCanvasElement | null {
  const key = Math.round(strength * 100);
  const have = grains.get(key);
  if (have || typeof document === 'undefined') return have ?? null;
  const size = 48;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  const g = grainTile(size, 7, 0.5);
  for (let i = 0; i < g.length; i++) img.data[i * 4 + 3] = Math.round(g[i] * strength * 255);
  ctx.putImageData(img, 0, 0);
  grains.set(key, c);
  return c;
}

// Whether this canvas can blur while drawing (ctx.filter): where it cannot, the watercolour stays an even wash.
let filterOk: boolean | null = null;
function canFilter(ctx: Ctx): boolean {
  if (filterOk !== null) return filterOk;
  try {
    const before = ctx.filter;
    ctx.filter = 'blur(1px)';
    filterOk = ctx.filter === 'blur(1px)';
    ctx.filter = before;
  } catch {
    filterOk = false;
  }
  return filterOk;
}

function offscreen(w: number, h: number): { c: HTMLCanvasElement; ctx: Ctx } | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  return ctx ? { c, ctx } : null;
}

// One stroke, as the tool lays it. Samples: the Catmull-Rom curve through the stroke's kept points.
export function paintRibbon(ctx: Ctx, tool: FreehandTool, colour: string, points: readonly RibbonPoint[], per = 4) {
  const look = BRUSH_LOOK[tool];
  const beads = catmullRom(points, per);
  if (beads.length === 0) return;
  ctx.save();
  if (look.erase) {
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    traceRibbon(ctx, beads);
    ctx.fill();
    ctx.restore();
    return;
  }
  if (look.wash || look.grain > 0) {
    // Laid on a small sheet of its own, then put down at the tool's see-through.
    const maxW = beads.reduce((m, p) => Math.max(m, p.w), 1);
    const b = ribbonBounds(beads, maxW);
    const off = b ? offscreen(b.w, b.h) : null;
    if (b && off) {
      off.ctx.translate(-b.x, -b.y);
      off.ctx.fillStyle = colour;
      off.ctx.beginPath();
      traceRibbon(off.ctx, beads);
      off.ctx.fill();
      if (look.wash && canFilter(off.ctx)) {
        // Watercolour: the middle thins out and the edge keeps its pigment, as paint drying on paper.
        off.ctx.globalCompositeOperation = 'destination-out';
        off.ctx.globalAlpha = 0.55;
        off.ctx.filter = `blur(${Math.max(1, maxW * 0.22)}px)`;
        off.ctx.beginPath();
        traceRibbon(off.ctx, beads, 0.55);
        off.ctx.fill();
        off.ctx.filter = 'none';
      }
      const grain = look.grain > 0 ? grainCanvas(look.grain) : null;
      const pattern = grain ? off.ctx.createPattern(grain, 'repeat') : null;
      if (pattern) {
        off.ctx.globalCompositeOperation = 'destination-out';
        off.ctx.globalAlpha = 1;
        off.ctx.fillStyle = pattern;
        off.ctx.fillRect(b.x, b.y, b.w, b.h);
      }
      ctx.globalAlpha = look.alpha;
      ctx.drawImage(off.c, b.x, b.y);
      ctx.restore();
      return;
    }
  }
  ctx.globalAlpha = look.alpha;
  ctx.fillStyle = colour;
  if (look.soft > 0) {
    const maxW = beads.reduce((m, p) => Math.max(m, p.w), 1);
    ctx.shadowBlur = maxW * look.soft;
    ctx.shadowColor = colour;
  }
  ctx.beginPath();
  traceRibbon(ctx, beads);
  ctx.fill();
  ctx.restore();
}

// The live stroke on the top canvas: drawn whole each frame at full strength (the top canvas itself carries the tool's
// see-through as CSS opacity, liveOpacity), so a frame costs one fill, however the tool looks once it is put down.
export function paintLive(ctx: Ctx, tool: FreehandTool, colour: string, points: readonly RibbonPoint[]) {
  const look = BRUSH_LOOK[tool];
  const beads = catmullRom(points, 2);
  if (beads.length === 0) return;
  ctx.save();
  ctx.fillStyle = colour;
  ctx.beginPath();
  traceRibbon(ctx, beads);
  ctx.fill();
  if (look.grain > 0) {
    const grain = grainCanvas(look.grain);
    const pattern = grain ? ctx.createPattern(grain, 'repeat') : null;
    const b = ribbonBounds(beads, 2);
    if (pattern && b) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = pattern;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
  }
  ctx.restore();
}
export const liveOpacity = (tool: FreehandTool): number => BRUSH_LOOK[tool].alpha;

// ---- stickers ------------------------------------------------------------------------------------------------------

export function paintSticker(ctx: Ctx, id: string, at: Point, px: number, rot = 0) {
  const sticker = stickerById(id);
  if (!sticker || typeof Path2D === 'undefined') return;
  const k = px / STICKER_BOX;
  ctx.save();
  ctx.translate(at.x, at.y);
  if (rot) ctx.rotate(rot);
  ctx.translate(-px / 2, -px / 2);
  ctx.scale(k, k);
  ctx.lineWidth = STICKER_LINE;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = lessonColors.ink;
  for (const part of sticker.parts) {
    const path = new Path2D(part.d);
    if (part.fill) {
      ctx.fillStyle = part.fill;
      ctx.fill(path);
    }
    ctx.stroke(path);
  }
  ctx.restore();
}

// ---- one step ------------------------------------------------------------------------------------------------------

// Paints one step. Returns false only when a fill reached its bound (the studio says so). `edges`: for a fill, the
// template's outline drawn over the drawing, which stops the paint (floodFill's `read`).
export function paintStep(ctx: Ctx, step: Step, width: number, height: number, edges?: (data: ImageData) => Uint8ClampedArray | null): boolean {
  ctx.save();
  ctx.lineJoin = 'round';
  let whole = true;
  switch (step.k) {
    case 'ink':
      paintRibbon(ctx, step.tool, step.colour, step.points);
      break;
    case 'shape': {
      const g = shapeGeometry(step.tool, step.a, step.b, step.size);
      ctx.strokeStyle = step.colour;
      ctx.lineWidth = step.size;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (g.kind === 'ellipse') ctx.ellipse(g.cx, g.cy, Math.max(0.5, g.rx), Math.max(0.5, g.ry), 0, 0, Math.PI * 2);
      else if (g.kind === 'arrow') {
        ctx.moveTo(g.shaft[0].x, g.shaft[0].y);
        ctx.lineTo(g.shaft[1].x, g.shaft[1].y);
        ctx.moveTo(g.head[0].x, g.head[0].y);
        ctx.lineTo(g.head[1].x, g.head[1].y);
        ctx.lineTo(g.head[2].x, g.head[2].y);
      } else {
        g.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        if (g.closed) ctx.closePath();
      }
      ctx.stroke();
      break;
    }
    case 'fill': {
      const img = ctx.getImageData(0, 0, width, height);
      const read = edges?.(img) ?? undefined;
      const r = floodFill(img.data, width, height, step.at.x, step.at.y, hexToRgba(step.colour), 48, width * height, read);
      ctx.putImageData(img, 0, 0);
      whole = !r.stopped;
      break;
    }
    case 'text': {
      ctx.fillStyle = step.colour;
      ctx.font = `700 ${step.size}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Devanagari", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(step.text, step.at.x, step.at.y);
      break;
    }
    case 'stickers':
      for (const s of step.items) paintSticker(ctx, s.id, s.at, s.px, s.rot);
      break;
    case 'clear':
      ctx.clearRect(0, 0, width, height);
      break;
  }
  ctx.restore();
  return whole;
}

// The text step's size in drawing pixels for a stroke size (CSS px) at the drawing's scale.
export const textSize = (size: number, scale: number): number => textPx(size) * scale;
