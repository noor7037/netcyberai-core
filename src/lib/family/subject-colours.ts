import { colors, deepColors } from '@/lib/design-tokens';
import type { Subject } from './subjects';

// One colour per subject (docs/family-app/09 §2; D1, C291), used everywhere a subject appears: chips and tabs, a card's
// top edge, a header, the plan and progress, so a child knows the subject before reading. Only design tokens; every
// text pairing is AA (white on the deep hues, slate on the bright ones, a deep variant for coloured text on white;
// scripts/check_contrast.py reads these strings). Subjects a class studies together never share a colour
// (test/d1/subject-colours.test.ts). Class names are written out whole so the CSS build finds them.

export type SubjectColour = {
  hex: string; // the hue, for SVG and charts
  bar: string; // an edge or a progress fill
  chip: string; // a filled chip or tab: background with its text colour
  soft: string; // a tinted panel with slate text
  text: string; // the subject's colour as text on white
  ring: string; // a focus or selected ring
  header: string; // a header band: gradient with its text colour
};

export const SUBJECT_COLOURS: Record<Subject, SubjectColour> = {
  mathematics: { hex: colors.royal, bar: 'bg-royal', chip: 'bg-royal text-white', soft: 'bg-royal/10 text-slate', text: 'text-royal-deep', ring: 'ring-royal', header: 'bg-royal bg-gradient-to-br from-royal to-electric text-white' },
  science: { hex: colors.emerald, bar: 'bg-emerald', chip: 'bg-emerald text-white', soft: 'bg-emerald/10 text-slate', text: 'text-emerald-text', ring: 'ring-emerald', header: 'bg-emerald bg-gradient-to-br from-emerald to-azure text-white' },
  evs: { hex: colors.leaf, bar: 'bg-leaf', chip: 'bg-leaf text-slate', soft: 'bg-leaf/15 text-slate', text: 'text-emerald-text', ring: 'ring-leaf', header: 'bg-leaf bg-gradient-to-br from-leaf to-turquoise text-slate' },
  social_science: { hex: colors.tangerine, bar: 'bg-tangerine', chip: 'bg-tangerine text-slate', soft: 'bg-tangerine/10 text-slate', text: 'text-tangerine-deep', ring: 'ring-tangerine', header: 'bg-tangerine bg-gradient-to-br from-tangerine to-gold text-slate' },
  english: { hex: colors.grape, bar: 'bg-grape', chip: 'bg-grape text-white', soft: 'bg-grape/10 text-slate', text: 'text-grape-deep', ring: 'ring-grape', header: 'bg-grape bg-gradient-to-br from-grape to-violet text-white' },
  hindi: { hex: colors.coral, bar: 'bg-coral', chip: 'bg-coral text-slate', soft: 'bg-coral/10 text-slate', text: 'text-coral-deep', ring: 'ring-coral', header: 'bg-coral bg-gradient-to-br from-coral to-peach text-slate' },
  sanskrit: { hex: colors.amber, bar: 'bg-amber', chip: 'bg-amber text-slate', soft: 'bg-amber/10 text-slate', text: 'text-amber-text', ring: 'ring-amber', header: 'bg-amber bg-gradient-to-br from-amber to-gold text-slate' },
  physics: { hex: colors.azure, bar: 'bg-azure', chip: 'bg-azure text-white', soft: 'bg-azure/10 text-slate', text: 'text-azure', ring: 'ring-azure', header: 'bg-azure bg-gradient-to-br from-azure to-royal text-white' },
  chemistry: { hex: colors.turquoise, bar: 'bg-turquoise', chip: 'bg-turquoise text-slate', soft: 'bg-turquoise/10 text-slate', text: 'text-emerald-text', ring: 'ring-turquoise', header: 'bg-turquoise bg-gradient-to-br from-turquoise to-cyan text-slate' },
  biology: { hex: colors.leaf, bar: 'bg-leaf', chip: 'bg-leaf text-slate', soft: 'bg-leaf/15 text-slate', text: 'text-emerald-text', ring: 'ring-leaf', header: 'bg-leaf bg-gradient-to-br from-leaf to-turquoise text-slate' },
  accountancy: { hex: colors.sapphire, bar: 'bg-sapphire', chip: 'bg-sapphire text-white', soft: 'bg-sapphire/10 text-slate', text: 'text-sapphire', ring: 'ring-sapphire', header: 'bg-sapphire bg-gradient-to-br from-sapphire to-royal text-white' },
  business_studies: { hex: colors.violet, bar: 'bg-violet', chip: 'bg-violet text-white', soft: 'bg-violet/10 text-slate', text: 'text-violet', ring: 'ring-violet', header: 'bg-violet bg-gradient-to-br from-violet to-grape text-white' },
  economics: { hex: colors.gold, bar: 'bg-gold', chip: 'bg-gold text-slate', soft: 'bg-gold/15 text-slate', text: 'text-gold-deep', ring: 'ring-gold', header: 'bg-gold bg-gradient-to-br from-gold to-sunshine text-slate' },
  history: { hex: colors.peach, bar: 'bg-peach', chip: 'bg-peach text-slate', soft: 'bg-peach/25 text-slate', text: 'text-gold-deep', ring: 'ring-peach', header: 'bg-peach bg-gradient-to-br from-peach to-tangerine text-slate' },
  geography: { hex: colors.emerald, bar: 'bg-emerald', chip: 'bg-emerald text-white', soft: 'bg-emerald/10 text-slate', text: 'text-emerald-text', ring: 'ring-emerald', header: 'bg-emerald bg-gradient-to-br from-emerald to-sapphire text-white' },
  political_science: { hex: colors.tangerine, bar: 'bg-tangerine', chip: 'bg-tangerine text-slate', soft: 'bg-tangerine/10 text-slate', text: 'text-tangerine-deep', ring: 'ring-tangerine', header: 'bg-tangerine bg-gradient-to-br from-tangerine to-coral text-slate' },
  computer_science: { hex: colors.cyan, bar: 'bg-cyan', chip: 'bg-cyan text-slate', soft: 'bg-cyan/15 text-slate', text: 'text-azure', ring: 'ring-cyan', header: 'bg-cyan bg-gradient-to-br from-cyan to-turquoise text-slate' },
  informatics_practices: { hex: colors.electric, bar: 'bg-electric', chip: 'bg-electric text-white', soft: 'bg-electric/10 text-slate', text: 'text-royal-deep', ring: 'ring-electric', header: 'bg-electric bg-gradient-to-br from-electric to-violet text-white' },
  psychology: { hex: colors.sunshine, bar: 'bg-sunshine', chip: 'bg-sunshine text-slate', soft: 'bg-sunshine/25 text-slate', text: 'text-gold-deep', ring: 'ring-sunshine', header: 'bg-sunshine bg-gradient-to-br from-sunshine to-gold text-slate' },
  sociology: { hex: colors.amber, bar: 'bg-amber', chip: 'bg-amber text-slate', soft: 'bg-amber/10 text-slate', text: 'text-amber-text', ring: 'ring-amber', header: 'bg-amber bg-gradient-to-br from-amber to-peach text-slate' },
};

// A subject's colour; a subject the app does not know takes Mathematics' blue rather than nothing.
export const subjectColour = (subject: string | null | undefined): SubjectColour => SUBJECT_COLOURS[subject as Subject] ?? SUBJECT_COLOURS.mathematics;

// The deep hue as a hex, for an SVG stroke or a chart on white.
export const subjectDeepHex = (subject: string) => {
  const c = subjectColour(subject).hex;
  const deep: Record<string, string> = { [colors.royal]: deepColors.royalDeep, [colors.grape]: deepColors.grapeDeep, [colors.tangerine]: deepColors.tangerineDeep, [colors.coral]: deepColors.coralDeep, [colors.gold]: deepColors.goldDeep };
  return deep[c] ?? c;
};
