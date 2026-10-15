'use client';

import { useEffect, useState } from 'react';
import { brandInitials } from '@/lib/school/logo-file';

// The school's logo as the top of every screen shows it (C235-B): the picture on a white tile, or, with no logo (or
// one that cannot be fetched now), a tile with the school's initials. Decorative: the school's name is always written
// beside it, so the picture says nothing more to a screen reader.
const SIZE = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
} as const;

export function SchoolLogo({ src, name, size = 'md', className = '' }: { src: string | null; name: string; size?: keyof typeof SIZE; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- the app's own private address, kept by the browser for a day; not an optimisable public image
      <img src={src} alt="" data-school-logo="picture" onError={() => setFailed(true)} className={`${SIZE[size]} shrink-0 rounded-lg bg-white object-contain p-0.5 ring-1 ring-slate/15 ${className}`} />
    );
  }
  return (
    <span aria-hidden="true" data-school-logo="initials" className={`${SIZE[size]} flex shrink-0 items-center justify-center rounded-lg bg-sapphire font-extrabold tracking-wide text-white ${className}`}>
      {brandInitials(name)}
    </span>
  );
}
