// Every outside picture, 3D, animation and simulation source's free-use limits, in one place (v21, 16 Nov 2026). The
// gate (limits.ts) counts each source's calls in the shared table content.visual_source_usage and skips a source BEFORE
// it reaches a limit here, so every limit is set a little under the provider's own. Sources that share one key share a
// `bucket` (the api.data.gov key serves Smithsonian photos and Smithsonian 3D). `keys`: the environment names, any one of
// which is enough; a source with keys and none set is skipped quietly and logged once. Server only.
//
// Checked against the providers' own pages on 2026-11-16:
// - Unsplash: https://unsplash.com/documentation ("demo mode ... 50 requests per hour"; production 1,000 per hour).
// - Pexels: https://www.pexels.com/api/documentation/ ("200 requests per hour and 20,000 requests per month").
// - Pixabay: https://pixabay.com/api/docs/ ("up to 100 requests per 60 seconds"; "requests must be cached for 24 hours").
// - api.data.gov (Smithsonian Open Access): https://api.data.gov/docs/developer-manual/ ("1,000 requests per hour").
// - Openverse: https://api.openverse.org/v1/ names anonymous throttling but publishes no figure; conservative default.
// - Sketchfab: https://docs.sketchfab.com/data-api/v3/ says only that it throttles (429); conservative default.
// - Poly Pizza, LottieFiles: no published figure found; conservative defaults until a key and its terms are in hand.
// - iNaturalist (https://www.inaturalist.org/pages/api+recommended+practices) and the Art Institute of Chicago
//   (https://api.artic.edu/docs/) refused the checker's fetch (403) on 2026-11-16; their long-known guidance (iNaturalist
//   about 60 a minute and 10,000 a day; AIC 60 a minute) is kept with a margin.
// - Wikimedia Commons, NASA Images, Wellcome, PubChem (5 a second), RCSB: polite-use defaults.

export type SourceLimit = {
  perMinute?: number;
  perHour?: number;
  perDay?: number;
  perMonth?: number;
  // The counter the source draws on (default: its own id).
  bucket?: string;
  keys?: readonly string[];
};

const KEYLESS: SourceLimit = { perMinute: 30, perHour: 600 };
const KEYED_UNKNOWN: SourceLimit = { perMinute: 5, perHour: 50, perDay: 500 };

export const SOURCE_LIMITS: Readonly<Record<string, SourceLimit>> = {
  // Photographs.
  commons: { perMinute: 60, perHour: 1500 },
  openverse: { perMinute: 15, perHour: 150, perDay: 1500 },
  nasa: KEYLESS,
  wellcome: KEYLESS,
  aic: { perMinute: 50, perHour: 1500 },
  inaturalist: { perMinute: 50, perHour: 1500, perDay: 9000 },
  pexels: { perHour: 190, perMonth: 19_500, keys: ['PEXELS_API_KEY'] },
  pixabay: { perMinute: 90, perHour: 3000, keys: ['PIXABAY_API_KEY'] },
  smithsonian: { perHour: 950, bucket: 'datagov', keys: ['SMITHSONIAN_API_KEY', 'DATA_GOV_API_KEY'] },
  unsplash: { perHour: 45, keys: ['UNSPLASH_ACCESS_KEY'] },
  // 3D.
  pubchem: { perMinute: 200, perHour: 3000 },
  pdb: KEYLESS,
  nasa3d: KEYLESS,
  smithsonian3d: { perHour: 950, bucket: 'datagov', keys: ['SMITHSONIAN_API_KEY', 'DATA_GOV_API_KEY'] },
  sketchfab: { ...KEYED_UNKNOWN, keys: ['SKETCHFAB_TOKEN'] },
  polypizza: { ...KEYED_UNKNOWN, keys: ['POLY_PIZZA_API_KEY'] },
  // Animations.
  lottie: { ...KEYED_UNKNOWN, keys: ['LOTTIEFILES_API_KEY'] },
};

// A source not listed above: the keyless default (a keyed source must be listed, with its key names).
export const limitFor = (source: string): SourceLimit => SOURCE_LIMITS[source] ?? KEYLESS;
export const bucketOf = (source: string): string => limitFor(source).bucket ?? source;

// A 429 with no Retry-After pauses the source this long; a Retry-After beyond a day is held to a day.
export const PAUSE_DEFAULT_S = 15 * 60;
export const PAUSE_MAX_S = 24 * 60 * 60;
// Outside calls one answer may make in all (every step, every source, photographs and 3D together).
export const ANSWER_CALL_CAP = 24;
// The shared cache: a found picture or model for 24 hours (Pixabay's terms ask for exactly that), a miss for one hour.
export const CACHE_HIT_S = 24 * 60 * 60;
export const CACHE_MISS_S = 60 * 60;

// The order 3D sources are asked (the adapters implement them): the free scientific ones, then the keyed ones.
export const MODEL3D_ORDER = ['pubchem', 'pdb', 'nasa3d', 'smithsonian3d', 'sketchfab', 'polypizza'] as const;
// Keyed photograph sources, asked after every free keyless one fitting the query, Unsplash last.
export const PHOTO_KEYED_ORDER = ['pexels', 'pixabay', 'smithsonian', 'unsplash'] as const;
