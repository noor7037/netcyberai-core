'use client';

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';

// Shows a block on phones exactly as Chrome's "desktop site" mode does
// (founder, 2026-09-28, Decision Log C82, C83): below 768px the children
// are laid out at a fixed desktop width and scaled down whole to the
// available width, instead of being rearranged. From 768px up the stage
// does nothing and the normal responsive layout applies. Used for the
// homepage hero (980px, the width Chrome uses for "desktop site") and the
// principal dashboard (its full 68rem frame).
//
// Two inline scripts size the stage while the page is still loading: the
// first sets the scale before anything inside is laid out (so SVG text is
// drawn at the right size from the start), the second sets the scaled
// height. The effect takes over after hydration and on client-side
// navigation, where inline scripts never run.

// Both functions are self-contained (no outside names), because their
// source text is also inlined as the loading-time scripts. 767.98px is the
// edge of Tailwind's md breakpoint.
function presetScale(s: HTMLElement) {
  if (window.matchMedia('(max-width: 767.98px)').matches) s.style.setProperty('--nca-stage-s', String(s.clientWidth / Number(s.getAttribute('data-w'))));
}

function fitStage(s: HTMLElement) {
  const i = s.querySelector(':scope > .nca-stage-inner') as HTMLElement | null;
  if (!i) return;
  if (!window.matchMedia('(max-width: 767.98px)').matches) {
    s.style.removeProperty('--nca-stage-s');
    s.style.removeProperty('--nca-stage-h');
    return;
  }
  const k = String(s.clientWidth / Number(s.getAttribute('data-w')));
  s.style.setProperty('--nca-stage-h', i.offsetHeight * Number(k) + 'px');
  if (s.style.getPropertyValue('--nca-stage-s') === k) return;
  s.style.setProperty('--nca-stage-s', k);
  // Chrome keeps SVG text laid out for the old scale (labels on curved
  // paths drift out of place), so re-lay the drawings out once.
  s.querySelectorAll('svg').forEach(function (v) {
    const had = v.getAttribute('style');
    v.style.display = 'none';
    v.getBoundingClientRect();
    if (had === null) v.removeAttribute('style');
    else v.setAttribute('style', had);
  });
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function ScaledStage({
  width,
  className = '',
  innerClassName = '',
  children,
}: {
  width: number;
  className?: string;
  innerClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const stage = ref.current;
    const inner = stage?.querySelector(':scope > .nca-stage-inner');
    if (!stage || !inner) return;
    const run = () => fitStage(stage);
    run();
    const ro = new ResizeObserver(run);
    ro.observe(inner);
    window.addEventListener('resize', run);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', run);
    };
  }, []);

  return (
    <div ref={ref} data-w={width} className={`nca-stage ${className}`} suppressHydrationWarning>
      <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `(${presetScale.toString()})(document.currentScript.parentElement)` }} />
      <div className={`nca-stage-inner ${innerClassName}`} style={{ '--nca-stage-w': `${width}px` } as CSSProperties}>
        {children}
      </div>
      <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `(${fitStage.toString()})(document.currentScript.parentElement)` }} />
    </div>
  );
}
