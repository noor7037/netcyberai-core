'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { Timeline } from '@/lib/family/blocks';
import type { Words } from '@/lib/family/fill';
import { Card } from './BlockViews';

// A timeline (W9-C, docs/39 §3): 3 to 8 dated events down one vertical line, in the order the model gave them. The
// date is shown as written (a year, a century, "Step 1"), never computed. Plain text only.
// W18-P3: the events appear one by one, 150 ms apart (a short fade and slide, CSS only: .fam-timeline in family.css),
// when the block first scrolls into view; "Show all" completes it at once. The first paint, a browser without
// IntersectionObserver and prefers-reduced-motion all show every event, so nothing is ever hidden without a way to see it.
export const TIMELINE_STEP_MS = 150;
// How long one event's fade takes (family.css), so the reveal is marked done after the last one.
const FADE_MS = 260;

export type TimelinePhase = 'all' | 'wait' | 'run';

// `start`: the phase to begin in (a test seam: the server render and the first client paint begin in 'all').
export function TimelineView({ b, tone, w, start = 'all' }: { b: Timeline; tone: string; w?: Words; start?: TimelinePhase }) {
  const list = useRef<HTMLOListElement>(null);
  const [phase, setPhase] = useState<TimelinePhase>(start);

  useEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still || typeof IntersectionObserver === 'undefined' || !list.current) return;
    setPhase('wait');
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        seen.disconnect();
        setPhase((p) => (p === 'wait' ? 'run' : p));
      }
    });
    seen.observe(list.current);
    return () => seen.disconnect();
  }, []);

  // After the last event has faded in the reveal is over and the control goes away.
  useEffect(() => {
    if (phase !== 'run') return;
    const t = window.setTimeout(() => setPhase('all'), (b.items.length - 1) * TIMELINE_STEP_MS + FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase, b.items.length]);

  return (
    <Card title={b.title} tone={tone} tag="timeline">
      <ol ref={list} data-timeline data-reveal={phase} className="fam-timeline relative ml-2 flex flex-col gap-4 border-l-2 border-ink/30 pl-6">
        {b.items.map((e, i) => (
          <li key={i} style={{ '--i': i } as CSSProperties} className="relative flex flex-col gap-1 text-slate">
            <span aria-hidden="true" data-dot className="absolute -left-[33px] top-1 h-4 w-4 rounded-full border-2 border-white bg-ink" />
            <span data-when className="self-start rounded-lg bg-lesson-sky px-2 py-0.5 text-sm font-bold text-slate">{e.when}</span>
            <span className="text-base leading-relaxed">{e.text}</span>
          </li>
        ))}
      </ol>
      {phase !== 'all' && w && (
        <button type="button" data-timeline-show-all onClick={() => setPhase('all')} className="fam-press flex min-h-[44px] items-center self-start rounded-full bg-saffron px-4 text-sm font-bold text-ink">
          {w['fam.timeline.showAll']}
        </button>
      )}
    </Card>
  );
}
