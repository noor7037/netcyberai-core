// v2 (2026-09-25): brand palette re-derived from the founder-approved
// final NetCyberAI wordmark (actual measured pixel colors, tuned only as
// far as WCAG required -- see docs/10_DECISION_LOG.md for the full
// contrast table). Token NAMES are unchanged from v1 -- this is a
// value-only rebrand, not a rename, so nothing that already references
// `sapphire`/`emerald`/`amber` needed to change. `azure`, `cyan`,
// `violet` and `gold` are new hues the wordmark carries that had no
// prior name. `danger` (defined below, not part of this palette) is
// deliberately NOT re-derived from the wordmark -- see its own comment.
export const colors = {
  sapphire: '#0C2A63', // was #0F4C81 -- primary navy, measured from the wordmark's letter body
  azure: '#0A5FDB', // new -- the wordmark's brighter mid-blue; secondary buttons, links, hover states
  cyan: '#00AEEF', // new -- informational accent (info banners, secondary badges)
  violet: '#4A2FE0', // new -- reserved for AI-touched surfaces only (Daily Pulse, AI-governance disclosures), never a general UI color
  emerald: '#0F766E', // was #10B981 -- teal-leaning, measured from the wordmark's leaf accent; still reads as success/green
  amber: '#F5820B', // was #F59E0B -- orange-leaning, measured from the wordmark's swoosh; still reads as warning/attention
  gold: '#F5B90A', // new -- rationed to real premium/highlight moments (founding-school badge, top recognition tier), never a base UI color
  slate: '#1E293B',
  offWhite: '#F9FAFB',
} as const;

// The raw emerald/amber/cyan/amber/gold tokens above fail WCAG AA as
// TEXT color on white/off-white, or as white text on the raw fill --
// confirmed by scripts/check_contrast.py. Cyan and gold in particular
// fail badly with white text (2.53:1 and 1.78:1). These are the same
// hue families, darkened (or, for cyan/gold, always paired with slate
// rather than darkened, since darkening enough to pass would drift the
// hue past recognition) only as far as needed to clear 4.5:1. Never use
// `emerald`/`amber`/`cyan`/`gold` directly as a text color or as a
// background with white text without checking this table first.
export const accessibleTextColors = {
  emeraldText: '#0F766E', // v2: emerald's own v2 value now passes AA (5.47:1) with WHITE text directly -- unlike v1, no darkened variant needed. Kept as an alias for callers that still reference emeraldText.
  amberText: '#92400E', // unchanged darkened variant -- v2 amber (#F5820B) still fails with white (2.60:1); slate (5.63:1) or this darkened text variant both clear AA.
} as const;

// v3 additions alongside the v2 rebrand: cyan/gold need a SLATE-paired
// text variant (not a darkened self-variant, since darkening either
// enough to pass with white would no longer read as the intended hue).
export const onAccentColors = {
  onCyan: colors.slate, // cyan (#00AEEF) vs slate: 5.78:1 (AA). vs white: 2.53:1 (fails) -- never pair cyan with white text.
  onGold: colors.slate, // gold (#F5B90A) vs slate: 8.24:1 (AAA). vs white: 1.78:1 (fails badly) -- never pair gold with white text.
} as const;
