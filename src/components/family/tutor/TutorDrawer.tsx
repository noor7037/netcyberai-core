'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef } from 'react';
import type { Words } from '@/lib/family/fill';
import type { Subject } from '@/lib/family/subjects';
import type { TutorReaderContext } from './TutorWindow';

// The chapter reader's doubt drawer (S2, C375): the same tutor window as Study, opened over the chapter with its
// subject, chapter and the block the child was on (board and class are the child's own, read on the server). The window
// loads only when the drawer first opens (09 §4: the reader's first-load budget). Escape or Close shuts it and gives
// the focus back to the button that opened it; nothing moves under prefers-reduced-motion.

const TutorWindow = dynamic(() => import('./TutorWindow').then((m) => m.TutorWindow), { ssr: false });

type Props = {
  open: boolean;
  onClose: () => void;
  w: Words;
  subject: Subject;
  tone: string;
  reader: TutorReaderContext;
  voice?: { secondsLeft: number } | null;
  files?: boolean;
  homework?: boolean;
};

export function TutorDrawer({ open, onClose, w, subject, tone, reader, voice = null, files = false, homework = false }: Props) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Keep Tab inside the drawer while it is open.
      if (e.key === 'Tab' && panel.current) {
        const focusable = panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), textarea, input:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])');
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" data-tutor-drawer>
      <button type="button" tabIndex={-1} aria-hidden="true" className="absolute inset-0 h-full w-full cursor-default bg-slate/60" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fam-tutor-drawer-title"
        className="relative flex max-h-[92vh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-t-[2rem] bg-off-white p-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] shadow-xl sm:rounded-[2rem] sm:p-5"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 id="fam-tutor-drawer-title" className="text-lg font-extrabold text-slate">
            {w['fam.tutor.doubt']}
          </h2>
          <button ref={closeButton} type="button" onClick={onClose} data-tutor-close className="flex min-h-[44px] items-center gap-1 rounded-full bg-white px-4 text-sm font-bold text-slate ring-1 ring-slate/15 hover:bg-off-white">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
            {w['fam.tutor.close']}
          </button>
        </div>
        <TutorWindow w={w} subject={subject} tone={tone} voice={voice} files={files} homework={homework} reader={reader} idPrefix="fam-doubt" />
      </div>
    </div>
  );
}
