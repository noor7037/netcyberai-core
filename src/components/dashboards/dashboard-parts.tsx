import Link from 'next/link';
import type { ReactNode } from 'react';
import { ModuleIcon } from '@/components/app-ui/ModuleIcon';
import { AppCard } from '@/components/app-ui/Card';
import { toneTint } from '@/components/app-ui/tones';
import type { IconName } from '@/components/visual/Icons';
import type { Trend } from '@/lib/contracts/charts';
import { moduleById, type ColorToken } from '@/lib/contracts/modules';
import { t, tCount, type Lang } from '@/lib/i18n';
import { say, sayDetail, sayNotSetUp, sayPeriod, saySources, sayTime, sayValue } from '@/lib/insights/dashboard';
import type { FactResult } from '@/lib/insights/types';

// Blocks every role dashboard shares (docs/19 §3.3): the attention list
// with its one-tap action and "Why this?", and the quick-action tiles; and
// the blocks the office's dashboard draws a school fact with (docs/26 slice
// 8d, C203): a tile, an attention item and its "Why this?". Every word
// comes from the message files, in the language given.

export type AttentionItem = { id: string; label: string; count: number; href: string; action: string; why: string; icon: IconName; tone: ColorToken };

const WHY = 'inline-flex min-h-[44px] cursor-pointer items-center font-semibold text-sapphire underline';

// The exceptions, most urgent first as given. "Why this?" says the rule
// that put the item here (C104), in plain words.
export function AttentionList({ items, allClear, lang = 'en' }: { items: readonly AttentionItem[]; allClear: string; lang?: Lang }) {
  return (
    <AppCard title={t(lang, 'dash.attention.title')} tone="coral">
      {items.length === 0 ? (
        <p className="text-sm text-slate">{allClear}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((i) => (
            <li key={i.id} className="rounded-xl border border-slate/10 bg-white p-3">
              <div className="flex flex-wrap items-center gap-3">
                <ModuleIcon name={i.icon} tone={i.tone} size="md" />
                <p className="min-w-0 flex-1 text-sm font-semibold text-slate">
                  <span className="tabular-nums">{i.count.toLocaleString('en-IN')}</span> {i.label}
                </p>
                <Link href={i.href} className="inline-flex min-h-[44px] items-center rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
                  {i.action}
                </Link>
              </div>
              <details className="mt-1 text-sm text-slate">
                <summary className={WHY}>{t(lang, 'myDay.why')}</summary>
                <p className="pb-1">{i.why}</p>
              </details>
            </li>
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
export function WhyThis({ fact, lang, others = [] }: { fact: FactResult; lang: Lang; others?: readonly FactResult[] }) {
  const all = [fact, ...others];
  return (
    <details data-why={all.map((f) => f.id).join(' ')} className="text-sm text-slate">
      <summary className={WHY}>{t(lang, 'myDay.why')}</summary>
      {all.map((f) => (
        <div key={f.id} data-why-fact={f.id} className="flex flex-col gap-1 pb-2">
          {all.length > 1 && <p className="font-semibold">{say(lang, `fact.${f.id}.label`)}</p>}
          <p>{t(lang, 'dash.why.rule', { rule: say(lang, f.rule.key) })}</p>
          <p className="text-slate/70">{t(lang, 'dash.why.source', { sources: saySources(lang, f.sources) })}</p>
          <p className="text-slate/70">{t(lang, 'dash.why.at', { time: sayTime(lang, f.countedAt), version: f.rule.version })}</p>
        </div>
      ))}
    </details>
  );
}

// One number: what it is, the value, the days it is about, and the whole tile as the link to its rows.
// Value text is slate, never a series colour (docs/19 §3.3). Not set up, it says what is missing.
export function FactTile({ fact, tone, lang }: { fact: FactResult; tone: ColorToken; lang: Lang }) {
  const detail = fact.state === 'not_set_up' ? sayNotSetUp(lang, fact) : sayDetail(lang, fact);
  const body: ReactNode = (
    <>
      <span className="text-sm font-semibold text-slate">{say(lang, `fact.${fact.id}.label`)}</span>
      <span data-fact-value className={`font-extrabold tabular-nums text-slate ${fact.state === 'ok' ? 'text-2xl' : 'text-base'}`}>
        {sayValue(lang, fact)}
      </span>
      {detail && <span className="text-xs text-slate">{detail}</span>}
      <span className="mt-auto text-xs text-slate">{sayPeriod(lang, fact)}</span>
    </>
  );
  const link = 'flex min-h-[96px] flex-1 flex-col gap-1 rounded-xl p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal';
  return (
    <li data-fact={fact.id} data-state={fact.state} className={`nca-lift flex min-w-0 flex-col rounded-2xl border border-slate/10 p-3 ${toneTint(tone)}`}>
      {fact.href ? (
        <Link href={fact.href} className={link}>
          {body}
        </Link>
      ) : (
        <div className={link}>{body}</div>
      )}
      <WhyThis fact={fact} lang={lang} />
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
        <ul className="flex flex-col gap-2">
          {facts.map((f) => {
            const mod = moduleById(f.moduleId);
            return (
              <li key={f.id} data-attention={f.id} className="rounded-xl border border-slate/10 bg-white p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <ModuleIcon name={mod.icon} tone={mod.tone[0]} size="md" />
                  <p className="min-w-0 flex-1 text-sm font-semibold text-slate">{tCount(lang, `fact.${f.id}.todo`, f.count ?? f.value ?? 0)}</p>
                  <Link href={f.href ?? mod.href} className="inline-flex min-h-[44px] items-center rounded-md bg-sapphire px-4 text-sm font-semibold text-white">
                    {say(lang, `fact.${f.id}.action`)}
                  </Link>
                </div>
                <WhyThis fact={f} lang={lang} />
              </li>
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
