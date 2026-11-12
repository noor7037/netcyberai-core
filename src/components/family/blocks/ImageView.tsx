'use client';

import { useEffect, useRef, useState } from 'react';
import type { ImageBlock } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';
import { Card } from './BlockViews';

// A real photograph (W9-C, docs/39 §3): a licensed Wikimedia Commons file the server found and checked, with its caption
// and its credit ("Photo: <author> · <licence> · Wikimedia Commons", as words: no link leaves the app). A block the server
// has not filled (no address) is never drawn. The picture loads lazily, sends no referrer, and sits in a fixed box, so
// the page never jumps when it arrives. Nothing here is generated.
// C508: the photo is loaded by the phone straight from Commons' upload host; when it does not load (the host refuses or
// limits it, the network drops it), the whole card goes: the answer never shows a broken frame.
export const photoShown = (b: ImageBlock, broken: boolean): b is Extract<ImageBlock, { url: string }> => 'url' in b && typeof b.url === 'string' && b.url !== '' && !broken;

export function ImageView({ b, w, tone }: { b: ImageBlock; w: Words; tone: string }) {
  const [broken, setBroken] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const url = 'url' in b ? b.url : null;
  useEffect(() => {
    setBroken(false);
    // An error that came before the handler was attached: the picture finished loading with nothing to draw.
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0 && el.currentSrc) setBroken(true);
  }, [url]);
  if (!photoShown(b, broken)) return null;
  return (
    <Card title={w['fam.block.photo']} tone={tone} tag="image">
      <figure data-photo className="flex flex-col gap-2">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-off-white ring-1 ring-slate/10">
          {/* eslint-disable-next-line @next/next/no-img-element -- a plain image in a fixed box (no image optimiser for a third-party file) */}
          <img ref={img} src={b.url} alt={b.caption} onError={() => setBroken(true)} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-contain" />
        </div>
        <figcaption className="flex flex-col gap-1">
          <span className="text-base text-slate">{b.caption}</span>
          {/* Founder (12 Nov 2026): nothing in the app opens a page outside it. The credit is shown as words, not a link. */}
          <span data-photo-credit className="text-sm font-semibold text-slate">
            {fill(w['fam.block.photoCredit'], { author: b.credit, licence: b.licence })}
          </span>
        </figcaption>
      </figure>
    </Card>
  );
}
