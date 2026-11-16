import { reviewVideoNow, type VideoReviewOutcome } from '@/lib/ai/platform';
import { videoIdOf } from './curated-videos';

// The video finder's judge (Noor, 16 Nov 2026; AI profile family.video_review): Gemini watches each video the finder
// keeps, once ever, and scores its accuracy, clarity, class fit, clickbait and child safety (content.video_reviews; the
// call and the writes are the AI platform's, reviewVideoNow). A video below 4 for child safety or below 3 for accuracy
// is never shown again (content.video_hidden; videos.ts readPicks). It runs in the background after a search, so no
// child waits for it: at most CONCURRENCY at once in this server process, within the day's limit
// (family.video_reviews_per_day), every error swallowed. Only a public video's address goes to Gemini, never anything
// about a child or a family. Control's Re-review (its own route) removes the row and asks again.

const CONCURRENCY = 2;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

type Deps = Parameters<typeof reviewVideoNow>[1];

// One video by its address (or its id), judged now.
export async function reviewVideo(videoUrl: string, deps: Deps = {}): Promise<VideoReviewOutcome> {
  const videoId = VIDEO_ID.test(videoUrl) ? videoUrl : videoIdOf(videoUrl);
  if (!videoId) return { ok: false, reason: 'bad_request' };
  return reviewVideoNow(videoId, deps);
}

// The background queue: ids waiting, and how many reviews run now. A video already queued or running is not added.
const waiting: string[] = [];
const queued = new Set<string>();
let running = 0;

// Fire and forget, after the finder saved its picks: never awaited by a child's request, never throws.
export function scheduleReviews(videoIds: readonly string[], deps: Deps = {}): void {
  for (const id of videoIds) {
    if (!VIDEO_ID.test(id) || queued.has(id) || queued.size > 500) continue;
    queued.add(id);
    waiting.push(id);
  }
  pump(deps);
}

function pump(deps: Deps): void {
  while (running < CONCURRENCY && waiting.length) {
    const id = waiting.shift()!;
    running++;
    void reviewVideo(id, deps)
      .then((r) => {
        // The day's limit reached, or no key or switch: the rest wait for a later search to ask again.
        if (!r.ok && (r.reason === 'cap_reached' || r.reason === 'no_key' || r.reason === 'not_switched_on')) {
          for (const w of waiting.splice(0)) queued.delete(w);
        }
      })
      .catch(() => {})
      .finally(() => {
        running--;
        queued.delete(id);
        pump(deps);
      });
  }
}

// For tests: whether the queue is empty.
export function reviewsIdle(): boolean {
  return running === 0 && waiting.length === 0;
}
