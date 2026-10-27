import type { Quad } from './scan-image';

// Holding still (C230-AJ), for the scan screen's main thread: whether the page has been held still long enough to take
// it by itself. Its own small file, so the screen does not load the picture functions (they run in the worker).

// Whether the page has been held still long enough to take it by itself: the corners (0..1 of the frame) moved less than
// `still` between frames for `holdMs`. Once taken, it waits for the page to change (the corners move by more than
// `moved`, or no page is seen) before it takes another, so one page is never taken twice by itself.
export class SteadyWatch {
  private since: number | null = null;
  private last: Quad | null = null;
  private armed = true;
  private takenAt: Quad | null = null;
  constructor(
    private readonly holdMs = 1200,
    private readonly still = 0.015,
    private readonly moved = 0.08
  ) {}

  private static distance(a: Quad, b: Quad): number {
    return Math.max(...a.map((p, i) => Math.hypot(p.x - b[i].x, p.y - b[i].y)));
  }

  // A new frame's corners (or null); true when it is time to take the page.
  see(quad: Quad | null, now: number): boolean {
    if (!quad) {
      this.since = null;
      this.last = null;
      this.armed = true;
      this.takenAt = null;
      return false;
    }
    if (!this.armed && this.takenAt && SteadyWatch.distance(quad, this.takenAt) > this.moved) this.armed = true;
    if (this.last && SteadyWatch.distance(quad, this.last) <= this.still) this.since ??= now;
    else this.since = now;
    this.last = quad;
    if (this.armed && this.since !== null && now - this.since >= this.holdMs) {
      this.armed = false;
      this.takenAt = quad;
      this.since = now;
      return true;
    }
    return false;
  }

  // Taken by hand: the same page is not taken again by itself.
  taken(quad: Quad | null): void {
    this.armed = false;
    this.takenAt = quad;
  }

  // How far along holding still is, 0 to 1 (for the ring around the shutter).
  progress(now: number): number {
    return this.armed && this.since !== null ? Math.min(1, (now - this.since) / this.holdMs) : 0;
  }
}
