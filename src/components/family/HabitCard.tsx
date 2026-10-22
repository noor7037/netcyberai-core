import type { ChildHabit } from '@/lib/family/habit';
import { t, type Lang } from '@/lib/i18n';
import { Picture } from './Picture';
import { ENTER } from './ui/motion';

// The habit pieces on the child's home, under the plan card (M2-3, C277; docs/family-app/11 R7): this week's plan days
// against the parent's goal as seven small circles, the badges for mastered topics, and the family reward jar. Never
// the words streak, broke or missed; no comparison with anyone; no badge for days or time. The jar fills in CSS only and
// stands still under reduced motion. D1-2 (C294): restyled to match the home (pictures, entrance, softer circles).
const titleLang = (title: string) => (/[ऀ-ॿ]/.test(title) ? 'hi' : 'en');
const card = `rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate/10 ${ENTER}`;
const head = 'flex items-center gap-2 text-lg font-extrabold text-slate';

export function HabitCard({ habit, lang }: { habit: ChildHabit; lang: Lang }) {
  const met = habit.doneDays >= habit.goal;
  const jar = habit.jar;
  const pct = jar ? Math.round((jar.days / jar.targetDays) * 100) : 0;
  return (
    <>
      <section data-family-week aria-labelledby="fam-week" className={card}>
        <h2 id="fam-week" className={head}>
          <Picture e="📆" size={24} />
          {t(lang, 'fam.habit.weekTitle')}
        </h2>
        <p className="mt-1 text-base font-semibold text-slate">{t(lang, 'fam.habit.weekSummary', { done: habit.doneDays, goal: habit.goal })}</p>
        <ol role="img" aria-label={t(lang, 'fam.habit.circles', { done: habit.doneDays })} className="mt-3 flex gap-2">
          {habit.week.map((done, i) => (
            <li
              key={i}
              aria-hidden
              data-day-done={done ? 'true' : 'false'}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold ${done ? 'bg-emerald-text text-white shadow-sm' : 'bg-off-white text-slate ring-2 ring-slate/15'}`}
            >
              {done ? '✓' : ''}
            </li>
          ))}
        </ol>
        {met ? (
          <p role="status" className="mt-3 rounded-2xl bg-emerald/10 px-3 py-2 text-base font-bold text-emerald-text">
            {t(lang, 'fam.habit.goalMet')}
          </p>
        ) : (
          <p className="mt-3 text-xs text-slate/80">{t(lang, 'fam.habit.goalHelp', { goal: habit.goal })}</p>
        )}
      </section>

      <section data-family-badges aria-labelledby="fam-badges" className={card}>
        <h2 id="fam-badges" className={head}>
          <Picture e="🏆" size={24} />
          {t(lang, 'fam.habit.badgesTitle')}
        </h2>
        {habit.badges.length === 0 ? (
          <p className="mt-1 text-sm text-slate/80">{t(lang, 'fam.habit.badgesNone')}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {habit.badges.map((b) => (
              <li key={b.topicKey} className="flex min-h-[44px] items-center gap-2 rounded-full bg-sunshine/40 px-4 ring-1 ring-gold/40 py-2 text-sm font-bold text-slate">
                <Picture e="⭐" size={20} />
                <span lang={titleLang(b.title)}>{b.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {jar && (
        <section data-family-jar aria-labelledby="fam-jar" className={card}>
          <h2 id="fam-jar" className={head}>
          <Picture e="🎁" size={24} />
            {t(lang, 'fam.habit.jarTitle')}
          </h2>
          <div className="mt-3 flex items-center gap-4">
            <div
              role="img"
              aria-label={t(lang, 'fam.habit.jarLabel', { days: jar.days, target: jar.targetDays })}
              className="relative h-24 w-16 shrink-0 overflow-hidden rounded-b-3xl rounded-t-lg border-4 border-royal bg-off-white"
            >
              <div data-jar-fill style={{ height: `${pct}%` }} className="absolute inset-x-0 bottom-0 bg-sunshine transition-[height] duration-700 motion-reduce:transition-none" />
            </div>
            <div className="min-w-0">
              <p lang={titleLang(jar.reward)} className="break-words text-base font-bold text-slate">
                {jar.reward}
              </p>
              <p className="text-sm text-slate/80">{t(lang, 'fam.habit.jarProgress', { days: jar.days, target: jar.targetDays })}</p>
            </div>
          </div>
          {jar.filled && (
            <p role="status" className="mt-3 rounded-2xl bg-emerald/10 px-3 py-2 text-base font-bold text-emerald-text">
              {t(lang, 'fam.habit.jarFull')}
            </p>
          )}
        </section>
      )}
    </>
  );
}
