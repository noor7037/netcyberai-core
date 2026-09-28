'use client';

import { useEffect, useState } from 'react';
import { Icon, type IconName } from './Icons';
import { tones, type Tone } from '@/lib/semantic';
import { useInView, usePrefersReducedMotion } from '@/lib/hooks';

export interface Step {
  title: string;
  detail: string;
}

export function FlowStepper({ steps, tones: stepTones, icons }: { steps: Step[]; tones: Tone[]; icons: IconName[] }) {
  const [ref, inView] = useInView<HTMLOListElement>();
  const reduced = usePrefersReducedMotion();
  const [lit, setLit] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setLit(steps.length);
      return;
    }
    setLit(0);
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setLit(i);
      if (i >= steps.length) window.clearInterval(t);
    }, 450);
    return () => window.clearInterval(t);
  }, [inView, reduced, steps.length]);

  return (
    <ol ref={ref} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {steps.map((s, i) => {
        const on = i < lit;
        return (
          <li key={s.title} className="relative">
            <div className={`flex h-full flex-col gap-2 rounded-2xl border p-4 transition-all duration-500 ${on ? 'border-transparent bg-white shadow-xl' : 'border-slate/10 bg-white'}`}>
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[stepTones[i]].solid}`}>
                <Icon name={icons[i]} className="h-4 w-4" />
              </span>
              <p className="text-sm font-bold text-slate">{`${i + 1}. ${s.title}`}</p>
              <p className="text-xs text-slate/70">{s.detail}</p>
            </div>
            {i < steps.length - 1 && (
              <span aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white p-0.5 text-slate shadow lg:block">
                <Icon name="chevronRight" className="h-4 w-4" />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

