import Link from 'next/link';
import type { DayPlan } from '@/lib/family/plan';
import { subjectTheme } from '@/lib/family/subject-theme';
import { t, type Lang } from '@/lib/i18n';
import { FamIcon, rise } from './FamIcon';
import { ProgressRing } from './ui/ProgressRing';
import { SubjectGlyph } from './ui/SubjectGlyph';

// Today's plan on the child's home, first (M2-2, C276: the learning-first routine). Each item opens its topic in
// Understand; a tick shows it has a checked answer today. Done means today's answers, never pages opened. No streaks and
// nothing about missed days.
// F2 on D1 (C230-Q): a D1 card, the day's progress as a ring with its words beside it, and each item in its subject's
// colour with the subject's mark (white on a solid royal-deep under the subject's gradient).
const titleLang = (title: string) => (/[ऀ-ॿ]/.test(title) ? 'hi' : 'en');

export function PlanCard({ plan, lang, delay = 40 }: { plan: DayPlan; lang: Lang; delay?: number }) {
  const total = plan.items.length;
  const done = plan.items.filter((i) => i.done).length;
  return (
    <section data-family-plan aria-labelledby="fam-plan" className="fam-card fam-rise bg-white p-5" style={rise(delay)}>
      <div className="flex items-center gap-4">
        {total > 0 ? (
          <ProgressRing value={done} max={total} size={60} stroke={7} track="text-leaf/20" arc="text-emerald">
            <span aria-hidden="true" className="text-base font-black text-slate">
              {done}/{total}
            </span>
          </ProgressRing>
        ) : (
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-royal-deep bg-gradient-to-br from-royal to-violet text-white shadow-lg">
            <FamIcon name="calendar" className="h-6 w-6" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 id="fam-plan" className="text-xl font-extrabold text-slate">
            {t(lang, 'fam.plan.title')}
          </h2>
          {total > 0 && (
            <p className="text-sm font-semibold text-slate/80">
              {t(lang, 'fam.plan.progress', { done, total })} · {t(lang, 'fam.plan.minutes', { minutes: plan.minutes })}
            </p>
          )}
        </div>
      </div>
      {total === 0 ? (
        <p className="mt-3 text-base text-slate/80">{t(lang, 'fam.plan.empty')}</p>
      ) : (
        <>
          {plan.complete && (
            <p role="status" data-plan-complete className="fam-pop mt-4 flex items-center gap-2 rounded-2xl bg-emerald/10 px-3 py-2 text-base font-bold text-emerald-text">
              <FamIcon name="sparkle" className="h-5 w-5 shrink-0" />
              {t(lang, 'fam.plan.complete')}
            </p>
          )}
          <ol className="mt-4 flex flex-col gap-2">
            {plan.items.map((i) => {
              const theme = subjectTheme(i.subject);
              return (
                <li key={i.topicKey}>
                  <Link
                    href={`/family/understand?kind=${i.isTopic ? 'topic' : 'chapter'}&key=${encodeURIComponent(i.topicKey)}`}
                    className={`fam-press flex min-h-[56px] items-center gap-3 rounded-2xl px-3 py-2 ${i.done ? 'bg-emerald/10' : 'bg-off-white hover:bg-slate/5'}`}
                  >
                    <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-royal-deep text-white shadow-md ${theme.tile}`}>
                      <SubjectGlyph subject={i.subject} className="h-5 w-5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-xs font-bold uppercase tracking-wide text-slate/80">{t(lang, `fam.plan.kind.${i.kind}`)}</span>
                      <span lang={titleLang(i.title)} className="text-base font-semibold text-slate">
                        {i.title}
                      </span>
                    </span>
                    {i.done ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-text px-2.5 py-1 text-xs font-bold text-white">
                        <FamIcon name="check" className="h-3.5 w-3.5" />
                        {t(lang, 'fam.plan.done')}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate ring-1 ring-slate/20">{t(lang, 'fam.plan.todo')}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
          {total - done > 0 && <p className="mt-3 text-xs text-slate/80">{t(lang, 'fam.plan.how')}</p>}
        </>
      )}
    </section>
  );
}
