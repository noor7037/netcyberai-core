import type { ChatImage } from '@/lib/ai/platform';
import { MAX_IMAGES } from './loop';

// Photos the person attaches (a document, a form): read inside this turn only, never stored or logged.
const MEDIA = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_PHOTO_CHARS = 2_000_000; // about 1.5 MB of picture each, after the phone shrinks it
export function photosFrom(v: unknown): ChatImage[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > MAX_IMAGES) return null;
  const out: ChatImage[] = [];
  for (const p of v) {
    const mediaType = (p as Record<string, unknown>)?.mediaType;
    const base64 = (p as Record<string, unknown>)?.base64;
    if (!MEDIA.includes(mediaType as (typeof MEDIA)[number]) || typeof base64 !== 'string' || base64.length > MAX_PHOTO_CHARS || !/^[A-Za-z0-9+/=]+$/.test(base64)) return null;
    out.push({ mediaType: mediaType as ChatImage['mediaType'], base64 });
  }
  return out;
}

