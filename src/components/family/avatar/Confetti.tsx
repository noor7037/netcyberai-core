'use client';

import { useEffect, useRef, useState } from 'react';
import { lessonColors as C, lessonTints as T } from '@/lib/design-tokens';

// One burst of confetti around the tutor's face (W19-A): 48 pieces in the lesson colours, 1.3 s, then the canvas is
// removed. Nothing under prefers-reduced-motion, or where a canvas cannot draw.
const COLOURS = [C.saffron, C.teal, C.plum, T.sky.accent, T.butter.accent, T.blush.accent];
const N = 48;
const MS = 1300;

export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const el = ref.current;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) ctx = el?.getContext('2d') ?? null;
    } catch {
      ctx = null;
    }
    if (!el || !ctx) return setGone(true);
    const g = ctx;
    const s = (el.width = el.height = Math.round(el.clientWidth * (window.devicePixelRatio || 1)) || 200);
    const bits = Array.from({ length: N }, (_, i) => {
      const a = (i / N) * Math.PI * 2 + Math.random() * 0.4;
      const v = (0.35 + Math.random() * 0.5) * s;
      return { a, v, spin: Math.random() * 6, c: COLOURS[i % COLOURS.length], w: s * (0.012 + Math.random() * 0.014) };
    });
    const t0 = performance.now();
    let raf = 0;
    const draw = (t: number) => {
      const k = Math.min(1, (t - t0) / MS);
      g.clearRect(0, 0, s, s);
      g.globalAlpha = 1 - k * k;
      for (const b of bits) {
        const r = b.v * (1 - (1 - k) ** 3) * 0.6;
        g.save();
        g.translate(s / 2 + Math.cos(b.a) * r, s / 2 + Math.sin(b.a) * r + k * k * s * 0.25);
        g.rotate(b.spin * k * 6);
        g.fillStyle = b.c;
        g.fillRect(-b.w, -b.w / 2, b.w * 2, b.w);
        g.restore();
      }
      if (k < 1) raf = requestAnimationFrame(draw);
      else setGone(true);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return gone ? null : <canvas ref={ref} data-confetti aria-hidden="true" className="pointer-events-none absolute -inset-1/2 h-[calc(2*100%)] w-[calc(2*100%)]" />;
}
