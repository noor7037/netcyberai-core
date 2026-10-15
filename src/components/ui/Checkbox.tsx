import type { InputHTMLAttributes, ReactNode } from 'react';

// v5 (C235-C): a drawn checkbox over the REAL native one. The native
// <input type="checkbox"> is the box itself, restyled with
// `appearance: none` (rounded, a brand fill when checked, the focus ring),
// so its semantics, keyboard and form behaviour are untouched: no ARIA, no
// key handling of our own. The tick is drawn over it, decorative. The
// unchecked border is slate/60 (#787F89, 4.0:1 on white; WCAG 1.4.11 asks
// 3:1). The 44px tap-target floor comes from the wrapping <label>
// (clicking anywhere on a label activates its checkbox), not from
// inflating the box itself. `description` is a quieter line under the
// label, part of the same label.
type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  id: string;
  description?: ReactNode;
};

export function Checkbox({ label, id, description, className = '', ...props }: Props) {
  return (
    <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2.5 text-base text-slate">
      <span className="relative mt-0.5 inline-flex h-5 w-5 shrink-0">
        <input
          id={id}
          type="checkbox"
          className={`peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-slate/60 bg-white transition-colors checked:border-sapphire checked:bg-sapphire focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none ${className}`}
          {...props}
        />
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="pointer-events-none absolute inset-0 h-5 w-5 scale-50 stroke-white opacity-0 transition peer-checked:scale-100 peer-checked:opacity-100 motion-reduce:transition-none">
          <path d="M5.5 10.5l3 3 6-6.5" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="min-w-0 leading-6">
        {label}
        {description && <span className="block text-sm leading-snug text-slate/70">{description}</span>}
      </span>
    </label>
  );
}
