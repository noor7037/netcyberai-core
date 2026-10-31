import { lessonColors, lessonTints } from '@/lib/design-tokens';

// The tutor's face (W10-3, C412): a friendly geometric face drawn in plum, the colour of everything the AI makes, with
// one saffron spark for the AI mark. Drawn here, no stock art; decorative only (the answer beside it is the content).
export function TutorAvatar({ className = 'h-12 w-12' }: { className?: string }) {
  return (
    <svg data-tutor-avatar viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <rect x="2" y="4" width="42" height="42" rx="15" fill={lessonColors.plum} />
      <circle cx="23" cy="26" r="13.5" fill={lessonTints.lilac.tint} />
      <ellipse cx="18.2" cy="24.2" rx="2.1" ry="2.6" fill={lessonColors.ink} />
      <ellipse cx="27.8" cy="24.2" rx="2.1" ry="2.6" fill={lessonColors.ink} />
      <circle cx="14.6" cy="29.4" r="2" fill={lessonTints.blush.accent} fillOpacity="0.28" />
      <circle cx="31.4" cy="29.4" r="2" fill={lessonTints.blush.accent} fillOpacity="0.28" />
      <path d="M18 30.2c2.8 3 7.2 3 10 0" fill="none" stroke={lessonColors.ink} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M41 1.5l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill={lessonColors.saffron} />
    </svg>
  );
}
