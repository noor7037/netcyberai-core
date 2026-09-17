export const colors = {
  sapphire: '#0F4C81',
  emerald: '#10B981',
  amber: '#F59E0B',
  slate: '#1E293B',
  offWhite: '#F9FAFB',
} as const;

// The raw emerald/amber tokens above fail WCAG AA as TEXT color on
// white/off-white -- confirmed by scripts/check_contrast.py: emerald
// 2.54:1, amber 2.15:1, both far under the 4.5:1 floor. White text on
// either as a solid background fails the same way (2.54:1 / 2.15:1).
// These are the same hue family, darkened only as far as needed to
// clear 4.5:1, for any UI that needs success-colored or
// warning-colored TEXT rather than an icon/border/background use of
// the raw token. Never use `emerald`/`amber` directly as a text color
// or as a background with white text -- the contrast checker fails
// on both.
export const accessibleTextColors = {
  emeraldText: '#047857', // 5.48:1 on white
  amberText: '#92400E', // 7.09:1 on white
} as const;
