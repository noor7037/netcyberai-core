'use client';

import { colors } from '@/lib/design-tokens';
import { Picture } from '../Picture';

// The one celebration (docs/family-app/09 §3; D1, C292): a topic mastered (right on two days a week apart). Never for
// opening the app or a streak. A short burst from the centre and a trophy; under reduced motion only the message.
const BITS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2;
  const hue = [colors.sunshine, colors.coral, colors.leaf, colors.cyan, colors.grape, colors.tangerine][i % 6];
  return { x: Math.round(Math.cos(a) * 90), y: Math.round(Math.sin(a) * 70), c: hue };
});

export function Celebrate({ title, body }: { title: string; body?: string }) {
  return (
    <div role="status" data-celebrate className="relative flex flex-col items-center gap-2 overflow-hidden rounded-3xl bg-sunshine/25 p-5 text-center ring-1 ring-gold/40">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-12 motion-reduce:hidden">
        {BITS.map((b, i) => (
          <span key={i} className="absolute h-3 w-3 rounded-full animate-burst" style={{ background: b.c, ['--bx' as string]: `${b.x}px`, ['--by' as string]: `${b.y}px`, animationDelay: `${(i % 4) * 40}ms` }} />
        ))}
      </div>
      <Picture e="🏆" size={56} className="animate-pop-in motion-reduce:animate-none" />
      <p className="text-lg font-extrabold text-slate">{title}</p>
      {body && <p className="text-sm text-slate/80">{body}</p>}
    </div>
  );
}
