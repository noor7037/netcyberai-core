'use client';

import { useEffect, useRef } from 'react';

// The home hero's backdrop (founder, C543): the watercolour clouds, a faint dot grid and three soft glows in logo
// colours. With a mouse, the main glow eases toward the pointer while the clouds and the other glows drift the other
// way. The script only writes four CSS variables on one element, in requestAnimationFrame, and stops when the glow
// has settled, when the pointer leaves the hero, or when the tab is hidden. Touch screens and reduced motion get the
// same picture, still (globals.css also pins it under prefers-reduced-motion). Decorative: aria-hidden, no pointer events.

const EASE = 0.07;
const ANCHOR_X = 0.64; // .nca-hero-glow-a's left/top in globals.css
const ANCHOR_Y = 0.22;
const REACH = 0.8; // how far toward the pointer the main glow travels

export function HeroBackdrop() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mouse = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (still.matches || !mouse.matches) return;

    let raf = 0;
    let box = { left: 0, top: 0, width: 1, height: 1 };
    let tx = ANCHOR_X;
    let ty = ANCHOR_Y;
    let x = tx;
    let y = ty;

    const measure = () => {
      const r = el.getBoundingClientRect();
      box = { left: r.left + window.scrollX, top: r.top + window.scrollY, width: r.width || 1, height: r.height || 1 };
    };
    const paint = () => {
      el.style.setProperty('--nca-ax', `${((x - ANCHOR_X) * box.width * REACH).toFixed(1)}px`);
      el.style.setProperty('--nca-ay', `${((y - ANCHOR_Y) * box.height * REACH).toFixed(1)}px`);
      el.style.setProperty('--nca-dx', (x - 0.5).toFixed(4));
      el.style.setProperty('--nca-dy', (y - 0.5).toFixed(4));
    };
    const step = () => {
      x += (tx - x) * EASE;
      y += (ty - y) * EASE;
      paint();
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.0008 ? window.requestAnimationFrame(step) : 0;
    };
    const kick = () => {
      if (!raf && !document.hidden) raf = window.requestAnimationFrame(step);
    };
    const onMove = (e: PointerEvent) => {
      if (still.matches) return;
      const px = (e.pageX - box.left) / box.width;
      const py = (e.pageY - box.top) / box.height;
      if (px < 0 || px > 1 || py < 0 || py > 1) return; // reading further down the page: the backdrop rests
      tx = px;
      ty = py;
      kick();
    };
    const onVisibility = () => {
      if (document.hidden && raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      } else kick();
    };
    const stop = () => {
      window.cancelAnimationFrame(raf);
      raf = 0;
      tx = x = ANCHOR_X;
      ty = y = ANCHOR_Y;
      paint();
    };
    const onPreference = () => {
      if (still.matches) stop();
    };

    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    still.addEventListener('change', onPreference);
    return () => {
      resize.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVisibility);
      still.removeEventListener('change', onPreference);
      window.cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="nca-hero-clouds absolute inset-0" />
      <div className="nca-hero-grid absolute inset-0" />
      <div className="nca-hero-glow nca-hero-glow-a">
        <span />
      </div>
      <div className="nca-hero-glow nca-hero-glow-b">
        <span />
      </div>
      <div className="nca-hero-glow nca-hero-glow-c">
        <span />
      </div>
    </div>
  );
}
