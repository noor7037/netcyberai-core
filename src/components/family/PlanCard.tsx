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
// colour with the subject's mark (the subject's solid accent, W12-E).
const titleLang = (title: string) => (/[ऀ-ॿ]/.test(title) ? 'hi' : 'en');

export function PlanCard({ plan, lang, delay = 40 }: { plan: DayPlan; lang: Lang; delay?: number }) {
  const total = plan.items.length;
  const done = plan.items.filter((i) => i.done).length;
  return (
    <section data-family-plan aria-labelledby="fam-plan" className="fam-card fam-section fam-rise bg-white" style={rise(delay)}>
      <div className="flex items-center gap-4">
        {total > 0 ? (
          <ProgressRing value={done} max={total} size={60} stroke={7} track="text-leaf/20" arc="text-emerald">
            <span aria-hidden="true" className="fam-num text-base text-slate">
              {done}/{total}
            </span>
          </ProgressRing>
        ) : (
          <span aria-hidden="true" className="fam-chip-icon h-12 w-12 bg-ink text-white">
            <FamIcon name="calendar" className="h-6 w-6" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 id="fam-plan" className="fam-h2 text-slate">
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
        <div data-plan-empty className="flex flex-col items-start gap-3">
          <p className="text-base text-slate">{t(lang, 'fam.plan.empty')}</p>
          <Link href="/family/study" className="fam-press inline-flex min-h-[44px] items-center rounded-full bg-white px-5 text-sm font-bold text-ink ring-1 ring-ink/30">
            {t(lang, 'fam.home.study')}
          </Link>
        </div>
      ) : (
        <>
          {plan.complete && (
            <p role="status" data-plan-complete className="fam-pop flex items-center gap-2 rounded-xl bg-emerald/10 px-3 py-2 text-base font-bold text-emerald-text">
              <FamIcon name="sparkle" className="h-5 w-5 shrink-0" />
              {t(lang, 'fam.plan.complete')}
            </p>
          )}
          <ol className="flex flex-col gap-2">
            {plan.items.map((i) => {
              const theme = subjectTheme(i.subject);
              return (
                <li key={i.topicKey}>
                  <Link
                    href={`/family/understand?kind=${i.isTopic ? 'topic' : 'chapter'}&key=${encodeURIComponent(i.topicKey)}`}
                    className={`fam-row fam-lift min-h-[56px] ${i.done ? 'bg-emerald/10' : 'bg-off-white hover:bg-slate/5'}`}
                  >
                    <span aria-hidden="true" className={`fam-chip-icon ${theme.chip}`}>
                      <SubjectGlyph subject={i.subject} className="h-5 w-5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="fam-eyebrow text-slate/80">{t(lang, `fam.plan.kind.${i.kind}`)}</span>
                      <span lang={titleLang(i.title)} className="text-base font-semibold text-slate">
                        {i.title}
                      </span>
                    </span>
                    {i.done ? (
                      <span className="fam-pill shrink-0 bg-emerald-text text-white">
                        <FamIcon name="check" className="h-3.5 w-3.5" />
                        {t(lang, 'fam.plan.done')}
                      </span>
                    ) : (
                      <span className="fam-pill shrink-0 bg-white text-slate ring-1 ring-slate/20">{t(lang, 'fam.plan.todo')}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </section>
  );
}
