'use client';

import { useState } from 'react';
import type { Steps } from '@/lib/family/blocks';
import type { Words } from '@/lib/family/fill';
import { Card } from './BlockViews';
import { useReducedMotion } from './InteractiveViews';

// A step strip (W9-C, docs/39 §3): 3 to 5 numbered cards, a column on a phone (390) and a row from 768 px, each with
// its short label and one line of text, in order. Plain text only.
// W10-6 (docs/39 §5): a strip written with `animate: true` (the working in Mathematics, stages in order) reveals its
// steps one by one, 300 ms apart, with a button to play it again. No motion under prefers-reduced-motion (and the first
// paint is still): every step is shown at once. `still` forces that (a test, a still picture).
export const STEP_DELAY_MS = 300;

export function StepsView({ b, tone, w, still }: { b: Steps; tone: string; w?: Words; still?: boolean }) {
  const reduced = useReducedMotion();
  const moving = b.animate === true && !(still ?? reduced);
  const [run, setRun] = useState(0);
  return (
    <Card title={b.title} tone={tone} tag="steps">
      <ol key={run} data-steps data-animate={moving ? 'true' : undefined} className="flex flex-col gap-3 md:flex-row md:items-stretch">
        {b.items.map((s, i) => (
          <li
            key={i}
            className={`flex flex-1 gap-3 rounded-2xl bg-off-white p-3 text-slate ring-1 ring-slate/10 md:flex-col ${moving ? 'fam-reveal' : ''}`}
            style={moving ? { animation: `nca-pop 400ms ease-out ${i * STEP_DELAY_MS}ms both` } : undefined}
          >
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
      {moving && w && (
        <button type="button" data-steps-replay onClick={() => setRun((n) => n + 1)} className="fam-press flex min-h-[44px] items-center gap-2 self-start rounded-full bg-royal px-4 text-sm font-bold text-white">
          <span aria-hidden="true">↻</span>
          {w['fam.block.replay']}
        </button>
      )}
    </Card>
  );
}
