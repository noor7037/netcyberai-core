// The art table's geometry (C513): the radial colour wheel, the stickers that stay objects until they are stuck down,
// and where a template's outline sits on the paper. Plain numbers, tested without a screen.

import type { Point } from './sketch';

// ---- colours -------------------------------------------------------------------------------------------------------

const hex2 = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
// HSL (degrees, 0 to 100, 0 to 100) as #rrggbb.
export function hslHex(h: number, s: number, l: number): string {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = Math.min(1, Math.max(0, s / 100));
  const ll = Math.min(1, Math.max(0, l / 100));
  if (ss === 0) return `#${hex2(ll * 255)}${hex2(ll * 255)}${hex2(ll * 255)}`.toUpperCase();
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const ch = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return `#${hex2(ch(hh + 1 / 3) * 255)}${hex2(ch(hh) * 255)}${hex2(ch(hh - 1 / 3) * 255)}`.toUpperCase();
}

// ---- the radial wheel ----------------------------------------------------------------------------------------------

// Rings from the centre out, in CSS px: the middle cancels; the petals are the template's palette or the recent
// colours; the tones are tints and shades of the hue under the finger; the outer ring is twelve hues.
export const WHEEL = { centre: 30, petals: 72, tones: 108, hues: 144 } as const;
export const WHEEL_HUES = 12;
export const WHEEL_TONES = [86, 72, 56, 42, 28] as const;
export const LONG_PRESS_MS = 350;
// A finger that moves more than this before the long press is drawing, not asking for the wheel.
export const LONG_PRESS_SLOP = 10;

export const wheelHue = (i: number): number => (i * 360) / WHEEL_HUES;
export const hueColour = (i: number): string => hslHex(wheelHue(i), 82, 52);
export const toneColours = (hueIndex: number): string[] => WHEEL_TONES.map((l) => hslHex(wheelHue(hueIndex), l > 80 ? 70 : 80, l));

export type WheelHit = { ring: 'centre' } | { ring: 'petal'; index: number } | { ring: 'tone'; index: number } | { ring: 'hue'; index: number } | { ring: 'outside' };

// Which ring and which item a point is on, from its offset to the wheel's centre (screen y grows downwards). Item 0 of
// every ring starts at the top and they go clockwise. A ring with no items (no petals) reads as the centre.
export function wheelHit(dx: number, dy: number, petals: number): WheelHit {
  const r = Math.hypot(dx, dy);
  if (r <= WHEEL.centre) return { ring: 'centre' };
  if (r > WHEEL.hues + 24) return { ring: 'outside' };
  // Clockwise from the top: 0 at 12 o'clock.
  const a = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
  const slot = (n: number) => Math.min(n - 1, Math.floor((a / (Math.PI * 2)) * n + 0.5) % n);
  if (r <= WHEEL.petals) return petals > 0 ? { ring: 'petal', index: slot(petals) } : { ring: 'centre' };
  if (r <= WHEEL.tones) return { ring: 'tone', index: slot(WHEEL_TONES.length) };
  return { ring: 'hue', index: slot(WHEEL_HUES) };
}

// The colour a hit names, or null (the middle, or off the wheel).
export function wheelColour(hit: WheelHit, petals: readonly string[], toneHue: number): string | null {
  if (hit.ring === 'hue') return hueColour(hit.index);
  if (hit.ring === 'tone') return toneColours(toneHue)[hit.index] ?? null;
  if (hit.ring === 'petal') return petals[hit.index] ?? null;
  return null;
}

// The wheel's hue nearest a colour (the tones ring starts on it).
export function nearestHue(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return Math.round(h / (360 / WHEEL_HUES)) % WHEEL_HUES;
}

// Where item i of n sits on a ring of radius r (offset from the centre), for drawing it.
export function wheelSpot(i: number, n: number, r: number): Point {
  const a = (i / n) * Math.PI * 2;
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
}

// The wheel's centre, kept on the screen: as near the finger as fits, `margin` from every edge.
export function wheelCentre(at: Point, view: { w: number; h: number }, margin = 8): Point {
  const R = WHEEL.hues + margin;
  return { x: Math.min(Math.max(at.x, R), Math.max(R, view.w - R)), y: Math.min(Math.max(at.y, R), Math.max(R, view.h - R)) };
}

// The recent colours: the newest first, no repeats, at most `max`.
export function pushRecent(list: readonly string[], hex: string, max = 6): string[] {
  const h = hex.toUpperCase();
  return [h, ...list.filter((c) => c.toUpperCase() !== h)].slice(0, max);
}

// ---- stickers as objects --------------------------------------------------------------------------------------------

// A sticker on its own layer, in drawing pixels: its centre, its side and its turn (radians), until it is stuck down.
export type StickerObject = { key: string; id: string; at: Point; px: number; rot: number };
export const STICKER_PX_MIN = 40;
export const STICKER_PX_MAX = 480;

// The handle at the sticker's corner turns and resizes it at once: the new side keeps the ratio of the finger's distance
// from the centre to where the drag started; the turn adds the angle swept. Sizes stay within the bounds (CSS px times
// the drawing's scale).
export function twistSticker(s: StickerObject, start: Point, now: Point, base: { px: number; rot: number }, scale = 1): StickerObject {
  const d0 = Math.max(1, Math.hypot(start.x - s.at.x, start.y - s.at.y));
  const d1 = Math.hypot(now.x - s.at.x, now.y - s.at.y);
  const a0 = Math.atan2(start.y - s.at.y, start.x - s.at.x);
  const a1 = Math.atan2(now.y - s.at.y, now.x - s.at.x);
  const px = Math.min(STICKER_PX_MAX * scale, Math.max(STICKER_PX_MIN * scale, base.px * (d1 / d0)));
  return { ...s, px, rot: normaliseTurn(base.rot + (a1 - a0)) };
}
export const moveSticker = (s: StickerObject, by: Point, bounds: { w: number; h: number }): StickerObject => ({
  ...s,
  at: { x: Math.min(bounds.w, Math.max(0, s.at.x + by.x)), y: Math.min(bounds.h, Math.max(0, s.at.y + by.y)) },
});
export const resizeSticker = (s: StickerObject, k: number, scale = 1): StickerObject => ({ ...s, px: Math.min(STICKER_PX_MAX * scale, Math.max(STICKER_PX_MIN * scale, s.px * k)) });
export const turnSticker = (s: StickerObject, by: number): StickerObject => ({ ...s, rot: normaliseTurn(s.rot + by) });
export function normaliseTurn(r: number): number {
  const t = Math.PI * 2;
  let v = ((r % t) + t) % t;
  if (v > Math.PI) v -= t;
  return v;
}
// Where the corner handle sits (the sticker's bottom-right corner, turned with it).
export function handleSpot(s: StickerObject): Point {
  const h = s.px / 2;
  const c = Math.cos(s.rot);
  const n = Math.sin(s.rot);
  return { x: s.at.x + h * c - h * n, y: s.at.y + h * n + h * c };
}

// ---- the template's outline on the paper ---------------------------------------------------------------------------

// The outline keeps its own shape, centred on the paper inside a small margin (0.06 of the shorter side), in drawing pixels.
// The same box draws it on screen (as percentages) and into a saved or sent picture.
export function outlineBox(docW: number, docH: number, vbW: number, vbH: number): { x: number; y: number; w: number; h: number } {
  const m = Math.round(Math.min(docW, docH) * 0.06);
  const aw = Math.max(1, docW - m * 2);
  const ah = Math.max(1, docH - m * 2);
  const k = Math.min(aw / Math.max(1, vbW), ah / Math.max(1, vbH));
  const w = vbW * k;
  const h = vbH * k;
  return { x: (docW - w) / 2, y: (docH - h) / 2, w, h };
}
