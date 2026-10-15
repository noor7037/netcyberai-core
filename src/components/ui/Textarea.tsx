import type { ReactNode, TextareaHTMLAttributes } from 'react';
import { FIELD_BOX, FLOAT_MAX, FieldMessage, RequiredMark, STATIC_LABEL, fieldBorder, floatingLabelClass } from './field';
import { FIELD_WORDS } from './Input';

// A multi-line field (C235-C), the same as Input: a floating label that rests
// at the first line and rises onto the top border with focus or a value, the
// helper text and the error under it. `floating={false}` puts the label above.
type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  id: string;
  error?: string;
  helperText?: ReactNode;
  floating?: boolean;
};

export function Textarea({ label, id, error, helperText, required, floating, placeholder, rows = 4, className = '', ...props }: Props) {
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error || helperText);
  const float = floating ?? label.length <= FLOAT_MAX;
  const field = (
    <textarea
      id={id}
      rows={rows}
      required={required}
      aria-required={required || undefined}
      aria-invalid={Boolean(error) || undefined}
      aria-describedby={hasMessage ? messageId : undefined}
      placeholder={float ? (placeholder ?? ' ') : placeholder}
      className={`${FIELD_BOX} ${fieldBorder(error)} min-h-[96px] px-4 py-3 leading-6 ${float ? 'peer placeholder:text-transparent focus:placeholder:text-slate/70' : 'placeholder:text-slate/70'} ${className}`}
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
          <label htmlFor={id} className={floatingLabelClass('top')}>
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
      {hasMessage && <FieldMessage id={messageId} error={error} helperText={helperText} />}
    </div>
  );
}
