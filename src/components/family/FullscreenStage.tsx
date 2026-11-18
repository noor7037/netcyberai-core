'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Words } from '@/lib/family/fill';

// A 16:9 stage that goes truly full screen on a tap (founder, 18 Nov 2026: videos and simulations). It asks the browser for
// real fullscreen on its own wrapper (not only the frame's tiny corner button) and, on a phone, for landscape
// (screen.orientation.lock). Where the browser refuses landscape, a short "turn your phone" line shows. Where there is no
// Fullscreen API (an iPhone's Safari), the stage fills the screen itself. One clear Close puts it back and unlocks the
// orientation. Nothing is loaded here: the caller decides what the children are.
type Lockable = { lock?: (o: string) => Promise<void>; unlock?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDoc = Document & { webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenElement?: Element | null };

const orientation = (): Lockable | undefined => (typeof screen !== 'undefined' ? (screen.orientation as unknown as Lockable | undefined) : undefined);
const fsElement = () => (document as FsDoc).fullscreenElement ?? (document as FsDoc).webkitFullscreenElement ?? null;

export type StageApi = { enter: () => Promise<void>; full: boolean };

export function FullscreenStage({ w, children, label }: { w: Words; children: ReactNode | ((api: StageApi) => ReactNode); label: string }) {
  const stage = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [turn, setTurn] = useState(false);
  const real = useRef(false);

  const leave = useCallback(() => {
    setFull(false);
    setTurn(false);
    try {
      orientation()?.unlock?.();
    } catch {
      /* not locked */
    }
    const d = document as FsDoc;
    if (real.current && fsElement()) void Promise.resolve(d.exitFullscreen?.() ?? d.webkitExitFullscreen?.()).catch(() => undefined);
    real.current = false;
  }, []);

  const enter = async () => {
    const el = stage.current as FsEl | null;
    if (!el) return;
    setFull(true);
    try {
      const ask = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
      if (ask) {
        await ask();
        real.current = true;
      }
    } catch {
      real.current = false;
    }
    // Landscape where the browser allows it; else the hint (only worth showing while the phone is upright).
    const o = orientation();
    if (o?.lock) o.lock('landscape').catch(() => setTurn(true));
    else setTurn(true);
  };

  // The browser's own exit (the Back gesture, Esc) ends it here too.
  useEffect(() => {
    const onChange = () => {
      if (real.current && !fsElement()) leave();
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [leave]);
  useEffect(() => {
    if (!full) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && leave();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [full, leave]);
  useEffect(
    () => () => {
      try {
        orientation()?.unlock?.();
      } catch {
        /* not locked */
      }
    },
    [],
  );

  return (
    <div
      ref={stage}
      data-fullscreen-stage={full ? 'on' : 'off'}
      className={full ? 'fixed inset-0 z-[80] flex items-center justify-center bg-black' : 'relative'}
    >
      <div className={`relative aspect-video overflow-hidden bg-slate ${full ? '' : 'sm:rounded-2xl'}`} style={full ? { width: 'min(100vw, 177.78vh)' } : { width: '100%' }}>
        {typeof children === 'function' ? children({ enter, full }) : children}
        {full ? (
          <button type="button" data-fullscreen-exit onClick={leave} className="fam-press absolute right-2 top-2 z-10 flex min-h-[44px] items-center gap-2 rounded-full bg-ink px-4 text-sm font-bold text-white shadow-lg ring-1 ring-white/30">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            {w['fam.media.exit']}
          </button>
        ) : (
          <button type="button" data-fullscreen-enter onClick={() => void enter()} aria-label={`${w['fam.media.fullscreen']}: ${label}`} className="fam-press absolute bottom-2 right-2 z-10 flex min-h-[44px] items-center gap-2 rounded-full bg-ink/85 px-4 text-sm font-bold text-white shadow-lg">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
            </svg>
            {w['fam.media.fullscreen']}
          </button>
        )}
        {full && turn && (
          <p role="status" data-fullscreen-turn className="portrait:block landscape:hidden absolute inset-x-2 bottom-2 z-10 hidden rounded-xl bg-white px-3 py-2 text-center text-sm font-bold text-ink">
            {w['fam.media.turnPhone']}
          </p>
        )}
      </div>
    </div>
  );
}
