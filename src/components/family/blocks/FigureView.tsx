'use client';

import type { Figure, FigureAt, FigureShape } from '@/lib/family/blocks';
import { colors, deepColors, lessonColors } from '@/lib/design-tokens';
import { Card } from './BlockViews';

// A labelled schematic (W9-C, docs/39 §3), drawn by our own code from checked data: one of five shapes (circle, ring,
// cell, layered, orbit) as a clean two-tone drawing, and 2 to 6 labels, each pointing at the part of the shape its `at`
// names. Nothing is generated and no library is used; the labels are shown as text by React.
//   - From 640 px: the labels sit in a column either side of the shape, each joined to its point by a callout line.
//   - Under 640 px (390 first): the shape carries numbered points, and the labels are a numbered list under it, so the
//     words stay full size at any width. The list is also what a screen reader hears, at every width.
// Logo tokens only, no gradients, and no motion of its own (the card's rise is off under prefers-reduced-motion).

const INK = colors.slate;
const LINE = lessonColors.plum;
const TONE_A = lessonColors.plum;
const TONE_B = colors.emerald;

// The drawing's centre and size, in the wide picture's units (the narrow picture is the same drawing, cropped).
const W = 520;
const H = 300;
const CX = W / 2;
const CY = H / 2;
const R = 82;
const BOX_W = 132;
const LINE_H = 15;
const CHARS = 18;

export type Point = { x: number; y: number };

// Where on each shape a label's `at` points; a second label with the same `at` moves a little along the outline.
export function anchor(shape: FigureShape, at: FigureAt, k = 0): Point {
  const wide = shape === 'cell' || shape === 'orbit' ? 1.3 : shape === 'layered' ? 1.1 : 1;
  const tall = shape === 'cell' ? 0.92 : shape === 'orbit' ? 0.82 : shape === 'layered' ? 0.92 : 1;
  const shift = k * 14;
  switch (at) {
    case 'centre':
      return { x: CX + shift, y: CY + shift / 2 };
    case 'top':
      return { x: CX + shift, y: CY - R * tall * (shape === 'layered' ? 0.7 : 0.82) };
    case 'bottom':
      return { x: CX + shift, y: CY + R * tall * (shape === 'layered' ? 0.7 : 0.82) };
    case 'left':
      return { x: CX - R * wide * 0.78, y: CY + shift };
    case 'right':
      return shape === 'orbit' ? { x: CX + R * wide, y: CY + shift } : { x: CX + R * wide * 0.78, y: CY + shift };
    case 'ring': {
      // On the outline, up and to the right first, then round the shape.
      const a = (-55 + k * 70) * (Math.PI / 180);
      return { x: CX + R * wide * Math.cos(a), y: CY + R * tall * Math.sin(a) };
    }
  }
}

// A label in lines of about `chars` characters, broken at spaces; nothing is cut (a label is at most 40 characters).
export function lines(text: string, chars = CHARS): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && `${line} ${word}`.length > chars) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

export type Callout = { n: number; text: string; lines: string[]; point: Point; side: 'left' | 'right'; box: { x: number; y: number; h: number } };

// Each label goes to the side its point is on (a centre, top or bottom label to the side with fewer), then each side's
// boxes are spaced down the picture in the order of their points, so no two callout lines cross on one side.
export function placeFigure(b: Figure): Callout[] {
  const seen = new Map<FigureAt, number>();
  const all = b.labels.map((l, i) => {
    const k = seen.get(l.at) ?? 0;
    seen.set(l.at, k + 1);
    return { n: i + 1, text: l.text, lines: lines(l.text), point: anchor(b.shape, l.at, k), at: l.at };
  });
  // First the labels whose point is clearly on one side; then each middle one to the side with fewer (left on a tie).
  const fixed = (c: (typeof all)[number]): 'left' | 'right' | null => (c.at === 'left' ? 'left' : c.at === 'right' ? 'right' : c.point.x < CX - 1 ? 'left' : c.point.x > CX + 1 ? 'right' : null);
  const count = { left: all.filter((c) => fixed(c) === 'left').length, right: all.filter((c) => fixed(c) === 'right').length };
  const sided = all.map((c) => {
    let side = fixed(c);
    if (!side) {
      side = count.left <= count.right ? 'left' : 'right';
      count[side] += 1;
    }
    return { ...c, side };
  });
  const out: Callout[] = [];
  for (const side of ['left', 'right'] as const) {
    const col = sided.filter((c) => c.side === side).sort((a, z) => a.point.y - z.point.y);
    const heights = col.map((c) => c.lines.length * LINE_H + 12);
    const gap = Math.max(8, (H - 16 - heights.reduce((s, h) => s + h, 0)) / (col.length + 1));
    let y = 8 + gap;
    col.forEach((c, i) => {
      out.push({ n: c.n, text: c.text, lines: c.lines, point: c.point, side, box: { x: side === 'left' ? 8 : W - 8 - BOX_W, y, h: heights[i] } });
      y += heights[i] + gap;
    });
  }
  return out.sort((a, z) => a.n - z.n);
}

// The five shapes, each two tones of the logo's blue and teal on white, with a solid outline.
function Shape({ shape }: { shape: FigureShape }) {
  switch (shape) {
    case 'circle':
      return (
        <g>
          <circle cx={CX} cy={CY} r={R} fill={TONE_A} fillOpacity="0.14" stroke={TONE_A} strokeWidth="3" />
          <circle cx={CX} cy={CY} r={R * 0.22} fill={TONE_B} fillOpacity="0.55" stroke={TONE_B} strokeWidth="2" />
        </g>
      );
    case 'ring':
      return (
        <g>
          <circle cx={CX} cy={CY} r={R} fill={TONE_B} fillOpacity="0.3" stroke={TONE_B} strokeWidth="3" />
          <circle cx={CX} cy={CY} r={R * 0.55} fill="white" stroke={TONE_B} strokeWidth="3" />
          <circle cx={CX} cy={CY} r={R * 0.55} fill={TONE_A} fillOpacity="0.1" />
        </g>
      );
    case 'cell':
      return (
        <g>
          <ellipse cx={CX} cy={CY} rx={R * 1.3} ry={R * 0.92} fill={TONE_B} fillOpacity="0.14" stroke={TONE_B} strokeWidth="5" />
          <ellipse cx={CX - R * 0.75} cy={CY + R * 0.4} rx={R * 0.2} ry={R * 0.1} fill={TONE_B} fillOpacity="0.45" />
          <ellipse cx={CX + R * 0.7} cy={CY - R * 0.45} rx={R * 0.18} ry={R * 0.09} fill={TONE_B} fillOpacity="0.45" />
          <ellipse cx={CX + R * 0.55} cy={CY + R * 0.5} rx={R * 0.15} ry={R * 0.08} fill={TONE_B} fillOpacity="0.45" />
          <circle cx={CX} cy={CY} r={R * 0.34} fill={TONE_A} fillOpacity="0.25" stroke={TONE_A} strokeWidth="3" />
          <circle cx={CX + R * 0.08} cy={CY - R * 0.06} r={R * 0.1} fill={TONE_A} />
        </g>
      );
    case 'layered': {
      const w = R * 2.2;
      const h = R * 1.84;
      const x = CX - w / 2;
      const y = CY - h / 2;
      const band = h / 4;
      const r = 14;
      const tints = [0.1, 0.24, 0.38, 0.55];
      // Four bands; the top and bottom ones carry the outline's rounded corners (no clip path: an id would repeat in
      // the wide and narrow pictures).
      const path = (...parts: (string | number)[]) => parts.join(' ');
      const bands = [
        path('M', x, y + band, 'V', y + r, 'Q', x, y, x + r, y, 'H', x + w - r, 'Q', x + w, y, x + w, y + r, 'V', y + band, 'Z'),
        path('M', x, y + band, 'H', x + w, 'V', y + 2 * band, 'H', x, 'Z'),
        path('M', x, y + 2 * band, 'H', x + w, 'V', y + 3 * band, 'H', x, 'Z'),
        path('M', x, y + 3 * band, 'H', x + w, 'V', y + h - r, 'Q', x + w, y + h, x + w - r, y + h, 'H', x + r, 'Q', x, y + h, x, y + h - r, 'Z'),
      ];
      return (
        <g>
          {bands.map((d, i) => (
            <path key={i} d={d} fill={i % 2 ? TONE_B : TONE_A} fillOpacity={tints[i]} />
          ))}
          {[1, 2, 3].map((i) => (
            <line key={i} x1={x} x2={x + w} y1={y + i * band} y2={y + i * band} stroke={TONE_A} strokeWidth="1.5" />
          ))}
          <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke={TONE_A} strokeWidth="3" />
        </g>
      );
    }
    case 'orbit':
      return (
        <g>
          <ellipse cx={CX} cy={CY} rx={R * 1.3} ry={R * 0.82} fill="none" stroke={TONE_A} strokeWidth="2.5" strokeDasharray="7 7" />
          <circle cx={CX} cy={CY} r={R * 0.3} fill={colors.gold} stroke={deepColors.goldDeep} strokeWidth="2.5" />
          <circle cx={CX + R * 1.3} cy={CY} r={R * 0.14} fill={TONE_A} stroke={lessonColors.ink} strokeWidth="2" />
        </g>
      );
  }
}

const Dot = ({ p }: { p: Point }) => <circle cx={p.x} cy={p.y} r="4.5" fill={INK} stroke="white" strokeWidth="1.5" />;

export function FigureView({ b, tone }: { b: Figure; tone: string }) {
  const placed = placeFigure(b);
  return (
    <Card title={b.title} tone={tone} tag="figure">
      <figure data-figure={b.shape} className="flex flex-col gap-3">
        {/* Wide: the labels in boxes either side, each joined to its point. */}
        <svg viewBox={`0 0 ${W} ${H}`} className="hidden w-full sm:block" aria-hidden="true" data-figure-wide>
          <Shape shape={b.shape} />
          {placed.map((c) => {
            const edge = { x: c.side === 'left' ? c.box.x + BOX_W : c.box.x, y: c.box.y + c.box.h / 2 };
            return <polyline key={`l${c.n}`} points={`${edge.x},${edge.y} ${edge.x + (c.side === 'left' ? 14 : -14)},${edge.y} ${c.point.x},${c.point.y}`} fill="none" stroke={LINE} strokeWidth="1.5" />;
          })}
          {placed.map((c) => (
            <g key={`b${c.n}`}>
              <rect x={c.box.x} y={c.box.y} width={BOX_W} height={c.box.h} rx="10" fill="white" stroke={LINE} strokeWidth="1.5" />
              <text x={c.box.x + BOX_W / 2} y={c.box.y + 6 + LINE_H - 3} textAnchor="middle" fontSize="12.5" fontWeight="700" fill={INK}>
                {c.lines.map((l, i) => (
                  <tspan key={i} x={c.box.x + BOX_W / 2} dy={i === 0 ? 0 : LINE_H}>
                    {l}
                  </tspan>
                ))}
              </text>
            </g>
          ))}
          {placed.map((c) => (
            <Dot key={`d${c.n}`} p={c.point} />
          ))}
        </svg>
        {/* Narrow: the same drawing with numbered points; the words are the list below. */}
        <svg viewBox={`${CX - 150} ${CY - 112} 300 224`} className="mx-auto w-full max-w-xs sm:hidden" aria-hidden="true" data-figure-narrow>
          <Shape shape={b.shape} />
          {placed.map((c) => (
            <g key={c.n}>
              <circle cx={c.point.x} cy={c.point.y} r="11" fill={INK} stroke="white" strokeWidth="2" />
              <text x={c.point.x} y={c.point.y + 4.5} textAnchor="middle" fontSize="13" fontWeight="800" fill="white">
                {c.n}
              </text>
            </g>
          ))}
        </svg>
        <figcaption>
          <ol data-figure-labels className="flex flex-col gap-2 sm:sr-only">
            {placed.map((c) => (
              <li key={c.n} className="flex items-start gap-3 text-base text-slate">
                <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate text-sm font-extrabold text-white">
                  {c.n}
                </span>
                <span className="pt-0.5 font-semibold">{c.text}</span>
              </li>
            ))}
          </ol>
        </figcaption>
      </figure>
    </Card>
  );
}
