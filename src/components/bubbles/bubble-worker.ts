'use client';

import type { SheetLayout } from '@/lib/bubbles/layout';
import type { ReadFailure } from '@/lib/bubbles/read';
import { SCAN_QUALITY, type BubbleReading } from '@/lib/contracts/marking';

// The scan worker (src/components/marking/scan.worker.ts) asked to read bubble sheets (C364), for the scan screen and the
// file uploader alike: a picture in, what was read and the straightened sheet as a JPEG out. Nothing is logged, and a
// picture is let go once it is read.

export type BubbleRead = { ok: true; reading: BubbleReading; jpeg: Blob } | { ok: false; why: ReadFailure | 'failed' };

type Reply =
  | { type: 'bubble'; id: number; ok: true; reading: BubbleReading; jpeg?: Blob; gray?: ArrayBuffer; width: number; height: number }
  | { type: 'bubble'; id: number; ok: false; why: ReadFailure }
  | { type: 'failed'; id: number }
  | { type: 'detected' | 'page'; id: number };

// A grey sheet made a JPEG here, where the worker could not (no OffscreenCanvas).
async function encodeGray(gray: ArrayBuffer, width: number, height: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = new Uint8ClampedArray(gray);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, j = 0; i < g.length; i++, j += 4) (rgba[j] = rgba[j + 1] = rgba[j + 2] = g[i]), (rgba[j + 3] = 255);
  ctx.putImageData(new ImageData(rgba, width, height), 0, 0);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', SCAN_QUALITY));
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

export class BubbleWorker {
  private readonly worker: Worker;
  private readonly pending = new Map<number, (r: Reply) => void>();
  private seq = 0;

  constructor(worker?: Worker) {
    this.worker = worker ?? new Worker(new URL('../marking/scan.worker.ts', import.meta.url));
    this.worker.addEventListener('message', (e: MessageEvent<Reply>) => {
      const done = this.pending.get(e.data.id);
      if (!done) return;
      this.pending.delete(e.data.id);
      done(e.data);
    });
    this.worker.addEventListener('error', () => {
      for (const [id, done] of this.pending) done({ type: 'failed', id });
      this.pending.clear();
    });
  }

  // Reads one picture (taken over by the worker) against the paper's layout; 'failed' after `ms`.
  read(bitmap: ImageBitmap, layout: SheetLayout, ms = 30_000): Promise<BubbleRead> {
    return new Promise((resolve) => {
      const id = ++this.seq;
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        resolve({ ok: false, why: 'failed' });
      }, ms);
      this.pending.set(id, async (r) => {
        window.clearTimeout(timer);
        if (r.type !== 'bubble') return resolve({ ok: false, why: 'failed' });
        if (!r.ok) return resolve({ ok: false, why: r.why });
        const jpeg = r.jpeg ?? (r.gray ? await encodeGray(r.gray, r.width, r.height) : null);
        resolve(jpeg ? { ok: true, reading: r.reading, jpeg } : { ok: false, why: 'failed' });
      });
      this.worker.postMessage({ type: 'bubble', id, bitmap, width: bitmap.width, height: bitmap.height, layout, quality: SCAN_QUALITY }, [bitmap]);
    });
  }

  // For the scan screen's live view: the same worker finds the page's edges.
  detect(frame: { width: number; height: number; rgba: ArrayBuffer }, ms = 3000): Promise<{ quad: { x: number; y: number }[] | null } | null> {
    return new Promise((resolve) => {
      const id = ++this.seq;
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        resolve(null);
      }, ms);
      this.pending.set(id, (r) => {
        window.clearTimeout(timer);
        resolve(r.type === 'detected' ? { quad: (r as unknown as { quad: { x: number; y: number }[] | null }).quad } : null);
      });
      this.worker.postMessage({ type: 'detect', id, width: frame.width, height: frame.height, rgba: frame.rgba }, [frame.rgba]);
    });
  }

  terminate() {
    this.worker.terminate();
    this.pending.clear();
  }
}
