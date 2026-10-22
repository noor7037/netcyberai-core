// The YouTube Data API v3 (docs/family-app/03 §8; M2-5, C279): the video finder's content adapter. Not a text model:
// it is never a choice for an AI profile, and nothing a child typed or said ever reaches it. A search sends a topic's
// title with its subject and class words, built by the server from the catalog (src/lib/family/videos.ts).
//
// The key is handed in already opened by the platform and goes in the X-Goog-Api-Key header, so no request address
// carries it. Nothing is stored, logged or thrown: a failure says only what kind it was. The description is read here
// for its chapter timestamps and dropped; only ids, titles, the duration, the language and the flags leave this file.

const BASE = 'https://www.googleapis.com/youtube/v3';
const TIMEOUT_MS = 10_000;

export type VideoKind = 'official' | 'approved' | 'blocked';
export type VideoChapter = { s: number; title: string };
export type VideoCandidate = {
  videoId: string;
  channelId: string;
  channelTitle: string;
  title: string;
  durationS: number;
  captions: boolean;
  embeddable: boolean;
  madeForKids: boolean;
  isPublic: boolean;
  ageRestricted: boolean;
  language: string | null;
  chapters: VideoChapter[];
};
export type VideoSearch = { query: string; language: 'en' | 'hi'; channelId?: string; maxResults?: number };
export type VideoFailure = 'http' | 'network' | 'bad_answer';
type Got<T> = { ok: true; value: T } | { ok: false; failure: VideoFailure; status?: number };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const CHANNEL_ID = /^[A-Za-z0-9_-]{2,40}$/;

// Google API keys: "AIza" and 35 more characters.
export const youtubeKeyLooksRight = (key: string) => /^AIza[0-9A-Za-z_-]{35}$/.test(key);

// ISO-8601 durations as the API gives them: PT1H2M3S, PT45S, P1DT2H. Anything else (a live stream's P0D) is 0.
export function parseDuration(iso: unknown): number {
  if (typeof iso !== 'string') return 0;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return 0;
  const [d, h, min, s] = m.slice(1).map((v) => Number(v ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

const clock = (t: string): number | null => {
  const parts = t.split(':').map(Number);
  if (parts.some((p) => !Number.isInteger(p) || p < 0) || parts.length < 2 || parts.length > 3) return null;
  const [a, b, c] = parts;
  if (parts.length === 2) return b < 60 ? a * 60 + b : null;
  return b < 60 && c < 60 ? a * 3600 + b * 60 + c : null;
};

// Chapter timestamps from a description, as YouTube reads them: a line that starts (or ends) with 0:00, 1:23 or
// 1:02:03 and has a title beside it. The first chapter must start at 0:00 and the times must rise, or there are none.
export function parseChapters(description: unknown): VideoChapter[] {
  if (typeof description !== 'string') return [];
  const out: VideoChapter[] = [];
  for (const raw of description.split(/\r?\n/).slice(0, 300)) {
    const line = raw.trim();
    const m = /^[([]?(\d{1,2}(?::\d{2}){1,2})[)\]]?\s*[-–—:|.)]?\s*(.{2,120})$/.exec(line) ?? /^(.{2,120}?)\s*[-–—:|(]?\s*(\d{1,2}(?::\d{2}){1,2})\)?$/.exec(line);
    if (!m) continue;
    const [time, title] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
    const s = clock(time);
    const name = title.replace(/\s+/g, ' ').trim();
    if (s === null || !name || /^\d/.test(name)) continue;
    if (out.length && s <= out[out.length - 1].s) continue;
    out.push({ s, title: name.slice(0, 120) });
  }
  return out.length >= 2 && out[0].s === 0 ? out : [];
}

async function get(path: string, params: Record<string, string>, apiKey: string): Promise<Got<Record<string, unknown>>> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}?${new URLSearchParams(params).toString()}`, { headers: { 'X-Goog-Api-Key': apiKey, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return { ok: false, failure: 'network' };
  }
  if (!res.ok) return { ok: false, failure: 'http', status: res.status };
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return body && typeof body === 'object' ? { ok: true, value: body } : { ok: false, failure: 'bad_answer' };
}

const items = (body: Record<string, unknown>) => (Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : []);
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

// search.list: embeddable videos only, strict safe search, Indian region, the child's language; one channel when given.
export async function searchVideoIds(apiKey: string, s: VideoSearch): Promise<Got<string[]>> {
  const params: Record<string, string> = {
    part: 'id',
    type: 'video',
    videoEmbeddable: 'true',
    safeSearch: 'strict',
    relevanceLanguage: s.language,
    regionCode: 'IN',
    maxResults: String(Math.min(Math.max(1, s.maxResults ?? 10), 10)),
    q: s.query.slice(0, 200),
  };
  if (s.channelId && CHANNEL_ID.test(s.channelId)) params.channelId = s.channelId;
  const got = await get('search', params, apiKey);
  if (!got.ok) return got;
  const ids = items(got.value).map((i) => obj(i.id).videoId).filter((v): v is string => typeof v === 'string' && VIDEO_ID.test(v));
  return { ok: true, value: Array.from(new Set(ids)) };
}

// videos.list: one batch (up to 50 ids) for the duration, captions, embedding, made for kids and the language.
export async function videoDetails(apiKey: string, ids: string[]): Promise<Got<VideoCandidate[]>> {
  const clean = Array.from(new Set(ids.filter((v) => VIDEO_ID.test(v)))).slice(0, 50);
  if (!clean.length) return { ok: true, value: [] };
  const got = await get('videos', { part: 'snippet,contentDetails,status', id: clean.join(','), maxResults: '50' }, apiKey);
  if (!got.ok) return got;
  const out: VideoCandidate[] = [];
  for (const i of items(got.value)) {
    const snippet = obj(i.snippet);
    const details = obj(i.contentDetails);
    const status = obj(i.status);
    const videoId = typeof i.id === 'string' ? i.id : '';
    const channelId = typeof snippet.channelId === 'string' ? snippet.channelId : '';
    if (!VIDEO_ID.test(videoId) || !CHANNEL_ID.test(channelId)) continue;
    const lang = text(snippet.defaultAudioLanguage, 20) || text(snippet.defaultLanguage, 20);
    out.push({
      videoId,
      channelId,
      channelTitle: text(snippet.channelTitle, 120),
      title: text(snippet.title, 200),
      durationS: parseDuration(details.duration),
      captions: details.caption === 'true' || details.caption === true,
      embeddable: status.embeddable === true,
      madeForKids: status.madeForKids === true,
      isPublic: status.privacyStatus === 'public',
      ageRestricted: obj(details.contentRating).ytRating === 'ytAgeRestricted',
      language: lang ? lang.toLowerCase() : null,
      chapters: parseChapters(snippet.description),
    });
  }
  return { ok: true, value: out };
}

// Control → AI's "test key": the cheapest call there is (videos.list on the most popular chart, one result, ids only).
export async function testYoutubeKey(apiKey: string): Promise<{ ok: true } | { ok: false; failure: VideoFailure; status?: number }> {
  const got = await get('videos', { part: 'id', chart: 'mostPopular', regionCode: 'IN', maxResults: '1' }, apiKey);
  return got.ok ? { ok: true } : got;
}

export const youtubeAdapter = {
  providerId: 'youtube',
  capability: 'video' as const,
  needsKey: true,
  keyLooksRight: youtubeKeyLooksRight,
};
