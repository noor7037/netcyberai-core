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
