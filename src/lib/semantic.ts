// Semantic colour roles as Tailwind class sets. Components choose a ROLE
// (what the colour means), never a raw hue. Pairings were computed with
// scripts/check_contrast.py's contrast_ratio() -- see design-tokens.ts.
//
// Because these are looked up at runtime, check_contrast.py cannot see
// them; that is why every set below uses only the pairings verified in
// design-tokens.ts, and why children of a `solid` surface must inherit
// its text colour rather than setting their own literal text-* class.
export type Tone =
  | 'trust'
  | 'product'
  | 'communication'
  | 'success'
  | 'intelligence'
  | 'action'
  | 'alert'
  | 'achievement';

export interface ToneClasses {
  solid: string; // filled surface + its readable text colour
  soft: string; // tinted surface for chips/cards on white
  fg: string; // coloured text on white/off-white (>= 4.5:1)
  dot: string; // a small colour mark (no text)
  ring: string; // focus/active ring
  border: string;
  fill: string; // hex, for SVG marks
}

export const tones: Record<Tone, ToneClasses> = {
  trust: {
    solid: 'bg-sapphire text-white',
    soft: 'bg-sapphire/10 text-sapphire',
    fg: 'text-sapphire',
    dot: 'bg-sapphire',
    ring: 'ring-sapphire',
    border: 'border-sapphire',
    fill: '#002357',
  },
  product: {
    solid: 'bg-royal text-white',
    soft: 'bg-royal/10 text-royal-deep',
    fg: 'text-royal',
    dot: 'bg-royal',
    ring: 'ring-royal',
    border: 'border-royal',
    fill: '#1D4ED8',
  },
  communication: {
    solid: 'bg-cyan text-slate',
    soft: 'bg-cyan/15 text-sapphire',
    fg: 'text-azure',
    dot: 'bg-cyan',
    ring: 'ring-cyan',
    border: 'border-cyan',
    fill: '#02CFF9',
  },
  success: {
    solid: 'bg-turquoise text-slate',
    soft: 'bg-turquoise/15 text-emerald',
    fg: 'text-emerald',
    dot: 'bg-turquoise',
    ring: 'ring-turquoise',
    border: 'border-turquoise',
    fill: '#14B8A6',
  },
  intelligence: {
    solid: 'bg-grape text-white',
    soft: 'bg-grape/10 text-grape-deep',
    fg: 'text-grape-deep',
    dot: 'bg-grape',
    ring: 'ring-grape',
    border: 'border-grape',
    fill: '#8B3DFF',
  },
  action: {
    solid: 'bg-tangerine text-slate',
    soft: 'bg-tangerine/10 text-tangerine-deep',
    fg: 'text-tangerine-deep',
    dot: 'bg-tangerine',
    ring: 'ring-tangerine',
    border: 'border-tangerine',
    fill: '#FF7A1A',
  },
  alert: {
    solid: 'bg-coral text-slate',
    soft: 'bg-coral/15 text-coral-deep',
    fg: 'text-coral-deep',
    dot: 'bg-coral',
    ring: 'ring-coral',
    border: 'border-coral',
    fill: '#FF6B57',
  },
  achievement: {
    solid: 'bg-gold text-slate',
    soft: 'bg-gold/20 text-gold-deep',
    fg: 'text-gold-deep',
    dot: 'bg-gold',
    ring: 'ring-gold',
    border: 'border-gold',
    fill: '#F5B90A',
  },
};
