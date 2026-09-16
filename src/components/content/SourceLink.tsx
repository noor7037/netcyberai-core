import type { AnchorHTMLAttributes } from 'react';

/**
 * Citation/footnote link. Text stays small (text-xs, inherited from the
 * caller) — the fix here is the tap target, not the type size: inline-flex
 * plus a min height grows the clickable box to the 44px floor
 * (docs/07_DESIGN_SYSTEM.md) without touching font-size.
 */
export function SourceLink({
  className = '',
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-[44px] items-center underline ${className}`}
      {...props}
    >
      {children}
    </a>
  );
}
