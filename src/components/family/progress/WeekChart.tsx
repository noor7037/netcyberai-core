'use client';

import { useState } from 'react';
import { seriesColor } from '@/lib/design-tokens';

// W19-C: the week's checked answers as seven bars (the founder's reference: rounded bars, the chosen day tinted and
// its value in a bubble above it). Tap a day to see its number; today is chosen at first. The bars' colour is the chart
// series' purple (src/lib/design-tokens.ts chartSeries), the other days the same colour faint. The total and every
// day's number are also in the words for screen readers, so the bars are never the only sign.
export type WeekChartBar = { day: string; n: number; share: number; today: boolean; short: string; value: string };

const BAR = seriesColor(3);

export function WeekChart({ bars, label }: { bars: WeekChartBar[]; label: string }) {
  const [chosen, setChosen] = useState(() => Math.max(0, bars.findIndex((b) => b.today)));
  return (
    <div data-week-chart className="flex flex-col gap-2">
      <p aria-live="polite" className="sr-only">
        {bars[chosen]?.value}
      </p>
      <ol aria-label={label} className="grid h-48 grid-cols-7 items-end gap-0 border-b border-dashed border-ink/15">
        {bars.map((b, i) => {
          const on = i === chosen;
          return (
            <li key={b.day} className="relative flex h-full flex-col items-center justify-end">
              {on && (
                <span data-week-bubble className="fam-pop absolute z-10 -translate-y-2 whitespace-nowrap rounded-full bg-ink px-2.5 py-1 text-xs font-bold text-white shadow-md" style={{ bottom: `calc(${Math.max(8, b.share * 100) * 0.82}% + 0.25rem)` }}>
                  <span className="fam-num">{b.n}</span>
                  <span aria-hidden="true" className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-ink" />
                </span>
              )}
              <button
                type="button"
                aria-pressed={on}
                aria-label={b.value}
                onClick={() => setChosen(i)}
                className="flex h-full min-h-[44px] w-full min-w-[40px] items-end justify-center px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <span
                  data-on={on ? 'true' : 'false'}
                  className="fam-week-bar block w-full max-w-[2.75rem] rounded-full"
                  style={{ height: `${Math.max(8, b.share * 100) * 0.82}%`, backgroundColor: BAR, opacity: on ? 1 : 0.28, ['--d' as string]: `${i * 50}ms` } as React.CSSProperties}
                />
              </button>
            </li>
          );
        })}
      </ol>
      <ol aria-hidden="true" className="grid grid-cols-7 text-center text-xs font-semibold text-ink">
        {bars.map((b, i) => (
          <li key={b.day} className={i === chosen ? 'font-extrabold' : ''}>
            {b.short}
          </li>
        ))}
      </ol>
    </div>
  );
}
