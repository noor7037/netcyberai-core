// One colour per subject (D1, C230-Q; docs/family-app/09 §2): a child knows the subject before reading it. Each tile
// is a gradient between two logo tokens that both carry white text at AA (design-tokens.ts: royal, electric, sapphire,
// midnight, azure, emerald, grape, violet and every `*-deep`), so scripts/check_contrast.py passes on either stop.
// The class strings are literal so Tailwind keeps them. Safe for the phone: no database or message file here.
import type { Subject } from './subjects';

export type SubjectTheme = {
  tile: string; // the tile's gradient
  chip: string; // a selected chip or a badge, solid
  soft: string; // a light tint behind an icon on white
  ink: string; // coloured text on white (AA)
  glyph: { path?: string; text?: string };
};

const T = (tile: string, chip: string, soft: string, ink: string, glyph: SubjectTheme['glyph']): SubjectTheme => ({ tile, chip, soft, ink, glyph });

export const SUBJECT_THEME: Record<Subject, SubjectTheme> = {
  mathematics: T('bg-gradient-to-br from-royal to-electric', 'bg-royal', 'bg-royal/10', 'text-royal-deep', { path: 'M7 4v6M4 7h6M14 7h6M15 15l4 4M19 15l-4 4M4 17h6' }),
  science: T('bg-gradient-to-br from-emerald to-azure', 'bg-emerald', 'bg-emerald/10', 'text-emerald-text', { path: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9' }),
  evs: T('bg-gradient-to-br from-emerald to-royal-deep', 'bg-emerald', 'bg-emerald/10', 'text-emerald-text', { path: 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7' }),
  social_science: T('bg-gradient-to-br from-tangerine-deep to-coral-deep', 'bg-tangerine-deep', 'bg-tangerine/15', 'text-tangerine-deep', { path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18' }),
  english: T('bg-gradient-to-br from-grape to-violet', 'bg-grape', 'bg-grape/10', 'text-grape-deep', { text: 'Aa' }),
  hindi: T('bg-gradient-to-br from-coral-deep to-grape-deep', 'bg-coral-deep', 'bg-coral/15', 'text-coral-deep', { text: 'अ' }),
  sanskrit: T('bg-gradient-to-br from-gold-deep to-tangerine-deep', 'bg-gold-deep', 'bg-gold/20', 'text-gold-deep', { text: 'सं' }),
  physics: T('bg-gradient-to-br from-violet to-royal', 'bg-violet', 'bg-violet/10', 'text-royal-deep', { path: 'M12 12m-1.6 0a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0M3 12c0-2.5 4-4.5 9-4.5s9 2 9 4.5-4 4.5-9 4.5-9-2-9-4.5zM7.5 4.2c2.2-1.2 5.5 1.3 7.5 5.6s1.7 8.6-.5 9.8-5.5-1.3-7.5-5.6-1.7-8.6.5-9.8z' }),
  chemistry: T('bg-gradient-to-br from-azure to-emerald', 'bg-azure', 'bg-azure/10', 'text-azure', { path: 'M10 3h4M11 3v5l-6 10a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-6-10V3M9 14h6M10 17.5h.01M14 16.5h.01' }),
  biology: T('bg-gradient-to-br from-emerald to-sapphire', 'bg-emerald', 'bg-emerald/10', 'text-emerald-text', { path: 'M7 3c0 6 10 6 10 12M17 3c0 6-10 6-10 12M7 21c0-2 1-3 3-4M17 21c0-2-1-3-3-4M8 7h8M8 11h8' }),
  accountancy: T('bg-gradient-to-br from-sapphire to-royal', 'bg-sapphire', 'bg-sapphire/10', 'text-royal-deep', { path: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3' }),
  business_studies: T('bg-gradient-to-br from-royal-deep to-violet', 'bg-royal-deep', 'bg-royal/10', 'text-royal-deep', { path: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16' }),
  economics: T('bg-gradient-to-br from-azure to-sapphire', 'bg-azure', 'bg-azure/10', 'text-azure', { path: 'M4 20h16M7 16v-4M12 16V8M17 16v-7' }),
  history: T('bg-gradient-to-br from-tangerine-deep to-gold-deep', 'bg-tangerine-deep', 'bg-tangerine/15', 'text-tangerine-deep', { path: 'M4 20h16M5 9h14M6 9v9M10 9v9M14 9v9M18 9v9M3 9l9-5 9 5' }),
  geography: T('bg-gradient-to-br from-emerald to-azure', 'bg-emerald', 'bg-emerald/10', 'text-emerald-text', { path: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' }),
  political_science: T('bg-gradient-to-br from-coral-deep to-sapphire', 'bg-coral-deep', 'bg-coral/15', 'text-coral-deep', { path: 'M12 3v4M8 7h8l2 4H6zM7 11v8M12 11v8M17 11v8M4 20h16' }),
  computer_science: T('bg-gradient-to-br from-midnight to-violet', 'bg-midnight', 'bg-violet/10', 'text-royal-deep', { path: 'M4 5h16v11H4zM9 20h6M12 16v4M9 9l-2 2 2 2M15 9l2 2-2 2' }),
  informatics_practices: T('bg-gradient-to-br from-midnight to-azure', 'bg-midnight', 'bg-azure/10', 'text-azure', { path: 'M4 6h16M4 12h16M4 18h10M18 16l2 2-2 2' }),
  psychology: T('bg-gradient-to-br from-grape-deep to-coral-deep', 'bg-grape-deep', 'bg-grape/10', 'text-grape-deep', { path: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z' }),
  sociology: T('bg-gradient-to-br from-violet to-grape-deep', 'bg-violet', 'bg-violet/10', 'text-grape-deep', { path: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M12 20a6 6 0 0 1 10 0' }),
};

export const subjectTheme = (s: string): SubjectTheme => SUBJECT_THEME[s as Subject] ?? SUBJECT_THEME.mathematics;
