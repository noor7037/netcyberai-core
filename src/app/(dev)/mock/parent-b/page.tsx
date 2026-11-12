import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { mockChildren, mockDays } from '@/demo-fixture/parent-mockups';
import { Meter, Timeline, WeekBars } from '@/components/family/parent/parts';
import { Phone, SampleChip } from '../MockParts';

// Parent home, direction B "Story": the week as a small bar chart, subject meters, a swipeable child switcher and a
// timeline of the last five things. Development only on sample data: production answers 404, never prerendered, never indexed.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Parent home B (development)', robots: { index: false, follow: false } };

export default function ParentB() {
  if (process.env.NODE_ENV === 'production') notFound();
  const c = mockChildren[0];
  const total = c.weekMinutes.reduce((a, b) => a + b, 0);
  return (
    <Phone tab="children">
      <header className="flex items-center justify-between px-4 pb-2 pt-5">
        <h1 className="text-2xl font-bold text-slate">Children</h1>
        <SampleChip />
      </header>

      <ul aria-label="Choose a child" className="flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none]">
        {mockChildren.map((k, i) => (
          <li key={k.id} className="shrink-0 snap-start">
            <button type="button" aria-pressed={i === 0} className={`flex min-h-[56px] whitespace-nowrap items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 ${i === 0 ? 'bg-royal text-white' : 'bg-white text-slate ring-1 ring-slate/15'}`}>
              <span className={`flex h-11 w-11 items-center justify-center rounded-full text-base font-bold ${i === 0 ? 'bg-white text-royal' : 'bg-lesson-lilac text-grape-deep'}`}>{k.name.slice(-1)}</span>
              <span className="text-left"><span className="block text-sm font-bold">{k.name}</span><span className="block text-xs font-semibold">{k.className}</span></span>
            </button>
          </li>
        ))}
        <li className="shrink-0 snap-start">
          <button type="button" className="flex min-h-[56px] items-center gap-2 whitespace-nowrap rounded-full bg-white px-4 text-sm font-bold text-royal ring-1 ring-slate/15">+ Add child</button>
        </li>
      </ul>

      <section aria-label="This week" className="mx-4 mt-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate/10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-slate">This week</h2>
          <p className="text-sm font-semibold text-slate"><span className="text-xl font-bold text-royal-deep">{total}</span> min</p>
        </div>
        <p className="mb-2 text-xs text-slate">Minutes learned each day</p>
        <WeekBars values={c.weekMinutes} labels={mockDays} label={`Minutes per day this week: ${c.weekMinutes.join(', ')}. Total ${total}.`} />
      </section>

      <section aria-label="Subjects" className="mx-4 mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate/10">
        <h2 className="mb-3 text-lg font-bold text-slate">Subjects</h2>
        <ul className="flex flex-col gap-3">
          {c.subjects.map((s) => (
            <li key={s.name}><Meter name={s.name} pct={s.pct} color={s.color} ariaLabel={`${s.name} progress`} /></li>
          ))}
        </ul>
      </section>

      <section aria-label="Latest" className="mx-4 mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate/10">
        <h2 className="mb-3 text-lg font-bold text-slate">Latest</h2>
        <Timeline items={c.timeline} />
      </section>
    </Phone>
  );
}
