// Gemini watching a public YouTube video (the video finder's judge, src/lib/family/video-review.ts). Gemini's own
// generateContent route, since only it takes a YouTube address as the video (fileData). The request carries the
// video's address and our fixed instructions, never a child's words or anything about a family. The key goes in the
// x-goog-api-key header, never the address; nothing is logged or thrown with it.

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 90_000;
const MODEL = /^[A-Za-z0-9._-]{1,80}$/;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export type VideoScores = { accuracy: number; clarity: number; class_fit: number; clickbait: number; child_safety: number; reason: string };
export type WatchResult = { ok: true; scores: VideoScores } | { ok: false; failure: 'http' | 'network' | 'bad_answer'; status?: number };

export const REVIEW_PROMPT = [
  'You review a YouTube video for an Indian school-learning app used by children aged 4 to 17.',
  'Watch the whole video. Score each item from 1 (worst) to 5 (best):',
  'accuracy: the teaching is correct;',
  'clarity: it explains clearly for a student;',
  'class_fit: it suits a school student of the level it seems aimed at;',
  'clickbait: 5 means the title and thumbnail are honest, 1 means misleading clickbait;',
  'child_safety: 5 means fully safe for a child (no violence, fear, adult themes, bad language, dangerous acts, ads aimed at children or requests for personal details).',
  'Answer with one JSON object only, no other text:',
  '{"accuracy":n,"clarity":n,"class_fit":n,"clickbait":n,"child_safety":n,"reason":"<at most 200 characters>"}',
].join(' ');

const score = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(5, Math.max(1, Math.round(n))) : null;
};

// The model's answer as scores: one JSON object (a fenced block is unwrapped), each score clamped to 1-5, the reason
// one line of at most 200 characters. Anything missing or not a number: null.
export function parseScores(text: string): VideoScores | null {
  const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(body.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const s = { accuracy: score(o.accuracy), clarity: score(o.clarity), class_fit: score(o.class_fit), clickbait: score(o.clickbait), child_safety: score(o.child_safety) };
  if (Object.values(s).some((v) => v === null)) return null;
  const reason = typeof o.reason === 'string' ? o.reason.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  return { ...(s as Omit<VideoScores, 'reason'>), reason };
}

export async function watchYoutubeVideo(apiKey: string, model: string, videoId: string, f: typeof fetch = fetch): Promise<WatchResult> {
  if (!MODEL.test(model) || !VIDEO_ID.test(videoId)) return { ok: false, failure: 'bad_answer' };
  const body = {
    contents: [{ role: 'user', parts: [{ fileData: { fileUri: `https://www.youtube.com/watch?v=${videoId}`, mimeType: 'video/*' } }, { text: REVIEW_PROMPT }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 400 },
  };
  let res: Response;
  try {
    res = await f(`${BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { ok: false, failure: 'network' };
  }
  if (!res.ok) return { ok: false, failure: 'http', status: res.status };
  const got = (await res.json().catch(() => null)) as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] } | null;
  const text = (got?.candidates?.[0]?.content?.parts ?? []).map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
  const scores = parseScores(text);
  return scores ? { ok: true, scores } : { ok: false, failure: 'bad_answer' };
}
