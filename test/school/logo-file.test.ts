import { describe, expect, it } from 'vitest';
import { brandInitials, checkLogo, checkSchoolName, imageSize, LOGO_MAX_BYTES } from '@/lib/school/logo-file';

// C235-B: the server keeps a logo only when its own first bytes say PNG, JPEG or WebP, it is at most 5 MB, and its
// header gives a size a logo can be. The name and the extension the browser sends are never read.

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const png = (w: number, h: number, pad = 0) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...new Array(pad).fill(0)]);
// A JPEG: start, an APP0 segment, then a baseline frame header with its height and width.
const jpeg = (w: number, h: number, frame = 0xc0) =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, frame, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xda]);
const riff = (chunk: string, data: number[]) => new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, ...[...chunk].map((c) => c.charCodeAt(0)), 0, 0, 0, 0, ...data, ...new Array(16).fill(0)]);
const webpLossy = (w: number, h: number) => riff('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, w & 255, w >> 8, h & 255, h >> 8]);
const webpLossless = (w: number, h: number) => {
  const bits = (w - 1) | ((h - 1) << 14);
  return riff('VP8L', [0x2f, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255]);
};
const webpExtended = (w: number, h: number) => riff('VP8X', [0, 0, 0, 0, (w - 1) & 255, ((w - 1) >> 8) & 255, (w - 1) >> 16, (h - 1) & 255, ((h - 1) >> 8) & 255, (h - 1) >> 16]);
const text = (s: string) => new TextEncoder().encode(s);

describe('the logo file, by its own bytes (C235-B)', () => {
  it('reads the size of a PNG, a JPEG and the three kinds of WebP from their headers', () => {
    expect(imageSize(png(512, 128), 'image/png')).toEqual({ width: 512, height: 128 });
    expect(imageSize(jpeg(300, 200), 'image/jpeg')).toEqual({ width: 300, height: 200 });
    expect(imageSize(jpeg(64, 640, 0xc2), 'image/jpeg')).toEqual({ width: 64, height: 640 }); // progressive
    expect(imageSize(webpLossy(400, 100), 'image/webp')).toEqual({ width: 400, height: 100 });
    expect(imageSize(webpLossless(256, 256), 'image/webp')).toEqual({ width: 256, height: 256 });
    expect(imageSize(webpExtended(1000, 500), 'image/webp')).toEqual({ width: 1000, height: 500 });
  });

  it('keeps a PNG, a JPEG or a WebP of a logo’s size, and says which', () => {
    expect(checkLogo(png(512, 512))).toEqual({ ok: true, type: 'image/png', extension: 'png', width: 512, height: 512 });
    expect(checkLogo(jpeg(512, 256))).toMatchObject({ ok: true, type: 'image/jpeg', extension: 'jpg' });
    expect(checkLogo(webpLossless(160, 16))).toMatchObject({ ok: true, type: 'image/webp', extension: 'webp' });
  });

  it('refuses an SVG, a GIF, a PDF, HTML and a script whatever they are called', () => {
    for (const bytes of [
      text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      text('<?xml version="1.0"?><svg/>'),
      text('GIF89a\u0001\u0000\u0001\u0000'),
      text('%PDF-1.7\n'),
      text('<!doctype html><html><body>hello</body></html>'),
      text('alert(document.cookie)'),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]), // a PNG's first bytes only
    ])
      expect(checkLogo(bytes)).toEqual({ ok: false, reason: 'logo_not_image' });
    // A PNG signature followed by anything but its header is not read as a picture either.
    const broken = png(64, 64);
    broken.set(text('ABCD'), 12);
    expect(checkLogo(broken)).toEqual({ ok: false, reason: 'logo_not_image' });
    // A JPEG whose picture starts before its size is given.
    expect(checkLogo(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0, 8, 1, 2, 3, 4, 5, 6, 7, 8]))).toEqual({ ok: false, reason: 'logo_not_image' });
  });

  it('refuses an empty file and one over 5 MB, before anything else is read', () => {
    expect(checkLogo(new Uint8Array())).toEqual({ ok: false, reason: 'logo_empty' });
    expect(checkLogo(png(64, 64, LOGO_MAX_BYTES))).toEqual({ ok: false, reason: 'logo_too_large' });
    expect(checkLogo(png(64, 64, LOGO_MAX_BYTES - 33)).ok).toBe(true); // exactly 5 MB
  });

  it('refuses a size no logo is: under 16 or over 1024 pixels a side, or thinner than 1 to 10', () => {
    expect(checkLogo(png(15, 64))).toEqual({ ok: false, reason: 'logo_dimensions' });
    expect(checkLogo(png(1025, 512))).toEqual({ ok: false, reason: 'logo_dimensions' });
    expect(checkLogo(png(0, 0))).toEqual({ ok: false, reason: 'logo_dimensions' });
    expect(checkLogo(png(1000, 99))).toEqual({ ok: false, reason: 'logo_dimensions' });
    expect(checkLogo(png(1000, 100)).ok).toBe(true);
    expect(checkLogo(jpeg(40000, 40000))).toEqual({ ok: false, reason: 'logo_dimensions' });
    expect(checkLogo(webpExtended(16384, 16384))).toEqual({ ok: false, reason: 'logo_dimensions' });
  });
});

describe('the school’s name (C235-B)', () => {
  it('is kept trimmed, one space between words, 2 to 120 characters, no control characters', () => {
    expect(checkSchoolName('  Made-up   Public School \n')).toEqual({ ok: true, name: 'Made-up Public School' });
    expect(checkSchoolName('राजकीय  विद्यालय')).toEqual({ ok: true, name: 'राजकीय विद्यालय' });
    expect(checkSchoolName(' A ')).toEqual({ ok: false, reason: 'name_blank' });
    expect(checkSchoolName('x'.repeat(121))).toEqual({ ok: false, reason: 'name_long' });
    expect(checkSchoolName('Made-up\u0000School')).toEqual({ ok: false, reason: 'name_invalid' });
    expect(checkSchoolName(42)).toEqual({ ok: false, reason: 'name_invalid' });
  });

  it('a school without a logo is shown by its initials', () => {
    expect(brandInitials("St. Mary's Convent School")).toBe('SM');
    expect(brandInitials('Made-up Public School')).toBe('MP');
    expect(brandInitials('Kendriya')).toBe('K');
    expect(brandInitials('राजकीय विद्यालय')).toBe('रव');
    expect(brandInitials('123')).toBe('1');
  });
});
