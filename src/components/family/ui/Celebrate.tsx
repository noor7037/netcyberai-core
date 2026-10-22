'use client';

import { Burst } from '../english/LessonPlayer';
import { Picture } from '../Picture';

// The one celebration (docs/family-app/09 §3; D1, C292): a topic mastered (right on two days a week apart). Never for
// opening the app or a streak. The English course's burst and a trophy; under reduced motion only the message.
export function Celebrate({ title, body }: { title: string; body?: string }) {
  return (
    <div role="status" data-celebrate className="relative flex flex-col items-center gap-2 overflow-hidden rounded-3xl bg-sunshine/25 p-5 text-center ring-1 ring-gold/40">
      <Burst />
      <Picture e="🏆" size={56} className="animate-pop-in motion-reduce:animate-none" />
      <p className="text-lg font-extrabold text-slate">{title}</p>
      {body && <p className="text-sm text-slate/80">{body}</p>}
    </div>
  );
}
