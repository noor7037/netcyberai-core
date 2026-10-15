import type { ReactNode } from 'react';

// What Input, Select and Textarea share (C235-C, design system v5): the
// floating label, the field's box, and the line under it.
//
// The floating label (WCAG 2.1 SC 1.3.1 and 3.3.2: a placeholder that
// disappears is not a label). The label is a real <label for>, drawn inside
// the field where a placeholder would be; it rises onto the top border when
// the field has focus or a value. Pure CSS: the field is the label's `peer`
// and carries a placeholder (" " when the caller gives none) so that
// :placeholder-shown means "empty". A field that never shows a placeholder
// (a date, a select) keeps its label on the border. The caller's own
// placeholder appears only while the field has focus, as a hint under the
// raised label, never as the label.
//
// A label longer than FLOAT_MAX characters would not fit inside a phone-width
// field, so it sits above the field instead (static), as before: no label is
// ever cut short.
export const FLOAT_MAX = 34;

// The box: 48 px tall, rounded, a border at 3:1 against white (slate/50 is
// #8F949D, 3.1:1; WCAG 1.4.11), a focus ring in the brand blue.
export const FIELD_BOX =
  'w-full rounded-xl border bg-white text-base text-slate shadow-sm transition-colors focus:border-royal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire disabled:bg-off-white disabled:text-slate/70 motion-reduce:transition-none';

export function fieldBorder(error?: string, success?: string): string {
  return error ? 'border-red-600' : success ? 'border-emerald-text' : 'border-slate/50';
}

// The label over the field. `resting` is where it sits while the field is
// empty and without focus: centred (one line) or near the top (a textarea).
export function floatingLabelClass(resting: 'middle' | 'top' | 'none'): string {
  const base =
    'pointer-events-none absolute left-3 top-0 z-[1] max-w-[calc(100%-1.5rem)] -translate-y-1/2 rounded bg-white px-1 text-xs font-semibold leading-tight text-slate/70 transition-all duration-150 peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-focus:font-semibold peer-focus:text-royal motion-reduce:transition-none';
  if (resting === 'middle') return `${base} peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-base peer-placeholder-shown:font-normal`;
  if (resting === 'top') return `${base} peer-placeholder-shown:top-6 peer-placeholder-shown:text-base peer-placeholder-shown:font-normal`;
  return base;
}

// The words the field parts say are kept in Input.tsx (FIELD_WORDS), where
// they were before v5, and passed in.
export function RequiredMark({ required, words }: { required?: boolean; words: string }) {
  if (!required) return null;
  return (
    <>
      <span aria-hidden="true" className="text-red-800">
        {' '}
        *
      </span>
      <span className="sr-only">{words}</span>
    </>
  );
}

// The line under the field: the error, else the success, else "Checking…",
// else the helper text. Small, below the field, announced politely.
export function FieldMessage({ id, error, success, pending, pendingWords, helperText }: { id: string; error?: string; success?: string; pending?: boolean; pendingWords?: string; helperText?: ReactNode }) {
  if (!(error || success || pending || helperText)) return null;
  return (
    <p id={id} aria-live="polite" className="px-1 text-xs leading-snug">
      {error && <span className="text-sm text-red-800">{error}</span>}
      {!error && success && <span className="text-sm text-emerald-text">{success}</span>}
      {!error && !success && pending && <span className="text-slate/70">{pendingWords}</span>}
      {!error && !success && !pending && helperText && <span className="text-slate/70">{helperText}</span>}
    </p>
  );
}

// A label too long to float sits above the field, as a plain label.
export const STATIC_LABEL = 'px-1 text-sm font-medium text-slate';
