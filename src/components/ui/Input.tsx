import type { InputHTMLAttributes, ReactNode } from 'react';
import { FIELD_BOX, FLOAT_MAX, FieldMessage, RequiredMark, STATIC_LABEL, fieldBorder, floatingLabelClass } from './field';

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
//
// v5 (C235-C): a floating label by default (./field.tsx says how and why);
// the helper text, the error and the success line sit under the field.
// `floating={false}` puts the label above the field.
// What the field parts say (Input, Select, Textarea, RadioGroup share them).
export const FIELD_WORDS = { required: ' (required)', checking: 'Checking…' } as const;

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  id: string;
  error?: string;
  success?: string;
  pending?: boolean;
  helperText?: ReactNode;
  floating?: boolean;
};

export function Input({ label, id, error, success, pending, helperText, required, floating, placeholder, className = '', ...props }: Props) {
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error || success || pending || helperText);
  const float = floating ?? label.length <= FLOAT_MAX;
  const field = (
    <input
      id={id}
      required={required}
      aria-required={required || undefined}
      aria-invalid={Boolean(error) || undefined}
      aria-describedby={hasMessage ? messageId : undefined}
      placeholder={float ? (placeholder ?? ' ') : placeholder}
      className={`${FIELD_BOX} ${fieldBorder(error, success)} h-12 min-h-[48px] px-4 ${float ? 'peer placeholder:text-transparent focus:placeholder:text-slate/70' : 'placeholder:text-slate/70'} ${className}`}
      {...props}
    />
  );
  const text = (
    <>
      {label}
      <RequiredMark required={required} words={FIELD_WORDS.required} />
    </>
  );
  return (
    <div className="flex flex-col gap-1">
      {float ? (
        <div className="relative flex flex-col">
          {field}
          <label htmlFor={id} className={floatingLabelClass('middle')}>
            {text}
          </label>
        </div>
      ) : (
        <>
          <label htmlFor={id} className={STATIC_LABEL}>
            {text}
          </label>
          {field}
        </>
      )}
      {hasMessage && <FieldMessage id={messageId} error={error} success={success} pending={pending} pendingWords={FIELD_WORDS.checking} helperText={helperText} />}
    </div>
  );
}
