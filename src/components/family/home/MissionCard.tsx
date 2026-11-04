import Link from 'next/link';
import type { DayPlan } from '@/lib/family/plan';
import { FamIcon } from '../FamIcon';
import { TutorAvatar } from '../TutorAvatar';
import { Mascot } from '../mascot/Mascot';
import { MissionArt } from './art';

// W19-C: the home's hero (the founder's reference: a tinted hero card with a drawn picture and a dark Start button).
// Today's mission is today's plan (M2-2): the next topic without a checked answer today, how many are done, and the
// plan's minutes, all from `dayPlan`. A plan with nothing in it shows the mascot and one way in. Done means checked
// answers, never pages opened; nothing about missed days.
export type MissionWords = { title: string; start: string; next: (topic: string) => string; progress: string; minutes: string; complete: string; emptyLead: string; study: string; done: string; todo: string };

const titleLang = (title: string) => (/[ऀ-ॿ]/.test(title) ? 'hi' : 'en');
const href = (i: { isTopic: boolean; topicKey: string }) => `/family/understand?kind=${i.isTopic ? 'topic' : 'chapter'}&key=${encodeURIComponent(i.topicKey)}`;

export function MissionCard({ plan, words }: { plan: DayPlan; words: MissionWords }) {
  const total = plan.items.length;
  const done = plan.items.filter((i) => i.done).length;
  const next = plan.items.find((i) => !i.done) ?? null;
  if (total === 0) {
    return (
      <section data-family-mission data-plan-empty aria-labelledby="fam-mission" className="fam-activity fam-section fam-rise relative overflow-hidden rounded-[1.5rem] bg-lesson-lilac">
        <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-left">
          <Mascot id="mission-empty" className="h-32 w-40 shrink-0" />
          <div className="flex min-w-0 flex-col gap-2">
            <h2 id="fam-mission" className="fam-display text-2xl font-extrabold leading-tight text-ink">
              {words.title}
            </h2>
            <p className="text-base text-ink">{words.emptyLead}</p>
          </div>
        </div>
        <Link href="/family/study" className="fam-press inline-flex min-h-[48px] items-center justify-center gap-2 self-center rounded-full bg-ink px-6 text-base font-bold text-white sm:self-start">
          {words.study}
          <FamIcon name="next" className="h-5 w-5" />
        </Link>
      </section>
    );
  }
  const pct = Math.round((done / total) * 100);
  return (
    <section data-family-mission data-family-plan aria-labelledby="fam-mission" className="fam-activity fam-section fam-rise relative overflow-hidden rounded-[1.5rem] bg-lesson-lilac">
      <span aria-hidden="true" className="fam-mission-glow" />
      <div className="relative flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-[0.12em] text-lesson-lilac-deep">
            <TutorAvatar className="h-7 w-7 shrink-0" />
            {words.title}
          </p>
          {next ? (
            <h2 id="fam-mission" lang={titleLang(next.title)} className="fam-display text-2xl font-extrabold leading-tight text-ink">
              {next.title}
            </h2>
          ) : (
            <h2 id="fam-mission" role="status" data-plan-complete className="fam-display text-2xl font-extrabold leading-tight text-ink">
              {words.complete}
            </h2>
          )}
          <p className="fam-num text-sm font-semibold text-ink">
            {words.progress} · {words.minutes}
          </p>
        </div>
        <MissionArt className="-mr-2 -mt-1 h-28 w-28 shrink-0 sm:h-32 sm:w-32" />
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-white" role="img" aria-label={words.progress}>
        <span className="fam-bar-fill absolute inset-y-0 left-0 rounded-full bg-lesson-lilac-deep" style={{ width: `${pct}%` }} />
      </div>
      <ol className="relative flex flex-col gap-1.5">
        {plan.items.slice(0, 4).map((i) => (
          <li key={i.topicKey}>
            <Link href={href(i)} className="fam-lift flex min-h-[44px] items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-ink">
              <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${i.done ? 'bg-emerald text-white' : 'bg-lesson-lilac text-lesson-lilac-deep'}`}>
                {i.done ? <FamIcon name="check" className="h-3.5 w-3.5" /> : <span className="h-2 w-2 rounded-full bg-lesson-lilac-deep" />}
              </span>
              <span lang={titleLang(i.title)} className="min-w-0 flex-1 truncate">
                {i.title}
              </span>
              <span className="sr-only">{i.done ? words.done : words.todo}</span>
            </Link>
          </li>
        ))}
      </ol>
      {next && (
        <Link href={href(next)} data-mission-start className="fam-press relative inline-flex min-h-[48px] items-center justify-center gap-2 self-start rounded-full bg-ink px-7 text-base font-bold text-white shadow-lg">
          {words.start}
          <span className="sr-only">{words.next(next.title)}</span>
          <FamIcon name="next" className="h-5 w-5" />
        </Link>
      )}
    </section>
  );
}
