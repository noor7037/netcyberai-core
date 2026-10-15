'use client';

import Link from 'next/link';
import type { IconName } from '@/components/visual/Icons';
import type { KpiTile as KpiTileData } from '@/lib/contracts/charts';
import { colors } from '@/lib/design-tokens';
import type { ColorToken } from '@/lib/contracts/modules';
import { formatTrend, formatValue } from './format';
import { ModuleIcon } from './ModuleIcon';
import { useCountUp } from './motion';
import { TOKEN_TONES } from './tones';

// KPI tile v3 (C230-D redesign, after Stripe's and Vercel's metric cards): a white card with a thin bar in the
// tile's tone, its icon
// chip, the value computed by the server (counted up, always in slate,
// never in a series colour), the trend as a pill with an arrow AND words,
// a small sparkline in the tone, and the whole tile as the drill-down
// link. null means no data yet and says so.

const TREND_PILL = { good: 'bg-off-white text-emerald', bad: 'bg-off-white text-coral-deep', neutral: 'bg-off-white text-slate' } as const;

// The last values as a thin line. Decorative: the value and the trend pill
// carry the meaning, and the dashboard's chart has the table view.
function Sparkline({ values, tone }: { values: readonly (number | null)[]; tone: ColorToken }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pts.length < 2) return null;
  const min = Math.min(...pts.map((p) => p.v));
  const max = Math.max(...pts.map((p) => p.v));
  const x = (i: number) => 2 + (i / (values.length - 1)) * 96;
  const y = (v: number) => (max === min ? 12 : 21 - ((v - min) / (max - min)) * 18);
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true" className="mt-auto h-6 w-full">
      <polyline points={pts.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')} fill="none" stroke={colors[tone]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function KpiTile({ tile, tone = 'royal', icon, spark }: { tile: KpiTileData; tone?: ColorToken; icon?: IconName; spark?: readonly (number | null)[] }) {
  const shown = useCountUp(tile.value);
  const trend = tile.trend ? formatTrend(tile.trend) : null;
  const value = formatValue(shown === null ? null : tile.unit === 'count' ? Math.round(shown) : shown, tile.unit);
  const body = (
    <>
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${TOKEN_TONES[tone].bar}`} />
      <div className="flex items-center gap-2">
        {icon && <ModuleIcon name={icon} tone={tone} size="sm" variant="solid" />}
        <p className="min-w-0 text-xs font-semibold uppercase tracking-wide text-slate/70">{tile.label}</p>
      </div>
      <p className="text-3xl font-extrabold tabular-nums text-slate" aria-label={`${tile.label}: ${formatValue(tile.value, tile.unit)}`}>
        {value}
      </p>
      {tile.value === null ? (
        <p className="text-sm text-slate">No data yet</p>
      ) : (
        trend && (
          <p className={`self-start rounded-full px-2 py-0.5 text-xs font-bold ${TREND_PILL[trend.tone]}`}>
            <span aria-hidden="true">{trend.short}</span>
            <span className="sr-only">{trend.spoken}</span>
          </p>
        )
      )}
      {spark && tile.value !== null && <Sparkline values={spark} tone={tone} />}
    </>
  );
  const cls = 'nca-lift relative flex min-h-[124px] min-w-0 flex-col gap-1.5 overflow-hidden rounded-2xl border border-slate/10 bg-white p-4 shadow-sm';
  return tile.drillHref ? (
    <Link href={tile.drillHref} className={`${cls} focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
