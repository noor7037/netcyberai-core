'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { useInView, usePrefersReducedMotion } from '@/lib/hooks';

// Lightweight SVG charts: no chart library, no runtime dependency.
// Mark specs follow the dataviz method: 2px lines, >= 8px end markers
// with a surface ring, <= 24px columns with 4px rounded data-ends,
// hairline solid gridlines, a legend for >= 2 series, sparse direct
// labels, a hover/keyboard tooltip, and a visually hidden table view
// so no value is ever colour- or hover-only.

export interface Series {
  name: string;
  color: string;
  values: number[];
}

type Fmt = (v: number) => string;

const INK = { light: '#475569', dark: '#CBD5E1' };
const GRID = { light: '#E2E8F0', dark: 'rgba(255,255,255,0.12)' };
const SURFACE = { light: '#FFFFFF', dark: '#061233' };


// Render each chart at its real pixel width (1 SVG unit = 1 CSS px), so
// labels keep their true font size in small panels and on phones instead
// of shrinking with a scaled viewBox.
function useWidth<T extends HTMLElement>(fallback = 600): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const cw = Math.round(entry.contentRect.width);
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceTicks(min: number, max: number, count = 4): number[] {
  const step = (max - min) / count;
  return Array.from({ length: count + 1 }, (_, i) => Math.round((min + step * i) * 10) / 10);
}

function DataTable({ caption, labels, series, fmt }: { caption: string; labels: string[]; series: Series[]; fmt: Fmt }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Label</th>
          {series.map((s) => (
            <th key={s.name} scope="col">
              {s.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((l, i) => (
          <tr key={l}>
            <th scope="row">{l}</th>
            {series.map((s) => (
              <td key={s.name}>{fmt(s.values[i])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Legend({ series, dark }: { series: Series[]; dark: boolean }) {
  if (series.length < 2) return null;
  if (dark) {
    return (
      <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-80">
        {series.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.name}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate/70">
      {series.map((s) => (
        <li key={s.name} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

function Tooltip({ leftPct, lines }: { leftPct: number; lines: string[] }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-midnight px-2.5 py-1.5 text-xs text-white shadow-lg"
      style={{ left: `${Math.min(88, Math.max(12, leftPct))}%` }}
    >
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}

// ---- Line ---------------------------------------------------------------

export function LineChart({
  title,
  labels,
  series,
  min = 0,
  max = 100,
  height = 200,
  unit = '',
  prefix = '',
  dark = false,
  area = true,
}: {
  title: string;
  labels: string[];
  series: Series[];
  min?: number;
  max?: number;
  height?: number;
  unit?: string;
  prefix?: string;
  dark?: boolean;
  area?: boolean;
}) {
  const format: Fmt = (v) => `${prefix}${v}${unit}`;
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const shown = inView || reduced;
  const mode = dark ? 'dark' : 'light';
  const [wref, W] = useWidth<HTMLElement>();

  const H = height;
  const pl = 34;
  const pr = 44;
  const pt = 14;
  const pb = 26;
  const n = labels.length;
  const x = (i: number) => pl + (i * (W - pl - pr)) / Math.max(1, n - 1);
  const y = (v: number) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);

  function onMove(e: PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pl) / (W - pl - pr)) * (n - 1));
    setActive(Math.max(0, Math.min(n - 1, i)));
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight') setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? n) - 1));
    else if (e.key === 'Escape') setActive(null);
  }

  return (
    <figure ref={wref} className="w-full">
      <Legend series={series} dark={dark} />
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label={`${title}. Use left and right arrow keys to read values.`}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        className="relative rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan"
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
          {niceTicks(min, max).map((t) => (
            <g key={t}>
              <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke={GRID[mode]} strokeWidth={1} />
              <text x={pl - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={INK[mode]}>
                {t}
              </text>
            </g>
          ))}
          {labels.map((l, i) => (
            <text key={l} x={x(i)} y={H - 6} textAnchor="middle" fontSize={11} fill={INK[mode]}>
              {l}
            </text>
          ))}
          {series.map((s) => {
            const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
            const areaD = `${d} L${x(n - 1)},${y(min)} L${x(0)},${y(min)} Z`;
            const last = s.values[n - 1];
            return (
              <g key={s.name}>
                {area && (
                  <path
                    d={areaD}
                    fill={s.color}
                    style={{ opacity: shown ? 0.1 : 0, transition: 'opacity 900ms ease 300ms' }}
                  />
                )}
                <path
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  pathLength={1}
                  style={{
                    strokeDasharray: 1,
                    strokeDashoffset: shown ? 0 : 1,
                    transition: 'stroke-dashoffset 1300ms cubic-bezier(0.3,0.7,0.2,1)',
                  }}
                />
                <circle
                  cx={x(n - 1)}
                  cy={y(last)}
                  r={4.5}
                  fill={s.color}
                  stroke={SURFACE[mode]}
                  strokeWidth={2}
                  style={{ opacity: shown ? 1 : 0, transition: 'opacity 300ms ease 1200ms' }}
                />
                <text
                  x={x(n - 1) + 8}
                  y={y(last) + 4}
                  fontSize={12}
                  fontWeight={600}
                  fill={dark ? '#FFFFFF' : '#1E293B'}
                  style={{ opacity: shown ? 1 : 0, transition: 'opacity 300ms ease 1200ms' }}
                >
                  {format(last)}
                </text>
              </g>
            );
          })}
          {active !== null && (
            <g>
              <line x1={x(active)} x2={x(active)} y1={pt} y2={H - pb} stroke={INK[mode]} strokeWidth={1} />
              {series.map((s) => (
                <circle key={s.name} cx={x(active)} cy={y(s.values[active])} r={5} fill={s.color} stroke={SURFACE[mode]} strokeWidth={2} />
              ))}
            </g>
          )}
          <rect
            x={pl}
            y={pt}
            width={W - pl - pr}
            height={H - pt - pb}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
        {active !== null && (
          <Tooltip
            leftPct={(x(active) / W) * 100}
            lines={[labels[active], ...series.map((s) => `${s.name}: ${format(s.values[active])}`)]}
          />
        )}
      </div>
      <DataTable caption={title} labels={labels} series={series} fmt={format} />
    </figure>
  );
}

// ---- Columns --------------------------------------------------------------

export function ColumnChart({
  title,
  data,
  color,
  max,
  height = 190,
  unit = '',
  prefix = '',
  dark = false,
}: {
  title: string;
  data: { label: string; value: number }[];
  color: string;
  max?: number;
  height?: number;
  unit?: string;
  prefix?: string;
  dark?: boolean;
}) {
  const format: Fmt = (v) => `${prefix}${v}${unit}`;
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const [active, setActive] = useState<number | null>(null);
  const shown = inView || reduced;
  const mode = dark ? 'dark' : 'light';
  const top = max ?? Math.max(...data.map((d) => d.value)) * 1.15;
  const [wref, W] = useWidth<HTMLElement>();

  const H = height;
  const pl = 8;
  const pr = 8;
  const pt = 22;
  const pb = 26;
  const band = (W - pl - pr) / data.length;
  const bw = Math.min(28, band * 0.55);
  const y = (v: number) => pt + (1 - v / top) * (H - pt - pb);
  const base = H - pb;

  return (
    <figure ref={wref} className="w-full">
      <div ref={ref} className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label={title}>
          <line x1={pl} x2={W - pr} y1={base} y2={base} stroke={GRID[mode]} strokeWidth={1} />
          {data.map((d, i) => {
            const cx = pl + band * i + band / 2;
            const top_ = y(d.value);
            const r = 4;
            const h = base - top_;
            const path = `M${cx - bw / 2},${base} L${cx - bw / 2},${top_ + r} Q${cx - bw / 2},${top_} ${cx - bw / 2 + r},${top_} L${cx + bw / 2 - r},${top_} Q${cx + bw / 2},${top_} ${cx + bw / 2},${top_ + r} L${cx + bw / 2},${base} Z`;
            return (
              <g
                key={d.label}
                tabIndex={0}
                role="img"
                aria-label={`${d.label}: ${format(d.value)}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                className="outline-none"
              >
                <rect x={cx - band / 2} y={pt} width={band} height={H - pt - pb} fill="transparent" />
                <path
                  d={path}
                  fill={color}
                  opacity={active === null || active === i ? 1 : 0.55}
                  style={{
                    transform: shown ? 'scaleY(1)' : 'scaleY(0)',
                    transformOrigin: 'bottom',
                    transformBox: 'fill-box',
                    transition: `transform 800ms cubic-bezier(0.3,0.7,0.2,1) ${i * 70}ms, opacity 150ms`,
                  }}
                />
                <text
                  x={cx}
                  y={Math.max(12, top_ - 6)}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={600}
                  fill={dark ? '#FFFFFF' : '#1E293B'}
                  style={{ opacity: shown ? 1 : 0, transition: `opacity 300ms ease ${600 + i * 70}ms` }}
                >
                  {format(d.value)}
                </text>
                <text x={cx} y={H - 7} textAnchor="middle" fontSize={11} fill={INK[mode]}>
                  {d.label}
                </text>
                {active === i && h > 0 && (
                  <rect x={cx - bw / 2 - 3} y={top_ - 3} width={bw + 6} height={h + 3} fill="none" stroke={INK[mode]} strokeWidth={1} rx={5} />
                )}
              </g>
            );
          })}
        </svg>
        {active !== null && (
          <Tooltip
            leftPct={((pl + band * active + band / 2) / W) * 100}
            lines={[`${data[active].label}: ${format(data[active].value)}`]}
          />
        )}
      </div>
      <DataTable
        caption={title}
        labels={data.map((d) => d.label)}
        series={[{ name: title, color, values: data.map((d) => d.value) }]}
        fmt={format}
      />
    </figure>
  );
}

// ---- Donut / ring -----------------------------------------------------------

export function Ring({
  value,
  max = 100,
  color,
  size = 120,
  label,
  center,
  dark = false,
  track,
}: {
  value: number;
  max?: number;
  color: string;
  size?: number;
  label: string;
  center: string;
  dark?: boolean;
  track?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const shown = inView || reduced;
  const r = 42;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / max));
  return (
    <div ref={ref} className="inline-flex flex-col items-center" style={{ width: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${label}: ${center}`}>
        <circle cx={50} cy={50} r={r} fill="none" stroke={track ?? (dark ? 'rgba(255,255,255,0.14)' : '#E2E8F0')} strokeWidth={10} />
        <circle
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={10}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          strokeDasharray={c}
          style={{ strokeDashoffset: shown ? c * (1 - frac) : c, transition: 'stroke-dashoffset 1200ms cubic-bezier(0.3,0.7,0.2,1)' }}
        />
        <text x={50} y={55} textAnchor="middle" fontSize={20} fontWeight={700} fill={dark ? '#FFFFFF' : '#1E293B'}>
          {center}
        </text>
      </svg>
    </div>
  );
}

// ---- Funnel -------------------------------------------------------------------

export function Funnel({
  title,
  stages,
  colors,
  dark = false,
}: {
  title: string;
  stages: { label: string; value: number }[];
  colors: string[];
  dark?: boolean;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const shown = inView || reduced;
  const top = stages[0]?.value || 1;
  return (
    <figure ref={ref} className="flex w-full flex-col gap-2" aria-label={title}>
      {stages.map((s, i) => {
        const pct = Math.round((s.value / top) * 100);
        const conv = i > 0 ? Math.round((s.value / stages[i - 1].value) * 100) : null;
        return (
          <div key={s.label} className="flex flex-col gap-1">
            {dark ? (
              <div className="flex items-baseline justify-between text-xs opacity-90">
                <span>{s.label}</span>
                <span className="font-semibold">
                  {s.value}
                  {conv !== null && <span className="ml-2 font-normal opacity-80">{`${conv}% of previous`}</span>}
                </span>
              </div>
            ) : (
              <div className="flex items-baseline justify-between text-xs text-slate/70">
                <span>{s.label}</span>
                <span className="font-semibold text-slate">
                  {s.value}
                  {conv !== null && <span className="ml-2 font-normal text-slate/70">{`${conv}% of previous`}</span>}
                </span>
              </div>
            )}
            <div className="h-3 w-full overflow-hidden rounded-full" style={{ backgroundColor: dark ? 'rgba(255,255,255,0.1)' : '#EEF2F7' }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: shown ? `${pct}%` : '0',
                  backgroundColor: colors[i % colors.length],
                  transition: `width 900ms cubic-bezier(0.3,0.7,0.2,1) ${i * 120}ms`,
                }}
              />
            </div>
          </div>
        );
      })}
    </figure>
  );
}

// ---- Progress bar -------------------------------------------------------------

export function Meter({ value, max = 100, color, label, dark = false }: { value: number; max?: number; color: string; label: string; dark?: boolean }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const shown = inView || reduced;
  const pct = Math.round((value / max) * 100);
  return (
    <div ref={ref} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: dark ? 'rgba(255,255,255,0.12)' : '#EEF2F7' }}>
        <div
          className="h-full rounded-full"
          style={{ width: shown ? `${pct}%` : '0', backgroundColor: color, transition: 'width 900ms cubic-bezier(0.3,0.7,0.2,1)' }}
        />
      </div>
    </div>
  );
}

// ---- Sparkline ---------------------------------------------------------------

export function Sparkline({ values, color, label }: { values: number[]; color: string; label: string }) {
  const W = 100;
  const H = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => (i * W) / Math.max(1, values.length - 1);
  const y = (v: number) => H - 3 - ((v - min) / Math.max(1, max - min)) * (H - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-full" role="img" aria-label={label} preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
