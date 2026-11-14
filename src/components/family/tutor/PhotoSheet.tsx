'use client';

import { useEffect, useRef } from 'react';
import type { Words } from '@/lib/family/fill';
import { PHOTO_PICK_ACCEPT } from '@/lib/family/photo-shrink';

// The photo sheet (C510): "Check my work" and "Ask about this" in the composer's attach menu open this small sheet with
// two big buttons. Take a photo opens the device camera (`capture="environment"`: the back camera, since a child
// photographs the notebook); Choose from gallery opens the picker. The camera input's accept is exactly "image/*": the
// Android app's file chooser (Capacitor 7) opens the camera only for that value with capture set. What is picked goes to
// the window's attach step unchanged, so the photo gate, the size limit and the type check apply as before.

export const CAMERA_ACCEPT = 'image/*';
// C525: the gallery offers an iPhone's HEIC too; the window's attach step turns it into a JPEG on the phone.
export const GALLERY_ACCEPT = PHOTO_PICK_ACCEPT;

type Props = {
  w: Words;
  id: string;
  title: string;
  lead?: string;
  onPick: (file: File) => void;
  onClose: () => void;
};

const ICON = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const BIG = 'fam-press flex min-h-[56px] w-full items-center gap-3 rounded-2xl px-4 text-left text-base font-bold';

export function PhotoSheet({ w, id, title, lead, onPick, onClose }: Props) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const picked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onPick(f);
  };
  return (
    <div id={id} role="dialog" aria-label={title} data-photo-sheet className="fam-acc-in absolute bottom-full left-0 z-30 mb-3 flex w-[18rem] max-w-[calc(100vw-2rem)] flex-col gap-2 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-slate/10">
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-base font-bold text-ink">{title}</p>
          {lead && <p className="text-xs text-slate">{lead}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label={w['fam.photo.close']} className="fam-press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-off-white">
          <svg aria-hidden="true" className="h-5 w-5" {...ICON} strokeWidth={2.5}>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <input ref={camera} type="file" accept={CAMERA_ACCEPT} capture="environment" className="sr-only" tabIndex={-1} aria-hidden="true" data-photo-camera onChange={picked} />
      <input ref={gallery} type="file" accept={GALLERY_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" data-photo-gallery onChange={picked} />
      <button ref={first} type="button" data-photo-take onClick={() => camera.current?.click()} className={`${BIG} fam-cta bg-saffron text-ink shadow-md`}>
        <svg aria-hidden="true" className="h-6 w-6 shrink-0" {...ICON}>
          <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        {w['fam.photo.take']}
      </button>
      <button type="button" data-photo-choose onClick={() => gallery.current?.click()} className={`${BIG} bg-off-white text-ink ring-1 ring-ink/15`}>
        <svg aria-hidden="true" className="h-6 w-6 shrink-0" {...ICON}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 16l5-5 4 4 3-3 6 6" />
          <circle cx="15.5" cy="8.5" r="1.5" />
        </svg>
        {w['fam.photo.gallery']}
      </button>
    </div>
  );
}
