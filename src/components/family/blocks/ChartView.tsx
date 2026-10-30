'use client';

import type { Chart } from '@/lib/family/blocks';
import { chartSeries, colors } from '@/lib/design-tokens';
import { fill, type Words } from '@/lib/family/fill';
import { Card } from './BlockViews';
import { PART_HEX } from './SceneView';

// A chart (W10-6, docs/39 §5) of the figures the answer states, drawn by our own code from checked data
// (src/lib/family/blocks.ts: 2 to 12 points, 1 to 3 series of finite numbers). No chart library.
//   - bar and line: the axis scaled here from the given values (round steps of 1, 2 or 5 times a power of ten, zero
//     always on a bar chart's axis); pie: each slice's percentage worked out here, whole numbers that add to 100.
//   - Text in slate; the series in the chart palette (design-tokens chartSeries, in its fixed order), a pie's slices in
//     the scene's part palette; a 2 px white gap between fills; a legend for several series; the unit; and the caption
//     "Figures as given in this answer". The numbers are also in a table under "The numbers" (the palette's lighter
//     hues sit under 3:1 on white, so the values are always there in text).

export const CHART_W = 360;
const H = 240;
const M = { top: 22, right: 12, bottom: 52, left: 46 };

// Round axis steps: the smallest of 1, 2 or 5 times a power of ten that covers the range in at most `count` steps.
export function niceTicks(lo: number, hi: number, count = 5): number[] {
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) / 2;
    lo -= pad;
    hi += pad;
  }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * mag).find((s) => (hi - lo) / s <= count) ?? 10 * mag;
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const out: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return out;
}

// A slice's share as a whole-number percentage; the shares add to exactly 100 (largest remainder).
export function piePercents(values: readonly number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => (v / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, r: x - Math.floor(x) })).sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

const number = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const seriesHex = (i: number) => chartSeries[i % chartSeries.length];
const sliceHex = (i: number) => PART_HEX[i % PART_HEX.length];

function Axes({ b }: { b: Chart }) {
  const all = b.series.flatMap((s) => s.values);
  const ticks = niceTicks(b.kind === 'bar' ? Math.min(0, ...all) : Math.min(...all), b.kind === 'bar' ? Math.max(0, ...all) : Math.max(...all));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const n = b.labels.length;
  const tilt = n > 5;
  // Tilted labels lean left of their point: a wider left margin keeps the first one inside the picture.
  const left = tilt ? 66 : M.left;
  const plotW = CHART_W - left - M.right;
  const plotH = H - M.top - M.bottom;
  const y = (v: number) => M.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const slot = plotW / n;
  const cx = (i: number) => left + slot * i + slot / 2;
  const bars = b.series.length * n;
  return (
    <>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={CHART_W - M.right} y1={y(t)} y2={y(t)} stroke={colors.slate} strokeOpacity={t === 0 ? 0.6 : 0.12} strokeWidth={t === 0 ? 1.5 : 1} />
          <text x={left - 6} y={y(t) + 4} textAnchor="end" fontSize="13" fill={colors.slate}>
            {number(t)}
          </text>
        </g>
      ))}
      {b.kind === 'bar' &&
        b.series.map((s, k) => {
          const inner = slot * 0.76;
          const bw = inner / b.series.length;
          return s.values.map((v, i) => {
            const x = cx(i) - inner / 2 + k * bw;
            const top = Math.min(y(v), y(0));
            return (
              <g key={`${k}-${i}`} data-chart-bar>
                {/* A 2 px gap between neighbouring fills. */}
                <rect x={x + 1} y={top} width={Math.max(1, bw - 2)} height={Math.max(1, Math.abs(y(v) - y(0)))} rx="3" fill={seriesHex(k)} />
                {bars <= 12 && (
                  <text x={x + bw / 2} y={v >= 0 ? top - 4 : top + Math.abs(y(v) - y(0)) + 12} textAnchor="middle" fontSize="12.5" fontWeight="700" fill={colors.slate}>
                    {number(v)}
                  </text>
                )}
              </g>
            );
          });
        })}
      {b.kind === 'line' &&
        b.series.map((s, k) => (
          <g key={k} data-chart-line>
            <polyline points={s.values.map((v, i) => `${cx(i)},${y(v)}`).join(' ')} fill="none" stroke={seriesHex(k)} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            {s.values.map((v, i) => (
              <circle key={i} cx={cx(i)} cy={y(v)} r="4.5" fill={seriesHex(k)} stroke="#ffffff" strokeWidth="2" />
            ))}
          </g>
        ))}
      {b.labels.map((l, i) => (
        <text key={i} x={cx(i)} y={H - M.bottom + 16} textAnchor={tilt ? 'end' : 'middle'} transform={tilt ? `rotate(-35 ${cx(i)} ${H - M.bottom + 16})` : undefined} fontSize={tilt ? 12 : 13} fill={colors.slate}>
          {l}
        </text>
      ))}
    </>
  );
}

function Pie({ b }: { b: Chart }) {
  const values = b.series[0].values;
  const total = values.reduce((a, v) => a + v, 0);
  const cx = CHART_W / 2;
  const cy = 110;
  const r = 100;
  let angle = -Math.PI / 2;
  return (
    <>
      {values.map((v, i) => {
        const a0 = angle;
        const a1 = angle + (v / total) * Math.PI * 2;
        angle = a1;
        if (v <= 0) return null;
        // A whole circle cannot be one arc: draw it as a circle.
        if (v === total) return <circle key={i} cx={cx} cy={cy} r={r} fill={sliceHex(i)} data-chart-slice />;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const d = ['M', cx, cy, 'L', cx + r * Math.cos(a0), cy + r * Math.sin(a0), 'A', r, r, 0, large, 1, cx + r * Math.cos(a1), cy + r * Math.sin(a1), 'Z'].join(' ');
        // The 2 px gap: a white edge on every slice.
        return <path key={i} d={d} fill={sliceHex(i)} stroke="#ffffff" strokeWidth="2" strokeLinejoin="round" data-chart-slice />;
      })}
    </>
  );
}

export function ChartView({ b, w, tone }: { b: Chart; w: Words; tone: string }) {
  const pie = b.kind === 'pie';
  const percents = pie ? piePercents(b.series[0].values) : [];
  const unit = b.unit ? ` ${b.unit}` : '';
  return (
    <Card title={b.title} tone={tone} tag="chart">
      {b.unit && <p className="text-sm font-semibold text-slate">{fill(w['fam.block.chartUnit'], { unit: b.unit })}</p>}
      <svg data-chart-svg data-kind={b.kind} viewBox={`0 0 ${CHART_W} ${pie ? 220 : H}`} className="mx-auto w-full max-w-[480px]" role="img" aria-label={b.title}>
        {pie ? <Pie b={b} /> : <Axes b={b} />}
      </svg>
      {pie ? (
        <ul data-chart-legend className="grid grid-cols-1 gap-1.5 min-[480px]:grid-cols-2">
          {b.labels.map((l, i) => (
            <li key={i} className="flex items-center gap-2 text-sm text-slate">
              <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: sliceHex(i) }} />
              <span className="font-bold">{l}</span>
              <span data-chart-percent>{percents[i]}%</span>
              <span className="text-slate/80">
                ({number(b.series[0].values[i])}
                {unit})
              </span>
            </li>
          ))}
        </ul>
      ) : (
        b.series.length > 1 && (
          <ul data-chart-legend className="flex flex-wrap gap-x-4 gap-y-1.5">
            {b.series.map((s, k) => (
              <li key={k} className="flex items-center gap-2 text-sm font-bold text-slate">
                <span aria-hidden="true" className="h-3.5 w-3.5 shrink-0 rounded-sm" style={{ background: seriesHex(k) }} />
                {s.label}
              </li>
            ))}
          </ul>
        )
      )}
      <details className="rounded-2xl bg-off-white px-3 ring-1 ring-slate/10">
        <summary className="flex min-h-[44px] cursor-pointer items-center text-sm font-bold text-slate">{w['fam.block.chartTable']}</summary>
        <table data-chart-table className="mb-3 w-full text-left text-sm text-slate">
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-2" />
              {b.series.map((s, k) => (
                <th key={k} scope="col" className="py-1 pr-2 font-bold">
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.labels.map((l, i) => (
              <tr key={i} className="border-t border-slate/10">
                <th scope="row" className="py-1 pr-2 font-semibold">
                  {l}
                </th>
                {b.series.map((s, k) => (
                  <td key={k} className="py-1 pr-2">
                    {number(s.values[i])}
                    {unit}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <p data-chart-caption className="text-xs font-semibold text-slate">
        {w['fam.block.chartCaption']}
      </p>
    </Card>
  );
}
