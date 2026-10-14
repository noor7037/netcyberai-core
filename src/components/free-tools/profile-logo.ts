'use client';

import { MAX_LOGO_CHARS } from '@/lib/free-tools/school-profile';

// Shrinks a logo to a size the browser can keep with the school profile
// (a few hundred pixels is plenty for a letterhead). Tries smaller sizes
// until it fits under MAX_LOGO_CHARS; returns null if it never does.
export async function shrinkLogoForProfile(src: string): Promise<{ src: string; aspect: number } | null> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('The logo could not be read.'));
    i.src = src;
  });
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  if (!w0 || !h0) return null;
  const aspect = w0 / h0;
  for (const side of [480, 360, 240, 160]) {
    const scale = Math.min(1, side / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * scale));
    c.height = Math.max(1, Math.round(h0 * scale));
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const out = c.toDataURL('image/png');
    if (out.length <= MAX_LOGO_CHARS) return { src: out, aspect };
  }
  return null;
}
