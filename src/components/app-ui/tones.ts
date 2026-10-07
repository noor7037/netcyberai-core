import type { ColorToken } from '@/lib/contracts/modules';

// Class sets for every logo colour token (17 §4: only the logo palette).
// Module groups carry a pair of tokens (contracts/modules.ts); screens look
// the classes up here, so they stay literal strings Tailwind can see.
//
//   solid: a filled surface and its readable text colour
//   soft:  a tinted surface with text that stays readable on it
//   fg:    the token as text on white or off-white
//   bar:   a mark with no text (accent bars, dots)
//
// White text only on the dark hues, slate text on the bright ones
// (design-tokens.ts). check_contrast.py cannot see a lookup table, so
// test/app-ui/tones.test.ts computes every pairing below from the hex
// values and fails under 4.5:1.

export type ToneClasses = { solid: string; soft: string; fg: string; bar: string; ring: string };

export const TOKEN_TONES: Record<ColorToken, ToneClasses> = {
  sapphire: { solid: 'bg-sapphire text-white', soft: 'bg-sapphire/10 text-sapphire', fg: 'text-sapphire', bar: 'bg-sapphire', ring: 'ring-sapphire' },
  midnight: { solid: 'bg-midnight text-white', soft: 'bg-midnight/10 text-midnight', fg: 'text-midnight', bar: 'bg-midnight', ring: 'ring-midnight' },
  azure: { solid: 'bg-azure text-white', soft: 'bg-azure/10 text-azure', fg: 'text-azure', bar: 'bg-azure', ring: 'ring-azure' },
  royal: { solid: 'bg-royal text-white', soft: 'bg-royal/10 text-royal-deep', fg: 'text-royal', bar: 'bg-royal', ring: 'ring-royal' },
  electric: { solid: 'bg-electric text-white', soft: 'bg-electric/10 text-royal-deep', fg: 'text-royal-deep', bar: 'bg-electric', ring: 'ring-electric' },
  cyan: { solid: 'bg-cyan text-slate', soft: 'bg-cyan/15 text-sapphire', fg: 'text-azure', bar: 'bg-cyan', ring: 'ring-cyan' },
  turquoise: { solid: 'bg-turquoise text-slate', soft: 'bg-turquoise/15 text-emerald', fg: 'text-emerald', bar: 'bg-turquoise', ring: 'ring-turquoise' },
  emerald: { solid: 'bg-emerald text-white', soft: 'bg-emerald/10 text-emerald', fg: 'text-emerald', bar: 'bg-emerald', ring: 'ring-emerald' },
  leaf: { solid: 'bg-leaf text-slate', soft: 'bg-leaf/15 text-emerald', fg: 'text-emerald', bar: 'bg-leaf', ring: 'ring-leaf' },
  grape: { solid: 'bg-grape text-white', soft: 'bg-grape/10 text-grape-deep', fg: 'text-grape-deep', bar: 'bg-grape', ring: 'ring-grape' },
  violet: { solid: 'bg-violet text-white', soft: 'bg-violet/10 text-violet', fg: 'text-violet', bar: 'bg-violet', ring: 'ring-violet' },
  tangerine: { solid: 'bg-tangerine text-slate', soft: 'bg-tangerine/10 text-tangerine-deep', fg: 'text-tangerine-deep', bar: 'bg-tangerine', ring: 'ring-tangerine' },
  amber: { solid: 'bg-amber text-slate', soft: 'bg-amber/10 text-amber-text', fg: 'text-amber-text', bar: 'bg-amber', ring: 'ring-amber' },
  coral: { solid: 'bg-coral text-slate', soft: 'bg-coral/10 text-coral-deep', fg: 'text-coral-deep', bar: 'bg-coral', ring: 'ring-coral' },
  sunshine: { solid: 'bg-sunshine text-slate', soft: 'bg-sunshine/20 text-gold-deep', fg: 'text-gold-deep', bar: 'bg-sunshine', ring: 'ring-sunshine' },
  gold: { solid: 'bg-gold text-slate', soft: 'bg-gold/15 text-gold-deep', fg: 'text-gold-deep', bar: 'bg-gold', ring: 'ring-gold' },
  peach: { solid: 'bg-peach text-slate', soft: 'bg-peach/30 text-slate', fg: 'text-tangerine-deep', bar: 'bg-peach', ring: 'ring-peach' },
  slate: { solid: 'bg-slate text-white', soft: 'bg-slate/5 text-slate', fg: 'text-slate', bar: 'bg-slate', ring: 'ring-slate' },
  offWhite: { solid: 'bg-off-white text-slate', soft: 'bg-off-white text-slate', fg: 'text-slate', bar: 'bg-off-white', ring: 'ring-slate' },
};

// Status meanings used across the app (17 §4: alerts coral, recognition
// gold, success emerald/turquoise).
export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'alert' | 'ai' | 'recognition';

export const STATUS_TONES: Record<StatusTone, ColorToken> = {
  neutral: 'slate',
  info: 'royal',
  success: 'turquoise',
  warning: 'tangerine',
  alert: 'coral',
  ai: 'grape',
  recognition: 'gold',
};

// The tinted surface of a tone without its text colour (KPI tiles, hero
// chips): the first class of `soft`. Text on it is always slate.
export function toneTint(tone: ColorToken): string {
  return TOKEN_TONES[tone].soft.split(' ')[0];
}
