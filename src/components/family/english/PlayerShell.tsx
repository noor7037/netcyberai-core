import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Track } from '@/lib/family/english/course';
import { TRACK_THEME } from './theme';

// The frame of an English lesson or check (W6-B, docs/38 §5): the same band as every other screen, in the track's own
// colours (theme.ts), holding the close button, the progress bar, the Hindi switch, the kind and the title; the cards
// come up under it. Visual only: the lesson, its steps and its scoring are untouched. Before the lesson has loaded
// there is no track yet, so the band is the app's navy. Every colour pair is a Tailwind class the contrast checker reads.
export function PlayerShell({ track, close, closeLabel, title, kind, progress, aside, children }: { track?: Track; close: string; closeLabel: string; title?: string; kind?: string; progress?: { now: number; max: number; label: string }; aside?: ReactNode; children: ReactNode }) {
  const band = track ? TRACK_THEME[track].header : 'bg-paper text-ink';
  const sunny = track === 'a';
  return (
    <>
      <header className={`fam-band rounded-b-[2rem] px-4 pb-12 pt-4 ${band}`}>
        <span aria-hidden="true" className="fam-band-dots" />
        <div className="mx-auto flex w-full max-w-xl flex-col gap-3">
          <div className="flex items-center gap-3">
            <Link href={close} aria-label={closeLabel} className="fam-press flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-white text-slate shadow-md">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </Link>
            {progress && (
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink/30" role="progressbar" aria-valuemin={0} aria-valuemax={progress.max} aria-valuenow={progress.now} aria-label={progress.label}>
                <div className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${sunny ? 'bg-slate' : 'bg-white'}`} style={{ width: `${(progress.now / progress.max) * 100}%` }} />
              </div>
            )}
            {!progress && <span className="flex-1" />}
            {aside}
          </div>
          {(kind || title) && (
            <div className="fam-rise flex flex-col items-start gap-2">
              {kind && <span className="fam-pill bg-white font-extrabold uppercase tracking-wide text-slate">{kind}</span>}
              {title && <h1 className="text-2xl font-extrabold leading-tight tracking-tight">{title}</h1>}
            </div>
          )}
        </div>
      </header>
      <main className="fam-page">{children}</main>
    </>
  );
}
