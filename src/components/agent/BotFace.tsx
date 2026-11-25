// The assistant's face (C549): eyes that blink and a ring that turns while it works, still when it rests. All motion
// stops under prefers-reduced-motion (Tailwind's motion-reduce).
export function BotFace({ working, size = 40 }: { working: boolean; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} aria-hidden="true">
      {working && <span className="absolute inset-0 rounded-full border-2 border-royal/30 border-t-royal motion-safe:animate-spin" />}
      <svg viewBox="0 0 40 40" width={size - 6} height={size - 6} className="relative">
        <rect x="6" y="9" width="28" height="24" rx="9" className="fill-royal" />
        <rect x="18.5" y="3" width="3" height="7" rx="1.5" className="fill-royal" />
        <circle cx="20" cy="3.5" r="2.5" className={working ? 'fill-tangerine motion-safe:animate-pulse' : 'fill-tangerine'} />
        <g className={working ? 'motion-safe:animate-blink origin-center' : ''} style={{ transformBox: 'fill-box' }}>
          <circle cx="15" cy="20" r="3" className="fill-white" />
          <circle cx="25" cy="20" r="3" className="fill-white" />
        </g>
        <path d="M14 27 q6 4 12 0" strokeWidth="2.2" strokeLinecap="round" fill="none" className="stroke-white" />
      </svg>
    </span>
  );
}
