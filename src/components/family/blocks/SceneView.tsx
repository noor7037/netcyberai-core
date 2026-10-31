'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import type { Scene, ScenePart, SceneShape } from '@/lib/family/blocks';
import { colors, lessonColors } from '@/lib/design-tokens';
import type { Words } from '@/lib/family/fill';
import { Card } from './BlockViews';
import { useReducedMotion } from './InteractiveViews';
import { wrapLabel } from './MindMapView';

// A scene (W10-6, docs/39 §5): a thing and its real parts, drawn by our own code from checked data
// (src/lib/family/blocks.ts: 2 to 12 parts, links only between them). No library, no image, no markup from the model.
//   - Four layouts laid out here: `row` (a grid of up to 4 a row), `ring` (round a circle, up to 8 parts; more fall back
//     to a row), `stack` (one part a row, its label beside it) and `free` (rows by the links: a part after the one that
//     links to it).
//   - Nine shapes, drawn simply: circle, rect, pill, hex, coil (a rotor's winding), magnet (a horseshoe), wire, arrow and
//     organ (a soft rounded body). Each part is filled from a fixed palette of 8 logo tokens, outlined in slate, with
//     its label in slate under or beside it.
//   - A tap, Enter or Space on a part opens its text in the panel below and highlights the part (each target at least
//     84 by 96 units, over 44 px at 390).
//   - Motion: `flow` moves dashes along the flow links, `pulse` breathes the parts, `rotate` turns the coil parts; under
//     `pulse` and `rotate` the flow links move as well (a heart's blood, a motor's current). None of it
//     under prefers-reduced-motion (and the first paint is still); the scene is complete without it.

// The part palette, colour 1 to 8 (the model names a number; the hue is ours).
export const PART_HEX = [lessonColors.ink, colors.tangerine, colors.turquoise, colors.grape, colors.azure, colors.coral, colors.emerald, colors.gold] as const;
export const partHex = (colour: number) => PART_HEX[(Math.max(1, Math.min(8, Math.round(colour))) - 1) % PART_HEX.length];

export const SCENE_W = 360;
const CELL_H = 124;
const SHAPE_Y = 36;
const LABEL_Y = 82;
const LINE_H = 17;
const STACK_ROW = 90;
const PAD = 12;

export type PlacedPart = { part: ScenePart; cx: number; cy: number; box: { x: number; y: number; w: number; h: number }; labelX: number; labelY: number; anchor: 'middle' | 'start'; lines: string[] };
export type PlacedScene = { W: number; H: number; layout: Scene['layout']; parts: PlacedPart[] };

// Rows of cells, centred, `cols` a row at most.
function grid(rows: ScenePart[][], cols: number): PlacedPart[] {
  const cellW = (SCENE_W - PAD * 2) / Math.max(1, cols);
  const out: PlacedPart[] = [];
  rows.forEach((row, r) => {
    const left = (SCENE_W - row.length * cellW) / 2;
    row.forEach((part, c) => {
      const x = left + c * cellW;
      const y = PAD + r * CELL_H;
      out.push({ part, cx: x + cellW / 2, cy: y + SHAPE_Y, box: { x: x + 3, y: y + 2, w: cellW - 6, h: CELL_H - 6 }, labelX: x + cellW / 2, labelY: y + LABEL_Y, anchor: 'middle', lines: wrapLabel(part.label, Math.max(10, Math.floor(cellW / 8))) });
    });
  });
  return out;
}

const chunk = <T,>(list: T[], size: number): T[][] => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));

// Each part's row under `free`: one after the deepest part that links to it (links in a loop stop at the part count).
function levels(b: Scene): number[] {
  const index = new Map(b.parts.map((p, i) => [p.id, i]));
  const depth = b.parts.map(() => 0);
  for (let round = 0; round < b.parts.length; round++) {
    let moved = false;
    for (const l of b.links) {
      const from = index.get(l.from)!;
      const to = index.get(l.to)!;
      if (depth[to] < depth[from] + 1 && depth[from] + 1 < b.parts.length) {
        depth[to] = depth[from] + 1;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return depth;
}

export function placeScene(b: Scene): PlacedScene {
  const n = b.parts.length;
  const layout = b.layout === 'ring' && n > 8 ? 'row' : b.layout;
  let parts: PlacedPart[];
  if (layout === 'stack') {
    parts = b.parts.map((part, i) => {
      const y = PAD + i * STACK_ROW;
      const lines = wrapLabel(part.label, 28);
      return { part, cx: 52, cy: y + STACK_ROW / 2, box: { x: 4, y: y + 2, w: SCENE_W - 8, h: STACK_ROW - 4 }, labelX: 100, labelY: y + STACK_ROW / 2 - ((lines.length - 1) * LINE_H) / 2 + 5, anchor: 'start' as const, lines };
    });
    return { W: SCENE_W, H: PAD * 2 + n * STACK_ROW, layout, parts };
  }
  if (layout === 'ring') {
    const R = n <= 4 ? 100 : 118;
    // Room above the ring for a top part's label, which sits above its shape so the links below it stay clear.
    const cy = PAD + 3 * LINE_H + SHAPE_Y + R;
    parts = b.parts.map((part, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const x = SCENE_W / 2 + R * Math.cos(a);
      const y = cy + R * Math.sin(a);
      const lines = wrapLabel(part.label, 12);
      const above = Math.sin(a) < -0.5;
      const labelY = above ? y - 34 - (lines.length - 1) * LINE_H : y + LABEL_Y - SHAPE_Y;
      return { part, cx: x, cy: y, box: { x: x - 46, y: above ? y - 34 - lines.length * LINE_H - 4 : y - 34, w: 92, h: 96 }, labelX: x, labelY, anchor: 'middle' as const, lines };
    });
    return { W: SCENE_W, H: cy + R + LABEL_Y - SHAPE_Y + 3 * LINE_H, layout, parts };
  }
  if (layout === 'free') {
    const depth = levels(b);
    const rows: ScenePart[][] = [];
    for (let d = 0; d <= Math.max(...depth); d++) rows.push(...chunk(b.parts.filter((_, i) => depth[i] === d), 4));
    const kept = rows.filter((r) => r.length > 0);
    parts = grid(kept, Math.max(...kept.map((r) => r.length)));
    return { W: SCENE_W, H: PAD * 2 + kept.length * CELL_H, layout, parts };
  }
  const cols = n <= 4 ? n : 3;
  const rows = chunk(b.parts, cols);
  return { W: SCENE_W, H: PAD * 2 + rows.length * CELL_H, layout, parts: grid(rows, cols) };
}

// The shape about (0, 0), about 60 by 50 units, in the part's colour with a slate outline.
function Shape({ shape, fill, line }: { shape: SceneShape; fill: string; line: number }) {
  const s = { fill, stroke: colors.slate, strokeWidth: line, strokeLinejoin: 'round' as const };
  switch (shape) {
    case 'circle':
      return <circle r="26" {...s} />;
    case 'rect':
      return <rect x="-28" y="-20" width="56" height="40" rx="6" {...s} />;
    case 'pill':
      return <rect x="-30" y="-15" width="60" height="30" rx="15" {...s} />;
    case 'hex':
      return <polygon points="28,0 14,24.2 -14,24.2 -28,0 -14,-24.2 14,-24.2" {...s} />;
    case 'coil':
      // A rotor's winding: the coil's loops across a round core, on its axle.
      return (
        <g>
          <circle r="27" {...s} />
          <path d="M-20 0 C-17 -16 -11 -16 -10 0 C-9 16 -3 16 0 0 C3 -16 9 -16 10 0 C11 16 17 16 20 0" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
          <circle r="3.5" fill={colors.slate} />
        </g>
      );
    case 'magnet':
      // A horseshoe magnet: one leg's tip dark, the other light.
      return (
        <g>
          <path d="M-18 -20 L-18 2 A18 18 0 0 0 18 2 L18 -20" fill="none" stroke={colors.slate} strokeWidth={16 + line} />
          <path d="M-18 -20 L-18 2 A18 18 0 0 0 18 2 L18 -20" fill="none" stroke={fill} strokeWidth="16" />
          <rect x="-26" y="-28" width="16" height="10" fill={colors.slate} stroke={colors.slate} strokeWidth={line} />
          <rect x="10" y="-28" width="16" height="10" fill="#ffffff" stroke={colors.slate} strokeWidth={line} />
        </g>
      );
    case 'wire':
      return (
        <g>
          <path d="M-28 8 C-16 -18 0 22 12 -4 S26 -10 28 -8" fill="none" stroke={colors.slate} strokeWidth={6 + line} strokeLinecap="round" />
          <path d="M-28 8 C-16 -18 0 22 12 -4 S26 -10 28 -8" fill="none" stroke={fill} strokeWidth="6" strokeLinecap="round" />
          <circle cx="-28" cy="8" r="4.5" fill={colors.slate} />
          <circle cx="28" cy="-8" r="4.5" fill={colors.slate} />
        </g>
      );
    case 'arrow':
      return <polygon points="-28,-10 6,-10 6,-22 30,0 6,22 6,10 -28,10" {...s} />;
    case 'organ':
      return <path d="M0 -24 C18 -30 32 -12 26 6 C20 24 6 28 -4 24 C-18 30 -32 14 -26 -4 C-22 -20 -12 -20 0 -24 Z" {...s} />;
  }
}

// A link's ends, pulled back from both centres so it meets the shapes' edges, not their middles.
function ends(a: PlacedPart, b: PlacedPart) {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const d = Math.max(1, Math.hypot(dx, dy));
  const k = Math.min(34, d / 3) / d;
  return { x1: a.cx + dx * k, y1: a.cy + dy * k, x2: b.cx - dx * k, y2: b.cy - dy * k };
}

// `still` forces the motion off (a test, a still picture); `initial` opens one part first.
export function SceneView({ b, w, tone, still, initial }: { b: Scene; w: Words; tone: string; still?: boolean; initial?: string }) {
  const reduced = useReducedMotion();
  const quiet = still ?? reduced;
  const [open, setOpen] = useState<string | null>(initial ?? null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const placed = placeScene(b);
  const at = new Map(placed.parts.map((p) => [p.part.id, p]));
  const chosen = open ? b.parts.find((p) => p.id === open) : undefined;
  const motion = quiet ? 'none' : b.animate;
  const toggle = (id: string) => setOpen((o) => (o === id ? null : id));
  const onKey = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle(id);
    }
  };
  return (
    <Card title={b.title} tone={tone} tag="scene">
      <svg data-scene-svg data-layout={placed.layout} viewBox={`0 0 ${placed.W} ${placed.H}`} className="mx-auto w-full max-w-[480px]">
        <defs>
          <marker id={`${uid}-head`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 Z" fill={colors.slate} />
          </marker>
        </defs>
        {b.links.map((l, i) => {
          const a = at.get(l.from);
          const z = at.get(l.to);
          if (!a || !z) return null;
          const e = ends(a, z);
          // In a stack, a link that skips a row bends out to the left so it does not run through the parts between.
          const skip = placed.layout === 'stack' && Math.abs(placed.parts.indexOf(a) - placed.parts.indexOf(z)) > 1;
          const d = (skip ? ['M', a.cx - 30, a.cy, 'Q', Math.max(4, a.cx - 48), (a.cy + z.cy) / 2, z.cx - 30, z.cy] : ['M', e.x1, e.y1, 'L', e.x2, e.y2]).join(' ');
          // A flow link (current, blood, water) moves under any motion: a motor's current flows while its rotor turns.
          const flowing = l.kind === 'flow' && motion !== 'none';
          return (
            <g key={i} data-scene-link={l.kind}>
              <path d={d} fill="none" stroke={colors.slate} strokeOpacity={l.kind === 'line' ? 0.55 : 0.8} strokeWidth={l.kind === 'flow' ? 3 : 2.5} strokeDasharray={l.kind === 'flow' ? '8 6' : undefined} markerEnd={l.kind === 'line' ? undefined : `url(#${uid}-head)`} className={flowing ? 'fam-scene-flow' : undefined}>
                {flowing && <animate attributeName="stroke-dashoffset" from="0" to="-28" dur="1.1s" repeatCount="indefinite" />}
              </path>
              {l.label && (
                <g>
                  <rect x={(a.cx + z.cx) / 2 - l.label.length * 3.7 - 6} y={(a.cy + z.cy) / 2 - 11} width={l.label.length * 7.4 + 12} height="20" rx="10" fill="#ffffff" stroke={colors.slate} strokeOpacity="0.2" />
                  <text x={(a.cx + z.cx) / 2} y={(a.cy + z.cy) / 2 + 3} textAnchor="middle" fontSize="12.5" fontWeight="600" fill={colors.slate}>
                    {l.label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        {placed.parts.map((p) => {
          const on = open === p.part.id;
          const pulse = motion === 'pulse';
          const turn = motion === 'rotate' && p.part.shape === 'coil';
          return (
            <g
              key={p.part.id}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={p.part.label}
              data-scene-part={p.part.id}
              data-open={on ? 'true' : undefined}
              onClick={() => toggle(p.part.id)}
              onKeyDown={(e) => onKey(e, p.part.id)}
              className="group cursor-pointer outline-none"
            >
              <rect x={p.box.x} y={p.box.y} width={p.box.w} height={p.box.h} rx="14" fill={on ? colors.offWhite : 'transparent'} stroke={on ? lessonColors.ink : 'transparent'} strokeWidth="2.5" className="group-focus-visible:stroke-ink" />
              <g transform={`translate(${p.cx} ${p.cy})`}>
                <g className={pulse ? 'fam-scene-pulse' : turn ? 'fam-scene-rotate' : undefined}>
                  {pulse && <animateTransform attributeName="transform" type="scale" values="1;1.08;1" dur="1.6s" repeatCount="indefinite" />}
                  {turn && <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="3s" repeatCount="indefinite" />}
                  <Shape shape={p.part.shape} fill={partHex(p.part.colour)} line={on ? 4 : 2} />
                </g>
              </g>
              <text x={p.labelX} textAnchor={p.anchor} fontSize="15" fontWeight={on ? 800 : 700} fill={colors.slate} stroke="#ffffff" strokeWidth="4" strokeLinejoin="round" paintOrder="stroke">
                {p.lines.map((line, i) => (
                  <tspan key={i} x={p.labelX} y={p.labelY + i * LINE_H}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>
      <div data-scene-panel aria-live="polite" className="rounded-2xl bg-off-white p-3 ring-1 ring-slate/10">
        {chosen ? (
          <div className="flex gap-3">
            <span aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 rounded-full ring-2 ring-slate" style={{ background: partHex(chosen.colour) }} />
            <p className="flex flex-col gap-1 text-slate">
              <span className="text-base font-extrabold">{chosen.label}</span>
              <span data-scene-text className="text-base leading-relaxed">
                {chosen.text}
              </span>
            </p>
          </div>
        ) : (
          <p className="text-sm font-semibold text-slate">{w['fam.block.sceneTap']}</p>
        )}
      </div>
    </Card>
  );
}

