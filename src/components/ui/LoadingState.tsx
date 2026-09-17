type Props = {
  label?: string;
};

// A functional loading indicator (a spin, not a decorative animation)
// -- Tailwind's built-in animate-spin, no added dependency, no
// illustration.
export function LoadingState({ label = 'Loading…' }: Props) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-4 border-slate/20 border-t-sapphire"
      />
      <p className="text-sm text-slate/70">{label}</p>
    </div>
  );
}
