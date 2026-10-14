'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/visual/Icons';
import type { Plan } from '@/content/pricing';

// The plan cards on /pricing with a Monthly / Yearly switch. Prices come
// from src/content/pricing.ts only (rupees per enrolled student); this
// component never states a number of its own.

type Period = 'monthly' | 'yearly';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function PlanCards({ plans }: { plans: Plan[] }) {
  const [period, setPeriod] = useState<Period>('monthly');

  return (
    <div className="flex flex-col gap-6">
      <div role="group" aria-label="Billing period" className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-slate/15 bg-off-white p-1">
          {(['monthly', 'yearly'] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`min-h-[44px] rounded-full px-5 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal ${
                period === p ? 'bg-royal text-white' : 'text-slate hover:bg-white'
              }`}
            >
              {p === 'monthly' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
        <span className="rounded-full bg-turquoise/15 px-3 py-1 text-sm font-bold text-slate">Yearly: two months free</span>
      </div>

      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => (
          <li key={p.id} className="relative">
            {p.recommended && (
              <span className="absolute -top-3 left-5 z-10 rounded-full bg-tangerine px-3 py-1 text-xs font-bold text-slate">Most schools start here</span>
            )}
            <div
              className={`flex h-full flex-col gap-4 rounded-3xl border bg-white p-6 ${p.recommended ? 'border-2 border-royal shadow-xl shadow-royal/10' : 'border-slate/10'}`}
            >
              <div>
                <h3 className="text-2xl font-extrabold text-slate">{p.name}</h3>
                <p className="mt-1 text-sm text-slate/70">{p.forWhom}</p>
              </div>
              {p.price ? (
                <div aria-live="polite">
                  <p className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-slate">{rupees(period === 'monthly' ? p.price.monthly : p.price.yearly)}</span>
                    <span className="text-sm font-semibold text-slate/70">per student / {period === 'monthly' ? 'month' : 'year'}</span>
                  </p>
                  <p className="mt-1 text-xs text-slate/70">
                    {period === 'monthly'
                      ? `Or ${rupees(p.price.yearly)} per student a year, two months free`
                      : `Instead of ${rupees(p.price.monthly * 12)} paid monthly`}
                  </p>
                </div>
              ) : (
                <p className="text-lg font-extrabold text-slate">Free, no account needed</p>
              )}
              <ul className="flex flex-col gap-2">
                {p.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2 text-sm text-slate">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald" />
                    {h}
                  </li>
                ))}
              </ul>
              <p className="mt-auto text-sm text-slate/70">{`Support: ${p.support}`}</p>
              <Button href={p.cta.href} variant={p.recommended ? 'secondary' : 'outline'} className="w-full">
                {p.cta.label}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
