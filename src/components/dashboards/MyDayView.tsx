import Link from 'next/link';
import { ModuleIcon } from '@/components/app-ui/ModuleIcon';
import { Icon } from '@/components/visual/Icons';
import { moduleById } from '@/lib/contracts/modules';
import type { MyDay, TodayCard } from '@/lib/contracts/today-cards';
import { isMessageKey, t, tCount, type Lang, type MessageKey } from '@/lib/i18n';

// My Day (docs/19 rule 2, C136): today's work first, one tap each. What
// is waiting comes first, as one list of lines that are one link each (C230-D); what is
// already done today follows, quieter. Every number on a card was counted
// from the school's own records for this person; with nothing to show, the
// screen says so plainly. Every word comes from the message files.

// A card's words. Countable cards have `.one` / `.other`; a card about one
// class has a single sentence with the class's name in it.
function words(lang: Lang, card: TodayCard): { title: string; detail: string | null } {
  const base = `today.${card.type}.${card.state}`;
  const values = { count: card.count, total: card.total ?? card.count, subject: card.subject ?? '' };
  const title = isMessageKey(base) ? t(lang, base, values) : tCount(lang, base, card.count, values);
  // The detail line: one sentence, or `.one` / `.other` chosen by the count its noun belongs to.
  const detailBase = `${base}.detail`;
  const detail = isMessageKey(detailBase) ? t(lang, detailBase, values) : isMessageKey(`${detailBase}.other`) ? tCount(lang, detailBase, card.count, values) : null;
  return { title, detail };
}

// One line of the day (C230-D redesign, after Linear's inbox): the module's mark, what is waiting and its detail,
// one action, and the info button for "Why this?" beside it rather than on a line of its own.
function Card({ card, lang }: { card: TodayCard; lang: Lang }) {
  const mod = moduleById(card.moduleId);
  const { title, detail } = words(lang, card);
  const done = card.state === 'done';
  const why = `today.${card.type}.why`;
  const hasWhy = !done && isMessageKey(why);
  return (
    <li data-today-card={card.type} data-state={card.state} className="relative px-2 py-1.5">
      <Link
        href={card.href}
        className={`flex min-h-[56px] items-center gap-3 rounded-xl px-1 hover:bg-off-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal ${hasWhy ? 'pr-12' : ''}`}
      >
        <ModuleIcon name={mod.icon} tone={mod.tone[0]} size="md" variant={done ? 'soft' : 'solid'} />
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-bold md:text-base ${done ? 'text-slate/80' : 'text-slate'}`}>{title}</span>
          {detail && <span className="block text-sm text-slate/70">{detail}</span>}
        </span>
        {done ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald/10 px-3 py-1 text-sm font-semibold text-slate">
            <Icon name="check" className="h-4 w-4" aria-hidden="true" />
            {t(lang, 'myDay.doneMark')}
          </span>
        ) : (
          <span aria-hidden="true" className="hidden min-h-[40px] shrink-0 items-center gap-1 rounded-md bg-sapphire px-3 text-sm font-semibold text-white sm:inline-flex">
            {t(lang, `today.${card.type}.action` as MessageKey)}
            <Icon name="arrow" className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        {!done && <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-slate/70 sm:hidden" aria-hidden="true" />}
      </Link>
      {hasWhy && (
        <details className="text-sm text-slate [&>summary]:absolute [&>summary]:right-2 [&>summary]:top-[12px]">
          <summary title={t(lang, 'myDay.why')} className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded-full text-slate/70 hover:bg-slate/5 hover:text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-royal [&::-webkit-details-marker]:hidden">
            <Icon name="info" className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">{t(lang, 'myDay.why')}</span>
          </summary>
          <p className="mx-1 mb-1 mt-1 rounded-lg bg-off-white p-3">{t(lang, why)}</p>
        </details>
      )}
    </li>
  );
}

export function MyDayView({ day, lang, failed = 0, dashboardHref }: { day: MyDay; lang: Lang; failed?: number; dashboardHref?: string }) {
  const todo = day.cards.filter((c) => c.state === 'todo');
  const done = day.cards.filter((c) => c.state === 'done');
  return (
    <div lang={lang} className="flex flex-col gap-5">
      {failed > 0 && (
        <p role="status" className="rounded-md bg-tangerine/10 px-3 py-2 text-sm text-slate">
          {t(lang, 'myDay.incomplete')}
        </p>
      )}

      {day.cards.length === 0 && failed === 0 && (
        <div role="status" className="flex flex-col items-start gap-2 rounded-2xl border border-dashed border-slate/20 bg-white p-5">
          <ModuleIcon name="check" tone="emerald" size="lg" />
          <p className="text-base font-bold text-slate">{t(lang, 'myDay.empty')}</p>
          <p className="max-w-prose text-sm text-slate/70">{t(lang, 'myDay.empty.hint')}</p>
        </div>
      )}

      {todo.length > 0 && (
        <section aria-labelledby="my-day-todo" className="flex flex-col gap-2">
          <h2 id="my-day-todo" className="text-lg font-extrabold text-slate">
            {tCount(lang, 'myDay.waiting', day.waiting)}
          </h2>
          <ul className="flex flex-col divide-y divide-slate/10 rounded-2xl border border-slate/10 bg-white shadow-sm">
            {todo.map((c) => (
              <Card key={c.id} card={c} lang={lang} />
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section aria-labelledby="my-day-done" className="flex flex-col gap-2">
          <h2 id="my-day-done" className="text-xs font-semibold uppercase tracking-wide text-slate/70">
            {t(lang, todo.length === 0 ? 'myDay.allDone' : 'myDay.done')}
          </h2>
          <ul className="flex flex-col divide-y divide-slate/10 rounded-2xl border border-slate/10 bg-white/70">
            {done.map((c) => (
              <Card key={c.id} card={c} lang={lang} />
            ))}
          </ul>
        </section>
      )}

      {dashboardHref && (
        <p>
          <Link href={dashboardHref} className="inline-flex min-h-[44px] items-center gap-1 font-semibold text-sapphire underline">
            {t(lang, 'myDay.dashboard')}
            <Icon name="arrow" className="h-4 w-4" aria-hidden="true" />
          </Link>
        </p>
      )}
    </div>
  );
}
