import { sniffImageType } from '@/lib/storage/file-storage';

// The school's logo file (C235-B): what the server keeps, decided from the file's own bytes, never from its name or
// the type the browser claims. The picker in the browser takes a JPG, PNG or SVG of up to 5 MB, draws it on a canvas
// no larger than LOGO_EDGE_PX on its long side and sends that drawing as a PNG, so an SVG is never sent: only its
// pixels are. The server takes a PNG, JPEG or WebP and nothing else, up to 5 MB, of a size a logo can be.
// Pure: no database, no storage; the browser reads the limits from here too.

export const LOGO_MAX_BYTES = 5 * 1024 * 1024;
// The long side the browser draws to (it never scales up).
export const LOGO_EDGE_PX = 512;
// What the server takes: each side from 16 to 1024 pixels, and no thinner than 1 to 10 either way (a wide wordmark
// fits; a line of pixels does not).
export const LOGO_MIN_SIDE_PX = 16;
export const LOGO_MAX_SIDE_PX = 1024;
export const LOGO_MAX_ASPECT = 10;
// The files the picker offers (the browser turns each into a PNG before sending).
export const LOGO_PICKER_ACCEPT = '.jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml';

export type LogoType = 'image/png' | 'image/jpeg' | 'image/webp';
export const LOGO_EXTENSION: Record<LogoType, 'png' | 'jpg' | 'webp'> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
export type LogoProblem = 'logo_empty' | 'logo_too_large' | 'logo_not_image' | 'logo_dimensions';
export type LogoCheck = { ok: true; type: LogoType; extension: 'png' | 'jpg' | 'webp'; width: number; height: number } | { ok: false; reason: LogoProblem };

const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const ascii = (b: Uint8Array, i: number, s: string) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));

// Width and height from the file's own header, or null when the header is not one this reads.
export function imageSize(bytes: Uint8Array, type: LogoType): { width: number; height: number } | null {
  if (type === 'image/png') {
    // The first chunk of a PNG is IHDR: width and height, 4 bytes each, big-endian.
    if (bytes.length < 24 || !ascii(bytes, 12, 'IHDR')) return null;
    return { width: be32(bytes, 16), height: be32(bytes, 20) };
  }
  if (type === 'image/jpeg') {
    // Walk the segments to the first start-of-frame marker (SOF0 to SOF15, not DHT, JPG or DAC).
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker === 0xff) {
        i += 1;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      if (marker === 0xda || marker === 0xd9) return null; // the picture starts (or ends) before its size was given
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: be16(bytes, i + 7), height: be16(bytes, i + 5) };
      const length = be16(bytes, i + 2);
      if (length < 2) return null;
      i += 2 + length;
    }
    return null;
  }
  // WebP: RIFF....WEBP, then one of three chunks.
  if (bytes.length < 30) return null;
  if (ascii(bytes, 12, 'VP8 ')) {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return { width: le16(bytes, 26) & 0x3fff, height: le16(bytes, 28) & 0x3fff };
  }
  if (ascii(bytes, 12, 'VP8L')) {
    if (bytes[20] !== 0x2f) return null;
    const bits = (bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24)) >>> 0;
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (ascii(bytes, 12, 'VP8X')) return { width: le24(bytes, 24) + 1, height: le24(bytes, 27) + 1 };
  return null;
}

// The one check every logo passes before it is stored.
export function checkLogo(bytes: Uint8Array): LogoCheck {
  if (bytes.length === 0) return { ok: false, reason: 'logo_empty' };
  if (bytes.length > LOGO_MAX_BYTES) return { ok: false, reason: 'logo_too_large' };
  const type = sniffImageType(bytes);
  if (!type) return { ok: false, reason: 'logo_not_image' };
  const size = imageSize(bytes, type);
  if (!size) return { ok: false, reason: 'logo_not_image' };
  const { width, height } = size;
  const sideOk = (n: number) => n >= LOGO_MIN_SIDE_PX && n <= LOGO_MAX_SIDE_PX;
  if (!sideOk(width) || !sideOk(height) || width / height > LOGO_MAX_ASPECT || height / width > LOGO_MAX_ASPECT) return { ok: false, reason: 'logo_dimensions' };
  return { ok: true, type, extension: LOGO_EXTENSION[type], width, height };
}

// The school's name as it is kept: spaces at the ends dropped and runs of spaces made one; 2 to 120 characters, no
// control characters.
export const SCHOOL_NAME_MIN = 2;
export const SCHOOL_NAME_MAX = 120;
export type NameCheck = { ok: true; name: string } | { ok: false; reason: 'name_blank' | 'name_long' | 'name_invalid' };
export function checkSchoolName(raw: unknown): NameCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'name_invalid' };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0008\u000b-\u001f\u007f]/.test(raw)) return { ok: false, reason: 'name_invalid' };
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name.length < SCHOOL_NAME_MIN) return { ok: false, reason: 'name_blank' };
  if (name.length > SCHOOL_NAME_MAX) return { ok: false, reason: 'name_long' };
  return { ok: true, name };
}

// The initials a school without a logo is shown by: the first letters of its first two words that start with a
// letter, punctuation dropped ("St. Mary's Convent School" → "SM"), or the first letter of a one-word name.
export function brandInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{M}\p{N}]/gu, ''))
    .filter((w) => /^\p{L}/u.test(w));
  const letters = words.slice(0, 2).map((w) => [...w][0].toLocaleUpperCase());
  return letters.join('') || [...name.trim()][0]?.toLocaleUpperCase() || '·';
}

// Where the browser asks for the logo (GET /api/branding/logo): the school's id and the logo's version (when it last
// changed), so the browser keeps it for a day, asks again only when it changes, and never shows one school's logo for
// another after a switch of school. A school's own session may ask only for its own school; Control for any. Null
// when the school has no logo.
export function logoAddress(logoVersion: string | null, schoolId: string): string | null {
  return logoVersion ? `/api/branding/logo?school=${schoolId}&v=${logoVersion}` : null;
}
