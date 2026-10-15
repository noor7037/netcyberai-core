import Link from 'next/link';
import type { ReactNode } from 'react';
import { ModuleIcon } from '@/components/app-ui/ModuleIcon';
import { AppCard } from '@/components/app-ui/Card';
import { Icon, type IconName } from '@/components/visual/Icons';
import type { Trend } from '@/lib/contracts/charts';
import { moduleById, type ColorToken } from '@/lib/contracts/modules';
import { t, tCount, type Lang } from '@/lib/i18n';
import { attentionNumber, say, sayDetail, sayNotSetUp, sayPeriod, saySources, sayTime, sayValue } from '@/lib/insights/dashboard';
import type { FactResult } from '@/lib/insights/types';

// Blocks every role dashboard shares (docs/19 §3.3): the attention list
// with its one-tap action and "Why this?", and the quick-action tiles; and
// the blocks the office's dashboard draws a school fact with (docs/26 slice
// 8d, C203): a tile, an attention item and its "Why this?". Every word
// comes from the message files, in the language given.

export type AttentionItem = { id: string; label: string; count: number; href: string; action: string; why: string; icon: IconName; tone: ColorToken };

// "Why this?" (C230-D redesign): a small info button beside the number or the item, not a line of its own; the
// answer opens under it. The words stay for screen readers. Reference: Stripe's dashboard keeps definitions
// behind an info icon so the numbers lead.
const WHY_BUTTON = 'flex h-11 w-11 shrink-0 cursor-pointer list-none items-center justify-center rounded-full text-slate/70 hover:bg-slate/5 hover:text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal [&::-webkit-details-marker]:hidden';
const WHY_BODY = 'mt-1 flex flex-col gap-1 rounded-lg bg-off-white p-3 text-sm text-slate';
function WhySummary({ lang }: { lang: Lang }) {
  return (
    <summary className={WHY_BUTTON} title={t(lang, 'myDay.why')}>
      <Icon name="info" className="h-5 w-5" />
      <span className="sr-only">{t(lang, 'myDay.why')}</span>
    </summary>
  );
}

// One line of an attention list (Linear's inbox): the module's mark, the sentence with its count, one action, and
// the info button. `children` is the answer to "Why this?".
function AttentionRow({ id, icon, tone, text, href, action, why }: { id?: string; icon: IconName; tone: ColorToken; text: ReactNode; href: string; action: string; why: ReactNode }) {
  return (
    <li data-attention={id} className="flex flex-col px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <ModuleIcon name={icon} tone={tone} size="md" />
        <p className="min-w-[10rem] flex-1 text-sm font-semibold text-slate">{text}</p>
        <Link href={href} className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-sapphire/30 px-3 text-sm font-semibold text-sapphire hover:bg-sapphire/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
          {action}
          <Icon name="arrow" className="h-4 w-4" />
        </Link>
        {why}
      </div>
    </li>
  );
}

// The exceptions, most urgent first as given. "Why this?" says the rule
// that put the item here (C104), in plain words.
export function AttentionList({ items, allClear, lang = 'en' }: { items: readonly AttentionItem[]; allClear: string; lang?: Lang }) {
  return (
    <AppCard title={t(lang, 'dash.attention.title')} tone="coral">
      {items.length === 0 ? (
        <p className="text-sm text-slate">{allClear}</p>
      ) : (
        <ul className="-mx-1 flex flex-col divide-y divide-slate/10">
          {items.map((i) => (
            <AttentionRow
              key={i.id}
              icon={i.icon}
              tone={i.tone}
              href={i.href}
              action={i.action}
              text={
                <>
                  <span className="tabular-nums">{i.count.toLocaleString('en-IN')}</span> {i.label}
                </>
              }
              why={
                <details className="sm:w-auto [&[open]]:w-full">
                  <WhySummary lang={lang} />
                  <p className={WHY_BODY}>{i.why}</p>
                </details>
              }
            />
          ))}
        </ul>
      )}
    </AppCard>
  );
}

export type QuickAction = { label: string; href: string; icon: IconName; tone: ColorToken };

export function QuickActions({ actions, lang = 'en' }: { actions: readonly QuickAction[]; lang?: Lang }) {
  return (
    <nav aria-label={t(lang, 'dash.quick.title')}>
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {actions.map((a) => (
          <li key={a.href + a.label}>
            <Link href={a.href} className="nca-lift flex min-h-[88px] flex-col items-start justify-between gap-2 rounded-2xl border border-slate/10 bg-white p-3 text-sm font-bold text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal">
              <ModuleIcon name={a.icon} tone={a.tone} size="lg" />
              {a.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ---- A school fact on the screen ------------------------------------------------

// "Why this?" (docs/21): the rule in one sentence, what it was counted from, when, and the rule's version.
// `others`: a chart that draws more than one fact says each one's rule under that fact's own name, so no
// number is explained by another number's rule.
export function WhyThis({ fact, lang, others = [], className = '' }: { fact: FactResult; lang: Lang; others?: readonly FactResult[]; className?: string }) {
  const all = [fact, ...others];
  return (
    <details data-why={all.map((f) => f.id).join(' ')} className={`text-sm text-slate ${className}`}>
      <WhySummary lang={lang} />
      <div className={WHY_BODY}>
        {all.map((f) => (
          <div key={f.id} data-why-fact={f.id} className="flex flex-col gap-1">
            {all.length > 1 && <p className="font-semibold">{say(lang, `fact.${f.id}.label`)}</p>}
            <p>{t(lang, 'dash.why.rule', { rule: say(lang, f.rule.key) })}</p>
            <p className="text-slate/70">{t(lang, 'dash.why.source', { sources: saySources(lang, f.sources) })}</p>
            <p className="text-slate/70">{t(lang, 'dash.why.at', { time: sayTime(lang, f.countedAt), version: f.rule.version })}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

// One number: what it is, the value, the days it is about, and the whole tile as the link to its rows.
// Value text is slate, never a series colour (docs/19 §3.3). Not set up, it says what is missing.
// v5 (C235-C, after the C230-D redesign): a white rounded card with a soft shadow, the module's icon chip in the
// group's colour ABOVE the number, the number large, the label under it, one muted line for the detail and the
// days, the info button in the corner.
// `todayShown`: the dashboard shows today, so a fact about today does not say "Today" again on its tile.
export function FactTile({ fact, tone, lang, todayShown = false }: { fact: FactResult; tone: ColorToken; lang: Lang; todayShown?: boolean }) {
  const detail = fact.state === 'not_set_up' ? sayNotSetUp(lang, fact) : sayDetail(lang, fact);
  // The days of the range the dashboard shows are said once, by the range switch (C235-C), not on every tile.
  const period = fact.period === 'range' || (todayShown && fact.period === 'today') ? '' : sayPeriod(lang, fact);
  const body: ReactNode = (
    <>
      <ModuleIcon name={moduleById(fact.moduleId).icon} tone={tone} size="sm" variant="solid" />
      <span data-fact-value className={`mt-2 font-extrabold tabular-nums tracking-tight text-slate ${fact.state === 'ok' ? 'text-3xl' : 'text-base'}`}>
        {sayValue(lang, fact)}
      </span>
      <span className="text-sm font-medium text-slate/70">{say(lang, `fact.${fact.id}.label`)}</span>
      <span className="mt-auto pt-1 text-xs text-slate/70">{[detail, period].filter(Boolean).join(' · ')}</span>
    </>
  );
  const link = 'flex min-h-[88px] flex-1 flex-col rounded-xl p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal';
  return (
    <li data-fact={fact.id} data-state={fact.state} className="nca-lift relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate/10 bg-white p-3 shadow-sm">
      {fact.href ? (
        <Link href={fact.href} className={link}>
          {body}
        </Link>
      ) : (
        <div className={link}>{body}</div>
      )}
      <WhyThis fact={fact} lang={lang} className="[&>summary]:absolute [&>summary]:right-1 [&>summary]:top-1" />
    </li>
  );
}

// What needs a person, most urgent first: the sentence with its count, one button to the place, and "Why this?".
// `incomplete`: a number could not be worked out, so an empty list does not say that nothing needs attention.
export function FactAttention({ facts, lang, incomplete = false }: { facts: readonly FactResult[]; lang: Lang; incomplete?: boolean }) {
  return (
    <AppCard title={t(lang, 'dash.attention.title')} tone="coral">
      {facts.length === 0 ? (
        <p data-attention-none className="text-sm text-slate">{t(lang, incomplete ? 'dash.incomplete' : 'dash.attention.none')}</p>
      ) : (
        <ul className="-mx-1 flex flex-col divide-y divide-slate/10">
          {facts.map((f) => {
            const mod = moduleById(f.moduleId);
            return (
              <AttentionRow
                key={f.id}
                id={f.id}
                icon={mod.icon}
                tone={mod.tone[0]}
                href={f.href ?? mod.href}
                action={say(lang, `fact.${f.id}.action`)}
                text={tCount(lang, `fact.${f.id}.todo`, attentionNumber(f))}
                why={<WhyThis fact={f} lang={lang} className="sm:w-auto [&[open]]:w-full" />}
              />
            );
          })}
        </ul>
      )}
    </AppCard>
  );
}

// The change between the last two real values of a series (the two most
// recent days that have a value, which need not be consecutive days), or
// nothing when there are not two to compare. Computed, never assumed.
export function trendFromSeries(values: readonly (number | null)[], unit: Trend['unit'], comparedTo: string, good: Trend['good']): Trend | undefined {
  const real = values.filter((v): v is number => v !== null);
  if (real.length < 2) return undefined;
  const delta = real[real.length - 1] - real[real.length - 2];
  return { direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat', delta, unit, comparedTo, good };
}

// Today's date in India as YYYY-MM-DD: the day a school means by "today".
export function indiaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

// The last `days` calendar days ending today, each with its value. A day
// the database returned no row for gets `missing`: null where no row means
// "nothing was recorded" (attendance), 0 where it means "none" (messages).
// The chart then shows the gap instead of drawing a line across it.
export const lastDays = <T extends number | null>(rows: readonly { date: string; value: number }[], days: number, missing: T, now: Date = new Date()): { t: string; v: number | T }[] => {
  const byDate = new Map(rows.map((r) => [r.date.slice(0, 10), r.value]));
  const end = Date.parse(`${indiaToday(now)}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(end - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    return { t: day, v: byDate.get(day) ?? missing };
  });
};

// "1 fee entry is", "17 fee entries are".
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
