'use client';

import { useState } from 'react';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/visual/Primitives';
import { Icon, type IconName } from '@/components/visual/Icons';

const ROWS: { manual: string; connected: string; result: string; icon: IconName }[] = [
  { manual: 'Paper registers, re-typed later', connected: 'Attendance marked once, validated at entry', result: 'Absences visible the same morning', icon: 'attendance' },
  { manual: 'Scattered WhatsApp groups', connected: 'One consent-aware WhatsApp channel', result: 'Parents get one clear update', icon: 'chat' },
  { manual: 'Chasing fees by phone', connected: 'Scheduled reminders with a UPI link', result: 'Fewer missed follow-ups', icon: 'fees' },
  { manual: 'No view of what was taught', connected: 'Daily Learning Pulse from verified class activity', result: 'Parents know what happened today', icon: 'pulse' },
  { manual: 'Tasks lost between people', connected: 'Every exception gets a named owner', result: 'Nothing silently missed', icon: 'alert' },
  { manual: 'Principal asks around for status', connected: 'Live school health dashboard', result: 'Visibility without chasing', icon: 'chart' },
];

export function ManualToConnected() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <section aria-labelledby="transform-title" className="nca-mesh-light bg-off-white">
      <Container wide className="flex flex-col gap-10 py-20">
        <SectionHeading
          id="transform-title"
          eyebrow="From manual to connected"
          tone="action"
          title="From manual work to connected school operations"
          lead="Most schools are not short of effort. They are short of one place where that effort connects. Point at any row to trace it across."
        />

        <div className="hidden grid-cols-3 gap-4 text-xs font-bold uppercase tracking-wider md:grid">
          <p className="flex items-center gap-2 text-coral-deep">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-coral" /> Manual today
          </p>
          <p className="flex items-center gap-2 text-grape-deep">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-grape" /> Connected with NetCyberAI
          </p>
          <p className="flex items-center gap-2 text-emerald">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-turquoise" /> What changes
          </p>
        </div>

        <ul className="flex flex-col gap-3">
          {ROWS.map((row, i) => {
            const on = active === i;
            return (
              <li key={row.manual}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(on ? null : i)}
                  aria-pressed={on}
                  className="grid w-full grid-cols-1 gap-2 rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-royal md:grid-cols-3 md:gap-4"
                >
                  <span className={`flex items-center gap-3 rounded-xl border border-coral/30 bg-white p-4 transition ${on ? 'shadow-lg' : ''}`}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-coral/15 text-coral-deep">
                      <Icon name={row.icon} className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-slate">
                      <span className="sr-only">Manual today: </span>
                      {row.manual}
                    </span>
                  </span>
                  <span className={`relative flex items-center gap-3 rounded-xl p-4 transition ${on ? 'bg-grape text-white shadow-xl shadow-grape/30' : 'border border-grape/30 bg-white text-slate'}`}>
                    <Icon name="arrow" className="hidden h-4 w-4 shrink-0 md:block" />
                    <span className="text-sm font-semibold">
                      <span className="sr-only">Connected: </span>
                      {row.connected}
                    </span>
                  </span>
                  <span className={`flex items-center gap-3 rounded-xl p-4 transition ${on ? 'bg-turquoise text-slate shadow-xl shadow-turquoise/30' : 'border border-turquoise/40 bg-white text-slate'}`}>
                    <Icon name="check" className="h-4 w-4 shrink-0" />
                    <span className="text-sm font-semibold">
                      <span className="sr-only">What changes: </span>
                      {row.result}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-sm text-slate/70">
          These are the changes the product is built to make visible. Outcomes depend on how each school uses it;
          we do not publish guaranteed results.
        </p>
      </Container>
    </section>
  );
}
