// A photo made smaller on the phone before it is sent (C525): the ONE helper the homework helper, the syllabus photo
// and the tutor's Attach use. The pure parts (the size, the HEIC sniff, the attach plan) are tested without a browser;
// shrinkPhoto needs a canvas, so it runs only on the phone.
//
// Why on the phone: the server has no image library (no new dependency, C525) and reads a photo's words with tesseract
// inside a 60 s route. A phone photo is 3 to 12 MB at 4000 px; a 1600 px JPEG at 0.8 is a few hundred KB, keeps a
// textbook's print readable, reads in seconds, and costs the family less data. Drawing it again on a canvas also drops
// the photo's EXIF (the place it was taken).
//
// HEIC (an iPhone photo): the server never takes it (src/lib/family/tutor-shape.ts sniffs PNG, JPEG, WebP and PDF only,
// and no HEIC decoder is added there). The phone turns it into a JPEG through the same canvas path when its browser can
// open it (Safari can); when it cannot, the child is told how to fix it (fam.tutor.err.heic_unreadable).

import { TUTOR_FILE_MAX_BYTES, TUTOR_FILE_TYPES, sniffTutorFile, type TutorFileType } from './tutor-shape';

export const PHOTO_LONG_SIDE = 1600;
export const PHOTO_QUALITY = 0.8;
// A picked file larger than this is not opened at all (a phone's memory); the 10 MB limit applies to what is sent.
export const PHOTO_INPUT_MAX_BYTES = 40 * 1024 * 1024;

const HEIC_TYPES = ['image/heic', 'image/heif', '.heic', '.heif'];
// What the gallery and Attach pickers offer: what the server takes, and an iPhone's HEIC, which the phone converts.
export const PHOTO_PICK_ACCEPT = ['image/png', 'image/jpeg', 'image/webp', ...HEIC_TYPES].join(',');
export const FILE_PICK_ACCEPT = [...TUTOR_FILE_TYPES, ...HEIC_TYPES].join(',');

// The size a photo is drawn at: its longer side at most `maxSide`, never made larger, at least 1 px.
export function shrunkSize(width: number, height: number, maxSide = PHOTO_LONG_SIDE): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// An HEIC or HEIF image, by its own first bytes: an ISO box "ftyp" at byte 4 with an HEIF brand.
const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);
export function isHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const ascii = (from: number) => String.fromCharCode(bytes[from], bytes[from + 1], bytes[from + 2], bytes[from + 3]);
  return ascii(4) === 'ftyp' && HEIF_BRANDS.has(ascii(8));
}

// What Attach does with a picked file, from its first bytes and its size: send it as it is (a PDF), draw it again
// smaller (a photo, HEIC included), or refuse it with the words that say what to do next.
export type AttachPlan =
  | { ok: true; mime: TutorFileType; shrink: false }
  | { ok: true; mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/heic'; shrink: true }
  | { ok: false; code: 'file_empty' | 'file_too_large' | 'file_type' };

export function attachPlan(head: Uint8Array, size: number): AttachPlan {
  if (size === 0) return { ok: false, code: 'file_empty' };
  const sniffed = sniffTutorFile(head);
  if (sniffed === 'application/pdf') return size > TUTOR_FILE_MAX_BYTES ? { ok: false, code: 'file_too_large' } : { ok: true, mime: sniffed, shrink: false };
  const photo = sniffed ?? (isHeic(head) ? 'image/heic' : null);
  if (!photo) return { ok: false, code: 'file_type' };
  if (size > PHOTO_INPUT_MAX_BYTES) return { ok: false, code: 'file_too_large' };
  return { ok: true, mime: photo, shrink: true };
}

// What is sent after the plan: the smaller JPEG; or, when the phone could not draw a PNG, JPEG or WebP, the file as it
// is (the server reads and checks it the same way) if it is within the limit; an HEIC the phone could not open is
// refused with the words that say how to fix it.
export type Prepared = { ok: true; file: File; mime: TutorFileType } | { ok: false; code: 'file_too_large' | 'heic_unreadable' };

export function afterShrink(original: { size: number; mime: Exclude<AttachPlan, { ok: false }>['mime'] }, shrunk: { size: number } | null): 'shrunk' | 'original' | 'file_too_large' | 'heic_unreadable' {
  if (shrunk) return shrunk.size > TUTOR_FILE_MAX_BYTES ? 'file_too_large' : 'shrunk';
  if (original.mime === 'image/heic') return 'heic_unreadable';
  return original.size > TUTOR_FILE_MAX_BYTES ? 'file_too_large' : 'original';
}

const jpegName = (name: string) => `${name.replace(/\.[A-Za-z0-9]{1,5}$/, '') || 'photo'}.jpg`;

// The browser parts. Open the picture (createImageBitmap, else an <img>, which Safari uses for HEIC), draw it at
// shrunkSize, and encode it. Throws when the browser cannot open or encode it.
async function openPicture(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      if (!img.naturalWidth || !img.naturalHeight) throw new Error('no image');
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw e;
    }
  }
}

export async function shrinkPhoto(file: Blob, opts: { maxSide?: number; quality?: number } = {}): Promise<Blob> {
  const picture = await openPicture(file);
  const size = shrunkSize(picture.width, picture.height, opts.maxSide ?? PHOTO_LONG_SIDE);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  try {
    canvas.getContext('2d')!.drawImage(picture.source, 0, 0, size.width, size.height);
  } finally {
    picture.close();
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', opts.quality ?? PHOTO_QUALITY));
  if (!blob || blob.size === 0) throw new Error('no image');
  return blob;
}

export async function blobBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// Attach's whole phone step for a planned photo: the smaller JPEG, or what afterShrink decides.
export async function preparePhoto(file: File, mime: Exclude<AttachPlan, { ok: false }>['mime']): Promise<Prepared> {
  let shrunk: Blob | null = null;
  try {
    shrunk = await shrinkPhoto(file);
  } catch {
    shrunk = null;
  }
  const next = afterShrink({ size: file.size, mime }, shrunk);
  if (next === 'shrunk') return { ok: true, file: new File([shrunk!], jpegName(file.name), { type: 'image/jpeg' }), mime: 'image/jpeg' };
  if (next === 'original') return { ok: true, file, mime: mime as TutorFileType };
  return { ok: false, code: next };
}
