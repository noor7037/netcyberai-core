'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Board, BoardAxis, BoardColour, BoardLeaf } from '@/lib/family/blocks';
import { BOARD_TEXT, boardAxes, boardBox, boardFrame, boardItems, boardStepOnSpoken, onAxis, targetBox, type BoardItem } from '@/lib/family/board';
import { lessonColors, lessonTints } from '@/lib/design-tokens';
import { fill, type Words } from '@/lib/family/fill';
import { Card } from './BlockViews';
import { useReducedMotion } from './motion';

// The live drawing board (W16-A2, docs/39 §6): the board block's steps drawn one after another on a paper grid, by our
// own code (no canvas library, no markup from the model). Its own chunk, loaded only when an answer carries a board.
//   - `cursor` is the step being read or spoken (W16-A4 passes boardCursorFromSentence's step); everything up to it is
//     drawn, the newest step fading in (and its lines drawing themselves). Without one, the board starts at step 1.
//   - Back and Next (44 px) move a step; Show all draws every step. The step's say line is the caption under it.
//   - Under prefers-reduced-motion (and on the first paint, and with `still`) every step is drawn at once, with no
//     motion, and the say lines are listed in order.
// Family identity colours only: ink, saffron (its deep tone for lines and words), teal and plum on paper, with the
// lesson tints as fills. No gradient.

const STROKE: Record<BoardColour, string> = { ink: lessonColors.ink, saffron: lessonColors.saffronDeep, teal: lessonColors.teal, plum: lessonColors.plum };
const TINT: Record<BoardColour, string> = { ink: lessonColors.line, saffron: lessonTints.butter.tint, teal: lessonTints.mint.tint, plum: lessonTints.lilac.tint };
const LINE = 0.7;
const FONT = 'inherit';

// Words cut into lines of at most `max` characters (a word longer than that keeps its own line).
function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  for (const word of text.split(' ')) {
    const last = out[out.length - 1];
    if (last !== undefined && last.length + 1 + word.length <= max) out[out.length - 1] = `${last} ${word}`;
    else out.push(word);
  }
  return out;
}

// From 640 px a wide or tall board keeps its shape; on a phone every board is square, so the words keep their size.
function useRoomy(): boolean {
  const [roomy, setRoomy] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(min-width: 640px)');
    const on = () => setRoomy(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return roomy;
}

type Frame = ReturnType<typeof boardFrame>;

type Box = { x: number; y: number; w: number; h: number };

function Item({ it, f, axes, head, fresh, boxOf }: { it: BoardItem; f: Frame; axes: Map<string, BoardAxis>; head: string; fresh: boolean; boxOf: (id: string) => Box | null }) {
  const c = it.cmd;
  const stroke = STROKE[it.colour];
  const X = (x: number) => x * f.sx;
  const Y = (y: number) => y * f.sy;
  const draw = fresh ? 'fam-board-draw' : undefined;
  const line = { stroke, strokeWidth: LINE, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const shapeFill = (c: BoardLeaf) => ('fill' in c && c.fill ? TINT[it.colour] : 'none');
  const words = (size: number, text: string, x: number, y: number, weight: number, italic = false) => {
    const lines = wrap(text, Math.max(8, Math.floor((f.W - X(x) - 2) / (size * 0.55))));
    return (
      <text x={X(x)} y={Y(y)} fontSize={size} fontWeight={weight} fontStyle={italic ? 'italic' : undefined} fill={stroke} fontFamily={FONT} stroke={lessonColors.paper} strokeWidth={0.9} paintOrder="stroke">
        {lines.map((l, i) => (
          <tspan key={i} x={X(x)} dy={i === 0 ? 0 : size * 1.25}>
            {l}
          </tspan>
        ))}
      </text>
    );
  };
  switch (c.kind) {
    case 'shape':
      if (c.shape === 'rect') return <rect x={X(c.at[0])} y={Y(c.at[1])} width={X(c.w)} height={Y(c.h)} rx={0.8} fill={shapeFill(c)} {...line} pathLength={1} className={draw} />;
      if (c.shape === 'circle') return <circle cx={X(c.at[0])} cy={Y(c.at[1])} r={c.r} fill={shapeFill(c)} {...line} pathLength={1} className={draw} />;
      if (c.shape === 'ellipse') return <ellipse cx={X(c.at[0])} cy={Y(c.at[1])} rx={X(c.rx)} ry={Y(c.ry)} fill={shapeFill(c)} {...line} pathLength={1} className={draw} />;
      if (c.shape === 'triangle') return <polygon points={c.points.map((p) => `${X(p[0])},${Y(p[1])}`).join(' ')} fill={shapeFill(c)} {...line} pathLength={1} className={draw} />;
      return <line x1={X(c.from[0])} y1={Y(c.from[1])} x2={X(c.to[0])} y2={Y(c.to[1])} {...line} strokeDasharray={c.dashed ? '2 1.5' : undefined} pathLength={c.dashed ? undefined : 1} className={c.dashed ? undefined : draw} />;
    case 'arrow':
      return <line x1={X(c.from[0])} y1={Y(c.from[1])} x2={X(c.to[0])} y2={Y(c.to[1])} {...line} markerEnd={`url(#${head}-${it.colour})`} />;
    case 'label': {
      const lines = wrap(c.text, 22);
      const w = Math.min(f.W - X(c.at[0]), Math.max(...lines.map((l) => l.length)) * BOARD_TEXT.label * 0.56 + 2.4);
      const h = lines.length * BOARD_TEXT.label * 1.25 + 1.4;
      return (
        <g>
          <rect x={X(c.at[0]) - 1.2} y={Y(c.at[1]) - BOARD_TEXT.label - 0.4} width={w} height={h} rx={1.6} fill={lessonColors.card} stroke={stroke} strokeWidth={0.35} />
          <text x={X(c.at[0])} y={Y(c.at[1])} fontSize={BOARD_TEXT.label} fontWeight={700} fill={stroke}>
            {lines.map((l, i) => (
              <tspan key={i} x={X(c.at[0])} dy={i === 0 ? 0 : BOARD_TEXT.label * 1.25}>
                {l}
              </tspan>
            ))}
          </text>
        </g>
      );
    }
    case 'text':
      return words(BOARD_TEXT[c.size ?? 'normal'], c.text, c.at[0], c.at[1], c.size === 'big' ? 800 : 600);
    case 'equation':
      return words(BOARD_TEXT.equation, c.text, c.at[0], c.at[1], 700, true);
    case 'axis': {
      const [x0, y0] = [X(c.at[0]), Y(c.at[1])];
      const [x1, y1] = [X(c.at[0] + c.w), Y(c.at[1] - c.h)];
      const tick = BOARD_TEXT.small * 0.85;
      return (
        <g fill={stroke} fontSize={tick} fontWeight={600}>
          <line x1={x0} y1={y0} x2={x1} y2={y0} {...line} markerEnd={`url(#${head}-${it.colour})`} />
          <line x1={x0} y1={y0} x2={x0} y2={y1} {...line} markerEnd={`url(#${head}-${it.colour})`} />
          <text x={x0} y={y0 + tick * 1.3} textAnchor="middle">{c.x[0]}</text>
          <text x={x1 - 1} y={y0 + tick * 1.3} textAnchor="end">{c.x[1]}</text>
          <text x={x0 - 1.2} y={y1 + tick} textAnchor="end">{c.y[1]}</text>
          {c.xLabel && <text x={x1} y={y0 + tick * 2.6} textAnchor="end">{c.xLabel}</text>}
          {c.yLabel && <text x={x0 + 1.5} y={y1 - 1.2}>{c.yLabel}</text>}
        </g>
      );
    }
    case 'graph': {
      const axis = axes.get(c.axis);
      if (!axis) return null;
      const pts = c.points.map((p) => onAxis(axis, p)).map(([x, y]) => [X(x), Y(y)]);
      return (
        <g>
          {!c.dots && pts.length > 1 && <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" {...line} strokeWidth={LINE * 1.4} pathLength={1} className={draw} />}
          {(c.dots || pts.length === 1) && pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={1.1} fill={stroke} />)}
        </g>
      );
    }
    case 'point':
      return (
        <g>
          <circle cx={X(c.at[0])} cy={Y(c.at[1])} r={1.2} fill={stroke} />
          {c.label && words(BOARD_TEXT.label, c.label, c.at[0] + 2.8, c.at[1] + 1.3, 700)}
        </g>
      );
    case 'highlight': {
      const target = c.target ? boxOf(c.target) : boardBox(c, axes);
      if (!target) return null;
      const pad = 1.6;
      return <rect data-board-highlight x={X(target.x) - pad} y={Y(target.y) - pad} width={X(target.w) + pad * 2} height={Y(target.h) + pad * 2} rx={2} fill={lessonColors.saffron} fillOpacity={0.16} stroke={lessonColors.saffron} strokeWidth={0.6} />;
    }
    default:
      return null;
  }
}

export function BoardView({ b, w, tone, cursor, still }: { b: Board; w: Words; tone: string; cursor?: number; still?: boolean }) {
  const reduced = useReducedMotion();
  const quiet = still ?? reduced;
  const roomy = useRoomy();
  const last = b.steps.length;
  const [at, setAt] = useState(() => Math.min(last, Math.max(1, cursor ?? 1)));
  // The step being spoken moves the board; a tap moves it too (board.ts boardStepOnSpoken: a Next ahead of the voice
  // stays, a Back holds until the voice's next step). The voice stopping (no cursor) leaves the board where it is, and
  // the next start draws from the voice's own step.
  const spoken = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (cursor === undefined) {
      spoken.current = undefined;
      return;
    }
    const step = Math.min(last, Math.max(1, Math.round(cursor)));
    const before = spoken.current;
    spoken.current = step;
    if (step !== before) setAt((n) => boardStepOnSpoken(n, before, step));
  }, [cursor, last]);
  const head = useId().replace(/[^a-zA-Z0-9]/g, '');
  const shown = quiet ? last : at;
  const f = boardFrame(roomy ? b : {});
  const axes = boardAxes(b);
  const items = boardItems(b, shown);
  const boxOf = (id: string) => targetBox(items, id, axes);
  const step = b.steps[shown - 1];
  const button = 'fam-press min-h-[44px] min-w-[44px] rounded-full px-4 text-sm font-bold disabled:opacity-40';
  return (
    <Card title={b.title} tone={tone} tag="board">
      <svg data-board-svg data-step={shown} role="img" aria-label={fill(w['fam.board.picture'], { title: b.title })} viewBox={`-2 -2 ${f.W + 4} ${f.H + 4}`} className={`mx-auto w-full ${roomy && b.width === 'wide' ? 'max-w-[640px]' : roomy && b.width === 'tall' ? 'max-w-[380px]' : 'max-w-[440px]'}`}>
        <defs>
          <pattern id={`${head}-grid`} width="10" height="10" patternUnits="userSpaceOnUse">
            <circle cx="0.5" cy="0.5" r="0.35" fill={lessonColors.line} />
          </pattern>
          {(Object.keys(STROKE) as BoardColour[]).map((k) => (
            <marker key={k} id={`${head}-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 Z" fill={STROKE[k]} />
            </marker>
          ))}
        </defs>
        <rect x={-2} y={-2} width={f.W + 4} height={f.H + 4} rx={3} fill={lessonColors.paper} stroke={lessonColors.line} strokeWidth={0.5} />
        <rect x={0} y={0} width={f.W} height={f.H} fill={`url(#${head}-grid)`} />
        {items.map((it) => {
          const fresh = !quiet && it.step === shown && shown > 1;
          return (
            <g key={it.key} data-board-item={it.cmd.kind} data-board-step={it.step} className={fresh ? 'fam-board-in' : undefined}>
              <Item it={it} f={f} axes={axes} head={head} fresh={fresh} boxOf={boxOf} />
            </g>
          );
        })}
      </svg>
      {quiet ? (
        b.steps.some((s) => s.say) && (
          <ol data-board-says className="flex list-decimal flex-col gap-1 pl-6 text-base leading-relaxed text-ink">
            {b.steps.map((s) => s.say && <li key={s.n}>{s.say}</li>)}
          </ol>
        )
      ) : (
        <>
          <p data-board-say aria-live="polite" className="min-h-[1.5rem] rounded-2xl bg-paper px-3 py-2 text-base leading-relaxed text-ink">
            {step?.say ?? ''}
          </p>
          <div data-board-controls className="flex flex-wrap items-center gap-2">
            <button type="button" data-board-prev onClick={() => setAt((n) => Math.max(1, n - 1))} disabled={at <= 1} className={`${button} bg-paper text-ink ring-1 ring-ink/15`}>
              {w['fam.board.prev']}
            </button>
            <span data-board-count className="px-1 text-sm font-semibold text-ink">
              {fill(w['fam.board.step'], { n: at, total: last })}
            </span>
            <button type="button" data-board-next onClick={() => setAt((n) => Math.min(last, n + 1))} disabled={at >= last} className={`${button} bg-saffron text-ink`}>
              {w['fam.board.next']}
            </button>
            <button type="button" data-board-all onClick={() => setAt(last)} disabled={at >= last} className={`${button} bg-paper text-ink ring-1 ring-ink/15`}>
              {w['fam.board.all']}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}
