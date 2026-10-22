import Link from 'next/link';
import type { DayPlan } from '@/lib/family/plan';
import { t, type Lang } from '@/lib/i18n';

// Today's plan on the child's home, first (M2-2, C276: the learning-first routine). Each item opens its topic in
// Understand; a tick shows it has a checked answer today. Done means today's answers, never pages opened. No streaks and
// nothing about missed days.
const titleLang = (title: string) => (/[ऀ-ॿ]/.test(title) ? 'hi' : 'en');

export function PlanCard({ plan, lang }: { plan: DayPlan; lang: Lang }) {
  const left = plan.items.filter((i) => !i.done).length;
  return (
    <section data-family-plan aria-labelledby="fam-plan" className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate/10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="fam-plan" className="text-xl font-extrabold text-slate">
          {t(lang, 'fam.plan.title')}
        </h2>
        {plan.items.length > 0 && <p className="shrink-0 text-sm font-semibold text-slate/80">{t(lang, 'fam.plan.minutes', { minutes: plan.minutes })}</p>}
      </div>
      {plan.items.length === 0 ? (
        <p className="mt-2 text-base text-slate/80">{t(lang, 'fam.plan.empty')}</p>
      ) : (
        <>
          {plan.complete && (
            <p role="status" data-plan-complete className="mt-3 animate-pop-in rounded-2xl bg-emerald/10 px-3 py-2 text-base font-bold text-emerald-text motion-reduce:animate-none">
              {t(lang, 'fam.plan.complete')}
            </p>
          )}
          <ol className="mt-3 flex flex-col gap-2">
            {plan.items.map((i) => (
              <li key={i.topicKey}>
                <Link
                  href={`/family/understand?kind=${i.isTopic ? 'topic' : 'chapter'}&key=${encodeURIComponent(i.topicKey)}`}
                  className={`flex min-h-[44px] items-center gap-3 rounded-2xl px-3 py-2 ${i.done ? 'bg-emerald/10' : 'bg-off-white hover:bg-slate/5'}`}
                >
                  <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${i.done ? 'bg-emerald-text text-white' : 'bg-white text-slate ring-1 ring-slate/20'}`}>
                    {i.done ? '✓' : ''}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-xs font-bold uppercase tracking-wide text-slate/80">{t(lang, `fam.plan.kind.${i.kind}`)}</span>
                    <span lang={titleLang(i.title)} className="text-base font-semibold text-slate">
                      {i.title}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-bold text-slate/80">{i.done ? t(lang, 'fam.plan.done') : t(lang, 'fam.plan.todo')}</span>
                </Link>
              </li>
            ))}
          </ol>
          {left > 0 && <p className="mt-3 text-xs text-slate/80">{t(lang, 'fam.plan.how')}</p>}
        </>
      )}
    </section>
  );
}
