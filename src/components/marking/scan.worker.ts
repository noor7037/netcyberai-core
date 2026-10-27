// The scan screen's Web Worker (C230-AJ): the camera's picture work off the main thread, so the screen never stutters.
// Loaded only by the scan screen (src/components/marking/ScanScreen.tsx), as its own file the build hashes, so the
// browser keeps it after the first visit. Everything it does is src/lib/marking/scan-image.ts's: nothing here is ever
// logged, and a picture is handed back and forgotten.
//
//   { type: 'detect', id, width, height, rgba }      a small frame of the live view → { type: 'detected', id, quad, score }
//                                                     (corners 0..1 of the frame, or null)
//   { type: 'process', id, bitmap | rgba, width, height, hint, maxEdge, quality }
//                                                     the full photo → { type: 'page', id, jpeg } (or { gray } for the
//                                                     screen to encode where a worker cannot), or { type: 'failed', id }
//   { type: 'bubble', id, bitmap | rgba, width, height, layout, quality }
//                                                     a bubble sheet (C364): read by rules (src/lib/bubbles/read.ts) →
//                                                     { type: 'bubble', id, ok: true, reading, jpeg | gray } (the sheet
//                                                     straightened, as kept), or { type: 'bubble', id, ok: false, why }
import { keptPicture, readSheet } from '@/lib/bubbles/read';
import type { SheetLayout } from '@/lib/bubbles/layout';
import { PAGE_MAX_BYTES } from '@/lib/contracts/marking';
import { detectPage, grayToRgba, processPage, rgbaToGray, scaleQuad, shrinkTo, type Gray, type Quad } from '@/lib/marking/scan-image';

type In =
  | { type: 'detect'; id: number; width: number; height: number; rgba: ArrayBuffer }
  | { type: 'process'; id: number; bitmap?: ImageBitmap; rgba?: ArrayBuffer; width: number; height: number; hint: Quad | null; maxEdge: number; quality: number }
  | { type: 'bubble'; id: number; bitmap?: ImageBitmap; rgba?: ArrayBuffer; width: number; height: number; layout: SheetLayout; quality: number };

const port = self as unknown as { postMessage: (m: unknown, transfer?: Transferable[]) => void; onmessage: ((e: MessageEvent<In>) => void) | null };

// Corners 0..1 of a picture of this size.
const unit = (q: Quad, w: number, h: number): Quad => scaleQuad(q, 1 / w, 1 / h);

// The photo's grey pixels: from the bitmap through an OffscreenCanvas, or as sent.
function photoGray(msg: Extract<In, { type: 'process' | 'bubble' }>): Gray | null {
  if (msg.bitmap && typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(msg.bitmap.width, msg.bitmap.height);
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(msg.bitmap, 0, 0);
    msg.bitmap.close();
    return rgbaToGray(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  }
  if (msg.rgba) return rgbaToGray(new Uint8ClampedArray(msg.rgba), msg.width, msg.height);
  return null;
}

// The page as a JPEG within the hard cap: the chosen quality, then less if a page is unusually heavy.
async function encode(page: Gray, quality: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const c = new OffscreenCanvas(page.width, page.height);
  const ctx = c.getContext('2d');
  if (!ctx || typeof c.convertToBlob !== 'function') return null;
  ctx.putImageData(new ImageData(grayToRgba(page), page.width, page.height), 0, 0);
  for (const q of [quality, quality * 0.8, quality * 0.6]) {
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: q });
    if (blob.size <= PAGE_MAX_BYTES) return blob;
  }
  return null;
}

port.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'detect') {
      const found = detectPage(rgbaToGray(new Uint8ClampedArray(msg.rgba), msg.width, msg.height));
      port.postMessage({ type: 'detected', id: msg.id, quad: found ? unit(found.quad, msg.width, msg.height) : null, score: found?.score ?? 0 });
      return;
    }
    if (msg.type === 'bubble') {
      const sheet = photoGray(msg);
      if (!sheet) return port.postMessage({ type: 'bubble', id: msg.id, ok: false, why: 'no_corners' });
      const out = readSheet(sheet, msg.layout);
      if (!out.ok) return port.postMessage({ type: 'bubble', id: msg.id, ok: false, why: out.why });
      const kept = keptPicture(out.page);
      const jpeg = await encode(kept, msg.quality);
      if (jpeg) port.postMessage({ type: 'bubble', id: msg.id, ok: true, reading: out.reading, jpeg, width: kept.width, height: kept.height });
      else port.postMessage({ type: 'bubble', id: msg.id, ok: true, reading: out.reading, gray: kept.data.buffer, width: kept.width, height: kept.height }, [kept.data.buffer]);
      return;
    }
    const photo = photoGray(msg);
    if (!photo) return port.postMessage({ type: 'failed', id: msg.id });
    // The corners found again on a larger frame than the live view's, for a cleaner edge; the live view's as a stand-by.
    const frame = shrinkTo(photo, 800);
    const found = detectPage(frame);
    const quad = found ? scaleQuad(found.quad, photo.width / frame.width, photo.height / frame.height) : msg.hint ? scaleQuad(msg.hint, photo.width, photo.height) : null;
    const page = processPage(photo, quad, { maxEdge: msg.maxEdge });
    const jpeg = await encode(page, msg.quality);
    if (jpeg) port.postMessage({ type: 'page', id: msg.id, jpeg, width: page.width, height: page.height });
    else port.postMessage({ type: 'page', id: msg.id, gray: page.data.buffer, width: page.width, height: page.height }, [page.data.buffer]);
  } catch {
    port.postMessage({ type: 'failed', id: msg.id });
  }
};
