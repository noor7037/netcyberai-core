// One colour per subject (D1, C230-Q; docs/family-app/09 §2), from the lesson identity (W12-E, C419): a child knows the
// subject before reading it. Every subject wears one of six palettes, the five lesson tints (mint, butter, lilac,
// blush, sky; src/lib/design-tokens.ts `lessonTints`) and saffron. No gradient and no dark blue. The mapping is fixed
// per subject, so Home, Study, the chips and the drawings all show the same colour, and the subjects a class studies
// together take different palettes where six allow it.
// The class strings are literal so Tailwind keeps them (tailwind.config.ts `lesson`). Safe for the phone: no database or
// message file here.
import { lessonColors, lessonTints, type LessonTint } from '@/lib/design-tokens';
import type { Subject } from './subjects';

export type SubjectTheme = {
  tile: string; // the Home tile: the tint, with ink text (AA)
  chip: string; // a selected chip, a badge or an icon: the solid accent, with its own text colour (AA)
  soft: string; // the tint behind an icon on white
  ink: string; // coloured text on white or on the tint (AA)
  hex: string; // the solid accent as a hex, for a drawing
  glyph: { path?: string; text?: string };
};

type Palette = Pick<SubjectTheme, 'tile' | 'chip' | 'soft' | 'ink' | 'hex'>;

// Written out whole so the class strings stay literal.
export const PALETTE = {
  mint: { tile: 'bg-lesson-mint text-ink', chip: 'bg-lesson-mint-deep text-white', soft: 'bg-lesson-mint', ink: 'text-lesson-mint-deep', hex: lessonTints.mint.accent },
  butter: { tile: 'bg-lesson-butter text-ink', chip: 'bg-lesson-butter-deep text-white', soft: 'bg-lesson-butter', ink: 'text-lesson-butter-deep', hex: lessonTints.butter.accent },
  lilac: { tile: 'bg-lesson-lilac text-ink', chip: 'bg-lesson-lilac-deep text-white', soft: 'bg-lesson-lilac', ink: 'text-lesson-lilac-deep', hex: lessonTints.lilac.accent },
  blush: { tile: 'bg-lesson-blush text-ink', chip: 'bg-lesson-blush-deep text-white', soft: 'bg-lesson-blush', ink: 'text-lesson-blush-deep', hex: lessonTints.blush.accent },
  sky: { tile: 'bg-lesson-sky text-ink', chip: 'bg-lesson-sky-deep text-white', soft: 'bg-lesson-sky', ink: 'text-lesson-sky-deep', hex: lessonTints.sky.accent },
  saffron: { tile: 'bg-saffron text-ink', chip: 'bg-saffron text-ink', soft: 'bg-saffron/10', ink: 'text-saffron-deep', hex: lessonColors.saffronDeep },
} as const satisfies Record<LessonTint | 'saffron', Palette>;

export type PaletteName = keyof typeof PALETTE;

const T = (palette: PaletteName, glyph: SubjectTheme['glyph']): SubjectTheme => ({ ...PALETTE[palette], glyph });

export const SUBJECT_THEME: Record<Subject, SubjectTheme> = {
  mathematics: T('sky', { path: 'M7 4v6M4 7h6M14 7h6M15 15l4 4M19 15l-4 4M4 17h6' }),
  science: T('mint', { path: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9' }),
  evs: T('mint', { path: 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19l7-7' }),
  social_science: T('butter', { path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18' }),
  english: T('lilac', { text: 'Aa' }),
  hindi: T('blush', { text: 'अ' }),
  sanskrit: T('saffron', { text: 'सं' }),
  physics: T('saffron', { path: 'M12 12m-1.6 0a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0M3 12c0-2.5 4-4.5 9-4.5s9 2 9 4.5-4 4.5-9 4.5-9-2-9-4.5zM7.5 4.2c2.2-1.2 5.5 1.3 7.5 5.6s1.7 8.6-.5 9.8-5.5-1.3-7.5-5.6-1.7-8.6.5-9.8z' }),
  chemistry: T('blush', { path: 'M10 3h4M11 3v5l-6 10a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-6-10V3M9 14h6M10 17.5h.01M14 16.5h.01' }),
  biology: T('mint', { path: 'M7 3c0 6 10 6 10 12M17 3c0 6-10 6-10 12M7 21c0-2 1-3 3-4M17 21c0-2-1-3-3-4M8 7h8M8 11h8' }),
  accountancy: T('butter', { path: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3' }),
  business_studies: T('blush', { path: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16' }),
  economics: T('saffron', { path: 'M4 20h16M7 16v-4M12 16V8M17 16v-7' }),
  history: T('butter', { path: 'M4 20h16M5 9h14M6 9v9M10 9v9M14 9v9M18 9v9M3 9l9-5 9 5' }),
  geography: T('mint', { path: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' }),
  political_science: T('blush', { path: 'M12 3v4M8 7h8l2 4H6zM7 11v8M12 11v8M17 11v8M4 20h16' }),
  computer_science: T('mint', { path: 'M4 5h16v11H4zM9 20h6M12 16v4M9 9l-2 2 2 2M15 9l2 2-2 2' }),
  informatics_practices: T('mint', { path: 'M4 6h16M4 12h16M4 18h10M18 16l2 2-2 2' }),
  psychology: T('sky', { path: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z' }),
  sociology: T('lilac', { path: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a6 6 0 0 1 12 0M12 20a6 6 0 0 1 10 0' }),
};

export const subjectTheme = (s: string): SubjectTheme => SUBJECT_THEME[s as Subject] ?? SUBJECT_THEME.mathematics;
