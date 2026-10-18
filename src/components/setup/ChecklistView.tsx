import Link from 'next/link';
import { Icon } from '@/components/visual/Icons';
import { checklistProgress, type ChecklistItem } from '@/lib/setup/checklist';
import { t, tCount, type Lang, type MessageKey } from '@/lib/i18n';

// The onboarding checklist as a list (docs/28 slice 10g, C244): each step with whether it is done and what exists, and,
// when `linked`, one tap to the screen where it is done. Drawn from the items of onboardingChecklist() and nothing
// else; it ticks nothing itself. Used on the Setup page (linked) and in Control's school page (not linked: the founder
// reads it, the school does the work). No hooks, so it renders on the server and in the browser alike; the words
// come from the message files in the language it is given.

function words(lang: Lang, it: ChecklistItem): string {
  const base = `setup.check.${it.id}`;
  if (it.id === 'session') {
    if (it.done) return t(lang, 'setup.check.session.done');
    return it.count > 0 ? tCount(lang, 'setup.check.session.notCurrent', it.count) : t(lang, 'setup.check.session.todo');
  }
  if (it.id === 'subjects') {
    if (it.done) return tCount(lang, 'setup.check.subjects.done', it.count);
    if (it.count === 0) return t(lang, 'setup.check.subjects.todo');
    // Subjects are added; either some class has none taught in it, or there is no class yet.
    return [tCount(lang, 'setup.check.subjects.have', it.count), it.without > 0 ? tCount(lang, 'setup.check.subjects.gap', it.without) : t(lang, 'setup.check.subjects.give')].join(' ');
  }
  if (it.id === 'logo') return t(lang, it.done ? 'setup.check.logo.done' : 'setup.check.logo.todo');
  return it.done ? tCount(lang, `${base}.done`, it.count) : t(lang, `${base}.todo` as MessageKey);
}

function Mark({ done, n }: { done: boolean; n: number }) {
  return done ? (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald/15 text-slate">
      <Icon name="check" className="h-5 w-5" aria-hidden="true" />
    </span>
  ) : (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-slate/30 text-sm font-bold text-slate">
      {n}
    </span>
  );
}

export function ChecklistView({ items, lang, linked = true, titleKey = 'setup.check.title' }: { items: readonly ChecklistItem[]; lang: Lang; linked?: boolean; titleKey?: MessageKey }) {
  const { done, total, complete } = checklistProgress(items);
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const progress = t(lang, 'setup.check.progress', { done, total });
  return (
    <section lang={lang} data-setup-checklist data-done={done} data-total={total} aria-labelledby="setup-checklist-title" className="flex max-w-3xl flex-col gap-3 rounded-2xl border border-slate/10 bg-white p-4 shadow-sm md:p-5">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="setup-checklist-title" className="text-base font-bold text-slate">
            {t(lang, titleKey)}
          </h2>
          <p className="text-sm font-semibold text-slate">{progress}</p>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={progress} className="h-2 w-full overflow-hidden rounded-full bg-slate/10">
          <div className="h-full rounded-full bg-emerald motion-safe:transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        {complete && (
          <p role="status" className="text-sm text-slate">
            {t(lang, 'setup.check.complete')}
          </p>
        )}
      </div>
      <ol className="flex flex-col divide-y divide-slate/10">
        {items.map((it, i) => {
          const title = t(lang, `setup.check.${it.id}.title` as MessageKey);
          const body = (
            <>
              <Mark done={it.done} n={i + 1} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate md:text-base">{title}</span>
                <span className="block text-sm text-slate/70">{words(lang, it)}</span>
              </span>
              <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-sm font-semibold text-slate ${it.done ? 'bg-emerald/10' : 'bg-amber/15'}`}>{t(lang, it.done ? 'setup.check.done' : 'setup.check.todo')}</span>
              {linked && <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-slate/70" aria-hidden="true" />}
            </>
          );
          return (
            <li key={it.id} data-check={it.id} data-check-done={it.done ? 'yes' : 'no'} data-check-count={it.count}>
              {linked ? (
                <Link href={it.href} className="flex min-h-[56px] items-center gap-3 rounded-xl px-1 py-2 hover:bg-off-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal">
                  {body}
                </Link>
              ) : (
                <div className="flex min-h-[56px] items-center gap-3 px-1 py-2">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
