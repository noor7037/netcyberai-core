'use client';

import type { CertImage } from './definitions';

// Logo, signature and stamp images for certificates. Everything happens
// in this tab: the file is read with an object URL that is revoked as
// soon as it is decoded, processed on a canvas, and kept only as a data
// URL in React state. Nothing is uploaded or stored.

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, number[][]> = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // "RIFF" (then "WEBP" at byte 8)
};

export interface ImageAdjust {
  crop: { top: number; right: number; bottom: number; left: number }; // percent of each edge
  trim: boolean; // cut away empty or plain margins
  clearWhite: boolean; // make a white background transparent
}

export const DEFAULT_ADJUST: ImageAdjust = { crop: { top: 0, right: 0, bottom: 0, left: 0 }, trim: true, clearWhite: false };

// Checks the declared type, the real file signature and the size, so a
// renamed file is caught before the browser tries to decode it.
export async function validateImageFile(file: File): Promise<string | null> {
  if (!TYPES[file.type]) return 'Choose a JPG, PNG or WebP image.';
  if (file.size > MAX_IMAGE_BYTES) return `This image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`;
  if (file.size === 0) return 'This file is empty.';
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const okSig = TYPES[file.type].some((sig) => sig.every((b, i) => head[i] === b));
  const webpOk = file.type !== 'image/webp' || String.fromCharCode(...head.slice(8, 12)) === 'WEBP';
  if (!okSig || !webpOk) return 'This file is not really a JPG, PNG or WebP image.';
  return null;
}

export async function decodeImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('This image could not be opened.'));
      img.src = url;
    });
    if (img.naturalWidth < 16 || img.naturalHeight < 16) throw new Error('This image is too small to print clearly.');
    if (img.naturalWidth * img.naturalHeight > 40_000_000) throw new Error('This image has too many pixels. Use a smaller version.');
    // Copy onto a canvas so the object URL can be released right away.
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    const copy = new Image();
    await new Promise<void>((resolve, reject) => {
      copy.onload = () => resolve();
      copy.onerror = () => reject(new Error('This image could not be opened.'));
      copy.src = c.toDataURL('image/png');
    });
    return copy;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Applies crop, background removal and trimming; returns a PNG data URL
// no larger than 1200 px on its longest side (plenty for 300 DPI at the
// sizes certificates print logos).
export function processImage(img: HTMLImageElement, adj: ImageAdjust, maxSide = 1200): CertImage {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const sx = Math.round((W * adj.crop.left) / 100);
  const sy = Math.round((H * adj.crop.top) / 100);
  const sw = Math.max(1, W - sx - Math.round((W * adj.crop.right) / 100));
  const sh = Math.max(1, H - sy - Math.round((H * adj.crop.bottom) / 100));
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k));
  c.height = Math.max(1, Math.round(sh * k));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);

  const data = ctx.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  if (adj.clearWhite) {
    for (let i = 0; i < px.length; i += 4) {
      const min = Math.min(px[i], px[i + 1], px[i + 2]);
      // Near-white becomes transparent, with a soft edge to avoid halos.
      if (min > 245) px[i + 3] = 0;
      else if (min > 225) px[i + 3] = Math.round(px[i + 3] * ((245 - min) / 20));
    }
    ctx.putImageData(data, 0, 0);
  }

  let out = c;
  if (adj.trim) {
    const bg = [px[0], px[1], px[2], px[3]];
    const isBg = (i: number) => (px[i + 3] < 12 && bg[3] < 12) || (Math.abs(px[i] - bg[0]) < 14 && Math.abs(px[i + 1] - bg[1]) < 14 && Math.abs(px[i + 2] - bg[2]) < 14 && Math.abs(px[i + 3] - bg[3]) < 14);
    let top = c.height;
    let left = c.width;
    let right = -1;
    let bottom = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (!isBg((y * c.width + x) * 4)) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }
    if (right >= left && bottom >= top && (right - left + 1 < c.width || bottom - top + 1 < c.height)) {
      const pad = Math.round(Math.max(c.width, c.height) * 0.01);
      const x0 = Math.max(0, left - pad);
      const y0 = Math.max(0, top - pad);
      const t = document.createElement('canvas');
      t.width = Math.min(c.width, right + pad + 1) - x0;
      t.height = Math.min(c.height, bottom + pad + 1) - y0;
      t.getContext('2d')!.drawImage(c, x0, y0, t.width, t.height, 0, 0, t.width, t.height);
      out = t;
    }
  }
  return { src: out.toDataURL('image/png'), aspect: out.width / out.height };
}
