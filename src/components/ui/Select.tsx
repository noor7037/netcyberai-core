import type { SelectHTMLAttributes } from 'react';

// A native <select> wrapped in the design system's visual tokens, not
// a custom listbox. This is the "smallest option that does the job"
// call from the design-system hardening prompt: a custom dropdown
// needs role=combobox/listbox/option, aria-activedescendant, typeahead
// and correct arrow/Home/End/Escape handling to match what a native
// <select> already gets for free, correctly, on every platform this
// project's Floor Device Standard cares about (including screen
// readers on a budget Android phone). No dependency, zero custom
// keyboard code to get subtly wrong.
type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  id: string;
  error?: string;
  helperText?: string;
};

export function Select({ label, id, error, helperText, required, className = '', children, ...props }: Props) {
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error || helperText);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate">
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="text-red-800">
              {' '}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      <select
        id={id}
        required={required}
        aria-required={required || undefined}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hasMessage ? messageId : undefined}
        className={`min-h-[44px] rounded-md border bg-white px-4 text-base text-slate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire ${
          error ? 'border-red-600' : 'border-slate/20'
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {hasMessage && (
        <p id={messageId} aria-live="polite" className="text-sm">
          {error ? <span className="text-red-800">{error}</span> : <span className="text-slate/70">{helperText}</span>}
        </p>
      )}
    </div>
  );
}
