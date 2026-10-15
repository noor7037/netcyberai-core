import type { InputHTMLAttributes, ReactNode } from 'react';

// An on/off switch (C235-C), the iOS kind, over the REAL native checkbox
// with role="switch": the checkbox is the track (appearance: none), the knob
// is drawn over it and slides when on (no slide with reduced motion). The
// state is also said in words beside the label (`stateText`), so colour is
// never the only cue. The 44px target is the <label>.
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role'> & {
  label: ReactNode;
  id: string;
  stateText?: ReactNode;
};

export function Switch({ label, id, stateText, className = '', ...props }: Props) {
  return (
    <label htmlFor={id} className="flex min-h-[44px] cursor-pointer items-center gap-3 text-sm font-semibold text-slate">
      <span className="relative inline-flex h-7 w-12 shrink-0">
        <input
          id={id}
          type="checkbox"
          role="switch"
          className={`peer h-7 w-12 cursor-pointer appearance-none rounded-full bg-slate/50 transition-colors checked:bg-emerald focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-royal disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none ${className}`}
          {...props}
        />
        <span aria-hidden="true" className="pointer-events-none absolute left-0.5 top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5 motion-reduce:transition-none" />
      </span>
      <span className="min-w-0">
        {label}
        {stateText && <span className="font-normal text-slate/70">: {stateText}</span>}
      </span>
    </label>
  );
}
