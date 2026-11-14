import { afterEach, describe, expect, it, vi } from 'vitest';
import { AADHAAR_PAGES, TEXTBOOK_PAGES } from '../fixtures/aadhaar-cases';
import { FILE_PICK_ACCEPT, PHOTO_INPUT_MAX_BYTES, PHOTO_LONG_SIDE, PHOTO_PICK_ACCEPT, afterShrink, attachPlan, isHeic, shrunkSize } from '@/lib/family/photo-shrink';
import { TUTOR_FILE_MAX_BYTES, sniffTutorFile } from '@/lib/family/tutor-shape';
import { TUTOR_KEYS } from '@/lib/family/tutor-words';
import { GALLERY_ACCEPT } from '@/components/family/tutor/PhotoSheet';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import { checkUpload, type OcrImage } from '@/lib/privacy/upload-check';
import { MemoryFileStorage } from '@/lib/storage/file-storage';

// Ask Tutor photo upload (C525): the phone shrinks a photo (an iPhone HEIC too) before it is sent, the server's OCR has
// a time limit and fails closed, and every refusal says what to do next. The OCR is a stand-in here; tesseract never runs.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 0, 0, 0, 0]);
const PDF = new TextEncoder().encode('%PDF-1.4\n%xxxxxxx');
const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode(`ftyp${brand}`), 0, 0, 0, 0]);
const HEIC = ftyp('heic');
const MB = 1024 * 1024;

const words = (text: string): OcrImage => async () => ({ rawText: text, words: [] });

describe('the phone shrink: its size', () => {
  it('a long side above 1600 px comes down to 1600, keeping the shape', () => {
    expect(shrunkSize(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(shrunkSize(3024, 4032)).toEqual({ width: 1200, height: 1600 });
    expect(shrunkSize(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
  });
  it('a small photo is never made larger; nothing is ever 0 px', () => {
    expect(shrunkSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(shrunkSize(PHOTO_LONG_SIDE, 10)).toEqual({ width: PHOTO_LONG_SIDE, height: 10 });
    expect(shrunkSize(20000, 1)).toEqual({ width: 1600, height: 1 });
  });
});

describe('HEIC: accepted in the picker, converted on the phone, never taken by the server', () => {
  it('is known by its own first bytes, not its name', () => {
    for (const brand of ['heic', 'heix', 'mif1', 'hevc']) expect(isHeic(ftyp(brand))).toBe(true);
    expect(isHeic(ftyp('isom'))).toBe(false); // an MP4
    expect(isHeic(JPEG)).toBe(false);
    expect(isHeic(new Uint8Array(4))).toBe(false);
  });
  it('the gallery and Attach pickers offer it; the server sniff still refuses it', () => {
    expect(GALLERY_ACCEPT).toBe(PHOTO_PICK_ACCEPT);
    for (const accept of [PHOTO_PICK_ACCEPT, FILE_PICK_ACCEPT]) expect(accept.split(',')).toEqual(expect.arrayContaining(['image/heic', 'image/heif', '.heic', 'image/jpeg']));
    expect(FILE_PICK_ACCEPT).toContain('application/pdf');
    expect(sniffTutorFile(HEIC)).toBeNull();
  });
});

describe('the attach plan', () => {
  it('a photo is shrunk (HEIC too); a PDF goes as it is', () => {
    expect(attachPlan(JPEG, 5 * MB)).toEqual({ ok: true, mime: 'image/jpeg', shrink: true });
    expect(attachPlan(PNG, 100)).toEqual({ ok: true, mime: 'image/png', shrink: true });
    expect(attachPlan(HEIC, 3 * MB)).toEqual({ ok: true, mime: 'image/heic', shrink: true });
    expect(attachPlan(PDF, 2 * MB)).toEqual({ ok: true, mime: 'application/pdf', shrink: false });
  });
  it('a 12 MB phone photo is no longer refused before it is shrunk; a PDF over 10 MB is', () => {
    expect(attachPlan(JPEG, 12 * MB)).toMatchObject({ ok: true, shrink: true });
    expect(attachPlan(PDF, TUTOR_FILE_MAX_BYTES + 1)).toEqual({ ok: false, code: 'file_too_large' });
    expect(attachPlan(JPEG, PHOTO_INPUT_MAX_BYTES + 1)).toEqual({ ok: false, code: 'file_too_large' });
  });
  it('an empty or unknown file is refused', () => {
    expect(attachPlan(JPEG, 0)).toEqual({ ok: false, code: 'file_empty' });
    expect(attachPlan(new TextEncoder().encode('<html>xxxxxxxxxx'), 10)).toEqual({ ok: false, code: 'file_type' });
  });
  it('after the shrink: the JPEG is sent; a photo the phone could not draw goes as it is when within 10 MB; an HEIC it could not open gets the fix-it words', () => {
    expect(afterShrink({ size: 8 * MB, mime: 'image/jpeg' }, { size: 300_000 })).toBe('shrunk');
    expect(afterShrink({ size: 8 * MB, mime: 'image/heic' }, { size: 300_000 })).toBe('shrunk');
    expect(afterShrink({ size: 8 * MB, mime: 'image/webp' }, null)).toBe('original');
    expect(afterShrink({ size: 12 * MB, mime: 'image/jpeg' }, null)).toBe('file_too_large');
    expect(afterShrink({ size: 1 * MB, mime: 'image/heic' }, null)).toBe('heic_unreadable');
    expect(afterShrink({ size: 1 * MB, mime: 'image/png' }, { size: TUTOR_FILE_MAX_BYTES + 1 })).toBe('file_too_large');
  });
});

describe('the OCR time limit (fail-closed)', () => {
  afterEach(() => vi.useRealTimers());

  it('a read past the limit is stopped and refused as timed out, never passed', async () => {
    let signal: AbortSignal | undefined;
    const slow: OcrImage = (_image, s) => {
      signal = s;
      return new Promise(() => undefined);
    };
    expect(await checkUpload({ bytes: JPEG, name: 'page.jpg' }, slow, { timeoutMs: 20 })).toEqual({ ok: false, reason: 'upload_unreadable', timedOut: true });
    expect(signal?.aborted).toBe(true);
  });
  it('a read within the limit is used as before; an OCR error is unreadable, not a timeout', async () => {
    expect(await checkUpload({ bytes: JPEG, name: 'page.jpg' }, words('Chapter 1'), { timeoutMs: 1000 })).toMatchObject({ ok: true, read: 'image_text' });
    const broken: OcrImage = async () => {
      throw new Error('tesseract could not start');
    };
    expect(await checkUpload({ bytes: JPEG, name: 'page.jpg' }, broken, { timeoutMs: 1000 })).toEqual({ ok: false, reason: 'upload_unreadable' });
  });
  it('the tutor refuses a timed-out photo as upload_check_timeout and takes the file away', async () => {
    vi.useFakeTimers();
    const t = await import('@/lib/family/tutor');
    const storage = new MemoryFileStorage();
    const row = { attachment_id: '00000000-0000-4000-8000-000000000001', account_id: 'acc', child_id: 'kid', mime: 'image/jpeg' as const, storage_key: 'k', status: 'pending', created_at: new Date() };
    await storage.put(t.tutorPendingKey(row.account_id, row.attachment_id, row.mime), JPEG, 'image/jpeg');
    const arrival = t.readTutorArrival(storage, row, Date.now, () => new Promise(() => undefined));
    await vi.advanceTimersByTimeAsync(t.TUTOR_OCR_MS + 1);
    expect(await arrival).toEqual({ ok: false, reason: 'upload_check_timeout', discard: true });
    expect(t.TUTOR_OCR_MS).toBeLessThan(60_000);
  });
});

describe('the upload check on whole pages', () => {
  it.each(TEXTBOOK_PAGES)('keeps a textbook page: $why', async ({ text }) => {
    expect(await checkUpload({ bytes: JPEG, name: 'file.jpg' }, words(text), { timeoutMs: 1000 })).toMatchObject({ ok: true });
  });
  it.each(AADHAAR_PAGES)('refuses an Aadhaar page: $why', async ({ text }) => {
    const r = await checkUpload({ bytes: JPEG, name: 'file.jpg' }, words(text), { timeoutMs: 1000 });
    expect(r.ok).toBe(false);
    expect(['upload_aadhaar_number', 'upload_aadhaar_card']).toContain(!r.ok && r.reason);
  });
});

describe('every refusal on this path says what to do next, in English and Hindi', () => {
  const REFUSALS = ['file_too_large', 'file_type', 'file_empty', 'upload_aadhaar_number', 'upload_aadhaar_card', 'upload_unreadable', 'upload_check_timeout', 'heic_unreadable'];
  it('the same keys in both languages', () => {
    expect(Object.keys(hi).sort()).toEqual(Object.keys(en).sort());
  });
  it.each(REFUSALS)('%s: sent to the phone, two sentences in English, Devanagari in Hindi', (code) => {
    const key = `fam.tutor.err.${code}` as keyof typeof en;
    expect(TUTOR_KEYS).toContain(key);
    expect(en[key].split(/(?<=\.)\s/).length, en[key]).toBeGreaterThanOrEqual(2);
    expect(hi[key]).toMatch(/[ऀ-ॿ]/);
    expect(hi[key].split('।').filter((s) => s.trim()).length, hi[key]).toBeGreaterThanOrEqual(2);
  });
});
