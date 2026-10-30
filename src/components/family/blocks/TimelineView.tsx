'use client';

import type { Timeline } from '@/lib/family/blocks';
import { Card } from './BlockViews';

// A timeline (W9-C, docs/39 §3): 3 to 8 dated events down one vertical line, in the order the model gave them. The
// date is shown as written (a year, a century, "Step 1"), never computed. Plain text only; no motion of its own.
export function TimelineView({ b, tone }: { b: Timeline; tone: string }) {
  return (
    <Card title={b.title} tone={tone} tag="timeline">
      <ol data-timeline className="relative ml-2 flex flex-col gap-4 border-l-2 border-royal/40 pl-6">
        {b.items.map((e, i) => (
          <li key={i} className="relative flex flex-col gap-1 text-slate">
            <span aria-hidden="true" data-dot className="absolute -left-[33px] top-1 h-4 w-4 rounded-full border-2 border-white bg-royal" />
            <span data-when className="self-start rounded-lg bg-royal/10 px-2 py-0.5 text-sm font-bold text-slate">{e.when}</span>
            <span className="text-base leading-relaxed">{e.text}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}
