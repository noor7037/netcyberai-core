'use client';

import type { ImageBlock } from '@/lib/family/blocks';
import { fill, type Words } from '@/lib/family/fill';
import { Card } from './BlockViews';

// A real photograph (W9-C, docs/39 §3): a licensed Wikimedia Commons file the server found and checked, with its caption
// and its credit ("Photo: <author> · <licence> · Wikimedia Commons", linking to the file's page). A block the server
// has not filled (no address) is never drawn. The picture loads lazily, sends no referrer, and sits in a fixed box, so
// the page never jumps when it arrives. Nothing here is generated.
export function ImageView({ b, w, tone }: { b: ImageBlock; w: Words; tone: string }) {
  if (!('url' in b)) return null;
  return (
    <Card title={w['fam.block.photo']} tone={tone} tag="image">
      <figure data-photo className="flex flex-col gap-2">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-off-white ring-1 ring-slate/10">
          {/* eslint-disable-next-line @next/next/no-img-element -- a plain image in a fixed box (no image optimiser for a third-party file) */}
          <img src={b.url} alt={b.caption} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-contain" />
        </div>
        <figcaption className="flex flex-col gap-1">
          <span className="text-base text-slate">{b.caption}</span>
          <a href={b.source} target="_blank" rel="noopener noreferrer" data-photo-credit className="inline-flex min-h-[44px] items-center self-start text-sm font-semibold text-ink underline underline-offset-4">
            {fill(w['fam.block.photoCredit'], { author: b.credit, licence: b.licence })}
          </a>
        </figcaption>
      </figure>
    </Card>
  );
}
