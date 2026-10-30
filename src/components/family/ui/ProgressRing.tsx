// A progress ring (D1, C230-Q) that draws itself to its value once (family.css `.fam-ring-arc`; still under reduced
// motion). The value is shown as text beside or inside it, so the ring is never the only sign.
export function ProgressRing({ value, max, size = 64, stroke = 7, track = 'text-ink/15', arc = 'text-ink', children }: { value: number; max: number; size?: number; stroke?: number; track?: string; arc?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const offset = c * (1 - share);
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg aria-hidden="true" width={size} height={size} viewBox={[0, 0, size, size].join(' ')} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className={track} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={`fam-ring-arc ${arc}`}
          style={{ ['--from' as string]: c, ['--to' as string]: offset } as React.CSSProperties}
        />
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
}
