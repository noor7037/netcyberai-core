import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { colors } from '@/lib/design-tokens';
import { mockChildren, mockDays, mockNeedsYou } from '@/demo-fixture/parent-mockups';
import { Icon, Phone, SampleChip } from '../MockParts';

// Parent home, direction A "Today": one card per child (ring, streak, three chips, one action), a short "Needs you"
// stack and the four-tab bar. Development only on sample data: production answers 404, never prerendered, never indexed.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Parent home A (development)', robots: { index: false, follow: false } };

function Ring({ value, goal }: { value: number; goal: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, value / goal);
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`${value} of ${goal} minutes today`}>
      <circle cx="44" cy="44" r={r} fill="none" stroke={colors.slate} strokeOpacity="0.12" strokeWidth="9" />
      <circle cx="44" cy="44" r={r} fill="none" stroke={colors.royal} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 44 44)" className="mock-ring" />
      <text x="44" y="46" textAnchor="middle" fontSize="20" fontWeight="700" fill={colors.slate}>{value}</text>
      <text x="44" y="61" textAnchor="middle" fontSize="10" fontWeight="600" fill={colors.slate}>of {goal} min</text>
    </svg>
  );
}

const TONE = { action: 'bg-tangerine text-slate', trust: 'bg-sapphire text-white', product: 'bg-royal text-white' } as const;

export default function ParentA() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <Phone tab="home">
      <style>{`@media (prefers-reduced-motion: no-preference){.mock-ring{animation:mockring .9s ease-out}@keyframes mockring{from{stroke-dashoffset:214}}}`}</style>
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
              <Ring value={c.minutesToday} goal={c.goalMinutes} />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-bold text-slate">{c.name}</h3>
                <p className="text-sm text-slate">{c.className}</p>
                <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-tangerine-deep"><Icon name="flame" size={18} />{c.streakDays}-day streak</p>
              </div>
            </div>
            <ol aria-label="Last 7 days" className="mt-4 flex justify-between">
              {c.streak.map((on, i) => (
                <li key={i} className="flex flex-col items-center gap-1 text-xs font-semibold text-slate">
                  <span className={`h-7 w-7 rounded-full ${on ? 'bg-emerald' : 'border-2 border-slate/25'}`}>
                    <span className="sr-only">{on ? 'Learned' : 'Missed'}</span>
                    {on && <Icon name="check" size={28} className="rounded-full bg-emerald text-white" />}
                  </span>
                  {mockDays[i]}
                </li>
              ))}
            </ol>
            <ul className="mt-4 grid grid-cols-3 gap-2">
              {[
                { v: c.answersRight, l: 'answers right', bg: 'bg-lesson-mint', fg: 'text-lesson-mint-deep' },
                { v: c.topicsDone, l: 'topics done', bg: 'bg-lesson-lilac', fg: 'text-lesson-lilac-deep' },
                { v: `${c.tutorMinutes}m`, l: 'with tutor', bg: 'bg-lesson-sky', fg: 'text-lesson-sky-deep' },
              ].map((s) => (
                <li key={s.l}>
                  <button type="button" className={`flex min-h-[64px] w-full flex-col items-center justify-center rounded-2xl ${s.bg}`}>
                    <span className={`text-xl font-bold ${s.fg}`}>{s.v}</span>
                    <span className="text-xs font-semibold text-slate">{s.l}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-1 rounded-full bg-royal text-base font-bold text-white">
              See {c.name}&rsquo;s week <Icon name="chevron" size={18} />
            </button>
          </article>
        ))}
      </section>
    </Phone>
  );
}
