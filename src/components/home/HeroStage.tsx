'use client';

import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';

// Phones get the hero exactly as Chrome's "desktop site" mode shows it
// (founder, 2026-09-28, Decision Log C82): the ecosystem, headline, calls
// to action and guarantee are laid out on a 980px page and scaled down
// whole to the screen width, instead of being rearranged. From 768px up
// this wrapper disappears (display: contents) and the normal responsive
// layout applies. Everything outside the stage, the WhatsApp phone
// included, keeps its real phone size.
//
// Two inline scripts size the stage while the page is still loading: the
// first sets the scale before anything inside is laid out (so the SVG ring
// labels are drawn at the right size from the start), the second sets the
// scaled height. The effect takes over after hydration and on client-side
// navigation, where inline scripts never run.

// Both functions are self-contained (no outside names), because their
// source text is also inlined as the loading-time scripts. 980 is the page
// width Chrome uses for "desktop site"; 767.98px is the edge of Tailwind's
// md breakpoint.
function presetScale(s: HTMLElement) {
  if (window.matchMedia('(max-width: 767.98px)').matches) s.style.setProperty('--nca-stage-s', String(s.clientWidth / 980));
}

function fitStage(s: HTMLElement) {
  const i = s.querySelector(':scope > .nca-hero-stage-inner') as HTMLElement | null;
  if (!i) return;
  if (!window.matchMedia('(max-width: 767.98px)').matches) {
    s.style.removeProperty('--nca-stage-s');
    s.style.removeProperty('--nca-stage-h');
    return;
  }
  const k = String(s.clientWidth / 980);
  s.style.setProperty('--nca-stage-h', i.offsetHeight * Number(k) + 'px');
  if (s.style.getPropertyValue('--nca-stage-s') === k) return;
  s.style.setProperty('--nca-stage-s', k);
  // Chrome keeps SVG text laid out for the old scale (the ring labels on
  // curved paths drift off the circle), so re-lay the drawings out once.
  s.querySelectorAll('svg').forEach(function (v) {
    const had = v.getAttribute('style');
    v.style.display = 'none';
    v.getBoundingClientRect();
    if (had === null) v.removeAttribute('style');
    else v.setAttribute('style', had);
  });
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function HeroStage({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const stage = ref.current;
    const inner = stage?.querySelector(':scope > .nca-hero-stage-inner');
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
    <div ref={ref} className="nca-hero-stage md:contents" suppressHydrationWarning>
      <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `(${presetScale.toString()})(document.currentScript.parentElement)` }} />
      <div className="nca-hero-stage-inner flex flex-col gap-10 md:contents">{children}</div>
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{
          __html: `(${fitStage.toString()})(document.currentScript.parentElement)`,
        }}
      />
    </div>
  );
}
