import type { InputHTMLAttributes } from 'react';

// Native <input type="checkbox">, recolored with the CSS `accent-color`
// property (Chrome 93+/Firefox 92+/Safari 15.4+ -- safely within this
// project's floor: a budget Android phone's auto-updated Chrome) rather
// than hidden behind a custom-drawn box. Zero custom keyboard/ARIA code:
// native checkbox semantics, unchanged. The 44px tap-target floor comes
// from the wrapping <label> (clicking anywhere on a label activates its
// checkbox), not from inflating the visual checkbox itself to 44px,
// which would look wrong at this component's actual size.
type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  id: string;
};

export function Checkbox({ label, id, className = '', ...props }: Props) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-[44px] cursor-pointer items-center gap-2 text-base text-slate"
    >
      <input
        id={id}
        type="checkbox"
        className={`h-5 w-5 accent-sapphire focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sapphire ${className}`}
        {...props}
      />
      {label}
    </label>
  );
}
