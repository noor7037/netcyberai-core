// v3 (2026-09-25): navy/cyan/violet corrected to the founder's own
// directly-stated hex values for the real NetCyberAI logo, and `peach`
// added as the fourth stated brand anchor. This session has no logo
// image file anywhere in the repo, and none was attached to it -- the
// v2 values above were this session's own earlier visual read of a
// chat-attached image in a prior conversation, which the founder has
// now corrected directly; these four values are taken as given, not
// independently re-verified against pixels. Token NAMES are unchanged
// from v1/v2 (still a value-only change, not a rename) except `peach`,
// which is genuinely new -- no prior token represented this hue at all.
export const colors = {
  sapphire: '#002357', // "Navy" in the founder's own naming; was #0C2A63
  azure: '#016898', // computed midpoint between sapphire and cyan (40% toward cyan), for gradients and secondary buttons/hover -- a derived in-between tone, not itself one of the four stated brand anchors
  cyan: '#02CFF9', // was #00AEEF
  violet: '#4400F0', // was #4A2FE0
  peach: '#FFC590', // new -- the fourth stated brand anchor
  emerald: '#0F766E', // unchanged -- an internal-app success semantic, not part of the four-color brand anchor set, out of scope for this pass
  amber: '#F5820B', // unchanged -- an internal-app warning semantic, ditto
  gold: '#F5B90A', // unchanged -- an internal-app premium-badge semantic, ditto
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

// cyan/gold/peach need a SLATE-paired text variant (not a darkened
// self-variant, since darkening either enough to pass with white would
// no longer read as the intended hue).
export const onAccentColors = {
  onCyan: colors.slate, // v3 cyan (#02CFF9) vs slate: 7.87:1 (AAA). vs white: 1.86:1 (fails) -- never pair cyan with white text.
  onGold: colors.slate, // gold (#F5B90A) vs slate: 8.24:1 (AAA). vs white: 1.78:1 (fails badly) -- never pair gold with white text.
  onPeach: colors.slate, // peach (#FFC590) vs slate: 9.50:1 (AAA). vs white: 1.54:1 (fails badly) -- never pair peach with white text.
} as const;
