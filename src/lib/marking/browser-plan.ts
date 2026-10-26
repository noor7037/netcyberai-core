import { PAGE_MAX_BYTES, PAGE_MAX_EDGE, PAGE_MIN_EDGE, PAGES_PER_REQUEST } from '@/lib/contracts/marking';

// The pure part of making a class's scripts into pictures in the browser (C350): how big a page picture is, how hard
// it is squeezed, how pages are grouped into requests and when a failed request is tried again. No browser here, so
// every rule is tested (test/marking/browser-plan.test.ts); src/components/marking/render-pages.ts does the drawing.

// Under the host's 4.5 MB body limit, with room for the form's own bytes. A page is at most PAGE_MAX_BYTES, so one
// page always fits alone.
export const REQUEST_MAX_BYTES = 4_000_000;

// A page picture's size: the longest side at most `maxEdge` pixels, the shape kept, never made larger than it is.
export function fitWithin(width: number, height: number, maxEdge: number = PAGE_MAX_EDGE): { width: number; height: number } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const k = maxEdge / longest;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

// A picture too small to read an answer on (the longest side under the floor the server also holds).
export const tooSmall = (width: number, height: number): boolean => Math.max(width, height) < PAGE_MIN_EDGE;

// A PDF page is drawn at a scale that puts its longest side at `maxEdge` pixels (a page is measured in points, 1/72
// inch): a vector page is drawn sharp at that size, and a very large scan is drawn smaller. Held between a floor and a
// ceiling so a page with a strange size cannot ask for a huge or a tiny canvas.
export function pdfRenderScale(widthPt: number, heightPt: number, maxEdge: number = PAGE_MAX_EDGE): number {
  const longest = Math.max(widthPt, heightPt);
  if (!(longest > 0)) return 1;
  return Math.min(6, Math.max(0.05, maxEdge / longest));
}

// How a page is squeezed, in order, until its picture is within PAGE_MAX_BYTES: first the usual quality (0.85), then
// less, then a smaller picture as well. The last step is the last resort; a page still too large then is refused.
export const ENCODE_ATTEMPTS: readonly { quality: number; shrink: number }[] = [
  { quality: 0.85, shrink: 1 },
  { quality: 0.75, shrink: 1 },
  { quality: 0.65, shrink: 0.85 },
  { quality: 0.55, shrink: 0.7 },
];

// What kind of file a person picked: by its type, else by its name's ending.
export function fileKind(file: { name: string; type: string }): 'pdf' | 'image' | null {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/.test(name)) return 'image';
  return null;
}

// The order the files go in: by name as a person reads it (IMG_2 before IMG_10), so photos taken in turn stay in turn.
export function inReadingOrder<T extends { name: string }>(files: readonly T[]): T[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }));
}

// Pages are sent a few at a time. The batcher takes pages one by one (so a long scan is never all in memory) and hands
// back a full batch when the next page would make it too many or too heavy.
export type Sized = { bytes: number };
export class PageBatcher<T extends Sized> {
  private held: T[] = [];
  private heavy = 0;
  constructor(
    private readonly perRequest: number = PAGES_PER_REQUEST,
    private readonly maxBytes: number = REQUEST_MAX_BYTES
  ) {}
  // The batch to send now (before this page), if this page does not fit with what is held; the page is then held.
  add(page: T): T[] | null {
    let full: T[] | null = null;
    if (this.held.length && (this.held.length >= this.perRequest || this.heavy + page.bytes > this.maxBytes)) full = this.take();
    this.held.push(page);
    this.heavy += page.bytes;
    return full;
  }
  // What is left, at the end of a file.
  flush(): T[] | null {
    return this.held.length ? this.take() : null;
  }
  get pending(): number {
    return this.held.length;
  }
  private take(): T[] {
    const out = this.held;
    this.held = [];
    this.heavy = 0;
    return out;
  }
}

// A failure of one request, with the host's answer (0: the network).
export class UploadError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null = null
  ) {
    super(`upload failed (${status}${code ? `, ${code}` : ''})`);
  }
}

// Worth trying again: the network, a timeout, too many requests, or the server failing. Not a refusal (a page the
// server will not take is not taken the second time either).
export const isRetryable = (status: number): boolean => status === 0 || status === 408 || status === 429 || status >= 500;

export const RETRY_WAITS_MS: readonly number[] = [800, 2500];

export async function withRetry<T>(
  attempt: () => Promise<T>,
  { waits = RETRY_WAITS_MS, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), cancelled = () => false }: { waits?: readonly number[]; sleep?: (ms: number) => Promise<void>; cancelled?: () => boolean } = {}
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await attempt();
    } catch (err) {
      const status = err instanceof UploadError ? err.status : 0;
      if (i >= waits.length || !isRetryable(status) || cancelled()) throw err;
      await sleep(waits[i]);
    }
  }
}
