import Link from 'next/link';
import { ModuleIcon } from '@/components/app-ui/ModuleIcon';
import { AppCard } from '@/components/app-ui/Card';
import type { IconName } from '@/components/visual/Icons';
import type { Trend } from '@/lib/contracts/charts';
import type { ColorToken } from '@/lib/contracts/modules';

// Blocks every role dashboard shares (docs/19 §3.3): the attention list
// with its one-tap action and "Why this?", and the quick-action tiles.

export type AttentionItem = { id: string; label: string; count: number; href: string; action: string; why: string; icon: IconName; tone: ColorToken };

// The exceptions, most urgent first as given. "Why this?" says the rule
// that put the item here (C104), in plain words.
export function AttentionList({ items, allClear }: { items: readonly AttentionItem[]; allClear: string }) {
  return (
    <AppCard title="Needs your attention" tone="coral">
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
                <summary className="inline-flex min-h-[44px] cursor-pointer items-center font-semibold text-sapphire underline">Why this?</summary>
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

export function QuickActions({ actions }: { actions: readonly QuickAction[] }) {
  return (
    <nav aria-label="Quick actions">
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
export function lastDays<T extends number | null>(rows: readonly { date: string; value: number }[], days: number, missing: T, now: Date = new Date()): { t: string; v: number | T }[] {
  const byDate = new Map(rows.map((r) => [r.date.slice(0, 10), r.value]));
  const end = Date.parse(`${indiaToday(now)}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const t = new Date(end - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    return { t, v: byDate.get(t) ?? missing };
  });
}

// "1 fee entry is", "17 fee entries are".
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
