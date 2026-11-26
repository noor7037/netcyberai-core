'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { AppCard } from '@/components/app-ui/Card';
import type { ColorToken } from '@/lib/contracts/modules';

// A chart card of the office's dashboard (docs/26 slice 8d, C203; docs/19
// §3.3 to §3.6): the title says the one message, a plain line under it says
// how to read it; text in slate; a table view for every chart, whose rows
// link to the rows behind them; nothing animates. Every word and every
// written number is handed in already said in the person's language: this
// file draws, it does not count and it does not speak.
//
// Colours are the theme's chart variables only, so every theme and dark mode
// apply without a change here: the series colours --chart-1 … --chart-6 (in
// order), the gridlines and tracks --chart-grid, the words drawn inside a
// chart --chart-text. A chart of one series takes the series colour its tone
// maps to; a chart of parts (the donut) takes them in order. No colour by
// rank: rows keep the order they are handed in (classes in class order).

export type FactChartRow = {
  label: string;
  value: number | null;
  text: string;
  href?: string;
  // Drawn in the track colour, not a series colour: what is not yet counted (students not marked yet).
  muted?: boolean;
  // A line said under the row (a funnel's drop from the step before).
  note?: string;
};
export type FactChartWords = { showAs: string; chart: string; table: string; what: string; value: string; none: string; open: string; gaps?: string };
export type FactChartKind = 'bars' | 'line' | 'ring' | 'donut' | 'hbars' | 'area' | 'funnel' | 'progress';

const TAP = 'min-h-[44px] rounded px-3 text-sm font-semibold';
// A share of a width, as SVG writes it.
const pct = (share: number) => `${(Math.max(0, Math.min(1, share)) * 100).toFixed(2)}%`;

export const chartSeries = (i: number) => `var(--chart-${(((i % 6) + 6) % 6) + 1})`;
const GRID = 'var(--chart-grid)';
const INK = 'var(--chart-text)';
// A tone's place in the series order (the palette's own order: royal, tangerine, turquoise, grape, azure, violet),
// a near hue taking its neighbour's place.
const TONE_ORDER: Partial<Record<ColorToken, number>> = {
  royal: 0, electric: 0, sapphire: 0, midnight: 0,
  tangerine: 1, amber: 1, coral: 1, peach: 1, gold: 1, sunshine: 1,
  turquoise: 2, emerald: 2, leaf: 2, cyan: 2,
  grape: 3,
  azure: 4,
  violet: 5,
};
export const toneColor = (tone: ColorToken) => chartSeries(TONE_ORDER[tone] ?? 0);

function RowLabel({ row }: { row: FactChartRow }) {
  return row.href ? (
    <Link href={row.href} data-chart-row-open className="inline-flex min-h-[44px] min-w-0 items-center break-words font-semibold text-sapphire underline">
      {row.label}
    </Link>
  ) : (
    <span className="inline-flex min-h-[28px] min-w-0 items-center break-words">{row.label}</span>
  );
}

// A bar on its track, as wide as its share of the whole: an SVG in percent, so it fills whatever width it is given
// and its rounded ends stay round.
function Track({ share, color, height = 12 }: { share: number; color: string; height?: number }) {
  const w = Math.max(0, Math.min(1, share));
  return (
    <svg height={height} aria-hidden="true" focusable="false" className="block w-full" data-track>
      <rect x="0" y="0" width={pct(1)} height={height} rx={height / 2} fill={GRID} />
      {w > 0 && <rect x="0" y="0" width={pct(Math.max(w, 0.015))} height={height} rx={height / 2} fill={color} />}
    </svg>
  );
}

// Bars beside their names, each scaled to the largest. `compact` (many classes): a narrower name column, closer rows.
function Bars({ rows, tone, compact = false }: { rows: readonly FactChartRow[]; tone: ColorToken; compact?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  const color = toneColor(tone);
  return (
    <ul className={`flex flex-col ${compact ? 'gap-0' : 'gap-2'}`}>
      {rows.map((r, i) => (
        <li key={`${i}-${r.label}`} className={`grid ${compact ? 'grid-cols-[minmax(0,6rem)_minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto]' : 'grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto]'} items-center gap-2 text-sm text-slate`}>
          <RowLabel row={r} />
          <Track share={(r.value ?? 0) / max} color={color} height={compact ? 10 : 12} />
          <span className="text-right font-semibold tabular-nums">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

// How far along each row is, out of 100: the name and the percent above a full-width track.
function Progress({ rows, tone }: { rows: readonly FactChartRow[]; tone: ColorToken }) {
  const color = toneColor(tone);
  return (
    <ul className="flex flex-col gap-1">
      {rows.map((r, i) => (
        <li key={`${i}-${r.label}`} className="flex flex-col text-sm text-slate">
          <div className="flex items-center justify-between gap-3">
            <RowLabel row={r} />
            <span className="font-semibold tabular-nums">{r.text}</span>
          </div>
          <Track share={(r.value ?? 0) / 100} color={color} height={10} />
        </li>
      ))}
    </ul>
  );
}

// Consecutive days with a value: a day with no value breaks the line, never a zero.
type Point = FactChartRow & { i: number; value: number };
function runsOf(rows: readonly FactChartRow[]): { real: Point[]; runs: Point[][] } {
  const real = rows.map((r, i) => ({ ...r, i })).filter((r): r is Point => r.value !== null);
  const runs: Point[][] = [];
  for (const p of real) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1].i === p.i - 1) run.push(p);
    else runs.push([p]);
  }
  return { real, runs };
}

function DayAxis({ rows, x, W, H }: { rows: readonly FactChartRow[]; x: (i: number) => number; W: number; H: number }) {
  return (
    <>
      {rows.length > 0 && (
        <text x={8} y={H - 8} fontSize={10} fill={INK}>
          {rows[0].label}
        </text>
      )}
      {rows.length > 1 && (
        <text x={Math.min(W - 8, x(rows.length - 1))} y={H - 8} fontSize={10} textAnchor="end" fill={INK}>
          {rows[rows.length - 1].label}
        </text>
      )}
    </>
  );
}

// A rate by day, out of 100.
function Line({ rows, tone, title, wide }: { rows: readonly FactChartRow[]; tone: ColorToken; title: string; wide: boolean }) {
  const W = wide ? 640 : 320;
  const H = 120;
  const BASE = H - 24;
  const x = (i: number) => (rows.length === 1 ? W / 2 : 8 + (i / (rows.length - 1)) * (W - 56));
  const y = (v: number) => 10 + (1 - Math.min(100, Math.max(0, v)) / 100) * (H - 34);
  const { real, runs } = runsOf(rows);
  const last = real[real.length - 1];
  const color = toneColor(tone);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${real.map((p) => `${p.label} ${p.text}`).join(', ')}`} className="h-auto w-full">
      {[0, 50, 100].map((v) => (
        <line key={v} x1={8} y1={y(v)} x2={W - 8} y2={y(v)} stroke={GRID} strokeWidth={1} />
      ))}
      <line x1={8} y1={BASE} x2={W - 8} y2={BASE} stroke={GRID} />
      {runs.filter((run) => run.length > 1).map((run) => (
        <path key={run[0].i} d={run.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.value).toFixed(1)}`).join('')} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {real.map((p) => (
        <circle key={p.i} cx={x(p.i)} cy={y(p.value)} r={p === last ? 4 : 3} fill={color}>
          <title>{`${p.label}: ${p.text}`}</title>
        </circle>
      ))}
      {last && (
        <text x={Math.min(W - 4, x(last.i) + 8)} y={y(last.value) + 4} fontSize={12} fontWeight={700} fill={INK}>
          {last.text}
        </text>
      )}
      <DayAxis rows={rows} x={x} W={W} H={H} />
    </svg>
  );
}

// An amount by day, filled down to zero, scaled to the largest day (whose amount is written at the top).
function Area({ rows, tone, title, wide }: { rows: readonly FactChartRow[]; tone: ColorToken; title: string; wide: boolean }) {
  const W = wide ? 640 : 320;
  const H = 140;
  const TOP = 18;
  const BASE = H - 24;
  const { real, runs } = runsOf(rows);
  const peak = real.reduce<Point | null>((m, p) => (m === null || p.value > m.value ? p : m), null);
  const max = Math.max(1, peak?.value ?? 0);
  const x = (i: number) => (rows.length === 1 ? W / 2 : 8 + (i / (rows.length - 1)) * (W - 16));
  const y = (v: number) => BASE - (Math.max(0, v) / max) * (BASE - TOP);
  const color = toneColor(tone);
  const lineOf = (run: Point[]) => run.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.value).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${real.map((p) => `${p.label} ${p.text}`).join(', ')}`} className="h-auto w-full">
      {[TOP, (TOP + BASE) / 2].map((gy) => (
        <line key={gy} x1={8} y1={gy} x2={W - 8} y2={gy} stroke={GRID} strokeDasharray="3 3" />
      ))}
      <line x1={8} y1={BASE} x2={W - 8} y2={BASE} stroke={GRID} />
      {peak && peak.value > 0 && (
        <text x={8} y={TOP - 5} fontSize={10} fill={INK}>
          {peak.text}
        </text>
      )}
      {runs.map((run) =>
        run.length > 1 ? (
          <g key={run[0].i}>
            <path d={`${lineOf(run)}L${x(run[run.length - 1].i).toFixed(1)} ${BASE}L${x(run[0].i).toFixed(1)} ${BASE}Z`} fill={color} fillOpacity={0.2} stroke="none" />
            <path d={lineOf(run)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ) : (
          <circle key={run[0].i} cx={x(run[0].i)} cy={y(run[0].value)} r={3} fill={color} />
        )
      )}
      {real.map((p) => (
        <circle key={`dot-${p.i}`} cx={x(p.i)} cy={y(p.value)} r={2} fill={color}>
          <title>{`${p.label}: ${p.text}`}</title>
        </circle>
      ))}
      <DayAxis rows={rows} x={x} W={W} H={H} />
    </svg>
  );
}

// How much is done, out of a whole: the first row is the part done.
function Ring({ rows, tone, title }: { rows: readonly FactChartRow[]; tone: ColorToken; title: string }) {
  const done = rows[0]?.value ?? 0;
  const total = rows.reduce((a, r) => a + (r.value ?? 0), 0);
  const share = total > 0 ? Math.min(1, done / total) : 0;
  const R = 48;
  const around = 2 * Math.PI * R;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 120 120" role="img" aria-label={title} className="h-28 w-28 shrink-0">
        <circle cx={60} cy={60} r={R} fill="none" stroke={GRID} strokeWidth={12} />
        {share > 0 && <circle cx={60} cy={60} r={R} fill="none" stroke={toneColor(tone)} strokeWidth={12} strokeLinecap="round" strokeDasharray={`${(share * around).toFixed(1)} ${around.toFixed(1)}`} transform="rotate(-90 60 60)" />}
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-slate">
        {rows.map((r, i) => (
          <li key={`${i}-${r.label}`} className="flex flex-wrap justify-between gap-x-3">
            <span>{r.label}</span>
            <span className="font-semibold tabular-nums">{r.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The parts of one whole, each its own series colour, with the whole in the centre and a legend that names (and
// opens) every part.
function Donut({ rows, title, centre }: { rows: readonly FactChartRow[]; title: string; centre?: { value: string; word?: string } }) {
  const total = rows.reduce((a, r) => a + Math.max(0, r.value ?? 0), 0);
  const R = 58;
  const around = 2 * Math.PI * R;
  const shown = rows.filter((r) => (r.value ?? 0) > 0).length;
  const gap = shown > 1 ? 2 : 0;
  let series = 0;
  const colorOf = rows.map((r) => (r.muted ? GRID : chartSeries(series++)));
  let start = 0;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 160 160" role="img" aria-label={`${title}. ${rows.map((r) => `${r.label} ${r.text}`).join(', ')}`} className="h-36 w-36 shrink-0">
        <circle cx={80} cy={80} r={R} fill="none" stroke={GRID} strokeWidth={20} />
        {total > 0 &&
          rows.map((r, i) => {
            const len = (Math.max(0, r.value ?? 0) / total) * around;
            const at = start;
            start += len;
            if (len <= 0) return null;
            return (
              <circle key={`${i}-${r.label}`} cx={80} cy={80} r={R} fill="none" stroke={colorOf[i]} strokeWidth={20} strokeDasharray={`${Math.max(0.5, len - gap).toFixed(2)} ${around.toFixed(2)}`} strokeDashoffset={(-at).toFixed(2)} transform="rotate(-90 80 80)">
                <title>{`${r.label}: ${r.text}`}</title>
              </circle>
            );
          })}
        {centre && (
          <text x={80} y={centre.word ? 82 : 87} textAnchor="middle" fontSize={24} fontWeight={800} fill={INK}>
            {centre.value}
          </text>
        )}
        {centre?.word && (
          <text x={80} y={100} textAnchor="middle" fontSize={11} fill={INK}>
            {centre.word}
          </text>
        )}
      </svg>
      <ul className="flex min-w-[10rem] flex-1 flex-col text-sm text-slate">
        {rows.map((r, i) => (
          <li key={`${i}-${r.label}`} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <svg width="12" height="12" aria-hidden="true" focusable="false" className="shrink-0">
                <rect width="12" height="12" rx="3" fill={colorOf[i]} />
              </svg>
              <RowLabel row={r} />
            </span>
            <span className="font-semibold tabular-nums">{r.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Steps in order, each bar as wide as its share of the first step and centred, so the whole narrows; under each
// step after the first, how many did not go on from the step before.
function Funnel({ rows, tone }: { rows: readonly FactChartRow[]; tone: ColorToken }) {
  const first = Math.max(1, rows[0]?.value ?? 0);
  const color = toneColor(tone);
  return (
    <ol className="flex flex-col gap-1">
      {rows.map((r, i) => {
        const share = Math.max(0, Math.min(1, (r.value ?? 0) / first));
        const w = share > 0 ? Math.max(share, 0.02) : 0;
        return (
          <li key={`${i}-${r.label}`} className="flex flex-col text-sm text-slate">
            {r.note && <p className="text-center text-xs text-slate" data-funnel-drop>{r.note}</p>}
            <div className="flex items-center justify-between gap-3">
              <RowLabel row={r} />
              <span className="font-semibold tabular-nums">{r.text}</span>
            </div>
            <svg height="20" aria-hidden="true" focusable="false" className="block w-full">
              <rect x="0" y="0" width={pct(1)} height="20" rx="6" fill={GRID} />
              {w > 0 && <rect x={pct((1 - w) / 2)} y="0" width={pct(w)} height="20" rx="6" fill={color} />}
            </svg>
          </li>
        );
      })}
    </ol>
  );
}

export function FactChart({
  id,
  title,
  note,
  kind,
  tone,
  rows,
  words,
  href,
  wide = false,
  centre,
  initialView = 'chart',
  children,
}: {
  id: string;
  title: string; // the one message
  note?: string; // how to read it, in one plain line
  kind: FactChartKind;
  tone: ColorToken;
  rows: readonly FactChartRow[];
  words: FactChartWords;
  href: string | null; // the rows behind the whole chart
  wide?: boolean;
  centre?: { value: string; word?: string }; // the whole, said in the donut's centre
  initialView?: 'chart' | 'table';
  children?: ReactNode; // "Why this?"
}) {
  const [view, setView] = useState(initialView);
  // A day's value or a class's percent is data even at zero (a class with nothing taught yet); a part of a whole is
  // something to draw only when there is some of it.
  const zeroIsData = kind === 'line' || kind === 'area' || kind === 'progress' || kind === 'hbars';
  const hasData = rows.some((r) => r.value !== null && (zeroIsData || r.value > 0));
  const dayChart = (k: 'line' | 'area', w: boolean) => (k === 'line' ? <Line rows={rows} tone={tone} title={title} wide={w} /> : <Area rows={rows} tone={tone} title={title} wide={w} />);
  const toggle = (
    <div role="group" aria-label={words.showAs} className="flex rounded-md border border-slate/10 bg-white p-0.5">
      {(['chart', 'table'] as const).map((v) => (
        <button key={v} type="button" data-chart-view={v} aria-pressed={view === v} onClick={() => setView(v)} className={view === v ? `${TAP} bg-sapphire text-white` : `${TAP} bg-white text-slate`}>
          {words[v]}
        </button>
      ))}
    </div>
  );
  return (
    <AppCard title={title} description={note} tone={tone} actions={hasData ? toggle : undefined} className="h-full">
      <div data-chart={id} data-chart-kind={kind} className="flex flex-col gap-2">
        {!hasData ? (
          <p data-chart-none className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{words.none}</p>
        ) : view === 'chart' ? (
          <>
            {kind === 'bars' && <Bars rows={rows} tone={tone} />}
            {kind === 'hbars' && <Bars rows={rows} tone={tone} compact />}
            {kind === 'progress' && <Progress rows={rows} tone={tone} />}
            {/* A chart across both columns is drawn wider only where there are two columns; on a phone it keeps the
                narrow drawing, so its words stay readable. The one not shown is not displayed, so it is not read out. */}
            {(kind === 'line' || kind === 'area') &&
              (wide ? (
                <>
                  <div className="lg:hidden">{dayChart(kind, false)}</div>
                  <div className="hidden lg:block">{dayChart(kind, true)}</div>
                </>
              ) : (
                dayChart(kind, false)
              ))}
            {kind === 'ring' && <Ring rows={rows} tone={tone} title={title} />}
            {kind === 'donut' && <Donut rows={rows} title={title} centre={centre} />}
            {kind === 'funnel' && <Funnel rows={rows} tone={tone} />}
            {words.gaps && <p className="text-xs text-slate">{words.gaps}</p>}
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="border-b border-slate/10">
                  <th scope="col" className="py-2 pr-3 font-semibold">{words.what}</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">{words.value}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${i}-${r.label}`} data-chart-table-row className="border-b border-slate/10">
                    <th scope="row" className="pr-3 font-normal">
                      {r.href ? (
                        <Link href={r.href} className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
                          {r.label}
                        </Link>
                      ) : (
                        <span className="inline-flex min-h-[44px] items-center">{r.label}</span>
                      )}
                    </th>
                    <td className="py-2 pr-3 tabular-nums">
                      {r.text}
                      {r.note && <span className="block text-xs">{r.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          {children}
          {href && (
            <Link href={href} data-chart-open className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
              {words.open}
            </Link>
          )}
        </div>
      </div>
    </AppCard>
  );
}
