import Link from 'next/link';
import { FirstVisitTour } from '@/components/app-shell/FirstVisitTour';
import { ShowMeHow } from '@/components/app-shell/ShowMeHow';
import { moduleById } from '@/lib/contracts/modules';
import type { TourId } from '@/lib/contracts/tours';
import { t, tCount, type Lang, type MessageKey } from '@/lib/i18n';
import { attentionNumber, chartRowLabel, chartTitle, dashboardModel, say, sayNumber, type DashboardChart } from '@/lib/insights/dashboard';
import { RANGE_IDS, type FactRange, type FactResult, type RangeId } from '@/lib/insights/types';
import { FactAttention, FactTile, QuickActions, WhyThis } from './dashboard-parts';
import { FactChart, type FactChartRow } from './FactChart';

// The principal's and school admin's dashboard (docs/26 slice 8d, C203;
// anatomy of docs/19 §3.3): the hero band with what needs a person, the
// day's numbers, the attention list, the rest of the numbers in groups a
// principal recognises, charts each with a table, and quick actions.
//
// Every number is a school fact (src/lib/insights): counted from the
// school's own rows, in the reader's own session, at the moment the page
// was asked for. A tile and each bar of a chart open the rows behind them
// (a fact whose screen cannot yet list exactly its rows is drawn without a
// link), and "Why this?" says the rule, the source and the time. A fact
// that was not loaded is not drawn: no tile, no zero. This file does not
// count anything.

export type OfficeDashboardData = {
  schoolName: string;
  rangeId: RangeId;
  range: FactRange;
  facts: FactResult[];
  // How many facts could not be computed just now.
  failed: number;
};

const greeting = (lang: Lang, now: Date): string => {
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(now));
  const date = now.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  return `${t(lang, hour < 12 ? 'myDay.morning' : hour < 17 ? 'myDay.afternoon' : 'myDay.evening')} · ${date}`;
};

// The midnight band: where you are, and what needs you as chips that go straight to the work.
// With a number missing, an empty list is not "all clear": the band says the numbers are incomplete instead.
function Hero({ data, attention, lang, now }: { data: OfficeDashboardData; attention: readonly FactResult[]; lang: Lang; now: Date }) {
  return (
    <section aria-label={t(lang, 'dash.group.today')} className="nca-mesh-dark relative overflow-hidden rounded-3xl bg-midnight p-5 text-white md:p-7">
      <span aria-hidden="true" className="nca-spectrum-bar absolute inset-x-0 top-0 h-1.5" />
      <p className="text-sm font-semibold">{greeting(lang, now)}</p>
      <h1 className="mt-1 text-2xl font-extrabold md:text-3xl">{data.schoolName || t(lang, 'module.dashboard')}</h1>
      <p data-needs-you={attention.length} className="mt-3 text-base font-semibold">
        {attention.length > 0 ? tCount(lang, 'dash.needs', attention.length) : t(lang, data.failed > 0 ? 'dash.incomplete' : 'dash.allClear')}
      </p>
      {attention.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {attention.map((f) => (
            <li key={f.id}>
              <Link href={f.href ?? moduleById(f.moduleId).href} className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-sapphire shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                <span className="rounded-full bg-sapphire px-2 py-0.5 text-xs tabular-nums text-white">{attentionNumber(f).toLocaleString('en-IN')}</span>
                {say(lang, `fact.${f.id}.action`)}
                <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Today, 7 days, 30 days: links, so the choice is in the address and can be shared or bookmarked.
function RangeSwitch({ rangeId, lang }: { rangeId: RangeId; lang: Lang }) {
  return (
    <nav aria-label={t(lang, 'dash.range.label')} title={t(lang, 'dash.range.note')} data-range={rangeId} className="flex rounded-md border border-slate/10 bg-white p-0.5">
      {RANGE_IDS.map((id) =>
        id === rangeId ? (
          <Link key={id} href={`/app/dashboard?range=${id}`} aria-current="page" className="inline-flex min-h-[44px] items-center rounded bg-sapphire px-3 text-sm font-semibold text-white">
            {t(lang, `dash.range.${id}` as MessageKey)}
          </Link>
        ) : (
          <Link key={id} href={`/app/dashboard?range=${id}`} className="inline-flex min-h-[44px] items-center rounded bg-white px-3 text-sm font-semibold text-slate">
            {t(lang, `dash.range.${id}` as MessageKey)}
          </Link>
        )
      )}
    </nav>
  );
}

function Chart({ chart, lang }: { chart: DashboardChart; lang: Lang }) {
  const rows: FactChartRow[] = chart.rows.map((r) => ({ label: chartRowLabel(lang, chart, r), value: r.value, text: r.value === null ? t(lang, 'dash.chart.gap') : sayNumber(r.value, chart.unit), href: r.href }));
  const gaps = chart.kind === 'line' ? chart.rows.filter((r) => r.value === null).length : 0;
  return (
    <FactChart
      id={chart.id}
      title={chartTitle(lang, chart)}
      kind={chart.kind}
      tone={chart.tone}
      rows={rows}
      href={chart.href}
      words={{ showAs: t(lang, 'dash.chart.showAs'), chart: t(lang, 'dash.chart.chart'), table: t(lang, 'dash.chart.table'), what: t(lang, chart.kind === 'line' ? 'dash.chart.day' : 'dash.chart.what'), value: t(lang, 'dash.chart.value'), none: t(lang, 'dash.chart.none'), open: t(lang, 'dash.open'), gaps: gaps > 0 ? tCount(lang, 'dash.chart.gaps', gaps) : undefined }}
    >
      <WhyThis fact={chart.fact} others={chart.others} lang={lang} />
    </FactChart>
  );
}

export function OfficeDashboardView({ data, lang = 'en', tour, help, now = new Date() }: { data: OfficeDashboardData; lang?: Lang; tour?: TourId; help?: string; now?: Date }) {
  const model = dashboardModel(data.facts);
  const [first, ...rest] = model.groups;
  const group = (g: (typeof model.groups)[number]) => (
    <section key={g.id} data-group={g.id} aria-labelledby={`dash-group-${g.id}`} className="flex flex-col gap-2">
      <h2 id={`dash-group-${g.id}`} className="text-xs font-bold uppercase tracking-wider text-slate/70">
        {t(lang, `dash.group.${g.id}` as MessageKey)}
      </h2>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {g.tiles.map((f) => (
          <FactTile key={f.id} fact={f} tone={g.tone} lang={lang} />
        ))}
      </ul>
    </section>
  );
  return (
    <div lang={lang} data-module-page="dashboard" data-dashboard={data.rangeId} className="flex flex-col gap-5 p-4 md:p-6">
      <Hero data={data} attention={model.attention} lang={lang} now={now} />

      <div data-slot="more" className="flex flex-wrap items-center justify-between gap-3">
        <RangeSwitch rangeId={data.rangeId} lang={lang} />
        <div className="flex flex-wrap items-center gap-2">
          {help && <ShowMeHow slug={help} />}
          <a href={`/api/app/dashboard/export?range=${data.rangeId}`} data-dashboard-export className="inline-flex min-h-[44px] items-center rounded-md border border-slate/10 bg-white px-4 text-sm font-semibold text-slate">
            {t(lang, 'dash.export')}
          </a>
        </div>
      </div>
      {tour && <FirstVisitTour id={tour} />}

      {data.failed > 0 && (
        <p role="status" data-dashboard-incomplete className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">
          {t(lang, 'dash.incomplete')}
        </p>
      )}

      <div data-slot="body" className="flex flex-col gap-5">
        {first && group(first)}
        <FactAttention facts={model.attention} lang={lang} incomplete={data.failed > 0} />
        {rest.map(group)}
      </div>

      {model.charts.length > 0 && (
        <section aria-label={t(lang, 'dash.charts')} data-charts className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {model.charts.map((c) => (
            <Chart key={c.id} chart={c} lang={lang} />
          ))}
        </section>
      )}

      <QuickActions
        lang={lang}
        actions={[
          { label: t(lang, 'dash.quick.student'), href: '/app/students?new=1', icon: 'student', tone: 'sapphire' },
          { label: t(lang, 'dash.quick.attendance'), href: '/app/attendance', icon: 'attendance', tone: 'royal' },
          { label: t(lang, 'dash.quick.ticket'), href: '/app/help/ticket/new', icon: 'ticket', tone: 'gold' },
          { label: t(lang, 'dash.quick.help'), href: '/app/help', icon: 'support', tone: 'gold' },
        ]}
      />
    </div>
  );
}
