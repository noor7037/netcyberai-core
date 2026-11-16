'use client';

import { useEffect, useState } from 'react';
import type { ElabPic } from '@/lib/family/elaboration';
import { useReducedMotion } from './motion';
import { showcaseSrc } from './ShowcaseView';

// One of our own small SVG animations (public/anim, v21), drawn as an <img> so no script in it can run. Under reduced
// motion the same file is drawn as a still: its text is fetched and every animation switched off (showcaseSrc).
export function AnimPic({ pic, className }: { pic: ElabPic; className?: string }) {
  const reduced = useReducedMotion();
  const [still, setStill] = useState<string | null>(null);
  useEffect(() => {
    if (!reduced || !pic.url) return;
    let gone = false;
    void fetch(pic.url).then((r) => (r.ok ? r.text() : '')).then((t) => !gone && t.startsWith('<svg') && setStill(showcaseSrc(t, true))).catch(() => {});
    return () => {
      gone = true;
    };
  }, [reduced, pic.url]);
  if (!pic.url || (reduced && !still)) return <div data-elab-img="animation" role="img" aria-label={pic.caption} className={`aspect-[4/3] w-full ${className ?? ''}`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- our own SVG animation, a fixed same-site file
    <img data-elab-img="animation" src={reduced ? still! : pic.url} alt={pic.caption} loading="lazy" decoding="async" className={className ?? 'mx-auto block h-auto max-h-[34vh] w-full object-contain'} />
  );
}
