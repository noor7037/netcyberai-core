'use client';

import { useState } from 'react';
import { ColumnChart, LineChart } from '@/components/visual/Charts';
import { chartAsTable, type ChartData } from '@/lib/contracts/charts';
import { chartSeries } from '@/lib/design-tokens';
import type { ColorToken } from '@/lib/contracts/modules';
import { AppCard } from './Card';
import { formatValue, NO_VALUE } from './format';
import { EmptyState } from './States';

// A chart with its table (17 §4: one message per chart, value labels, a
// table view for every chart). Drawn with the V4 chart kit. A missing value
// (null) is never drawn as a number: points with no data are left out of
// the drawing, counted under it, and shown as "—" in the table.

function hasData(chart: ChartData): boolean {
  if (chart.kind === 'time_series') return chart.series.some((s) => s.points.some((p) => p.v !== null));
  if (chart.kind === 'category') return chart.series.some((s) => s.values.some((v) => v !== null));
  return chart.slices.some((s) => s.value > 0);
}

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Drawing({ chart }: { chart: ChartData }) {
  if (chart.kind === 'time_series') {
    const dates = [...new Set(chart.series.flatMap((s) => s.points.map((p) => p.t)))].sort();
    // Only dates where every series has a value; the rest are counted below.
    const full = dates.filter((t) => chart.series.every((s) => s.points.find((p) => p.t === t)?.v != null));
    const missing = dates.length - full.length;
    const values = chart.series.flatMap((s) => s.points.map((p) => p.v).filter((v): v is number => v !== null));
    const max = chart.unit === 'percent' ? 100 : Math.max(1, ...values) * 1.1;
    return (
      <>
        <LineChart
          title={chart.title}
          labels={full.map(shortDate)}
          series={chart.series.map((s, i) => ({ name: s.label, color: chartSeries[i % chartSeries.length], values: full.map((t) => s.points.find((p) => p.t === t)!.v!) }))}
          min={0}
          max={max}
          unit={chart.unit === 'percent' ? '%' : ''}
        />
        {missing > 0 && <p className="text-xs text-slate/70">{missing === 1 ? '1 day has' : `${missing} days have`} no data yet and is left out.</p>}
      </>
    );
  }
  if (chart.kind === 'category') {
    const s = chart.series[0];
    const data = chart.categories.map((label, i) => ({ label, value: s.values[i] })).filter((d): d is { label: string; value: number } => d.value !== null);
    const missing = chart.categories.length - data.length;
    return (
      <>
        <ColumnChart title={chart.title} data={data} color={chartSeries[0]} max={chart.unit === 'percent' ? 100 : undefined} unit={chart.unit === 'percent' ? '%' : ''} />
        {missing > 0 && <p className="text-xs text-slate/70">{missing === 1 ? '1 has' : `${missing} have`} no data yet and {missing === 1 ? 'is' : 'are'} left out.</p>}
      </>
    );
  }
  const total = chart.slices.reduce((a, s) => a + s.value, 0);
  return (
    <ul className="flex flex-col gap-2" aria-label={chart.title}>
      {chart.slices.map((s, i) => {
        const share = total ? (s.value / total) * 100 : 0;
        return (
          <li key={s.id} className="text-sm text-slate">
            <div className="mb-1 flex justify-between gap-2">
              <span>{s.label}</span>
              <span className="font-semibold tabular-nums">
                {formatValue(s.value, chart.unit)} · {formatValue(share, 'percent')}
              </span>
            </div>
            <span className="block h-2 overflow-hidden rounded-full bg-slate/10" aria-hidden="true">
              <span className="block h-full rounded-full" style={{ width: `${share}%`, backgroundColor: chartSeries[i % chartSeries.length] }} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ChartTable({ chart }: { chart: ChartData }) {
  const table = chartAsTable(chart);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm text-slate">
        <caption className="sr-only">{chart.title}</caption>
        <thead>
          <tr className="border-b border-slate/10">
            {table.columns.map((c, i) => (
              <th key={i} scope="col" className="py-2 pr-3 font-semibold">
                {c || 'Item'}
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
                    {cell === null ? NO_VALUE : chart.kind === 'time_series' ? shortDate(String(cell)) : cell}
                  </th>
                ) : (
                  <td key={c} className="py-2 pr-3 tabular-nums">
                    {typeof cell === 'number' ? formatValue(cell, chart.unit) : NO_VALUE}
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartCard({ chart, tone, emptyHint = 'Data appears here once it is recorded.' }: { chart: ChartData; tone?: ColorToken; emptyHint?: string }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const toggle = (
    <div role="group" aria-label="Show as" className="flex rounded-md border border-slate/15 p-0.5 text-sm">
      {(['chart', 'table'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => setView(v)}
          className={`min-h-[44px] rounded px-3 font-semibold ${view === v ? 'bg-sapphire text-white' : 'text-slate'}`}
        >
          {v === 'chart' ? 'Chart' : 'Table'}
        </button>
      ))}
    </div>
  );
  return (
    <AppCard title={chart.title} tone={tone} actions={hasData(chart) ? toggle : undefined}>
      {!hasData(chart) ? <EmptyState title="No data yet" whatToDo={emptyHint} /> : view === 'chart' ? <Drawing chart={chart} /> : <ChartTable chart={chart} />}
    </AppCard>
  );
}
