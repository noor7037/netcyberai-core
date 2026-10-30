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
  saffronDeep: '#B4521A', // saffron as text or an outline on paper (4.76:1)
  teal: '#0F766E', // progress, a correct answer, the subject chip (white text 5.47:1)
  plum: '#6D28D9', // the tutor avatar, "Made by AI", AI marks (white text 7.10:1)
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
