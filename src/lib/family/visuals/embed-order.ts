// The order embedded simulation sources are preferred in (Noor, 16 Nov 2026). Free of any server code. A source whose pages block
// embedding is not seeded at all (HHMI BioInteractive's were refused on the day this was built).
export const EMBED_FIRST = ['phet', 'geogebra', 'nasa_eyes', 'hhmi'] as const;
export const EMBED_NEXT = ['labxchange', 'concord', 'desmos', 'smithsonian3d', 'googlearts'] as const;
export const EMBED_LAST = ['wolfram'] as const;
export const EMBED_ORDER: readonly string[] = [...EMBED_FIRST, ...EMBED_NEXT, ...EMBED_LAST];
