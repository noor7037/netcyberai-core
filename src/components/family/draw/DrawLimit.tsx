'use client';

import type { Words } from '@/lib/family/fill';

// The day's new drawings are used up (C513): a kind full-screen card, never a scolding. The drawings already made still
// open (the first button), so the child can finish one.
export function DrawLimit({ w, onOpenMine, onClose }: { w: Words; onOpenMine: () => void; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="draw-limit-title" data-draw-limit className="draw-table fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="draw-tray-in draw-sheet flex w-full max-w-sm flex-col items-center gap-4 rounded-[1.75rem] bg-art-butter p-6 text-center text-ink">
        <svg aria-hidden="true" viewBox="0 0 64 64" className="h-20 w-20">
          <circle cx="32" cy="32" r="26" fill="#FFFCF6" stroke="#1C1B1A" strokeWidth="2.5" />
          <circle cx="22" cy="24" r="5" fill="#FFB4A2" />
          <circle cx="36" cy="18" r="5" fill="#A9D6F5" />
          <circle cx="46" cy="30" r="5" fill="#B8E6CF" />
          <circle cx="40" cy="44" r="5" fill="#D9CCF6" />
          <path d="M16 46c6-2 10 2 14-2" fill="none" stroke="#1C1B1A" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <h2 id="draw-limit-title" className="text-2xl font-extrabold leading-tight text-ink">
          {w['fam.draw.limitTitle']}
        </h2>
        <p className="text-base text-ink">{w['fam.draw.limitBody']}</p>
        <div className="flex w-full flex-col gap-2">
          <button type="button" data-draw-limit-open onClick={onOpenMine} className="fam-press flex min-h-[48px] items-center justify-center rounded-2xl bg-ink px-4 text-base font-bold text-white">
            {w['fam.draw.limitOpen']}
          </button>
          <button type="button" data-draw-limit-close onClick={onClose} className="fam-press flex min-h-[48px] items-center justify-center rounded-2xl bg-white px-4 text-base font-bold text-ink ring-1 ring-ink/15">
            {w['fam.draw.limitClose']}
          </button>
        </div>
      </div>
    </div>
  );
}
