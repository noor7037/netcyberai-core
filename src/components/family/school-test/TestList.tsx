import Link from 'next/link';
import type { FamilyOnlineTest } from '@/lib/contracts/marking';
import { fill, type Words } from '@/lib/family/fill';
import { FamIcon } from '../FamIcon';
import { SchoolText } from '../SchoolText';
import { sameInkOnBothSides } from '@/lib/family/day-text';

// The school's online tests in Study (AQ-4, C365): for the child using the app now, matched to a school student, the
// tests of their class that are coming up or open now, and one they are sitting. Each opens its start screen. Nothing
// shows when there is none. Never a mark: results come when the school publishes them.

export const TEST_LIST_KEYS = [
  'fam.test.listTitle',
  'fam.test.opensAt',
  'fam.test.closesAt',
  'fam.test.minutes',
  'fam.test.questions',
  'fam.test.state.upcoming',
  'fam.test.state.open',
  'fam.test.state.in_progress',
  'fam.test.state.done',
  'fam.test.start',
  'fam.test.continue',
] as const;

const when = (iso: string, lang: string) =>
  sameInkOnBothSides(new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)));

export function TestList({ w, lang, tests }: { w: Words; lang: string; tests: FamilyOnlineTest[] }) {
  if (!tests.length) return null;
  return (
    <section aria-labelledby="fam-school-tests" data-school-tests className="flex flex-col gap-2">
      <h2 id="fam-school-tests" className="px-1 text-lg font-extrabold text-slate">
        {w['fam.test.listTitle']}
      </h2>
      <ul className="flex flex-col gap-2">
        {tests.map((t) => (
          <li key={t.testId} data-school-test={t.state} className="fam-card flex flex-col gap-3 bg-white p-4">
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sunshine/30 text-gold-deep">
                <FamIcon name="sheet" className="h-6 w-6" />
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="break-words text-base font-bold text-slate">
                  <SchoolText text={t.subject} /> · <SchoolText text={t.exam} />
                </p>
                <p className="text-sm text-slate">
                  {t.state === 'upcoming' ? fill(w['fam.test.opensAt'], { when: when(t.opensAt, lang) }) : fill(w['fam.test.closesAt'], { when: when(t.closesAt, lang) })}
                </p>
                <p className="text-sm text-slate">
                  {fill(w['fam.test.minutes'], { n: t.minutes })} · {fill(w['fam.test.questions'], { n: t.questions })}
                </p>
              </div>
              <span className={`ml-auto shrink-0 rounded-full px-3 py-1 text-xs font-bold ${t.state === 'open' || t.state === 'in_progress' ? 'bg-white text-emerald-text ring-1 ring-emerald-text/40' : 'bg-white text-slate ring-1 ring-slate/20'}`}>
                {w[`fam.test.state.${t.state}`]}
              </span>
            </div>
            {t.state !== 'done' && (
              <Link
                href={`/family/study/tests/${t.testId}`}
                data-school-test-open={t.testId}
                className="fam-press flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-royal-deep bg-gradient-to-r from-royal to-violet px-5 text-base font-extrabold text-white"
              >
                {t.state === 'in_progress' ? w['fam.test.continue'] : w['fam.test.start']}
                <FamIcon name="next" className="h-5 w-5" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
