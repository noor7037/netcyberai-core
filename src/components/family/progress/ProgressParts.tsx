import { FamIcon, type IconName } from '../FamIcon';

// W19-C: the Progress screen's parts (the founder's reference "Learning Plan": three tinted stat tiles with an icon, an
// "Average progress" gradient bar with its number). Server-rendered, no script. Every number comes from the page.
export type StatTile = { key: 'subjects' | 'checked' | 'mastered'; label: string; value: number };

const LOOK: Record<StatTile['key'], { tint: string; chip: string; icon: IconName }> = {
  subjects: { tint: 'bg-lesson-blush', chip: 'bg-white text-lesson-blush-deep', icon: 'sheet' },
  checked: { tint: 'bg-lesson-lilac', chip: 'bg-white text-lesson-lilac-deep', icon: 'check' },
  mastered: { tint: 'bg-lesson-butter', chip: 'bg-white text-lesson-butter-deep', icon: 'star' },
};

export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <ul data-progress-stats className="grid grid-cols-3 gap-2 sm:gap-3">
      {tiles.map((t, i) => {
        const look = LOOK[t.key];
        return (
          <li key={t.key} data-stat={t.key} className={`fam-activity fam-rise flex min-h-[132px] flex-col justify-between gap-2 rounded-[1.25rem] p-3 sm:p-4 ${look.tint}`} style={{ ['--d' as string]: `${i * 60}ms` } as React.CSSProperties}>
            <span aria-hidden="true" className={`flex h-10 w-10 items-center justify-center rounded-full shadow-sm ${look.chip}`}>
              <FamIcon name={look.icon} className="h-5 w-5" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-bold leading-tight text-ink">{t.label}</span>
              <span className="fam-num text-3xl font-black leading-none text-ink">{t.value}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function AverageBar({ title, value, label, note, none }: { title: string; value: number | null; label: string; note: string; none: string }) {
  return (
    <section data-progress-average aria-labelledby="fam-average" className="fam-card fam-section fam-rise bg-white" style={{ ['--d' as string]: '180ms' } as React.CSSProperties}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="fam-average" className="fam-h2 flex items-center gap-3 text-ink">
          <span aria-hidden="true" className="fam-chip-icon bg-lesson-lilac text-lesson-lilac-deep">
            <FamIcon name="chart" className="h-5 w-5" />
          </span>
          {title}
        </h2>
        {value !== null && <p className="fam-num text-4xl font-black text-ink">{value}%</p>}
      </div>
      {value === null ? (
        <p className="text-base text-ink">{none}</p>
      ) : (
        <>
          <div role="img" aria-label={label} className="fam-gradient-track relative h-5 rounded-full">
            <span className="fam-bar-fill fam-gradient-fill absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(value, 4)}%` }} />
            <span aria-hidden="true" className="absolute top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-lesson-lilac-deep bg-white shadow-md" style={{ left: `${Math.min(Math.max(value, 4), 96)}%` }} />
          </div>
          <p className="fam-note text-ink">{note}</p>
        </>
      )}
    </section>
  );
}
