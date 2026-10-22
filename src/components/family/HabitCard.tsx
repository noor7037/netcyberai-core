import type { ChildHabit } from '@/lib/family/habit';
import { t, type Lang } from '@/lib/i18n';
import { FamIcon, rise } from './FamIcon';
import { ProgressRing } from './ui/ProgressRing';

// The habit pieces on the child's home, under the plan card (M2-3, C277; docs/family-app/11 R7): this week's plan days
// against the parent's goal as seven small circles, the badges for mastered topics, and the family reward jar. Never
// the words streak, broke or missed; no comparison with anyone; no badge for days or time. The jar fills in CSS only and
// stands still under reduced motion.
// F2 on D1 (C230-Q): D1 cards that come in one after another, the week's days against the goal as a ring with the
// sentence beside it, and drawn ticks and stars (never a device emoji).
const titleLang = (title: string) => (/[ऀ-ॿ]/.test(title) ? 'hi' : 'en');
const card = 'fam-card fam-rise bg-white p-5';

export function HabitCard({ habit, lang, delay = 80 }: { habit: ChildHabit; lang: Lang; delay?: number }) {
  const met = habit.doneDays >= habit.goal;
  const jar = habit.jar;
  const pct = jar ? Math.min(100, Math.round((jar.days / jar.targetDays) * 100)) : 0;
  return (
    <>
      <section data-family-week aria-labelledby="fam-week" className={card} style={rise(delay)}>
        <div className="flex items-center gap-4">
          <ProgressRing value={habit.doneDays} max={habit.goal} size={60} stroke={7} track="text-leaf/20" arc="text-emerald">
            <span aria-hidden="true" className="text-lg font-black text-slate">
              {habit.doneDays}
            </span>
          </ProgressRing>
          <div className="min-w-0">
            <h2 id="fam-week" className="text-lg font-extrabold text-slate">
              {t(lang, 'fam.habit.weekTitle')}
            </h2>
            <p className="text-base font-semibold text-slate">{t(lang, 'fam.habit.weekSummary', { done: habit.doneDays, goal: habit.goal })}</p>
          </div>
        </div>
        <ol role="img" aria-label={t(lang, 'fam.habit.circles', { done: habit.doneDays })} className="mt-4 grid grid-cols-7 gap-1.5">
          {habit.week.map((done, i) => (
            <li
              key={i}
              aria-hidden
              data-day-done={done ? 'true' : 'false'}
              className={`mx-auto flex aspect-square w-full max-w-[2.5rem] items-center justify-center rounded-full ${done ? 'bg-emerald-text text-white shadow-md' : 'bg-white text-slate ring-2 ring-slate/20'}`}
            >
              {done && <FamIcon name="check" className="h-4 w-4" />}
            </li>
          ))}
        </ol>
        {met ? (
          <p role="status" className="fam-pop mt-4 flex items-center gap-2 rounded-2xl bg-emerald/10 px-3 py-2 text-base font-bold text-emerald-text">
            <FamIcon name="sparkle" className="h-5 w-5 shrink-0" />
            {t(lang, 'fam.habit.goalMet')}
          </p>
        ) : (
          <p className="mt-3 text-xs text-slate/80">{t(lang, 'fam.habit.goalHelp', { goal: habit.goal })}</p>
        )}
      </section>

      <section data-family-badges aria-labelledby="fam-badges" className={card} style={rise(delay + 40)}>
        <h2 id="fam-badges" className="flex items-center gap-2 text-lg font-extrabold text-slate">
          <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sunshine text-slate">
            <FamIcon name="star" className="h-5 w-5" />
          </span>
          {t(lang, 'fam.habit.badgesTitle')}
        </h2>
        {habit.badges.length === 0 ? (
          <p className="mt-2 text-sm text-slate/80">{t(lang, 'fam.habit.badgesNone')}</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-2">
            {habit.badges.map((b) => (
              <li key={b.topicKey} className="fam-pop flex min-h-[44px] items-center gap-2 rounded-full bg-sunshine py-1.5 pl-1.5 pr-4 text-sm font-bold text-slate">
                <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate">
                  <FamIcon name="star" className="h-4 w-4" />
                </span>
                <span lang={titleLang(b.title)}>{b.title}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {jar && (
        <section data-family-jar aria-labelledby="fam-jar" className={card} style={rise(delay + 80)}>
          <h2 id="fam-jar" className="text-lg font-extrabold text-slate">
            {t(lang, 'fam.habit.jarTitle')}
          </h2>
          <div className="mt-3 flex items-center gap-4">
            <div
              role="img"
              aria-label={t(lang, 'fam.habit.jarLabel', { days: jar.days, target: jar.targetDays })}
              className="relative h-24 w-16 shrink-0 overflow-hidden rounded-b-3xl rounded-t-lg border-4 border-royal bg-off-white shadow-md"
            >
              <div data-jar-fill style={{ height: `${pct}%` }} className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-gold to-sunshine transition-[height] duration-700 motion-reduce:transition-none" />
            </div>
            <div className="min-w-0">
              <p lang={titleLang(jar.reward)} className="break-words text-base font-bold text-slate">
                {jar.reward}
              </p>
              <p className="text-sm text-slate/80">{t(lang, 'fam.habit.jarProgress', { days: jar.days, target: jar.targetDays })}</p>
            </div>
          </div>
          {jar.filled && (
            <p role="status" className="fam-pop mt-3 flex items-center gap-2 rounded-2xl bg-emerald/10 px-3 py-2 text-base font-bold text-emerald-text">
              <FamIcon name="sparkle" className="h-5 w-5 shrink-0" />
              {t(lang, 'fam.habit.jarFull')}
            </p>
          )}
        </section>
      )}
    </>
  );
}
