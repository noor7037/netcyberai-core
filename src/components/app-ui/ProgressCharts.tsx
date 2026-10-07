'use client';

import { useId, useState, type ReactNode } from 'react';
import { colors, sequentialRoyal, seriesColor } from '@/lib/design-tokens';
import type { ValueUnit } from '@/lib/contracts/charts';
import type { ColorToken } from '@/lib/contracts/modules';
import { AppCard } from './Card';
import { formatValue, NO_VALUE } from './format';
import { EmptyState } from './States';

// The chart forms of docs/19 §3.4 that the V4 kit does not have: ring
// progress, donut, score gauge, gradient area and calendar heat grid. The
// rules they all keep (docs/19 §3.6): one axis; a legend for two or more
// series; text in slate, never in a series colour; thin marks and 2 px
// gaps; a table view for every chart; an empty state that says what to do;
// nothing animates, so nothing moves under prefers-reduced-motion. Every
// value is a prop computed by the caller from real records: null and empty
// mean "no data yet", never a guess.

export type ChartTableData = { columns: readonly string[]; rows: readonly (readonly (string | number | null)[])[] };

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// A chart card with its Chart / Table switch and its empty state.
export function ChartFrame({
  title,
  tone,
  hasData,
  emptyHint,
  table,
  unit,
  initialView = 'chart',
  children,
}: {
  title: string;
  tone?: ColorToken;
  hasData: boolean;
  emptyHint: string;
  table: ChartTableData;
  unit: ValueUnit;
  initialView?: 'chart' | 'table';
  children: ReactNode;
}) {
  const [view, setView] = useState(initialView);
  const toggle = (
    <div role="group" aria-label="Show as" className="flex rounded-md border border-slate/15 bg-white p-0.5 text-sm">
      {(['chart', 'table'] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`min-h-[44px] rounded px-3 font-semibold ${view === v ? 'bg-sapphire text-white' : 'bg-white text-slate'}`}>
          {v === 'chart' ? 'Chart' : 'Table'}
        </button>
      ))}
    </div>
  );
  return (
    <AppCard title={title} tone={tone} actions={hasData ? toggle : undefined}>
      {!hasData ? (
        <EmptyState title="No data yet" whatToDo={emptyHint} />
      ) : view === 'chart' ? (
        children
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-slate/10">
                {table.columns.map((c, i) => (
                  <th key={i} scope="col" className="py-2 pr-3 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r} className="border-b border-slate/5">
                  {row.map((cell, c) =>
                    c === 0 ? (
                      <th key={c} scope="row" className="py-2 pr-3 font-normal">
                        {cell ?? NO_VALUE}
                      </th>
                    ) : (
                      <td key={c} className="py-2 pr-3 tabular-nums">
                        {typeof cell === 'number' ? formatValue(cell, unit) : (cell ?? NO_VALUE)}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppCard>
  );
}

// The card surface the charts sit on (the validator's light surface).
const SURFACE = '#FFFFFF';
const TAU = Math.PI * 2;
// The smallest arc still drawn (in turns), so a small part never vanishes.
const MIN_ARC = 0.006;
const polar = (cx: number, cy: number, r: number, turn: number) => [cx + r * Math.cos(turn * TAU - Math.PI / 2), cy + r * Math.sin(turn * TAU - Math.PI / 2)] as const;
// An arc from `from` to `to` (in turns, clockwise from the top).
function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r} ${r} 0 ${to - from > 0.5 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

// How much is done, out of a whole: "42 of 60 classes marked".
export function RingProgress({ title, done, total, noun, doneWord = 'done', tone = 'royal', emptyHint, initialView }: { title: string; done: number; total: number; noun: string; doneWord?: string; tone?: ColorToken; emptyHint: string; initialView?: 'chart' | 'table' }) {
  const share = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  const pct = Math.round(share * 100);
  const sentence = `${done.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} ${noun} ${doneWord}`;
  return (
    <ChartFrame title={title} tone={tone} hasData={total > 0} emptyHint={emptyHint} unit="count" initialView={initialView} table={{ columns: ['', noun], rows: [[doneWord.charAt(0).toUpperCase() + doneWord.slice(1), done], ['Left', Math.max(0, total - done)], ['Total', total]] }}>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 120 120" role="img" aria-label={`${title}: ${sentence} (${pct}%)`} className="h-28 w-28 shrink-0">
          <circle cx={60} cy={60} r={48} fill="none" stroke={colors.slate} strokeOpacity={0.1} strokeWidth={12} />
          {share > 0 && (share >= 1 ? <circle cx={60} cy={60} r={48} fill="none" stroke={colors[tone]} strokeWidth={12} /> : <path d={arc(60, 60, 48, 0, share)} fill="none" stroke={colors[tone]} strokeWidth={12} strokeLinecap="round" />)}
          <text x={60} y={67} textAnchor="middle" fontSize={24} fontWeight={800} fill={colors.slate}>
            {pct}%
          </text>
        </svg>
        <p className="text-base font-semibold text-slate">{sentence}</p>
      </div>
    </ChartFrame>
  );
}

export type DonutSlice = { id: string; label: string; value: number };

// Parts of a whole, at most five; a sixth and later fold into "Other".
export function DonutChart({ title, slices, unit, tone, emptyHint, initialView }: { title: string; slices: readonly DonutSlice[]; unit: ValueUnit; tone?: ColorToken; emptyHint: string; initialView?: 'chart' | 'table' }) {
  const positive = slices.filter((s) => s.value > 0);
  const shown = positive.length > 5 ? [...positive.slice(0, 4), { id: 'other', label: 'Other', value: positive.slice(4).reduce((a, s) => a + s.value, 0) }] : positive;
  const total = shown.reduce((a, s) => a + s.value, 0);
  const gap = shown.length > 1 ? 0.008 : 0; // about 2 px of surface between segments
  let at = 0;
  return (
    <ChartFrame title={title} tone={tone} hasData={total > 0} emptyHint={emptyHint} unit={unit} initialView={initialView} table={{ columns: ['', 'Value', 'Share'], rows: slices.map((s) => [s.label, s.value, total ? `${Math.round((s.value / total) * 100)}%` : NO_VALUE]) }}>
      <div className="flex flex-wrap items-center gap-4">
        <svg viewBox="0 0 120 120" role="img" aria-label={`${title}: ${shown.map((s) => `${s.label} ${formatValue(s.value, unit)}`).join(', ')}`} className="h-32 w-32 shrink-0">
          {shown.map((s, i) => {
            const from = at;
            at += s.value / total;
            const color = s.id === 'other' ? seriesColor(99) : seriesColor(i);
            return shown.length === 1 ? (
              <circle key={s.id} cx={60} cy={60} r={44} fill="none" stroke={color} strokeWidth={18} />
            ) : (
              <path key={s.id} d={at - from > MIN_ARC + 2 * gap ? arc(60, 60, 44, from + gap, at - gap) : arc(60, 60, 44, from, Math.max(at, from + MIN_ARC))} fill="none" stroke={color} strokeWidth={18}>
                <title>{`${s.label}: ${formatValue(s.value, unit)}`}</title>
              </path>
            );
          })}
        </svg>
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm text-slate" aria-label="Legend">
          {shown.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: s.id === 'other' ? seriesColor(99) : seriesColor(i) }} />
              <span className="flex min-w-0 flex-1 flex-wrap justify-between gap-x-3">
                <span>{s.label}</span>
                <span className="font-semibold tabular-nums">
                  {formatValue(s.value, unit)} · {Math.round((s.value / total) * 100)}%
                </span>
              </span>
            </li>
          ))}
          <li className="mt-1 flex flex-wrap justify-between gap-x-3 border-t border-slate/10 pt-1.5 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatValue(total, unit)}</span>
          </li>
        </ul>
      </div>
    </ChartFrame>
  );
}

export type GaugeBand = { upTo: number; word: string; token: 'coral' | 'tangerine' | 'turquoise' };
export const DEFAULT_BANDS: readonly GaugeBand[] = [
  { upTo: 50, word: 'Act', token: 'coral' },
  { upTo: 75, word: 'Watch', token: 'tangerine' },
  { upTo: 100, word: 'Good', token: 'turquoise' },
];

// A 0 to 100 score against bands named in words. The band is status, so it
// is always said in words beside the number, never by colour alone.
export function GaugeChart({ title, score, bands = DEFAULT_BANDS, tone, emptyHint, initialView }: { title: string; score: number | null; bands?: readonly GaugeBand[]; tone?: ColorToken; emptyHint: string; initialView?: 'chart' | 'table' }) {
  // Rounded first, so the number shown and its band always agree.
  const value = score === null || !Number.isFinite(score) ? null : Math.round(Math.min(100, Math.max(0, score)));
  const band = value === null ? null : (bands.find((b) => value <= b.upTo) ?? bands[bands.length - 1]);
  // The half circle runs from the left (0) over the top to the right (100).
  const turn = (v: number) => 0.75 + (v / 100) * 0.5;
  const needle = value === null ? null : polar(70, 70, 44, turn(value));
  let from = 0;
  return (
    <ChartFrame title={title} tone={tone} hasData={value !== null} emptyHint={emptyHint} unit="score" initialView={initialView} table={{ columns: ['', 'Score'], rows: [['Score', value], ...bands.map((b, i) => [`${b.word}`, `${i === 0 ? 0 : bands[i - 1].upTo + 1} to ${b.upTo}`] as const)] }}>
      <div className="flex flex-wrap items-center gap-4">
        <svg viewBox="0 0 140 84" role="img" aria-label={`${title}: ${value} out of 100, ${band?.word}`} className="h-28 w-44 shrink-0">
          {bands.map((b) => {
            const d = arc(70, 70, 56, turn(from) + 0.004, turn(b.upTo) - 0.004);
            from = b.upTo;
            return <path key={b.word} d={d} fill="none" stroke={colors[b.token]} strokeWidth={12} />;
          })}
          {needle && <line x1={70} y1={70} x2={needle[0]} y2={needle[1]} stroke={colors.slate} strokeWidth={3} strokeLinecap="round" />}
          <circle cx={70} cy={70} r={5} fill={colors.slate} />
        </svg>
        <div>
          <p className="text-3xl font-extrabold tabular-nums text-slate">{value === null ? NO_VALUE : value}</p>
          <p className="text-base font-semibold text-slate">{band?.word}</p>
          <p className="text-xs text-slate/70">{bands.map((b, i) => `${b.word} ${i === 0 ? 0 : bands[i - 1].upTo + 1}–${b.upTo}`).join(' · ')}</p>
        </div>
      </div>
    </ChartFrame>
  );
}

export type TrendPoint = { t: string; v: number | null }; // t: ISO date

// Change over time, one series: a 2 px line over a soft wash of its colour.
// Days with no value are left out of the line and counted under it.
export function AreaTrend({ title, seriesLabel, points, unit, tone = 'royal', emptyHint, initialView }: { title: string; seriesLabel: string; points: readonly TrendPoint[]; unit: ValueUnit; tone?: ColorToken; emptyHint: string; initialView?: 'chart' | 'table' }) {
  const gradient = useId();
  const real = points.map((p, i) => ({ ...p, i })).filter((p): p is { t: string; v: number; i: number } => p.v !== null && Number.isFinite(p.v));
  const missing = points.length - real.length;
  const max = Math.max(unit === 'percent' ? 100 : 1, ...real.map((p) => p.v)) * (unit === 'percent' ? 1 : 1.1);
  const W = 320;
  const H = 120;
  const BASE = H - 24;
  // A point sits at its day's place, so a gap in the data is a gap in the line.
  const x = (i: number) => (points.length === 1 ? W / 2 : 8 + (i / (points.length - 1)) * (W - 56));
  const y = (v: number) => 10 + (1 - Math.max(0, v) / max) * (H - 34);
  const runs: (typeof real)[] = [];
  for (const p of real) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1].i === p.i - 1) run.push(p);
    else runs.push([p]);
  }
  const path = (run: typeof real) => run.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
  const last = real[real.length - 1];
  const color = colors[tone];
  return (
    <ChartFrame title={title} tone={tone} hasData={real.length > 0} emptyHint={emptyHint} unit={unit} initialView={initialView} table={{ columns: ['Date', seriesLabel], rows: points.map((p) => [shortDate(p.t), p.v]) }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${seriesLabel}: ${real.map((p) => `${shortDate(p.t)} ${formatValue(p.v, unit)}`).join(', ')}`} className="h-auto w-full">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity={0.22} />
            <stop offset="1" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <line x1={8} y1={BASE} x2={W - 8} y2={BASE} stroke={colors.slate} strokeOpacity={0.15} />
        {runs
          .filter((run) => run.length > 1)
          .map((run) => (
            <g key={run[0].t}>
              <path d={`${path(run)}L${x(run[run.length - 1].i).toFixed(1)} ${BASE}L${x(run[0].i).toFixed(1)} ${BASE}Z`} fill={`url(#${gradient})`} />
              <path d={path(run)} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" data-run="line" />
            </g>
          ))}
        {real.map((p) => {
          const end = p === last;
          // A day on its own (no neighbour with data) is drawn as a dot, or it would be invisible.
          const alone = !runs.some((run) => run.length > 1 && run.includes(p));
          return (
            <circle key={p.t} cx={x(p.i)} cy={y(p.v)} r={end ? 4 : alone ? 3 : 7} fill={end || alone ? color : 'transparent'} stroke={end ? SURFACE : 'none'} strokeWidth={2}>
              <title>{`${shortDate(p.t)}: ${formatValue(p.v, unit)}`}</title>
            </circle>
          );
        })}
        {last && (
          <text x={Math.min(W - 4, x(last.i) + 8)} y={y(last.v) + 4} fontSize={12} fontWeight={700} fill={colors.slate}>
            {formatValue(last.v, unit)}
          </text>
        )}
        {points.length > 0 && (
          <>
            <text x={8} y={H - 8} fontSize={10} fill={colors.slate}>
              {shortDate(points[0].t)}
            </text>
            {points.length > 1 && (
              <text x={x(points.length - 1)} y={H - 8} fontSize={10} textAnchor="end" fill={colors.slate}>
                {shortDate(points[points.length - 1].t)}
              </text>
            )}
          </>
        )}
      </svg>
      {missing > 0 && <p className="text-xs text-slate/70">{missing === 1 ? '1 day has no data and is' : `${missing} days have no data and are`} left as a gap.</p>}
    </ChartFrame>
  );
}

export type HeatDay = { date: string; value: number | null }; // ISO date; null = no data that day

// A daily pattern over weeks: one hue, light to dark (the validated royal
// ramp). Days without data are an outlined empty cell, never the lightest
// colour. Columns are weeks, rows Monday to Sunday.
export function CalendarHeat({ title, days, unit, max, tone, emptyHint, initialView }: { title: string; days: readonly HeatDay[]; unit: ValueUnit; max?: number; tone?: ColorToken; emptyHint: string; initialView?: 'chart' | 'table' }) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const withData = sorted.filter((d) => d.value !== null);
  // Shades run from the lowest to the highest value shown, so a month of
  // 80 to 100 % still shows its pattern; the legend says the two ends.
  const values = withData.map((d) => d.value as number);
  const low = values.length ? Math.min(...values) : 0;
  const high = Math.max(low, max ?? (values.length ? Math.max(...values) : 0));
  const steps = sequentialRoyal.steps;
  const step = (v: number) => (high === low ? steps[steps.length - 1] : steps[Math.min(steps.length - 1, Math.max(0, Math.floor(((v - low) / (high - low)) * steps.length)))]);
  const weekday = (iso: string) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const first = sorted[0] ? Math.floor(Date.parse(`${sorted[0].date}T00:00:00Z`) / 86400000) - weekday(sorted[0].date) : 0;
  const week = (iso: string) => Math.floor((Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000) - first) / 7);
  const weeks = sorted.length ? week(sorted[sorted.length - 1].date) + 1 : 0;
  const C = 16;
  return (
    <ChartFrame title={title} tone={tone} hasData={withData.length > 0} emptyHint={emptyHint} unit={unit} initialView={initialView} table={{ columns: ['Date', 'Value'], rows: sorted.map((d) => [shortDate(d.date), d.value]) }}>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${26 + weeks * C} ${7 * C + 2}`} role="img" aria-label={`${title}: ${withData.length} days with data, from ${sorted[0] ? shortDate(sorted[0].date) : ''} to ${sorted.length ? shortDate(sorted[sorted.length - 1].date) : ''}`} style={{ width: Math.max(180, (26 + weeks * C) * 1.6), maxWidth: '100%' }}>
          {['Mon', 'Wed', 'Fri'].map((d, i) => (
            <text key={d} x={0} y={i * 2 * C + 11} fontSize={8} fill={colors.slate}>
              {d}
            </text>
          ))}
          {sorted.map((d) => (
            <rect key={d.date} x={26 + week(d.date) * C} y={weekday(d.date) * C + 1} width={C - 2} height={C - 2} rx={3} fill={d.value === null ? SURFACE : sequentialRoyal.color} fillOpacity={d.value === null ? 1 : step(d.value)} stroke={d.value === null ? colors.slate : 'none'} strokeOpacity={0.25}>
              <title>{`${shortDate(d.date)}: ${d.value === null ? 'no data' : formatValue(d.value, unit)}`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate">
        {formatValue(low, unit)}
        {steps.map((o) => (
          <span key={o} aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ backgroundColor: sequentialRoyal.color, opacity: o }} />
        ))}
        {formatValue(high, unit)}
        <span aria-hidden="true" className="ml-2 h-3 w-3 rounded-sm border border-slate/30 bg-white" />
        No data
      </p>
    </ChartFrame>
  );
}
