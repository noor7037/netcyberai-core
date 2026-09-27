import { Fragment } from 'react';
import type { VisualBlock } from '@/demo-fixture/principal-dashboard';
import { fillOf, Progress, Ring, hexOf } from './bits';

// The reference's per-module "signature visual", rendered from data.
// Matrices use one hue at five strengths (sequential, never a rainbow);
// every mark has a text value next to it or in its tooltip.

const LEVEL = ['bg-emerald/15', 'bg-emerald/30', 'bg-emerald/50', 'bg-emerald/75', 'bg-emerald'];
const SLOT = ['bg-turquoise/15', 'bg-tangerine/15', 'bg-grape/10', 'bg-gold/20', 'bg-coral/15'];

function Block({ b }: { b: VisualBlock }) {
  switch (b.t) {
    case 'funnel':
      return (
        <ol className="flex flex-col items-center gap-1">
          {b.steps.map((s, i) => (
            <li
              key={s}
              className="nca-row rounded-md bg-emerald/10 py-1.5 text-center text-xs font-bold text-emerald"
              style={{ width: `${100 - i * (50 / b.steps.length)}%` }}
            >
              {s}
            </li>
          ))}
        </ol>
      );
    case 'bars': {
      const max = Math.max(...b.values);
      return (
        <div className="flex h-28 items-end gap-1.5" role="img" aria-label={b.values.map((v, i) => `${b.labels?.[i] ?? i + 1}: ${v}`).join(', ')}>
          {b.values.map((v, i) => (
            <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span
                title={`${b.labels?.[i] ?? ''} ${v}`.trim()}
                className={`w-full max-w-[2.25rem] rounded-t-md transition-opacity hover:opacity-80 ${b.tones?.[i] ? fillOf(b.tones[i]) : 'bg-emerald/70'}`}
                style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
              />
              {b.labels && <span className="text-[10px] font-semibold text-slate/70">{b.labels[i]}</span>}
            </div>
          ))}
        </div>
      );
    }
    case 'boxes':
      return (
        <div className={`grid gap-2 ${b.items.length === 1 ? 'grid-cols-1' : 'grid-cols-2 xl:grid-cols-4'}`}>
          {b.items.map((x) => (
            <div key={x.label} className="nca-lift flex flex-col gap-1 rounded-lg border border-slate/10 bg-off-white p-2.5">
              <span className="text-[11px] font-bold text-slate/70">{x.label}</span>
              <span className="text-lg font-extrabold leading-none text-slate">{x.value}</span>
              {x.note && <span className="text-[11px] text-slate/70">{x.note}</span>}
              {x.progress !== undefined && <Progress value={x.progress} />}
            </div>
          ))}
        </div>
      );
    case 'skills':
    case 'timeline':
      return (
        <ul className="flex flex-col gap-2">
          {b.rows.map(([label, v]) => (
            <li key={label} className="nca-row grid grid-cols-[7.5rem_1fr_2.75rem] items-center gap-2 rounded px-1 text-xs">
              <span className="truncate font-semibold text-slate">{label}</span>
              <Progress value={v} tone={b.t === 'skills' ? 'communication' : 'intelligence'} />
              <span className="text-right font-bold text-slate">{`${v}%`}</span>
            </li>
          ))}
        </ul>
      );
    case 'matrix':
      return (
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${b.cols ?? 10}, minmax(0, 1fr))` }} aria-hidden="true">
          {b.cells.map((lvl, i) => (
            <span key={i} className={`h-5 rounded transition-transform hover:scale-110 ${LEVEL[lvl - 1]}`} />
          ))}
        </div>
      );
    case 'ring':
      return (
        <div className="flex justify-center">
          <Ring segments={b.segments} size={132} stroke={14} label={`${b.value} ${b.label}`}>
            <span className="text-lg font-extrabold text-slate">{b.value}</span>
            <span className="text-[11px] text-slate/70">{b.label}</span>
          </Ring>
        </div>
      );
    case 'legend':
      return (
        <ul className="flex flex-wrap justify-center gap-3 text-[11px] font-semibold text-slate">
          {b.items.map(([label, tone]) => (
            <li key={label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: hexOf(tone) }} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      );
    case 'flow':
      return (
        <ol className="flex flex-wrap items-center gap-1.5">
          {b.nodes.map(([n, label], i) => (
            <Fragment key={n}>
              <li className={`nca-lift flex min-w-[5.5rem] flex-1 flex-col rounded-lg border bg-white px-2 py-1.5 ${b.breakAfter === i - 1 ? 'border-coral' : 'border-slate/10'}`}>
                <span className="text-[10px] font-extrabold text-grape-deep">{n}</span>
                <span className="text-xs font-semibold text-slate">{label}</span>
              </li>
              {i < b.nodes.length - 1 && (
                <li aria-hidden="true" className={`text-sm font-bold ${b.breakAfter === i ? 'text-coral-deep' : 'text-slate/70'}`}>
                  {b.breakAfter === i ? '×' : '→'}
                </li>
              )}
            </Fragment>
          ))}
        </ol>
      );
    case 'pills':
      return (
        <ul className="flex flex-wrap gap-1.5">
          {b.items.map((p) => (
            <li key={p} className="rounded-full bg-slate/5 px-2.5 py-1 text-[11px] font-bold text-slate">
              {p}
            </li>
          ))}
        </ul>
      );
    case 'schedule':
      return (
        <div className="grid grid-cols-[3.5rem_repeat(5,minmax(0,1fr))] gap-1 text-[11px]">
          <span />
          {b.days.map((d) => (
            <span key={d} className="text-center font-bold text-slate/70">
              {d}
            </span>
          ))}
          {b.slots.map((s) => (
            <Fragment key={s.time}>
              <span className="font-bold text-slate/70">{s.time}</span>
              {s.cells.map((c, i) => (
                <span key={i} className={`nca-lift rounded px-1 py-1.5 text-center font-semibold text-slate ${c === 'Proxy' ? 'bg-coral/15' : SLOT[i]}`}>
                  {c}
                </span>
              ))}
            </Fragment>
          ))}
        </div>
      );
    case 'graph':
      return (
        <svg viewBox="0 0 520 235" className="w-full" role="img" aria-label="Learning genome graph: Fractions and Word Problems lead to Ratio and Algebra, which carry a future risk into Class 8">
          {[
            [65, 120, 190, 70, false],
            [65, 120, 190, 170, false],
            [190, 70, 325, 120, true],
            [190, 170, 325, 120, true],
            [325, 120, 455, 70, false],
            [325, 120, 455, 170, false],
          ].map(([x1, y1, x2, y2, hot], i) => (
            <line key={i} x1={x1 as number} y1={y1 as number} x2={x2 as number} y2={y2 as number} stroke={hot ? '#FF6B57' : '#94A3B8'} strokeWidth={hot ? 3 : 2} className={hot ? 'nca-flow-line' : ''} />
          ))}
          {[
            [65, 120, 30, '#14B8A6', 'Fractions'],
            [190, 70, 26, '#8B3DFF', 'Ratio'],
            [190, 170, 26, '#8B3DFF', 'Word Prob.'],
            [325, 120, 32, '#FF7A1A', 'Algebra'],
            [455, 70, 25, '#1E293B', 'Class 8'],
            [455, 170, 25, '#FF6B57', 'Future risk'],
          ].map(([cx, cy, r, fill, label]) => (
            <g key={label as string} className="transition-opacity hover:opacity-80">
              <circle cx={cx as number} cy={cy as number} r={r as number} fill={fill as string} opacity={0.9} />
              <text x={cx as number} y={(cy as number) + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
                {label}
              </text>
            </g>
          ))}
        </svg>
      );
    case 'sims':
      return (
        <div className="grid grid-cols-2 gap-2">
          {b.items.map((x) => (
            <div key={x.title} className="nca-lift flex flex-col gap-1 rounded-lg border border-slate/10 bg-off-white p-3">
              <span className="text-xs font-extrabold text-slate">{x.title}</span>
              <span className="text-[11px] text-slate/70">{x.sub}</span>
              <span className="text-xl font-extrabold text-grape-deep">{x.num}</span>
              <Progress value={x.pct} tone="intelligence" />
            </div>
          ))}
        </div>
      );
    case 'gauge':
      return (
        <div className="flex justify-center">
          <Ring segments={[[b.value, 'success']]} size={132} stroke={14} label={`${b.value}% ${b.label}`}>
            <span className="text-lg font-extrabold text-slate">{`${b.value}%`}</span>
            <span className="text-[11px] text-slate/70">{b.label}</span>
          </Ring>
        </div>
      );
  }
}

export function ModuleVisual({ blocks }: { blocks: VisualBlock[] }) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((b, i) => (
        <Block key={i} b={b} />
      ))}
    </div>
  );
}
