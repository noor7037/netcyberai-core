import type { InputHTMLAttributes } from 'react';

// [GAP] per docs/07_DESIGN_SYSTEM.md: `Input` is listed as Phase 1,
// specified but not built (08_EXECUTION_BIBLE.md Prompt C), alongside
// Select/Checkbox/Table/Modal/Toast/Badge/Tabs/EmptyState/LoadingState/
// ErrorState and inline validation. This is deliberately the minimal
// subset the B2 login form actually needs -- a labeled text input
// meeting the same tap-target floor Button already meets -- not that
// fuller primitive. No inline validation or saved-state affordance is
// built here; that's still Prompt C's job.
type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  id: string;
};

export function Input({ label, id, className = '', ...props }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate">
        {label}
      </label>
      <input
        id={id}
        className={`min-h-[44px] rounded-md border border-slate/20 bg-white px-4 text-base text-slate placeholder:text-slate/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire ${className}`}
        {...props}
      />
    </div>
  );
}
