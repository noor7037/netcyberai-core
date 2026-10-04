'use client';

import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '@/lib/hooks';

// Count-up numbers (17 §4: purposeful motion, 150–300 ms, off under
// prefers-reduced-motion). Returns the target at once when motion is
// reduced, when there is no number, or on the server.
export function useCountUp(target: number | null, durationMs = 300): number | null {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState<number | null>(target);
  const from = useRef<number>(0);

  useEffect(() => {
    if (target === null || reduced) {
      setShown(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(origin + (target - origin) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
      else from.current = target;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced, durationMs]);

  return shown;
}
