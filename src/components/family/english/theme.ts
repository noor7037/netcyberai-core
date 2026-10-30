import { colors } from '@/lib/design-tokens';
import type { PartRole, Track } from '@/lib/family/english/course';

// Each track's colours (docs/family-app/12 §10), from the design tokens only. Every class string carries its own
// background with its text colour, so scripts/check_contrast.py reads the pair (white on the deep hues, slate on the
// bright ones).
export const TRACK_THEME: Record<Track, { header: string; button: string; soft: string; ring: string; hex: string; light: string }> = {
  a: { header: 'bg-sunshine bg-gradient-to-br from-sunshine to-gold text-slate', button: 'bg-tangerine text-slate', soft: 'bg-sunshine/20 text-slate', ring: 'ring-tangerine', hex: colors.tangerine, light: colors.sunshine },
  b: { header: 'bg-emerald bg-gradient-to-br from-emerald to-azure text-white', button: 'bg-emerald text-white', soft: 'bg-turquoise/10 text-slate', ring: 'ring-emerald', hex: colors.emerald, light: colors.turquoise },
  c: { header: 'bg-ink text-white', button: 'bg-ink text-white', soft: 'bg-cyan/10 text-slate', ring: 'ring-ink', hex: colors.royal, light: colors.cyan },
  d: { header: 'bg-grape-deep text-white', button: 'bg-grape-deep text-white', soft: 'bg-grape/10 text-slate', ring: 'ring-grape', hex: colors.grape, light: colors.violet },
};

// The sentence builder's colour for each part of a sentence (12 §10): the same colour means the same job everywhere.
export const PART_STYLE: Record<PartRole, string> = {
  who: 'bg-ink text-white',
  do: 'bg-tangerine text-slate',
  what: 'bg-leaf text-slate',
  where: 'bg-turquoise text-slate',
  when: 'bg-grape text-white',
  not: 'bg-coral text-slate',
  ask: 'bg-cyan text-slate',
  other: 'bg-off-white text-slate',
};
