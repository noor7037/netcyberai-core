import type { HTMLAttributes } from 'react';

type Variant = 'neutral' | 'success' | 'warning' | 'danger';

type Props = HTMLAttributes<HTMLSpanElement> & {
  variant?: Variant;
};

// Variant classes are written inline in the className template below,
// not in a separate lookup object -- deliberately, so
// scripts/check_contrast.py (which reads literal className text, not
// evaluated JS) can actually see and verify every pairing here. A
// variantClasses-style object elsewhere in the file would hide these
// from it the same way it hides Button's.
export function Badge({ variant = 'neutral', className = '', children, ...props }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium ${
        variant === 'success'
          ? 'bg-emerald/10 text-emerald-text'
          : variant === 'warning'
            ? 'bg-amber/10 text-amber-text'
            : variant === 'danger'
              ? 'bg-red-600/10 text-red-800'
              : 'bg-slate/10 text-slate'
      } ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
