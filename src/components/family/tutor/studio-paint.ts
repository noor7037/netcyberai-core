// The drawing studio's canvas code (C510): how each step is painted on a Canvas 2D context. The maths (ink, smoothing,
// shapes, fill, paper) is src/lib/family/sketch.ts; this file only follows it. Plain Canvas 2D, no library.

import { floodFill, hexToRgba, inkStyle, paperLines, shapeGeometry, smoothPath, textPx, type FreehandTool, type Paper, type Point, type ShapeTool } from '@/lib/family/sketch';
import { STICKER_BOX, STICKER_LINE, stickerById } from '@/lib/family/sketch-stickers';
import { lessonColors } from '@/lib/design-tokens';

// One step of a drawing, in the drawing's own pixels. `size` is already in drawing pixels.
export type Step =
  | { k: 'ink'; tool: FreehandTool; colour: string; size: number; points: Point[] }
  | { k: 'shape'; tool: ShapeTool; colour: string; size: number; a: Point; b: Point }
  | { k: 'fill'; colour: string; at: Point }
  | { k: 'text'; colour: string; size: number; text: string; at: Point }
  | { k: 'sticker'; id: string; at: Point; px: number }
  | { k: 'clear' };

// A step's weight for the undo history's memory bound: a stroke weighs its points.
export const stepWeight = (s: Step): number => (s.k === 'ink' ? s.points.length : 1);
// Whether a step puts colour on the paper (the eraser and Clear do not).
export const inks = (s: Step): boolean => !(s.k === 'clear' || (s.k === 'ink' && s.tool === 'eraser'));

type Ctx = CanvasRenderingContext2D;

const PAPER_FILL = '#FFFFFF';
const PAPER_LINE = '#B9CCE0';
const PAPER_MARGIN = '#F2A7A0';

// The paper under the drawing (its own canvas, so the eraser and the fill bucket never touch the printed lines).
export function paintPaper(ctx: Ctx, paper: Paper, width: number, height: number, unit: number) {
  ctx.save();
  ctx.fillStyle = PAPER_FILL;
  ctx.fillRect(0, 0, width, height);
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

function tracePoints(ctx: Ctx, points: readonly Point[]) {
  const s = smoothPath(points);
  if (!s || s.kind === 'dot') return;
  ctx.moveTo(s.start.x, s.start.y);
  for (const c of s.curves) ctx.quadraticCurveTo(c.c.x, c.c.y, c.to.x, c.to.y);
}

export function paintSticker(ctx: Ctx, id: string, at: Point, px: number) {
  const sticker = stickerById(id);
  if (!sticker || typeof Path2D === 'undefined') return;
  const k = px / STICKER_BOX;
  ctx.save();
  ctx.translate(at.x - px / 2, at.y - px / 2);
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

// Paints one step. Returns false only when a fill reached its bound (the studio says so).
export function paintStep(ctx: Ctx, step: Step, width: number, height: number): boolean {
  ctx.save();
  ctx.lineJoin = 'round';
  let whole = true;
  switch (step.k) {
    case 'ink': {
      const st = inkStyle(step.tool, step.size);
      ctx.globalAlpha = st.alpha;
      ctx.globalCompositeOperation = st.erase ? 'destination-out' : 'source-over';
      ctx.strokeStyle = step.colour;
      ctx.fillStyle = step.colour;
      ctx.lineWidth = st.width;
      ctx.lineCap = st.cap;
      if (st.blur > 0) {
        ctx.shadowBlur = st.blur;
        ctx.shadowColor = step.colour;
      }
      if (step.points.length === 1) {
        const p = step.points[0];
        ctx.beginPath();
        if (st.cap === 'round') ctx.arc(p.x, p.y, st.width / 2, 0, Math.PI * 2);
        else ctx.rect(p.x - st.width / 2, p.y - st.width / 2, st.width, st.width);
        ctx.fill();
      } else {
        ctx.beginPath();
        tracePoints(ctx, step.points);
        ctx.stroke();
      }
      break;
    }
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
      const r = floodFill(img.data, width, height, step.at.x, step.at.y, hexToRgba(step.colour), 48);
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
    case 'sticker':
      paintSticker(ctx, step.id, step.at, step.px);
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
