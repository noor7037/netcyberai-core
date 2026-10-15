import type { InputHTMLAttributes, ReactNode } from 'react';
import { FieldMessage, RequiredMark } from './field';
import { FIELD_WORDS } from './Input';

// v5 (C235-C): a drawn radio over the REAL native one, like Checkbox: the
// native radio input is the circle (appearance: none), a brand dot
// is drawn over it when chosen. Arrow keys, the group's single tab stop and
// form submission are the browser's own. The 44px target is the label.
export type RadioOption<T extends string = string> = { value: T; label: ReactNode; description?: ReactNode; disabled?: boolean };

type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: ReactNode;
  id: string;
  description?: ReactNode;
};

// A set of radios with its question as the legend of a fieldset, the
// helper text or the error under it. Controlled (`value` + `onChange`) or
// not (`defaultValue`).
export function RadioGroup<T extends string>({
  id,
  name,
  legend,
  options,
  value,
  defaultValue,
  onChange,
  required,
  error,
  helperText,
  hideLegend = false,
  className = '',
}: {
  id: string;
  name?: string;
  legend: ReactNode;
  options: readonly RadioOption<T>[];
  value?: T;
  defaultValue?: T;
  onChange?: (value: T) => void;
  required?: boolean;
  error?: string;
  helperText?: ReactNode;
  hideLegend?: boolean;
  className?: string;
}) {
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error || helperText);
  return (
    <fieldset id={id} aria-describedby={hasMessage ? messageId : undefined} aria-invalid={Boolean(error) || undefined} className={`flex min-w-0 flex-col ${className}`}>
      <legend className={hideLegend ? 'sr-only' : 'mb-1 px-1 text-sm font-semibold text-slate'}>
        {legend}
        <RequiredMark required={required} words={FIELD_WORDS.required} />
      </legend>
      <div className="flex flex-col">
        {options.map((o) => (
          <Radio
            key={o.value}
            id={`${id}-${o.value}`}
            name={name ?? id}
            value={o.value}
            label={o.label}
            description={o.description}
            disabled={o.disabled}
            required={required}
            {...(value !== undefined ? { checked: value === o.value, onChange: () => onChange?.(o.value) } : { defaultChecked: defaultValue === o.value, onChange: () => onChange?.(o.value) })}
          />
        ))}
      </div>
      {hasMessage && <FieldMessage id={messageId} error={error} helperText={helperText} />}
    </fieldset>
  );
}

export function Radio({ label, id, description, className = '', ...props }: RadioProps) {
  return (
    <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2.5 text-base text-slate">
      <span className="relative mt-0.5 inline-flex h-5 w-5 shrink-0">
        <input
          id={id}
          type="radio"
          className={`peer h-5 w-5 cursor-pointer appearance-none rounded-full border-2 border-slate/60 bg-white transition-colors checked:border-sapphire focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none ${className}`}
          {...props}
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-[5px] scale-0 rounded-full bg-sapphire transition-transform peer-checked:scale-100 motion-reduce:transition-none" />
      </span>
      <span className="min-w-0 leading-6">
        {label}
        {description && <span className="block text-sm leading-snug text-slate/70">{description}</span>}
      </span>
    </label>
  );
}
