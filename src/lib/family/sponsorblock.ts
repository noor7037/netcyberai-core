import type { Promo } from './videos';

// SponsorBlock (sponsor.ajay.app): the community's marked segments of a public YouTube video. The finder asks once per
// top candidate, in parallel, after ranking (video-finder.ts): a video whose sponsor, self-promotion and "subscribe"
// segments are a large share of it is skipped, a lighter one ranks lower, and one that opens with a sponsor starts
// after it. Only a public video's id is sent, never anything about a child or a family. The host is fixed, redirects
// are refused, and the answer is read as data only. Down, slow or odd: null, and the finder carries on unchanged.

const HOST = 'https://sponsor.ajay.app';
const TIMEOUT_MS = 2_500;
const CATEGORIES = JSON.stringify(['sponsor', 'selfpromo', 'interaction']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
// A segment that begins this early is an opening one: the video starts after it.
const OPENING_S = 60;

type Fetch = typeof fetch;

// The promotion share (0 to 1) of a video `durationS` long and where to start, or null when not known.
export async function sponsorSegments(videoId: string, durationS: number, f: Fetch = fetch): Promise<Promo | null> {
  if (!VIDEO_ID.test(videoId) || !(durationS > 0)) return null;
  const url = `${HOST}/api/skipSegments?videoID=${encodeURIComponent(videoId)}&categories=${encodeURIComponent(CATEGORIES)}`;
  let res: Response;
  try {
    res = await f(url, { headers: { accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return null;
  }
  // No segment was ever marked for this video.
  if (res.status === 404) return { promoShare: 0, startAfterS: 0 };
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as unknown;
  if (!Array.isArray(body)) return null;
  return promoOf(body, durationS);
}

// The segments as SponsorBlock gives them ([{ segment: [start, end], category, videoDuration }]), merged where they
// overlap so no second is counted twice.
export function promoOf(segments: readonly unknown[], durationS: number): Promo {
  const spans: [number, number][] = [];
  for (const s of segments.slice(0, 200)) {
    const seg = (s as { segment?: unknown })?.segment;
    if (!Array.isArray(seg) || seg.length !== 2) continue;
    const [a, b] = seg.map(Number);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || a < 0) continue;
    spans.push([Math.min(a, durationS), Math.min(b, durationS)]);
  }
  spans.sort((x, y) => x[0] - y[0]);
  let covered = 0;
  let end = -1;
  let startAfterS = 0;
  for (const [a, b] of spans) {
    if (b > end) {
      covered += b - Math.max(a, end);
      end = b;
    }
    if (a < OPENING_S) startAfterS = Math.max(startAfterS, b);
  }
  const promoShare = durationS > 0 ? Math.min(1, Math.max(0, covered / durationS)) : 0;
  return { promoShare, startAfterS: Math.floor(startAfterS) };
}

// For the top few candidates at once: a map of what is known (a video the service could not answer for is left out).
export async function promoFor(videos: readonly { videoId: string; durationS: number }[], f: Fetch = fetch): Promise<Map<string, Promo>> {
  const got = await Promise.all(videos.map(async (v) => [v.videoId, await sponsorSegments(v.videoId, v.durationS, f).catch(() => null)] as const));
  return new Map(got.filter((g): g is readonly [string, Promo] => g[1] !== null));
}
