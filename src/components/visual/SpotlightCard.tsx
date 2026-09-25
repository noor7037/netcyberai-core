'use client';

import { useRef, type CSSProperties, type HTMLAttributes, type PointerEvent } from 'react';
import { useFinePointer, usePrefersReducedMotion } from '@/lib/hooks';

// Cursor spotlight + a gentle, bounded 3D tilt. Only active for a fine
// hover-capable pointer and when reduced motion is not requested; on
// touch or with reduced motion it is a plain container.
export function SpotlightCard({
  tilt = true,
  spot,
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { tilt?: boolean; spot?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const fine = useFinePointer();
  const reduced = usePrefersReducedMotion();
  const live = fine && !reduced;

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || !live) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${px * 100}%`);
    el.style.setProperty('--my', `${py * 100}%`);
    if (tilt) {
      el.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 5}deg) rotateY(${(px - 0.5) * 6}deg)`;
    }
  }
  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = '';
  }

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`nca-spotlight transition-transform duration-200 ease-out ${className}`}
      style={spot ? ({ ['--spot' as string]: spot } as CSSProperties) : undefined}
      {...rest}
    >
      {children}
    </div>
  );
}
