'use client';

import { useEffect, useRef, useState } from 'react';
import { OPENVERSE_IMAGE_HOST, type ImageBlock } from '@/lib/family/blocks';
import { PHOTO_HEIGHT, PHOTO_WIDTH, WIDE_MEDIA, photoSizes } from '@/lib/family/visuals/photo-size';
import { fill, type Words } from '@/lib/family/fill';
import { Card } from './BlockViews';
import { useReducedMotion } from './InteractiveViews';

// A real photograph (W9-C, docs/39 §3): a licensed Wikimedia Commons file the server found and checked, with its caption
// and its credit ("Photo: <author> · <licence> · Wikimedia Commons", as words: no link leaves the app). A block the server
// has not filled (no address) is never drawn. The picture loads lazily, sends no referrer, and sits in a fixed box, so
// the page never jumps when it arrives. Nothing here is generated.
// C508: the photo is loaded by the phone straight from Commons' upload host; when it does not load (the host refuses or
// limits it, the network drops it), the whole card goes: the answer never shows a broken frame.
// C526: a low-data photo: the 500 px copy (tens of kilobytes) on a phone, the 960 px one only on a wide screen, with
// its size given and a tint box behind it; a photo from Openverse (the second source) is credited to Openverse.
export const photoShown = (b: ImageBlock, broken: boolean): b is Extract<ImageBlock, { url: string }> => 'url' in b && typeof b.url === 'string' && b.url !== '' && !broken;

export function ImageView({ b, w, tone }: { b: ImageBlock; w: Words; tone: string }) {
  const [broken, setBroken] = useState(false);
  // C526: the wider copy (a wide screen only) failed: the small one is used instead, never a missing photo.
  const [noWide, setNoWide] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const reduced = useReducedMotion();
  const img = useRef<HTMLImageElement>(null);
  const url = 'url' in b ? b.url : null;
  const sizes = url ? photoSizes(url) : null;
  const wide = sizes?.wide && !noWide ? sizes.wide : null;
  useEffect(() => {
    setBroken(false);
    setNoWide(false);
    setLoaded(false);
    // An error that came before the handler was attached: the picture finished loading with nothing to draw.
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0 && el.currentSrc) setBroken(true);
    else if (el && el.complete && el.naturalWidth > 0) setLoaded(true);
  }, [url]);
  if (!photoShown(b, broken) || !sizes) return null;
  const onError = () => {
    if (wide && img.current?.currentSrc === wide) setNoWide(true);
    else setBroken(true);
  };
  // C526: gentle motion: the photo fades in and settles when it arrives; still under prefers-reduced-motion.
  const motion = reduced ? '' : `transition-[opacity,transform] duration-500 ease-out ${loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.03]'}`;
  return (
    <Card title={w['fam.block.photo']} tone={tone} tag="image">
      <figure data-photo className="flex flex-col gap-2">
        {/* A tint box until the photo arrives: no extra request, and the page never jumps (4:3, its size given). */}
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-off-white ring-1 ring-slate/10">
          <picture>
            {wide ? <source media={WIDE_MEDIA} srcSet={wide} /> : null}
            {/* eslint-disable-next-line @next/next/no-img-element -- a plain image in a fixed box (no image optimiser for a third-party file) */}
            <img ref={img} src={sizes.src} width={PHOTO_WIDTH} height={PHOTO_HEIGHT} alt={b.caption} onError={onError} onLoad={() => setLoaded(true)} loading="lazy" decoding="async" referrerPolicy="no-referrer" className={`absolute inset-0 h-full w-full object-contain ${motion}`} />
          </picture>
        </div>
        <figcaption className="flex flex-col gap-1">
          <span className="text-base text-slate">{b.caption}</span>
          {/* Founder (12 Nov 2026): nothing in the app opens a page outside it. The credit is shown as words, not a link. */}
          <span data-photo-credit className="text-sm font-semibold text-slate">
            {fill(w[fromOpenverse(b.url) ? 'fam.block.photoCreditOpenverse' : 'fam.block.photoCredit'], { author: b.credit, licence: b.licence })}
          </span>
        </figcaption>
      </figure>
    </Card>
  );
}

const fromOpenverse = (url: string): boolean => {
  try {
    return new URL(url).hostname === OPENVERSE_IMAGE_HOST;
  } catch {
    return false;
  }
};
