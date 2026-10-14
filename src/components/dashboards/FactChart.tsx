'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { AppCard } from '@/components/app-ui/Card';
import { TOKEN_TONES } from '@/components/app-ui/tones';
import type { ColorToken } from '@/lib/contracts/modules';
import { colors } from '@/lib/design-tokens';

// A chart card of the office's dashboard (docs/26 slice 8d, C203; docs/19
// §3.3 to §3.6): the title says the one message; one hue, never a colour by
// rank; text in slate; a table view for every chart, whose rows link to the
// rows behind them; nothing animates. Every word and every written number
// is handed in already said in the person's language: this file draws, it
// does not count and it does not speak.

export type FactChartRow = { label: string; value: number | null; text: string; href?: string };
export type FactChartWords = { showAs: string; chart: string; table: string; what: string; value: string; none: string; open: string; gaps?: string };

const TAP = 'min-h-[44px] rounded px-3 text-sm font-semibold';

function Bars({ rows, tone }: { rows: readonly FactChartRow[]; tone: ColorToken }) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2 text-sm text-slate">
          {r.href ? (
            <Link href={r.href} data-chart-row-open className="inline-flex min-h-[44px] min-w-0 items-center font-semibold text-sapphire underline">
              {r.label}
            </Link>
          ) : (
            <span className="min-w-0">{r.label}</span>
          )}
          <span aria-hidden="true" className="block h-3 overflow-hidden rounded-full bg-off-white">
            <span className={`block h-3 rounded-full ${TOKEN_TONES[tone].bar}`} style={{ width: `${Math.round(((r.value ?? 0) / max) * 100)}%`, minWidth: (r.value ?? 0) > 0 ? 4 : 0 }} />
          </span>
          <span className="text-right font-semibold tabular-nums">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

// A rate by day, out of 100. A day with no value is a gap in the line, never a zero.
function Line({ rows, tone, title }: { rows: readonly FactChartRow[]; tone: ColorToken; title: string }) {
  const W = 320;
  const H = 120;
  const BASE = H - 24;
  const x = (i: number) => (rows.length === 1 ? W / 2 : 8 + (i / (rows.length - 1)) * (W - 56));
  const y = (v: number) => 10 + (1 - Math.min(100, Math.max(0, v)) / 100) * (H - 34);
  const real = rows.map((r, i) => ({ ...r, i })).filter((r): r is FactChartRow & { i: number; value: number } => r.value !== null);
  const runs: (typeof real)[] = [];
  for (const p of real) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1].i === p.i - 1) run.push(p);
    else runs.push([p]);
  }
  const last = real[real.length - 1];
  const color = colors[tone];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${real.map((p) => `${p.label} ${p.text}`).join(', ')}`} className="h-auto w-full">
      <line x1={8} y1={BASE} x2={W - 8} y2={BASE} stroke={colors.slate} strokeOpacity={0.15} />
      {runs.filter((run) => run.length > 1).map((run) => (
        <path key={run[0].label} d={run.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.value).toFixed(1)}`).join('')} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {real.map((p) => (
        <circle key={p.label} cx={x(p.i)} cy={y(p.value)} r={p === last ? 4 : 3} fill={color}>
          <title>{`${p.label}: ${p.text}`}</title>
        </circle>
      ))}
      {last && (
        <text x={Math.min(W - 4, x(last.i) + 8)} y={y(last.value) + 4} fontSize={12} fontWeight={700} fill={colors.slate}>
          {last.text}
        </text>
      )}
      {rows.length > 0 && (
        <text x={8} y={H - 8} fontSize={10} fill={colors.slate}>
          {rows[0].label}
        </text>
      )}
      {rows.length > 1 && (
        <text x={x(rows.length - 1)} y={H - 8} fontSize={10} textAnchor="end" fill={colors.slate}>
          {rows[rows.length - 1].label}
        </text>
      )}
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
        <circle cx={60} cy={60} r={R} fill="none" stroke={colors.slate} strokeOpacity={0.1} strokeWidth={12} />
        {share > 0 && <circle cx={60} cy={60} r={R} fill="none" stroke={colors[tone]} strokeWidth={12} strokeLinecap="round" strokeDasharray={`${(share * around).toFixed(1)} ${around.toFixed(1)}`} transform="rotate(-90 60 60)" />}
      </svg>
      <ul className="flex min-w-0 flex-1 flex-col gap-1 text-sm text-slate">
        {rows.map((r) => (
          <li key={r.label} className="flex flex-wrap justify-between gap-x-3">
            <span>{r.label}</span>
            <span className="font-semibold tabular-nums">{r.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FactChart({
  id,
  title,
  kind,
  tone,
  rows,
  words,
  href,
  initialView = 'chart',
  children,
}: {
  id: string;
  title: string; // the one message
  kind: 'bars' | 'line' | 'ring';
  tone: ColorToken;
  rows: readonly FactChartRow[];
  words: FactChartWords;
  href: string | null; // the rows behind the whole chart
  initialView?: 'chart' | 'table';
  children?: ReactNode; // "Why this?"
}) {
  const [view, setView] = useState(initialView);
  const hasData = rows.some((r) => r.value !== null && (kind === 'line' || r.value > 0));
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
    <AppCard title={title} tone={tone} actions={hasData ? toggle : undefined}>
      <div data-chart={id} data-chart-kind={kind} className="flex flex-col gap-2">
        {!hasData ? (
          <p data-chart-none className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{words.none}</p>
        ) : view === 'chart' ? (
          <>
            {kind === 'bars' && <Bars rows={rows} tone={tone} />}
            {kind === 'line' && <Line rows={rows} tone={tone} title={title} />}
            {kind === 'ring' && <Ring rows={rows} tone={tone} title={title} />}
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
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-slate/10">
                    <th scope="row" className="pr-3 font-normal">
                      {r.href ? (
                        <Link href={r.href} className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
                          {r.label}
                        </Link>
                      ) : (
                        <span className="inline-flex min-h-[44px] items-center">{r.label}</span>
                      )}
                    </th>
                    <td className="py-2 pr-3 tabular-nums">{r.text}</td>
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
