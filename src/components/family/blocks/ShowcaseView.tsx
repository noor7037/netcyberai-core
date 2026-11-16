'use client';

import type { Showcase } from '@/lib/family/blocks';
import type { Words } from '@/lib/family/fill';
import { Card } from './BlockViews';
import { useReducedMotion } from './InteractiveViews';

// Tutor overhaul: the open chapter's own animated diagram. Drawn as an <img> with a data URL: a browser runs no script in
// an image, and the diagram's own CSS animation still plays. Under prefers-reduced-motion the animation is switched off
// by the browser's image rules only when the SVG asks for it, so the picture is drawn once as a still (see `still`).
const STILL = '<style>*{animation:none!important;transition:none!important}</style>';

export function ShowcaseView({ b, w, tone }: { b: Showcase; w: Words; tone: string }) {
  const reduced = useReducedMotion();
  const svg = reduced ? b.svg.replace(/(<svg[^>]*>)/, `$1${STILL}`) : b.svg;
  return (
    <Card title={b.title || w['fam.block.photo']} tone={tone} tag="showcase">
      <figure data-showcase className="flex flex-col gap-2">
        <div className="relative w-full overflow-hidden rounded-2xl bg-white ring-1 ring-slate/10">
          {/* eslint-disable-next-line @next/next/no-img-element -- our own authored SVG as a data URL */}
          <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={b.caption} className="mx-auto block h-auto max-h-[42vh] md:max-h-[60vh] w-full object-contain" />
        </div>
        <figcaption className="text-base text-slate">{b.caption}</figcaption>
      </figure>
    </Card>
  );
}
