'use client';

import type { Steps } from '@/lib/family/blocks';
import { Card } from './BlockViews';

// A step strip (W9-C, docs/39 §3): 3 to 5 numbered cards, a column on a phone (390) and a row from 768 px, each with
// its short label and one line of text, in order. Plain text only; no motion of its own.
export function StepsView({ b, tone }: { b: Steps; tone: string }) {
  return (
    <Card title={b.title} tone={tone} tag="steps">
      <ol data-steps className="flex flex-col gap-3 md:flex-row md:items-stretch">
        {b.items.map((s, i) => (
          <li key={i} className="flex flex-1 gap-3 rounded-2xl bg-off-white p-3 text-slate ring-1 ring-slate/10 md:flex-col">
            <span aria-hidden="true" data-num className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-royal text-base font-extrabold text-white">
              {i + 1}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-base font-bold">{s.label}</span>
              <span className="text-sm leading-relaxed">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
