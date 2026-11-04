import Link from 'next/link';
import { BookArt, ClockArt, StarArt } from './art';

// W19-C: "Your activity" on the home (the founder's reference: a tinted tile with a 3D-looking picture, a big number, a
// small label and a round arrow). Every number is one the home already reads: topics checked and mastered
// (`childProgress`, checked answers only) and, with the habit module on, the days this week with the plan done
// (`childHabit`). Each tile opens the Progress screen. Learning first: no streaks, no ranks, no time in the app.
export type ActivityTile = { key: 'checked' | 'mastered' | 'days'; title: string; value: number; label: string };

const LOOK: Record<ActivityTile['key'], { tint: string; panel: string; Art: typeof BookArt }> = {
  checked: { tint: 'bg-lesson-lilac', panel: 'bg-lesson-butter', Art: BookArt },
  days: { tint: 'bg-lesson-butter', panel: 'bg-lesson-lilac', Art: ClockArt },
  mastered: { tint: 'bg-lesson-butter', panel: 'bg-lesson-blush', Art: StarArt },
};

export function ActivityTiles({ title, seeAll, open, tiles, delay = 80 }: { title: string; seeAll: string; open: string; tiles: ActivityTile[]; delay?: number }) {
  if (!tiles.length) return null;
  return (
    <section data-family-activity aria-labelledby="fam-activity" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 id="fam-activity" className="fam-h2 text-ink">
          {title}
        </h2>
        <Link href="/family/progress" className="inline-flex min-h-[44px] items-center px-1 text-sm font-bold text-ink underline-offset-4 hover:underline">
          {seeAll}
        </Link>
      </div>
      <ul className="grid gap-3">
        {tiles.map((t, i) => {
          const look = LOOK[t.key];
          return (
            <li key={t.key} className="fam-rise" style={{ ['--d' as string]: `${delay + i * 60}ms` } as React.CSSProperties}>
              <Link href="/family/progress" data-activity={t.key} className={`fam-press fam-activity relative flex min-h-[132px] items-stretch gap-3 overflow-hidden rounded-[1.5rem] p-2.5 ${look.tint}`}>
                <span aria-hidden="true" className={`flex w-2/5 max-w-[9.5rem] shrink-0 items-center justify-center rounded-[1.15rem] ${look.panel}`}>
                  <look.Art className="h-20 w-20 sm:h-24 sm:w-24" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-between py-1.5 pr-12">
                  <span className="text-lg font-extrabold leading-tight text-ink">{t.title}</span>
                  <span className="flex flex-col">
                    <span className="fam-num text-4xl font-black leading-none text-ink">{t.value}</span>
                    <span className="mt-1 text-sm font-semibold text-ink">{t.label}</span>
                  </span>
                </span>
                <span aria-hidden="true" className="absolute bottom-2.5 right-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-ink text-white shadow-lg">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17L17 7M9 7h8v8" />
                  </svg>
                </span>
                <span className="sr-only">{open}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
