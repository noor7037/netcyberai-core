'use client';

import Link from 'next/link';
import type { KpiTile as KpiTileData } from '@/lib/contracts/charts';
import { formatTrend, formatValue } from './format';
import { useCountUp } from './motion';

// A KPI tile (17 §4): the value computed by the server, counted up, its
// trend in words and colour, and a drill-down link. null means no data yet
// and says so; a demo badge string can never reach it (numbers only).

const TREND_CLASS = { good: 'text-emerald', bad: 'text-coral-deep', neutral: 'text-slate/70' } as const;

export function KpiTile({ tile }: { tile: KpiTileData }) {
  const shown = useCountUp(tile.value);
  const trend = tile.trend ? formatTrend(tile.trend) : null;
  const value = formatValue(shown === null ? null : tile.unit === 'count' ? Math.round(shown) : shown, tile.unit);
  const body = (
    <>
      <p className="text-sm font-semibold text-slate/70">{tile.label}</p>
      <p className="text-3xl font-extrabold tabular-nums text-slate" aria-label={`${tile.label}: ${formatValue(tile.value, tile.unit)}`}>
        {value}
      </p>
      {tile.value === null ? (
        <p className="text-sm text-slate/70">No data yet</p>
      ) : (
        trend && (
          <p className={`text-sm font-semibold ${TREND_CLASS[trend.tone]}`}>
            <span aria-hidden="true">{trend.short}</span>
            <span className="sr-only">{trend.spoken}</span>
          </p>
        )
      )}
    </>
  );
  const cls = 'nca-lift flex min-h-[112px] min-w-0 flex-col gap-1 rounded-xl border border-slate/10 bg-white p-4';
  return tile.drillHref ? (
    <Link href={tile.drillHref} className={`${cls} focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

