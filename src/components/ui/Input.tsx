import type { InputHTMLAttributes } from 'react';

// Full Phase 1 spec per docs/07_DESIGN_SYSTEM.md: validation states
// (error/success/pending), helper text, required-field marking, all
// wired to real WCAG-safe colors -- checked with scripts/check_contrast.py,
// not chosen by eye. Error text uses red-800 (8.31:1), not red-600
// (4.83:1): still AA either way, but this project's own Floor Device
// Standard asks for AAA on critical states, and a validation error is
// exactly that. Success text/border reuses the emerald-text token
// (#047857) rather than the raw emerald brand color -- raw emerald is
// 2.54:1 on white, which fails even the 3:1 non-text-contrast floor
// for a border, let alone text.
type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  id: string;
  error?: string;
  success?: string;
  pending?: boolean;
  helperText?: string;
};

export function Input({
  label,
  id,
  error,
  success,
  pending,
  helperText,
  required,
  className = '',
  ...props
}: Props) {
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error || success || pending || helperText);

  const borderClass = error
    ? 'border-red-600'
    : success
      ? 'border-emerald-text'
      : 'border-slate/20';

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
      <input
        id={id}
        required={required}
        aria-required={required || undefined}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={hasMessage ? messageId : undefined}
        className={`min-h-[44px] rounded-md border ${borderClass} bg-white px-4 text-base text-slate placeholder:text-slate/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire ${className}`}
        {...props}
      />
      {hasMessage && (
        <p id={messageId} aria-live="polite" className="text-sm">
          {error && <span className="text-red-800">{error}</span>}
          {!error && success && <span className="text-emerald-text">{success}</span>}
          {!error && !success && pending && <span className="text-slate/70">Checking…</span>}
          {!error && !success && !pending && helperText && <span className="text-slate/70">{helperText}</span>}
        </p>
      )}
    </div>
  );
}
