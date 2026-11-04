import { colors, lessonColors, lessonTints } from '@/lib/design-tokens';

// W19-C: the home's 2.5D pictures (the founder's reference: a soft 3D book and alarm clock on tinted tiles), drawn in
// code with the logo tokens: gradients for the light from above, a darker side for depth, a soft shadow under each.
// Decorative only (aria-hidden); the number and the words beside each picture are the content. One of each per page,
// so the gradient names are fixed.
const shadow = (cx: number, cy: number, rx: number) => <ellipse cx={cx} cy={cy} rx={rx} ry={rx / 6} fill={lessonColors.ink} opacity="0.14" />;

export function BookArt({ className = 'h-20 w-20' }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="art-book-l" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={lessonColors.card} />
          <stop offset="1" stopColor={lessonColors.line} />
        </linearGradient>
        <linearGradient id="art-book-r" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={lessonColors.card} />
          <stop offset="1" stopColor={lessonTints.lilac.tint} />
        </linearGradient>
        <linearGradient id="art-book-c" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.grape} />
          <stop offset="1" stopColor={lessonColors.plum} />
        </linearGradient>
      </defs>
      {shadow(48, 84, 36)}
      <path d="M8 34 L48 44 L88 34 L88 74 L48 84 L8 74 Z" fill="url(#art-book-c)" />
      <path d="M12 28 Q30 24 48 36 L48 78 Q30 66 12 70 Z" fill="url(#art-book-l)" />
      <path d="M84 28 Q66 24 48 36 L48 78 Q66 66 84 70 Z" fill="url(#art-book-r)" />
      <path d="M18 38 Q30 35 42 42M18 46 Q30 43 42 50M18 54 Q30 51 42 58" stroke={lessonTints.lilac.accent} strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M54 42 Q66 35 78 38M54 50 Q66 43 78 46M54 58 Q66 51 78 54" stroke={lessonTints.lilac.accent} strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M48 36 L48 78" stroke={lessonColors.plum} strokeOpacity="0.3" strokeWidth="1.5" />
      <path d="M66 16 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" fill={lessonColors.saffron} />
    </svg>
  );
}

export function ClockArt({ className = 'h-20 w-20' }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="art-clock-b" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor={colors.grape} />
          <stop offset="1" stopColor={lessonColors.plum} />
        </radialGradient>
        <radialGradient id="art-clock-f" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor={lessonColors.card} />
          <stop offset="1" stopColor={lessonTints.butter.tint} />
        </radialGradient>
        <linearGradient id="art-clock-bell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.sunshine} />
          <stop offset="1" stopColor={colors.gold} />
        </linearGradient>
      </defs>
      {shadow(48, 88, 30)}
      <path d="M26 80 L20 88M70 80 L76 88" stroke={lessonColors.plum} strokeWidth="5" strokeLinecap="round" />
      <path d="M14 30 a14 14 0 0 1 22 -14 z" fill="url(#art-clock-bell)" />
      <path d="M82 30 a14 14 0 0 0 -22 -14 z" fill="url(#art-clock-bell)" />
      <circle cx="48" cy="52" r="34" fill="url(#art-clock-b)" />
      <circle cx="48" cy="52" r="26" fill="url(#art-clock-f)" />
      <path d="M48 34v18l12 7" stroke={lessonColors.ink} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="48" cy="52" r="3.5" fill={lessonColors.saffron} />
      <path d="M48 28v3M48 73v3M24 52h3M69 52h3" stroke={lessonTints.butter.accent} strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="36" cy="34" rx="9" ry="4" fill={lessonColors.card} opacity="0.35" transform="rotate(-30 36 34)" />
    </svg>
  );
}

export function StarArt({ className = 'h-20 w-20' }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="art-star" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={colors.sunshine} />
          <stop offset="1" stopColor={lessonColors.saffron} />
        </linearGradient>
      </defs>
      {shadow(48, 86, 28)}
      <path d="M48 10 l11 23 25 3.6 -18 17.6 4.3 25 -22.3 -11.8 -22.3 11.8 4.3 -25 -18 -17.6 25 -3.6z" fill="url(#art-star)" />
      <path d="M48 22 l6 13 14 2 -10 9.8" stroke={lessonColors.card} strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

// The mission card's picture: a rocket lifting off an open book, the tutor's saffron in its flame.
export function MissionArt({ className = 'h-28 w-28' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="art-rocket" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={lessonColors.card} />
          <stop offset="1" stopColor={lessonTints.lilac.tint} />
        </linearGradient>
        <linearGradient id="art-flame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.sunshine} />
          <stop offset="1" stopColor={lessonColors.saffron} />
        </linearGradient>
        <linearGradient id="art-mbook" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={colors.grape} />
          <stop offset="1" stopColor={lessonColors.plum} />
        </linearGradient>
      </defs>
      {shadow(60, 110, 42)}
      <path d="M18 86 L60 94 L102 86 L102 104 L60 110 L18 104 Z" fill="url(#art-mbook)" />
      <path d="M22 82 Q42 78 60 88 L60 104 Q42 96 22 100 Z" fill={lessonColors.card} />
      <path d="M98 82 Q78 78 60 88 L60 104 Q78 96 98 100 Z" fill={lessonTints.lilac.tint} />
      <g transform="rotate(18 64 46)">
        <path d="M58 76 q6 14 12 0 z" fill="url(#art-flame)" className="fam-flame" />
        <path d="M54 60 l-10 14 h10z M74 60 l10 14 h-10z" fill={lessonTints.blush.accent} />
        <path d="M64 10 q14 16 12 56 h-24 q-2 -40 12 -56z" fill="url(#art-rocket)" />
        <path d="M64 10 q14 16 12 56 h-6 q2 -36 -6 -56z" fill={lessonTints.lilac.accent} opacity="0.18" />
        <circle cx="64" cy="38" r="7" fill={lessonTints.sky.accent} />
        <circle cx="62" cy="36" r="2.4" fill={lessonColors.card} opacity="0.7" />
      </g>
      <path d="M22 26 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" fill={lessonColors.saffron} />
      <circle cx="102" cy="22" r="3.5" fill={colors.sunshine} />
      <circle cx="30" cy="60" r="2.5" fill={lessonTints.lilac.accent} opacity="0.5" />
    </svg>
  );
}
