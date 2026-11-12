import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { mockChildren, mockDays, mockNeedsYou } from '@/demo-fixture/parent-mockups';
import { DayRow, Icon, ProgressRing, StatChip } from '@/components/family/parent/parts';
import { Phone, SampleChip } from '../MockParts';

// Parent home, direction A "Today": one card per child (ring, streak, three chips, one action), a short "Needs you"
// stack and the four-tab bar. Development only on sample data: production answers 404, never prerendered, never indexed.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Parent home A (development)', robots: { index: false, follow: false } };

const TONE = { action: 'bg-tangerine text-slate', trust: 'bg-sapphire text-white', product: 'bg-royal text-white' } as const;

export default function ParentA() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <Phone tab="home">
      <header className="flex items-center justify-between px-4 pb-2 pt-5">
        <h1 className="text-2xl font-bold text-slate">Today</h1>
        <SampleChip />
      </header>

      <section aria-label="Needs you" className="px-4 pt-2">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate">Needs you · {mockNeedsYou.length}</h2>
        <ul className="flex flex-col gap-2">
          {mockNeedsYou.map((n) => (
            <li key={n.title} className="flex items-center gap-3 rounded-2xl border border-slate/10 bg-white p-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${TONE[n.tone]}`}><Icon name={n.icon} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-slate">{n.title}</span>
                <span className="block text-xs text-slate">{n.body}</span>
              </span>
              <button type="button" className="min-h-[44px] shrink-0 rounded-full px-3 text-sm font-bold text-royal">{n.cta}</button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Your children" className="flex flex-col gap-4 px-4 pt-6">
        {mockChildren.map((c) => (
          <article key={c.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate/10">
            <div className="flex items-center gap-4">
              <ProgressRing value={c.minutesToday} goal={c.goalMinutes} centre={String(c.minutesToday)} sub={`of ${c.goalMinutes} min`} label={`${c.minutesToday} of ${c.goalMinutes} minutes today`} />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate">{c.name}</h3>
                <p className="text-sm text-slate">{c.className}</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-tangerine-deep"><Icon name="flame" size={18} />{c.streakDays}-day streak</p>
              </div>
            </div>
            <div className="mt-4">
              <DayRow label="Last 7 days" onText="Learned" offText="Missed" days={c.streak.map((on, i) => ({ on, label: mockDays[i] }))} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <StatChip value={c.answersRight} label="answers right" tone="mint" />
              <StatChip value={c.topicsDone} label="topics done" tone="lilac" />
              <StatChip value={`${c.tutorMinutes}m`} label="with tutor" tone="sky" />
            </div>
            <button type="button" className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-1 rounded-full bg-royal text-base font-bold text-white">
              See {c.name}&rsquo;s week <Icon name="chevron" size={18} />
            </button>
          </article>
        ))}
      </section>
    </Phone>
  );
}
