import type { CSSProperties } from 'react';

// The M2 screens' small line icons (F2 on D1, C230-Q): drawn here, so they look the same on every phone, where a
// device emoji (📷, ★, ▶) looks different on Samsung, Xiaomi and older Android. Decorative: the words beside each one
// carry the meaning. A subject's own mark is SubjectGlyph (D1), not one of these.
const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  star: 'M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z',
  play: 'M8 5.2v13.6L19.2 12z',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5h.01',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z',
  question: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .9-1 1.6v.4M12 17h.01',
  steps: 'M10 6h10M10 12h10M10 18h10M4 6h2M4 12h2M4 18h2',
  printer: 'M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z',
  lock: 'M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  shield: 'M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z',
  sheet: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h6M9 16h6',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  sparkle: 'M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4zM19 15l.8 2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z',
  video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3',
  back: 'M15 18l-6-6 6-6',
  next: 'M9 6l6 6-6 6',
  again: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 19h14',
  upload: 'M7 18a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 10.5 3.8 3.8 0 0 1 17.5 18M12 20v-8M9 15l3-3 3 3',
  offline: 'M3 3l18 18M8.5 16.5a5 5 0 0 1 6.2-.8M5 12.6a10 10 0 0 1 4-2.3M19 12.6a10 10 0 0 0-2.6-1.8M2 8.8a15 15 0 0 1 4.3-2.8M22 8.8a15 15 0 0 0-11.6-3.7M12 20h.01',
  saver: 'M4 20v-3M9 20v-7M14 20V9M19 20V4',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
  inbox: 'M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h4l1 2h6l1-2h4',
  chart: 'M4 20h16M7 20v-6M12 20V8M17 20v-9',
} as const;

export type IconName = keyof typeof PATHS;
const FILLED: readonly IconName[] = ['star', 'play'];

export function FamIcon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const filled = FILLED.includes(name);
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" className={className} fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}

// D1's entrance (family.css `.fam-rise`) after `ms`: cards come in one after another, and stand still under reduced
// motion.
export const rise = (ms: number): CSSProperties => ({ ['--d' as string]: `${ms}ms` }) as CSSProperties;
