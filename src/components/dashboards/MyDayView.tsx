import Link from 'next/link';
import { ModuleIcon } from '@/components/app-ui/ModuleIcon';
import { Icon } from '@/components/visual/Icons';
import { moduleById } from '@/lib/contracts/modules';
import type { MyDay, TodayCard } from '@/lib/contracts/today-cards';
import { isMessageKey, t, tCount, type Lang, type MessageKey } from '@/lib/i18n';

// My Day (docs/19 rule 2, C136): today's work first, one tap each. What
// is waiting comes first, as large cards that are one link each; what is
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

function Card({ card, lang }: { card: TodayCard; lang: Lang }) {
  const mod = moduleById(card.moduleId);
  const { title, detail } = words(lang, card);
  const done = card.state === 'done';
  const why = `today.${card.type}.why`;
  return (
    <li data-today-card={card.type} data-state={card.state} className={`rounded-2xl border bg-white ${done ? 'border-slate/10' : 'border-slate/20 shadow-sm'}`}>
      <Link href={card.href} className="nca-lift flex min-h-[72px] items-center gap-3 rounded-2xl p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal">
        <ModuleIcon name={mod.icon} tone={mod.tone[0]} size="lg" variant={done ? 'soft' : 'solid'} />
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-slate">{title}</span>
          {detail && <span className="block text-sm text-slate/70">{detail}</span>}
        </span>
        {done ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald/10 px-3 py-1 text-sm font-semibold text-slate">
            <Icon name="check" className="h-4 w-4" aria-hidden="true" />
            {t(lang, 'myDay.doneMark')}
          </span>
        ) : (
          <span aria-hidden="true" className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-md bg-sapphire px-3 text-sm font-semibold text-white">
            {t(lang, `today.${card.type}.action` as MessageKey)}
            <Icon name="arrow" className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </Link>
      {!done && isMessageKey(why) && (
        <details className="px-3 pb-2 text-sm text-slate">
          <summary className="inline-flex min-h-[44px] cursor-pointer items-center font-semibold text-sapphire underline">{t(lang, 'myDay.why')}</summary>
          <p className="pb-1">{t(lang, why)}</p>
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
          <ul className="flex flex-col gap-2">
            {todo.map((c) => (
              <Card key={c.id} card={c} lang={lang} />
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section aria-labelledby="my-day-done" className="flex flex-col gap-2">
          <h2 id="my-day-done" className="text-base font-bold text-slate">
            {t(lang, todo.length === 0 ? 'myDay.allDone' : 'myDay.done')}
          </h2>
          <ul className="flex flex-col gap-2">
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
