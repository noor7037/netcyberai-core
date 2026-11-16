'use client';

// Two small helpers many answer blocks share, kept out of InteractiveViews.tsx so a block that only needs them does not
// pull the whole interactive set (number lines, graphs, simulations) into the first load: that file loads on demand.
import { useEffect, useState } from 'react';
import { subjectTheme } from '@/lib/family/subject-theme';

// The subject's accent as a hex (AA on white), for a line or a filled part on a white card.
export const toneColor = (tone: string): string => subjectTheme(tone).hex;

export function useReducedMotion(): boolean {
  // Still until the browser says otherwise: the first paint never moves.
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}
