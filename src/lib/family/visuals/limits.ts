// The one gate every outside picture, 3D, animation and simulation source goes through (v21). This file is the agreed
// interface; the infrastructure slice replaces the body (per-source hourly counter in the shared database, 429 pause,
// per-answer call cap) without changing these signatures.
export class RateLimited extends Error {
  constructor(public retryAfterS: number | null = null) {
    super('rate_limited');
  }
}

// Runs `fn` for source `source` ("commons", "unsplash", "sketchfab", ...). Returns null when the source is skipped
// (paused, at its hourly limit, key missing) or when fn throws; throw RateLimited from fn on HTTP 429 to pause it.
export async function guarded<T>(source: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}
