import { colors, lessonColors, lessonTints } from '@/lib/design-tokens';

// W19-C: the Family app's mascot, our own drawing: a child riding a big pencil with a spark of the tutor's saffron, for
// the welcome and the empty states. Code-drawn SVG, gradients and a soft shadow from the logo tokens only, decorative
// (aria-hidden; the words beside it carry the meaning). It bobs gently (family.css `.fam-mascot`), still under reduced
// motion. `id` keeps the gradient names apart when two are on one page.
export function Mascot({ className = 'h-40 w-48', id = 'm' }: { className?: string; id?: string }) {
  const g = (n: string) => `${id}-${n}`;
  const u = (n: string) => `url(#${g(n)})`;
  return (
    <svg data-mascot viewBox="0 0 200 170" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={g('pencil')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.sunshine} />
          <stop offset="0.55" stopColor={colors.gold} />
          <stop offset="1" stopColor={lessonColors.saffron} />
        </linearGradient>
        <linearGradient id={g('shirt')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colors.grape} />
          <stop offset="1" stopColor={lessonColors.plum} />
        </linearGradient>
        <radialGradient id={g('face')} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor={lessonColors.card} />
          <stop offset="1" stopColor={colors.peach} />
        </radialGradient>
        <linearGradient id={g('leg')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={lessonTints.sky.accent} />
          <stop offset="1" stopColor={lessonColors.ink} />
        </linearGradient>
      </defs>
      <ellipse cx="104" cy="158" rx="70" ry="7" fill={lessonColors.ink} opacity="0.12" />
      <g className="fam-mascot">
        {/* the pencil */}
        <g transform="rotate(-14 100 112)">
          <rect x="22" y="100" width="134" height="26" rx="5" fill={u('pencil')} />
          <rect x="22" y="104" width="134" height="5" fill={lessonColors.card} opacity="0.45" />
          <rect x="12" y="100" width="14" height="26" rx="5" fill={lessonTints.blush.accent} />
          <rect x="24" y="100" width="7" height="26" fill={lessonColors.line} />
          <path d="M156 100 L184 113 L156 126 Z" fill={colors.peach} />
          <path d="M175 109 L184 113 L175 117 Z" fill={lessonColors.ink} />
        </g>
        {/* the far leg, the body, the near leg */}
        <path d="M84 104 q-6 16 -2 30" stroke={u('leg')} strokeWidth="11" strokeLinecap="round" fill="none" opacity="0.7" />
        <path d="M78 66 h34 a10 10 0 0 1 10 10 v24 a8 8 0 0 1 -8 8 h-38 a8 8 0 0 1 -8 -8 v-24 a10 10 0 0 1 10 -10z" fill={u('shirt')} />
        <path d="M95 70 l5 8 5 -8" fill="none" stroke={lessonTints.lilac.tint} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M108 104 q10 14 6 34" stroke={u('leg')} strokeWidth="12" strokeLinecap="round" fill="none" />
        <ellipse cx="118" cy="141" rx="11" ry="6" fill={lessonColors.saffron} />
        {/* the waving arm and the arm holding on */}
        <path d="M116 76 q16 -6 20 -24" stroke={u('shirt')} strokeWidth="10" strokeLinecap="round" fill="none" />
        <circle cx="137" cy="48" r="7" fill={colors.peach} />
        <path d="M76 80 q-10 12 -4 24" stroke={u('shirt')} strokeWidth="10" strokeLinecap="round" fill="none" />
        <circle cx="73" cy="106" r="6" fill={colors.peach} />
        {/* the head */}
        <circle cx="96" cy="42" r="27" fill={u('face')} />
        <path d="M69 40 q0 -30 28 -29 q24 1 26 25 q-8 -10 -20 -11 q-4 8 -16 9 q-10 1 -18 6z" fill={lessonColors.ink} />
        <ellipse cx="86" cy="45" rx="3.6" ry="4.6" fill={lessonColors.ink} />
        <ellipse cx="106" cy="45" rx="3.6" ry="4.6" fill={lessonColors.ink} />
        <circle cx="87.3" cy="43.4" r="1.3" fill={lessonColors.card} />
        <circle cx="107.3" cy="43.4" r="1.3" fill={lessonColors.card} />
        <circle cx="79" cy="53" r="4" fill={lessonTints.blush.accent} opacity="0.22" />
        <circle cx="113" cy="53" r="4" fill={lessonTints.blush.accent} opacity="0.22" />
        <path d="M88 55 q8 8 16 0" fill="none" stroke={lessonColors.ink} strokeWidth="3" strokeLinecap="round" />
      </g>
      {/* the tutor's spark */}
      <path className="fam-mascot-spark" d="M160 22 l3.5 9 9 3.5 -9 3.5 -3.5 9 -3.5 -9 -9 -3.5 9 -3.5z" fill={lessonColors.saffron} />
      <circle cx="40" cy="40" r="4" fill={lessonTints.lilac.accent} opacity="0.35" />
      <circle cx="176" cy="66" r="3" fill={colors.cyan} opacity="0.6" />
    </svg>
  );
}
