'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useInView, usePrefersReducedMotion } from '@/lib/hooks';
import { Icon } from './Icons';

export interface Slide {
  id: string;
  label: string;
  content: ReactNode;
}

// Accessible carousel (WAI-ARIA APG carousel pattern): autoplays only
// while on screen, pauses on hover and on keyboard focus, has an
// explicit play/pause control (WCAG 2.2.2), labelled slide pickers,
// arrow keys, swipe on touch, and never autoplays under reduced motion.
// Only the active slide is rendered, so off-screen slides can never
// receive focus.
export function Carousel({ slides, label, interval = 6500, onDark = false }: { slides: Slide[]; label: string; interval?: number; onDark?: boolean }) {
  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = usePrefersReducedMotion();
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.35, once: false });
  const startX = useRef<number | null>(null);

  const n = slides.length;
  const go = useCallback((i: number) => setIndex(((i % n) + n) % n), [n]);
  const playing = !userPaused && !reduced && inView && !hovered && !focused;

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => go(index + 1), interval);
    return () => window.clearTimeout(t);
  }, [playing, index, interval, go]);

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index - 1);
    }
  }
  function onDown(e: PointerEvent<HTMLDivElement>) {
    startX.current = e.clientX;
  }
  function onUp(e: PointerEvent<HTMLDivElement>) {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > 45) go(index + (dx < 0 ? 1 : -1));
  }

  const slide = slides[index];

  return (
    <div
      ref={ref}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onKeyDown={onKey}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setUserPaused((p) => !p)}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-slate/15 bg-white px-3 text-xs font-semibold text-slate hover:bg-off-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
          aria-label={userPaused || reduced ? 'Start automatic slide show' : 'Pause automatic slide show'}
        >
          <Icon name={userPaused || reduced ? 'play' : 'pause'} className="h-3.5 w-3.5" />
          {userPaused || reduced ? 'Play' : 'Pause'}
        </button>
        <div className="flex flex-1 flex-wrap gap-1.5" role="group" aria-label="Choose a slide">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => go(i)}
              aria-label={`Slide ${i + 1} of ${n}: ${s.label}`}
              aria-current={i === index ? 'true' : undefined}
              className="group relative h-10 min-w-[2.5rem] flex-1 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
            >
              <span className={`absolute inset-x-0 top-1/2 block h-1.5 -translate-y-1/2 overflow-hidden rounded-full ${onDark ? 'bg-white/25' : 'bg-slate/15'}`}>
                {i < index && <span className={`block h-full w-full ${onDark ? 'bg-cyan' : 'bg-royal'}`} />}
                {i === index && (
                  <span
                    key={`${index}-${playing}`}
                    className={`nca-progress block h-full w-full ${onDark ? 'bg-cyan' : 'bg-royal'}`}
                    style={{
                      animationDuration: `${interval}ms`,
                      animationPlayState: playing ? 'running' : 'paused',
                    }}
                  />
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous slide"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate/15 bg-white text-slate hover:bg-off-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
          >
            <Icon name="chevronLeft" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next slide"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate/15 bg-white text-slate hover:bg-off-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal"
          >
            <Icon name="chevronRight" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div
        onPointerDown={onDown}
        onPointerUp={onUp}
        className="touch-pan-y select-none"
        aria-live={playing ? 'off' : 'polite'}
      >
        <div key={slide.id} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${n}: ${slide.label}`} className="nca-pop">
          {slide.content}
        </div>
      </div>
    </div>
  );
}
