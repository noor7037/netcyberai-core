'use client';

import { useState, type ReactNode } from 'react';
import { AppCard } from '@/components/app-ui/Card';
import { ModuleIcon } from '@/components/app-ui/ModuleIcon';
import { TOKEN_TONES } from '@/components/app-ui/tones';
import { Icon } from '@/components/visual/Icons';
import type { ColorToken } from '@/lib/contracts/modules';
import { colors } from '@/lib/design-tokens';
import {
  ATTENDANCE_TODAY,
  FEES_OWED,
  HERO,
  HOMEWORK_CHECKED,
  HOMEWORK_DUE,
  MESSAGE_PARTS,
  PRESENT_RATE_SERIES,
  QUICK_ACTIONS,
  RANGES,
  TILE_GROUPS,
  UNMARKED,
  type RangeId,
  type Tile,
  type Unit,
} from '@/demo-fixture/principal-showcase';
import { SCHOOL, type ModuleId } from '@/demo-fixture/principal-dashboard';

// The home page of the principal's dashboard preview, in the order of the
// real office dashboard (OfficeDashboardView): the hero band, the days
// switch and the CSV download, the "Today" numbers, "Needs your attention",
// the other number groups (Money, Learning, Parents, Running the school),
// the charts, each with a table view, and the quick actions. Titles are the
// product's own. Fixture data only; nothing is saved or downloaded.

const inr = new Intl.NumberFormat('en-IN');
const say = (n: number, unit: Unit) => (unit === 'rupees' ? `₹${inr.format(n)}` : unit === 'percent' ? `${n}%` : inr.format(n));

const TAP = 'inline-flex min-h-[44px] items-center';
const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal';

// "Why this?": a small info button; the answer opens under it.
function Why({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <details className={`text-sm text-slate ${className}`}>
      <summary title="Why this?" className={`flex h-11 w-11 shrink-0 cursor-pointer list-none items-center justify-center rounded-full text-slate/70 hover:bg-slate/5 hover:text-slate ${FOCUS} [&::-webkit-details-marker]:hidden`}>
        <Icon name="info" className="h-5 w-5" />
        <span className="sr-only">Why this?</span>
      </summary>
      <p className="mt-1 rounded-lg bg-off-white p-3 text-sm text-slate">{children}</p>
    </details>
  );
}

function FactTile({ tile, tone, range, open }: { tile: Tile; tone: ColorToken; range: RangeId; open: (id: ModuleId) => void }) {
  const detail = tile.notSetUp ? tile.detail : tile.total !== undefined ? `Out of ${inr.format(tile.total)}` : tile.detail;
  const rangeFact = !tile.period;
  const period = rangeFact && range === 'today' ? '' : tile.period ?? '';
  return (
    <li className="nca-lift relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate/10 bg-white p-3 shadow-sm">
      <button type="button" onClick={() => open(tile.module)} className={`flex min-h-[88px] flex-1 flex-col rounded-xl p-1 text-left ${FOCUS}`}>
        <ModuleIcon name={tile.icon} tone={tone} size="sm" variant="solid" />
        <span className={`mt-2 font-extrabold tabular-nums tracking-tight text-slate ${tile.notSetUp ? 'text-base' : 'text-3xl'}`}>{tile.notSetUp ? 'Not set up yet' : say(tile.value[range], tile.unit)}</span>
        <span className="text-sm font-medium text-slate/70">{tile.label}</span>
        <span className="mt-auto pt-1 text-xs text-slate/70">{[detail, period].filter(Boolean).join(' · ')}</span>
      </button>
    </li>
  );
}

function Hero({ attention }: { attention: number }) {
  return (
    <section aria-label="Today" className="nca-mesh-dark relative overflow-hidden rounded-3xl bg-midnight p-5 text-white md:p-7">
      <span aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1.5" />
      <p className="text-sm font-semibold">{HERO.greeting}</p>
      <h2 className="mt-1 text-2xl font-extrabold md:text-3xl">{SCHOOL.name}</h2>
      <p className="mt-3 text-base font-semibold">{attention === 1 ? `${attention} thing needs you today` : `${attention} things need you today`}</p>
    </section>
  );
}

// ---- charts: each has a chart view and a table view ----------------------------------------------------------

type Row = { label: string; value: number | null; text: string };

function Bars({ rows, tone }: { rows: Row[]; tone: ColorToken }) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto] items-center gap-2 text-sm text-slate">
          <span className="min-w-0">{r.label}</span>
          <span aria-hidden="true" className="block h-3 overflow-hidden rounded-full bg-off-white">
            <span className={`block h-3 rounded-full ${TOKEN_TONES[tone].bar}`} style={{ width: `${Math.round(((r.value ?? 0) / max) * 100)}%`, minWidth: (r.value ?? 0) > 0 ? 4 : 0 }} />
          </span>
          <span className="text-right font-semibold tabular-nums">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

// A rate by day out of 100. A day with no value is a gap in the line, never a zero.
function Line({ rows, tone, title }: { rows: Row[]; tone: ColorToken; title: string }) {
  const W = 320;
  const H = 120;
  const x = (i: number) => 8 + (i / Math.max(1, rows.length - 1)) * (W - 56);
  const y = (v: number) => 10 + (1 - v / 100) * (H - 34);
  const real = rows.map((r, i) => ({ ...r, i })).filter((r): r is Row & { i: number; value: number } => r.value !== null);
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
      <line x1={8} y1={H - 24} x2={W - 8} y2={H - 24} stroke={colors.slate} strokeOpacity={0.15} />
      {runs.filter((r) => r.length > 1).map((run) => (
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
      <text x={8} y={H - 8} fontSize={10} fill={colors.slate}>{rows[0].label}</text>
      <text x={x(rows.length - 1)} y={H - 8} fontSize={10} textAnchor="end" fill={colors.slate}>{rows[rows.length - 1].label}</text>
    </svg>
  );
}

function RingChart({ done, total, rows, tone, title }: { done: number; total: number; rows: Row[]; tone: ColorToken; title: string }) {
  const R = 48;
  const around = 2 * Math.PI * R;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 120 120" role="img" aria-label={title} className="h-28 w-28 shrink-0">
        <circle cx={60} cy={60} r={R} fill="none" stroke={colors.slate} strokeOpacity={0.1} strokeWidth={12} />
        <circle cx={60} cy={60} r={R} fill="none" stroke={colors[tone]} strokeWidth={12} strokeLinecap="round" strokeDasharray={`${((done / total) * around).toFixed(1)} ${around.toFixed(1)}`} transform="rotate(-90 60 60)" />
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

function Chart({ id, title, kind, tone, rows, what, why, ring, onOpen }: { id: string; title: string; kind: 'bars' | 'line' | 'ring'; tone: ColorToken; rows: Row[]; what: string; why: string; ring?: { done: number; total: number }; onOpen: () => void }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const gaps = kind === 'line' ? rows.filter((r) => r.value === null).length : 0;
  const btn = `${TAP} rounded px-3 text-sm font-semibold ${FOCUS}`;
  const toggle = (
    <div role="group" aria-label="Show as" className="flex rounded-md border border-slate/10 bg-white p-0.5">
      {(['chart', 'table'] as const).map((v) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`${btn} ${view === v ? 'bg-sapphire text-white' : 'bg-white text-slate'}`}>
          {v === 'chart' ? 'Chart' : 'Table'}
        </button>
      ))}
    </div>
  );
  return (
    <AppCard title={title} tone={tone} actions={toggle}>
      <div data-chart={id} className="flex flex-col gap-2">
        {view === 'chart' ? (
          <>
            {kind === 'bars' && <Bars rows={rows} tone={tone} />}
            {kind === 'line' && <Line rows={rows} tone={tone} title={title} />}
            {kind === 'ring' && ring && <RingChart done={ring.done} total={ring.total} rows={rows} tone={tone} title={title} />}
            {gaps > 0 && <p className="text-xs text-slate">{gaps === 1 ? `${gaps} day has no mark saved and is left as a gap.` : `${gaps} days have no mark saved and are left as a gap.`}</p>}
          </>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate">
              <caption className="sr-only">{title}</caption>
              <thead>
                <tr className="border-b border-slate/10">
                  <th scope="col" className="py-2 pr-3 font-semibold">{what}</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Number</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-slate/10">
                    <th scope="row" className="py-2 pr-3 font-normal">{r.label}</th>
                    <td className="py-2 pr-3 tabular-nums">{r.value === null ? 'No mark saved' : r.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-x-4">
          <Why>{`How it is counted: ${why}`}</Why>
          <button type="button" onClick={onOpen} className={`${TAP} font-semibold text-sapphire underline ${FOCUS}`}>
            Open the rows
          </button>
        </div>
      </div>
    </AppCard>
  );
}

export function PrincipalHome({ open, onAdd, toast }: { open: (id: ModuleId) => void; onAdd: () => void; toast: (msg: string) => void }) {
  const [range, setRange] = useState<RangeId>('today');
  const current = RANGES.find((r) => r.id === range) ?? RANGES[0];

  const attention = [
    { id: UNMARKED.id, module: UNMARKED.module, icon: UNMARKED.icon, tone: UNMARKED.tone, count: UNMARKED.count, text: UNMARKED.text, action: UNMARKED.action, why: UNMARKED.why },
    ...TILE_GROUPS.flatMap((g) => g.tiles.filter((t) => t.attention).map((t) => ({ id: t.id, module: t.module, icon: t.icon, tone: g.tone, ...t.attention! }))),
  ];

  const group = (g: (typeof TILE_GROUPS)[number]) => (
    <section key={g.id} aria-labelledby={`dash-group-${g.id}`} className="flex flex-col gap-2">
      <h3 id={`dash-group-${g.id}`} className="text-xs font-bold uppercase tracking-wider text-slate/70">
        {g.title}
      </h3>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {g.tiles.map((t) => (
          <FactTile key={t.id} tile={t} tone={g.tone} range={range} open={open} />
        ))}
      </ul>
    </section>
  );

  const rangeSay = (n: number) => inr.format(n);
  const msgs = MESSAGE_PARTS[range];
  const msgTotal = msgs.reduce((a, p) => a + p.value, 0);

  return (
    <div className="flex flex-col gap-5">
      <Hero attention={attention.length} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <nav aria-label="Days to show" className="flex gap-1 rounded-xl bg-slate/5 p-1 ring-1 ring-inset ring-slate/10">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-current={r.id === range ? 'page' : undefined}
                onClick={() => setRange(r.id)}
                className={`${TAP} rounded-lg px-4 text-sm font-semibold ${FOCUS} ${r.id === range ? 'bg-white text-slate shadow-sm' : 'text-slate/70 hover:text-slate'}`}
              >
                {r.label}
              </button>
            ))}
          </nav>
          {current.days && <span className="text-sm font-semibold text-slate/70">{current.days}</span>}
        </div>
        <button type="button" onClick={() => toast('Demo: no file is made. In the school app this downloads the numbers on screen as a CSV.')} className={`${TAP} gap-2 rounded-xl border border-slate/10 bg-white px-4 text-sm font-semibold text-slate shadow-sm ${FOCUS}`}>
          <Icon name="download" className="h-4 w-4" />
          Download CSV
        </button>
      </div>

      <div className="flex flex-col gap-5">
        {group(TILE_GROUPS[0])}

        <AppCard title="Needs your attention" tone="coral">
          <ul className="-mx-1 flex flex-col divide-y divide-slate/10">
            {attention.map((a) => (
              <li key={a.id} className="flex flex-col px-3 py-2">
                <div className="flex flex-wrap items-center gap-3">
                  <ModuleIcon name={a.icon} tone={a.tone} size="md" />
                  <p className="min-w-[10rem] flex-1 text-sm font-semibold text-slate">
                    <span className="tabular-nums">{inr.format(a.count)}</span> {a.text}
                  </p>
                  <button type="button" onClick={() => open(a.module)} className={`${TAP} gap-1 rounded-md border border-sapphire/30 px-3 text-sm font-semibold text-sapphire hover:bg-sapphire/5 ${FOCUS}`}>
                    {a.action}
                    <Icon name="arrow" className="h-4 w-4" />
                  </button>
                  <Why className="[&[open]]:w-full">{`How it is counted: ${a.why}`}</Why>
                </div>
              </li>
            ))}
          </ul>
        </AppCard>

        {TILE_GROUPS.slice(1).map(group)}
      </div>

      <section aria-label="Charts" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Chart
          id="attendance-today"
          title="Attendance today: 1,102 of 1,240 students marked"
          kind="bars"
          tone="royal"
          what="What"
          rows={ATTENDANCE_TODAY.map((r) => ({ ...r, text: rangeSay(r.value) }))}
          why="Students on a class roll with a mark saved today: present, late, absent or on leave. A student on leave is marked."
          onOpen={() => open('attendance')}
        />
        <Chart
          id="present-rate"
          title={`In school over these days: ${say(presentRate(range), 'percent')}`}
          kind="line"
          tone="azure"
          what="Day"
          rows={PRESENT_RATE_SERIES[range].map((r) => ({ ...r, text: r.value === null ? 'No mark saved' : `${r.value}%` }))}
          why="Of every attendance mark saved in these days, the share that is present or late. A day on leave is a marked day and is not an absence. Days with no mark saved are left out."
          onOpen={() => open('attendance')}
        />
        <Chart
          id="fees-owed"
          title="Fees still to come in"
          kind="bars"
          tone="tangerine"
          what="What"
          rows={FEES_OWED.map((r) => ({ ...r, text: say(r.value, 'rupees') }))}
          why="What is still to be paid on fee entries, split into those not yet due and those whose due date has passed. Part payments are taken off."
          onOpen={() => open('fees')}
        />
        <Chart
          id="messages-by-state"
          title={`WhatsApp messages in these days: ${rangeSay(msgTotal)}`}
          kind="bars"
          tone="cyan"
          what="What"
          rows={msgs.map((r) => ({ ...r, text: rangeSay(r.value) }))}
          why="Every WhatsApp message written to the school’s log in these days, whatever state it is in now: waiting, sent, delivered, read, failed or held back."
          onOpen={() => open('communication')}
        />
        <Chart
          id="homework-checked"
          title={`Homework checked: ${rangeSay(HOMEWORK_CHECKED[range])} of ${rangeSay(HOMEWORK_DUE[range])} due`}
          kind="ring"
          tone="azure"
          what="What"
          ring={{ done: HOMEWORK_CHECKED[range], total: HOMEWORK_DUE[range] }}
          rows={[
            { label: 'Checked for everyone', value: HOMEWORK_CHECKED[range], text: rangeSay(HOMEWORK_CHECKED[range]) },
            { label: 'Not yet checked for everyone', value: HOMEWORK_DUE[range] - HOMEWORK_CHECKED[range], text: rangeSay(HOMEWORK_DUE[range] - HOMEWORK_CHECKED[range]) },
          ]}
          why="Of the homework due in these days for a section with students on its roll, how many are checked for every student of the section."
          onOpen={() => open('homework')}
        />
      </section>

      <nav aria-label="Quick actions">
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {QUICK_ACTIONS.map((q) => (
            <li key={q.label}>
              <button
                type="button"
                onClick={() => (q.action === 'add-student' ? onAdd() : open(q.action))}
                className={`nca-lift flex min-h-[88px] w-full flex-col items-start justify-between gap-2 rounded-2xl border border-slate/10 bg-white p-3 text-left text-sm font-bold text-slate ${FOCUS}`}
              >
                <ModuleIcon name={q.icon} tone={q.tone} size="lg" />
                {q.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

// The "In school" number the line chart's title and its tile both say.
function presentRate(range: RangeId): number {
  const t = TILE_GROUPS.flatMap((g) => g.tiles).find((x) => x.id === 'present_rate');
  return t ? t.value[range] : 0;
}
