// A placeholder while an area loads (docs/family-app/09 §6 rule 9: never a blank screen while loading). It breathes
// gently (opacity only) and stands still under reduced motion. `label` is read out once for screen readers.
export function Skeleton({ lines = 3, label, className = '' }: { lines?: number; label: string; className?: string }) {
  return (
    <div role="status" aria-label={label} className={`flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate/10 ${className}`}>
      <div className="h-5 w-2/5 animate-pulse rounded-full bg-slate/10 motion-reduce:animate-none" />
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className={`h-4 animate-pulse rounded-full bg-slate/10 motion-reduce:animate-none ${i % 2 ? 'w-4/5' : 'w-full'}`} />
      ))}
    </div>
  );
}
