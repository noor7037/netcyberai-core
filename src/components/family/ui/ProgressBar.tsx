import { ENTER } from './motion';

// A progress bar that fills from the left when it appears (a transform, so it stays smooth on budget phones; no motion
// under reduced motion). `value` and `max` are counts; the label names it for screen readers.
export function ProgressBar({ value, max, bar = 'bg-royal', label, className = '' }: { value: number; max: number; bar?: string; label: string; className?: string }) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className={`h-3 w-full overflow-hidden rounded-full bg-slate/10 ${className}`}>
      <div className={`h-full origin-left rounded-full ${bar} animate-grow-x motion-reduce:animate-none`} style={{ transform: `scaleX(${share})` }} />
    </div>
  );
}

export { ENTER };
