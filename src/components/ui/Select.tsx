import type { ReactNode, SelectHTMLAttributes } from 'react';
import { FIELD_BOX, FLOAT_MAX, FieldMessage, RequiredMark, STATIC_LABEL, fieldBorder, floatingLabelClass } from './field';
import { FIELD_WORDS } from './Input';

// A native <select> wrapped in the design system's visual tokens, not
// a custom listbox. This is the "smallest option that does the job"
// call from the design-system hardening prompt: a custom dropdown
// needs role=combobox/listbox/option, aria-activedescendant, typeahead
// and correct arrow/Home/End/Escape handling to match what a native
// <select> already gets for free, correctly, on every platform this
// project's Floor Device Standard cares about (including screen
// readers on a budget Android phone). No dependency, zero custom
// keyboard code to get subtly wrong.
//
// v5 (C235-C): the label floats on the top border (a select always shows a
// choice, so its label never rests inside it), the native arrow is replaced
// by a drawn chevron, and the helper text and the error sit under the field.
type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  id: string;
  error?: string;
  helperText?: ReactNode;
  floating?: boolean;
};

export function Select({ label, id, error, helperText, required, floating, className = '', children, ...props }: Props) {
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error || helperText);
  const float = floating ?? label.length <= FLOAT_MAX;
  const text = (
    <>
      {label}
      <RequiredMark required={required} words={FIELD_WORDS.required} />
    </>
  );
  return (
    <div className="flex flex-col gap-1">
      {!float && (
        <label htmlFor={id} className={STATIC_LABEL}>
          {text}
        </label>
      )}
      <div className="relative flex flex-col">
        <select
          id={id}
          required={required}
          aria-required={required || undefined}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          className={`${FIELD_BOX} ${fieldBorder(error)} peer h-12 min-h-[48px] cursor-pointer appearance-none pl-4 pr-10 ${className}`}
          {...props}
        >
          {children}
        </select>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate/70">
          <path d="M6 8l4 4 4-4" />
        </svg>
        {float && (
          <label htmlFor={id} className={floatingLabelClass('none')}>
            {text}
          </label>
        )}
      </div>
      {hasMessage && <FieldMessage id={messageId} error={error} helperText={helperText} />}
    </div>
  );
}
