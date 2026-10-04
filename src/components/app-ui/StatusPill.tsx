import type { ReactNode } from 'react';
import { STATUS_TONES, TOKEN_TONES, type StatusTone } from './tones';

// A short status label in its meaning's colour. The text says the status;
// the colour only repeats it.
export function StatusPill({ tone = 'neutral', children }: { tone?: StatusTone; children: ReactNode }) {
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${TOKEN_TONES[STATUS_TONES[tone]].soft}`}>
      {children}
    </span>
  );
}
