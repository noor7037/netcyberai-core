import { pictureSrc } from '@/lib/family/pictures';

// One picture from the bundled set (D1, C290), in place of the phone's own emoji. Decorative unless `label` is given
// (then it is named for screen readers). Sized in pixels or any CSS length; inline with text at 1.25em by default.
export function Picture({ e, size = '1.25em', label, className = '' }: { e: string; size?: number | string; label?: string; className?: string }) {
  const s = typeof size === 'number' ? `${size}px` : size;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a small bundled SVG at a fixed size; nothing to optimise
    <img
      src={pictureSrc(e)}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`inline-block shrink-0 select-none align-[-0.25em] ${className}`}
      style={{ width: s, height: s }}
    />
  );
}
