import type { ReactNode } from 'react';
import { colors } from '@/lib/design-tokens';

// The visual parts of the parent area's approved design (C506): icons, the progress ring, the 7-day row, a stat chip, the bar chart, a meter, the timeline and the bottom
// bar. They hold no data of their own; every number and word comes in as a prop.

export type IconName = 'home' | 'kids' | 'school' | 'me' | 'link' | 'shield' | 'clock' | 'check' | 'book' | 'chat' | 'star' | 'flask' | 'flame' | 'chevron' | 'plus';

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />,
  kids: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.2c2.6.3 4.5 2.5 4.5 5.8" /></>),
  school: (<><path d="M3 9l9-5 9 5-9 5z" /><path d="M7 11.5V16c0 1.2 2.2 2.5 5 2.5s5-1.3 5-2.5v-4.5" /></>),
  me: (<><circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /></>),
  link: (<><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>),
  shield: (<><path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>),
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  check: (<><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.5" /></>),
  book: (<><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5" /></>),
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" />,
  flask: (<><path d="M9 3h6" /><path d="M10 3v6l-5.5 9.5A1.5 1.5 0 0 0 5.8 21h12.4a1.5 1.5 0 0 0 1.3-2.5L14 9V3" /></>),
  flame: <path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.2 2-4.2.2 1.2.8 2 1.6 2.4C10.2 8 10.6 5.5 12 3z" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
};

export function Icon({ name, size = 22, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {PATHS[name]}
    </svg>
  );
}

/** The ring: `value` of `goal` filled; `centre` big and `sub` small inside; `label` is what a screen reader hears. */
export function ProgressRing({ value, goal, centre, sub, label }: { value: number; goal: number; centre: string; sub: string; label: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const pct = goal > 0 ? Math.min(1, Math.max(0, value / goal)) : 0;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={label} className="shrink-0">
      <circle cx="44" cy="44" r={r} fill="none" stroke={colors.slate} strokeOpacity="0.12" strokeWidth="9" />
      <circle cx="44" cy="44" r={r} fill="none" stroke={colors.emerald} strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform="rotate(-90 44 44)" className="pa-ring" />
      <text x="44" y="46" textAnchor="middle" fontSize="20" fontWeight="700" fill={colors.slate}>{centre}</text>
      <text x="44" y="61" textAnchor="middle" fontSize="10" fontWeight="600" fill={colors.slate}>{sub}</text>
    </svg>
  );
}

/** Seven round marks, oldest first: filled with a tick when the day had activity. */
export function DayRow({ days, label, onText, offText }: { days: { on: boolean; label: string }[]; label: string; onText: string; offText: string }) {
  return (
    <ol aria-label={label} className="flex justify-between">
      {days.map((d, i) => (
        <li key={i} className="flex flex-col items-center gap-1 text-xs font-semibold text-slate">
          <span className={`h-7 w-7 rounded-full ${d.on ? 'bg-emerald' : 'border-2 border-slate/25'}`}>
            <span className="sr-only">{d.on ? onText : offText}</span>
            {d.on && <Icon name="check" size={28} className="rounded-full bg-emerald text-white" />}
          </span>
          {d.label}
        </li>
      ))}
    </ol>
  );
}

const CHIP = {
  mint: { bg: 'bg-lesson-mint', fg: 'text-lesson-mint-deep' },
  lilac: { bg: 'bg-lesson-lilac', fg: 'text-lesson-lilac-deep' },
  sky: { bg: 'bg-lesson-sky', fg: 'text-lesson-sky-deep' },
} as const;
export type ChipTone = keyof typeof CHIP;

/** One number on a tint with its name under it. */
export function StatChip({ value, label, tone }: { value: string | number; label: string; tone: ChipTone }) {
  const c = CHIP[tone];
  return (
    <div className={`flex min-h-[64px] min-w-0 flex-col items-center justify-center rounded-2xl px-1 py-2 text-center ${c.bg}`}>
      <span className={`text-xl font-bold ${c.fg}`}>{value}</span>
      <span className="text-xs font-semibold text-slate">{label}</span>
    </div>
  );
}

/** Seven bars, oldest first, the last (today) full strength; each carries its number and its day's name. */
export function WeekBars({ values, labels, label }: { values: number[]; labels: readonly string[]; label: string }) {
  const max = Math.max(...values, 1);
  const W = 334, H = 120, bw = 28, gap = (W - bw * 7) / 6, top = 18;
  return (
    <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full" role="img" aria-label={label}>
      {values.map((m, i) => {
        const h = Math.max(m === 0 ? 3 : 6, ((H - top) * m) / max);
        const x = i * (bw + gap);
        return (
          <g key={i}>
            <rect x={x} y={H - h} width={bw} height={h} rx="7" fill={colors.emerald} fillOpacity={i === values.length - 1 ? 1 : 0.45} className="pa-bar" style={{ animationDelay: `${i * 50}ms` }} />
            <text x={x + bw / 2} y={H - h - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill={colors.slate}>{m}</text>
            <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize="11" fontWeight="600" fill={colors.slate}>{labels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

export const meterColors = { emerald: colors.emerald, turquoise: colors.turquoise, grape: colors.grape, tangerine: colors.tangerine } as const;
export type MeterColor = keyof typeof meterColors;

/** A labelled meter, 0 to 100. `detail` (optional) is a small line under it. */
export function Meter({ name, pct, color, ariaLabel, detail }: { name: string; pct: number; color: MeterColor; ariaLabel: string; detail?: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-2 text-sm font-semibold text-slate"><span className="min-w-0">{name}</span><span>{pct}%</span></div>
      <div role="meter" aria-label={ariaLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-3 overflow-hidden rounded-full bg-slate/10">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: meterColors[color] }} />
      </div>
      {detail && <p className="mt-0.5 text-xs text-slate">{detail}</p>}
    </div>
  );
}

export type TimelineItem = { icon: IconName; text: string; when: string };

/** The latest few things, newest first, on a thin line. */
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="relative flex flex-col gap-4 before:absolute before:bottom-3 before:left-[21px] before:top-3 before:w-0.5 before:bg-slate/15">
      {items.map((t, i) => (
        <li key={i} className="relative flex items-center gap-3">
          <span className="z-[1] flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lesson-mint text-lesson-mint-deep"><Icon name={t.icon} size={20} /></span>
          <span className="min-w-0">
            <span className="block break-words text-sm font-semibold text-slate">{t.text}</span>
            {t.when && <span className="block text-xs text-slate">{t.when}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

export type BarTab = { id: string; label: string; icon: IconName };

/** The bottom bar: four tabs, 56 px tall, above the phone's home bar (the safe-area padding is `--fam-bottom`). */
export function BottomTabs({ tabs, active, onSelect, label, position = 'fixed' }: { tabs: BarTab[]; active: string; onSelect?: (id: string) => void; label: string; position?: 'fixed' | 'absolute' }) {
  return (
    <nav aria-label={label} data-parent-bar className={`${position} inset-x-0 bottom-0 z-30 border-t border-slate/10 bg-white pb-[var(--fam-bottom,0px)]`}>
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <li key={t.id} className="min-w-0">
              <button type="button" data-parent-tab={t.id} aria-current={on ? 'page' : undefined} onClick={onSelect ? () => onSelect(t.id) : undefined} className={`flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 text-xs font-semibold ${on ? 'text-emerald' : 'text-slate'}`}>
                <span className={`flex h-7 w-12 items-center justify-center rounded-full ${on ? 'bg-emerald/10' : ''}`}>
                  <Icon name={t.icon} size={22} />
                </span>
                {t.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
