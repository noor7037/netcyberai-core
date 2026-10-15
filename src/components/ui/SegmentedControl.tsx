import type { ReactNode } from 'react';

// A segmented control (C235-C) for a choice of 2 to 4 short options, the
// iOS kind: a quiet track with the chosen segment raised in white. Built on
// native radios (visually hidden, still focusable): one tab stop for the
// group, arrow keys move the choice, the <legend> names it. Each segment is
// 44px tall; on a phone the track takes the full width and long words wrap
// instead of scrolling. More than 4 options belong in a Select or RadioGroup.
export type Segment<T extends string = string> = { value: T; label: ReactNode; disabled?: boolean };

export function SegmentedControl<T extends string>({
  id,
  name,
  label,
  hideLabel = false,
  options,
  value,
  onChange,
  className = '',
}: {
  id: string;
  name?: string;
  label: ReactNode;
  hideLabel?: boolean;
  options: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <fieldset id={id} data-segmented={id} className={`min-w-0 ${className}`}>
      <legend className={hideLabel ? 'sr-only' : 'mb-1 px-1 text-sm font-semibold text-slate'}>{label}</legend>
      <div className="flex w-full gap-1 rounded-xl bg-slate/5 p-1 ring-1 ring-inset ring-slate/10 sm:inline-flex sm:w-auto">
        {options.map((o) => (
          <label key={o.value} className="relative min-w-0 flex-1 cursor-pointer sm:flex-none">
            <input type="radio" name={name ?? id} value={o.value} checked={value === o.value} disabled={o.disabled} onChange={() => onChange(o.value)} className="peer sr-only" />
            <span className="flex min-h-[44px] items-center justify-center rounded-lg px-4 text-center text-sm font-semibold leading-tight text-slate/70 transition peer-checked:bg-white peer-checked:text-slate peer-checked:shadow-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-royal peer-disabled:cursor-not-allowed peer-disabled:opacity-60 motion-reduce:transition-none">
              {o.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
