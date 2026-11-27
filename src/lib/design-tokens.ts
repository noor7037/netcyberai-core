// v4 (2026-09-25): the full NetCyberAI spectrum, taken from the two logo
// artworks the founder supplied (the gradient wordmark and the
// illustrated school-ecosystem mark): navy, royal and electric blue,
// cyan, turquoise/teal, green, purple, violet, orange, coral, yellow and
// gold. v3's four stated anchors (sapphire/cyan/violet/peach) are kept
// unchanged; v4 only ADDS hues, it does not re-derive the existing ones.
//
// Every hue below has a documented pairing rule. Contrast ratios were
// computed with scripts/check_contrast.py's own contrast_ratio(), not
// estimated:
//   white text passes on: sapphire, midnight, royal, electric, azure,
//     emerald, grape, violet, and every `*-deep` variant.
//   slate text is REQUIRED on: cyan, turquoise, leaf, tangerine, coral,
//     sunshine, gold, peach (white on these is 1.4-2.8:1 and fails).
export const colors = {
  sapphire: '#002357', // navy -- trust, infrastructure, principal, administration
  midnight: '#061233', // darkest surface for dramatic dark sections (white text 18.8:1)
  azure: '#016898',
  royal: '#1D4ED8', // blue -- core product, dashboards, platform (white 6.70:1)
  electric: '#2563EB', // brighter product blue (white 5.17:1)
  cyan: '#02CFF9', // communication, connectivity, live status (slate 7.87:1)
  turquoise: '#14B8A6', // healthy state (slate 5.88:1)
  emerald: '#0F766E', // success / completed workflow, text-safe teal (white 5.47:1)
  leaf: '#22C55E', // green -- success fills (slate 6.42:1)
  grape: '#8B3DFF', // purple -- AI, intelligence, learning (white 4.99:1)
  violet: '#4400F0', // deep violet -- AI/analytics (white 8.39:1)
  tangerine: '#FF7A1A', // orange -- action, admissions, fees (slate 5.61:1)
  coral: '#FF6B57', // coral -- alerts, exceptions (slate 5.22:1)
  sunshine: '#FFD23F', // yellow -- achievement, growth (slate 10.13:1)
  gold: '#F5B90A', // gold -- recognition, Personal Best (slate 8.24:1)
  peach: '#FFC590',
  amber: '#F5820B',
  slate: '#1E293B',
  offWhite: '#F9FAFB',
} as const;

// Darkened, text-safe variants of the bright hues, for coloured TEXT on
// white/off-white (>= 4.5:1 each).
export const deepColors = {
  tangerineDeep: '#C2410C', // 5.18:1 on white
  coralDeep: '#B42318', // 6.57:1
  grapeDeep: '#6D28D9', // 7.10:1
  goldDeep: '#92400E', // 7.09:1
  royalDeep: '#1E3A8A', // 10.36:1
} as const;

// Semantic roles. Components pick a ROLE, never a raw hue, so colour
// always carries the same meaning across the site.
export const semanticColors = {
  trust: colors.sapphire, // principal, administration, infrastructure
  product: colors.royal, // dashboards, platform
  communication: colors.cyan, // parent messages, connectivity, live status
  success: colors.turquoise, // healthy state, completed workflow
  intelligence: colors.grape, // AI, analytics, learning
  action: colors.tangerine, // admissions, fees, required action
  alert: colors.coral, // exceptions
  achievement: colors.gold, // recognition, Personal Best, growth
} as const;

// Kept for existing callers (v2/v3 API).
export const accessibleTextColors = {
  emeraldText: '#0F766E',
  amberText: '#92400E',
} as const;

export const onAccentColors = {
  onCyan: colors.slate,
  onGold: colors.slate,
  onPeach: colors.slate,
} as const;

// Chart series colours (docs/19 §3.5, C131): a fixed order, never cycled.
// Validated with the dataviz validator (validate_palette.js, light surface
// #FFFFFF, 2026-10-07): lightness band, chroma floor, colour-blind
// separation (worst adjacent ΔE 15.4) and the normal-vision floor all PASS.
// Tangerine and turquoise sit under 3:1 on white, so every chart that uses
// them shows value labels and offers a table view. A 7th series is never a
// generated hue: it folds into "Other" (seriesColor).
export const chartSeries = [colors.royal, colors.tangerine, colors.turquoise, colors.grape, colors.azure, colors.violet] as const;
export const chartOther = colors.slate;
export function seriesColor(index: number): string {
  return chartSeries[index] ?? chartOther;
}

// Sequential (magnitude) ramp: one hue, light to dark, as royal at these
// opacities on the white surface. Validated with --ordinal: monotone
// lightness, visible steps, light end 2.16:1 against the surface.
export const sequentialRoyal = { color: colors.royal, steps: [0.45, 0.65, 0.85, 1] } as const;

// W10-3 (C412): the lesson identity, previewed on the Understand answer page only (the `.fam-lesson` root in
// src/app/(family)/family/family.css carries these same values as CSS variables; test/family/w10-3-identity.test.ts
// holds the two in step). Warm paper and near-black ink instead of white and slate, no dark blue; three accents with
// one meaning each; one soft tint per kind of section, each with a deep accent for its numbered badge (white numeral).
// Contrast, by scripts/check_contrast.py's own contrast_ratio(): ink on paper 16.2:1, on every tint >= 14.3:1; muted
// on every tint >= 6.3:1; white on every badge accent >= 5.9:1 (teal 5.47:1); ink on saffron 5.55:1.
export const lessonColors = {
  paper: '#FBF8F3', // the page
  card: '#FFFDF9', // a surface on the page or inside a tinted section
  ink: '#1C1B1A', // reading text and headings
  muted: '#4B5563', // secondary text (muted slate)
  line: '#E7E1D6', // hairlines on paper
  saffron: '#E8702A', // primary actions (ink text on it, never white)
  saffronDeep: '#C2410C', // saffron as text or an outline on paper (the founder's review, 30 Oct)
  teal: '#0F766E', // progress, a correct answer, the subject chip (white text 5.47:1)
  plum: '#6D28D9', // the tutor avatar, AI marks (white text 7.10:1)
} as const;

export type LessonTint = 'mint' | 'butter' | 'lilac' | 'blush' | 'sky';
export const lessonTints: Record<LessonTint, { tint: string; accent: string }> = {
  mint: { tint: '#E4F3EA', accent: '#0F766E' }, // explanation
  butter: { tint: '#FBF1D3', accent: '#8A5300' }, // worked example, key points
  lilac: { tint: '#EFE9FB', accent: '#6D28D9' }, // figure, diagram, mind map, timeline
  blush: { tint: '#FBE6E3', accent: '#B42318' }, // misconceptions and the check
  sky: { tint: '#E3EEF9', accent: '#0369A1' }, // steps, practice, videos
};

// Which tint each block kind wears. A kind not listed keeps the mint of an explanation.
export const LESSON_TINT_OF: Record<string, LessonTint> = {
  explanation: 'mint',
  worked_example: 'butter',
  key_points: 'butter',
  english_moment: 'butter',
  figure: 'lilac',
  board: 'lilac',
  diagram: 'lilac',
  mind_map: 'lilac',
  timeline: 'lilac',
  image: 'lilac',
  graph: 'lilac',
  number_line: 'lilac',
  fraction_model: 'lilac',
  geometry: 'lilac',
  simulation: 'lilac',
  check: 'blush',
  steps: 'sky',
  practice: 'sky',
  videos: 'sky',
  sources: 'sky',
};

// No web font is loaded anywhere in the repository, so the faces are the phone's own: a rounded display face where the
// phone has one (iOS), else its system sans at a heavier weight; the reading face is the app's existing stack.
export const lessonType = {
  display: 'ui-rounded, "SF Pro Rounded", "Segoe UI Variable Display", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Devanagari", sans-serif',
  text: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Devanagari", sans-serif',
  scale: { answer: '1.375rem', h1: '2.25rem', h2: '1.25rem', body: '1.0625rem', small: '0.875rem' },
} as const;

// 8-point spacing, 16 px card radii, and the one entry/feedback duration (off under prefers-reduced-motion).
export const lessonShape = { space: 8, radius: 16, enterMs: 180 } as const;

// C513: the Draw tab's art table. Five soft paints for its surfaces and tool blocks (bg-art-coral, ...), each with ink
// text (lessonColors.ink), and the table under the paper. Contrast, by scripts/check_contrast.py's contrast_ratio(): ink
// on coral 10.4:1, on sky 11.9:1, on mint 13.4:1, on butter 15.1:1, on lavender 11.5:1, on the table 14.6:1.
export const artColors = {
  coral: '#FFB4A2',
  sky: '#A9D6F5',
  mint: '#B8E6CF',
  butter: '#FFE7A3',
  lavender: '#D9CCF6',
  table: '#F4EADB',
} as const;

// ---- School app themes and dark mode (C553) ---------------------------------------------------------------------------
// The school app (principal, office, teachers) only: the Family app, the website, Control and every printed or PDF
// document stay as they are. A theme swaps the brand hues the app's classes use (bg-sapphire, text-royal, …) through
// CSS variables, so no screen is rewritten; dark mode swaps the surfaces, the text and the text-safe tints. Every pair a
// screen shows is checked for contrast in each theme and mode (test/theme/school-themes.test.ts).
export const SCHOOL_THEME_IDS = ['classic', 'emerald', 'royal'] as const;
export type SchoolThemeId = (typeof SCHOOL_THEME_IDS)[number];
export const SCHOOL_MODE_IDS = ['light', 'dark', 'system'] as const;
export type SchoolModeId = (typeof SCHOOL_MODE_IDS)[number];

type ThemeHues = {
  sapphire: string; // primary buttons and the deepest brand surface (white text)
  midnight: string; // the dashboard band (white text)
  royal: string; // the product colour: links, active states, primary chips (white text on it; text on white)
  electric: string;
  azure: string;
  chart: readonly [string, string, string, string, string, string];
  // Text-safe tints of the brand hues on the dark surface (dark mode).
  darkText: { sapphire: string; royal: string; azure: string; electric: string };
};

export const schoolThemes: Record<SchoolThemeId, ThemeHues> = {
  // Today's NetCyberAI blue.
  classic: {
    sapphire: colors.sapphire,
    midnight: colors.midnight,
    royal: colors.royal,
    electric: colors.electric,
    azure: colors.azure,
    chart: [colors.royal, colors.tangerine, colors.turquoise, colors.grape, colors.azure, colors.violet],
    darkText: { sapphire: '#BFDBFE', royal: '#93C5FD', azure: '#7DD3FC', electric: '#93C5FD' },
  },
  // Calm green and teal.
  emerald: {
    sapphire: '#064E3B',
    midnight: '#022C22',
    royal: '#047857',
    electric: '#05805A', // white text 4.95:1
    azure: '#0E7490',
    chart: ['#047857', '#F59E0B', '#0EA5E9', '#7C3AED', '#E11D48', '#65A30D'],
    darkText: { sapphire: '#A7F3D0', royal: '#6EE7B7', azure: '#67E8F9', electric: '#6EE7B7' },
  },
  // Deep plum with gold.
  royal: {
    sapphire: '#3B0764',
    midnight: '#1E0436',
    royal: '#6D28D9',
    electric: '#7C3AED',
    azure: '#9333EA',
    chart: ['#6D28D9', '#D97706', '#DB2777', '#0891B2', '#059669', '#4F46E5'],
    darkText: { sapphire: '#E9D5FF', royal: '#C4B5FD', azure: '#D8B4FE', electric: '#C4B5FD' },
  },
};

// Dark mode, the same for every theme: surfaces, text, lines, and text-safe tints of the shared accent hues.
export const schoolDark = {
  page: '#0B1220', // the page (bg-off-white)
  surface: '#141C2E', // cards, inputs, bars (bg-white)
  text: '#E2E8F0', // body text (text-slate) and the hairlines drawn in it (border-slate/10)
  chartGrid: '#334155',
  chartText: '#CBD5E1',
  textTints: { emerald: '#5EEAD4', grape: '#C4B5FD', tangerine: '#FDBA74', coral: '#FCA5A5', violet: '#C4B5FD', turquoise: '#5EEAD4', cyan: '#67E8F9', amber: '#FCD34D', gold: '#FCD34D' },
} as const;
