import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { colors } from '@/lib/design-tokens';
import { mockChildren, mockDays } from '@/demo-fixture/parent-mockups';
import { Icon, Phone, SampleChip, subjectHex } from '../MockParts';

// Parent home, direction B "Story": the week as a small bar chart, subject meters, a swipeable child switcher and a
// timeline of the last five things. Development only on sample data: production answers 404, never prerendered, never indexed.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Parent home B (development)', robots: { index: false, follow: false } };

function WeekBars({ minutes }: { minutes: number[] }) {
  const max = Math.max(...minutes, 1);
  const W = 334, H = 120, bw = 28, gap = (W - bw * 7) / 6, top = 18;
  const total = minutes.reduce((a, b) => a + b, 0);
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" role="img" aria-label={`Minutes per day this week: ${minutes.join(', ')}. Total ${total}.`}>
      {minutes.map((m, i) => {
        const h = Math.max(m === 0 ? 3 : 6, ((H - top) * m) / max);
        const x = i * (bw + gap);
        const isToday = i === minutes.length - 1;
        return (
          <g key={i}>
            <rect x={x} y={H - h} width={bw} height={h} rx="7" fill={colors.royal} fillOpacity={isToday ? 1 : 0.45} className="mock-bar" style={{ animationDelay: `${i * 50}ms` }} />
            <text x={x + bw / 2} y={H - h - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill={colors.slate}>{m}</text>
            <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize="11" fontWeight="600" fill={colors.slate}>{mockDays[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ParentB() {
  if (process.env.NODE_ENV === 'production') notFound();
  const c = mockChildren[0];
  const total = c.weekMinutes.reduce((a, b) => a + b, 0);
  return (
    <Phone tab="children">
      <style>{`@media (prefers-reduced-motion: no-preference){.mock-bar{transform-box:fill-box;transform-origin:bottom;animation:mockbar .6s ease-out both}@keyframes mockbar{from{transform:scaleY(0)}}}`}</style>
      <header className="flex items-center justify-between px-4 pb-2 pt-5">
        <h1 className="text-2xl font-bold text-slate">Children</h1>
        <SampleChip />
      </header>

      <ul aria-label="Choose a child" className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1 [scrollbar-width:none]">
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
        <WeekBars minutes={c.weekMinutes} />
      </section>

      <section aria-label="Subjects" className="mx-4 mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate/10">
        <h2 className="mb-3 text-lg font-bold text-slate">Subjects</h2>
        <ul className="flex flex-col gap-3">
          {c.subjects.map((s) => (
            <li key={s.name}>
              <div className="mb-1 flex justify-between text-sm font-semibold text-slate"><span>{s.name}</span><span>{s.pct}%</span></div>
              <div role="meter" aria-label={`${s.name} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.pct} className="h-3 overflow-hidden rounded-full bg-slate/10">
                <div className="h-full rounded-full" style={{ width: `${s.pct}%`, backgroundColor: subjectHex[s.color] }} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Latest" className="mx-4 mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate/10">
        <h2 className="mb-3 text-lg font-bold text-slate">Latest</h2>
        <ol className="relative flex flex-col gap-4 before:absolute before:bottom-3 before:left-[21px] before:top-3 before:w-0.5 before:bg-slate/15">
          {c.timeline.map((t) => (
            <li key={t.text} className="relative flex items-center gap-3">
              <span className="z-[1] flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lesson-mint text-lesson-mint-deep"><Icon name={t.icon} size={20} /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate">{t.text}</span>
                <span className="block text-xs text-slate">{t.when}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </Phone>
  );
}
