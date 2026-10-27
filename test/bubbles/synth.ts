import type { OptionKey } from '@/lib/contracts/marking';
import { CORNERS, CORNER_SIZE, HEADER, ORIENT, PAGE_H, PAGE_W, sheetDigits, type SheetLayout } from '@/lib/bubbles/layout';
import { boxBlur, pixelAt, rectToQuad, type Gray, type Quad } from '@/lib/marking/scan-image';

// Made-up bubble sheets for the reader's tests (C364): the layout drawn into grey pixels in code, shaded as a child
// would (pencil, a double mark, a half-rubbed-out answer, a smudge), then "photographed": turned, seen at an angle,
// blurred, lit unevenly, with noise. Every number here is made up and seeded, so a run is the same every time.

export function prng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0x100000000;
  };
}

const PAPER = 238;
const PRINT = 18;
const RING = 70;
const LETTER = 185;

export type ChildMarks = {
  sheetNo: number;
  printedRoll?: string | null; // pre-shaded on a named sheet (four digits)
  shadedRoll?: string | null; // shaded by the child on a blank sheet, in the first columns
  fills: Record<string, OptionKey[]>; // clearly shaded in pencil
  smudges?: Record<string, OptionKey[]>; // rubbed out half way, or smudged: between empty and filled
  faint?: Record<string, OptionKey[]>; // rubbed out well: a light trace
  pencil?: number; // the pencil's grey (lower is darker)
  smudge?: number; // the smudge's share of the way from paper to pencil (0.35 to 0.6)
  seed?: number;
};

export function renderSheet(layout: SheetLayout, marks: ChildMarks, px = 5): Gray {
  const w = Math.round(PAGE_W * px);
  const h = Math.round(PAGE_H * px);
  const rnd = prng(marks.seed ?? 7);
  const data = new Uint8ClampedArray(w * h);
  for (let i = 0; i < data.length; i++) data[i] = PAPER - rnd() * 6;
  const put = (x: number, y: number, v: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (v < data[i]) data[i] = v;
  };
  // Anti-aliased by 3×3 samples a pixel.
  const shape = (x0: number, y0: number, x1: number, y1: number, inside: (x: number, y: number) => boolean, value: () => number, cover = 1) => {
    for (let y = Math.floor(y0 * px); y <= Math.ceil(y1 * px); y++)
      for (let x = Math.floor(x0 * px); x <= Math.ceil(x1 * px); x++) {
        let hit = 0;
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (inside((x + (a + 0.5) / 3) / px, (y + (b + 0.5) / 3) / px)) hit++;
        if (!hit || rnd() > cover) continue;
        const v = value();
        put(x, y, PAPER - ((PAPER - v) * hit) / 9);
      }
  };
  const rect = (x: number, y: number, ww: number, hh: number, v: number) => shape(x, y, x + ww, y + hh, (a, b) => a >= x && a <= x + ww && b >= y && b <= y + hh, () => v);
  const disc = (cx: number, cy: number, r: number, value: () => number, cover = 1) => shape(cx - r, cy - r, cx + r, cy + r, (a, b) => (a - cx) ** 2 + (b - cy) ** 2 <= r * r, value, cover);
  const ring = (cx: number, cy: number, r: number, t: number, v: number) => shape(cx - r - t, cy - r - t, cx + r + t, cy + r + t, (a, b) => Math.abs(Math.hypot(a - cx, b - cy) - r) <= t / 2, () => v);

  for (const c of CORNERS) rect(c.x - CORNER_SIZE / 2, c.y - CORNER_SIZE / 2, CORNER_SIZE, CORNER_SIZE, PRINT);
  rect(ORIENT.x - ORIENT.size / 2, ORIENT.y - ORIENT.size / 2, ORIENT.size, ORIENT.size, PRINT);
  // The header's words, as strokes.
  for (const y of [HEADER.school, HEADER.exam, HEADER.paper, HEADER.childBox.y + 8, HEADER.childBox.y + 16, HEADER.instructions, HEADER.instructions + 6]) {
    for (let x = HEADER.textLeft + 12; x < HEADER.textRight - 4; x += 2.2 + rnd() * 1.5) rect(x, y - 1.5, 0.35, 3, PRINT + 30);
  }
  for (let x = 26; x < 150; x += 2.4) rect(x, HEADER.footer - 1, 0.3, 2, PRINT + 40);
  const pencil = marks.pencil ?? 72;
  const pencilValue = () => pencil + (rnd() - 0.5) * 30;
  const rings = (bs: { x: number; y: number; r: number }[], letters = false) => {
    for (const b of bs) {
      ring(b.x, b.y, b.r, 0.28, RING);
      if (letters) rect(b.x - 0.5, b.y - 0.9, 1, 1.8, LETTER);
    }
  };
  layout.sheetNo.forEach((col) => rings(col));
  layout.roll.forEach((col) => rings(col));
  layout.questions.forEach((q) => rings(q.bubbles, true));
  // The sheet number, printed solid.
  sheetDigits(marks.sheetNo).forEach((d, c) => disc(layout.sheetNo[c][d].x, layout.sheetNo[c][d].y, layout.sheetNo[c][d].r + 0.1, () => PRINT));
  if (marks.printedRoll) marks.printedRoll.split('').forEach((d, c) => disc(layout.roll[c][Number(d)].x, layout.roll[c][Number(d)].y, layout.roll[c][Number(d)].r + 0.1, () => PRINT));
  const shade = (b: { x: number; y: number; r: number }, value: () => number, cover = 0.95) => {
    const ox = (rnd() - 0.5) * 0.5;
    const oy = (rnd() - 0.5) * 0.5;
    disc(b.x + ox, b.y + oy, b.r * (0.92 + rnd() * 0.12), value, cover);
  };
  if (marks.shadedRoll) marks.shadedRoll.split('').forEach((d, c) => shade(layout.roll[c][Number(d)], pencilValue));
  const byLabel = new Map(layout.questions.map((q) => [q.label, q]));
  const each = (m: Record<string, OptionKey[]> | undefined, fn: (b: { x: number; y: number; r: number }) => void) => {
    for (const [label, keys] of Object.entries(m ?? {})) {
      const q = byLabel.get(label);
      if (!q) throw new Error(`no question ${label}`);
      for (const k of keys) fn(q.bubbles[q.keys.indexOf(k)]);
    }
  };
  each(marks.fills, (b) => shade(b, pencilValue));
  const share = marks.smudge ?? 0.45;
  each(marks.smudges, (b) => shade(b, () => PAPER - share * (PAPER - pencil) + (rnd() - 0.5) * 20, 0.9));
  each(marks.faint, (b) => shade(b, () => PAPER - 0.1 * (PAPER - pencil) + (rnd() - 0.5) * 10, 0.7));
  return { width: w, height: h, data };
}

function invert3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

export type Camera = {
  width: number;
  height: number;
  pageHeight: number; // the page's long side in the photo, pixels (before turning)
  angle: number; // degrees, clockwise
  quarter?: 0 | 1 | 2 | 3; // the sheet turned a quarter, half or three quarters
  tilt?: number; // perspective: the far edge this much narrower (0 to 0.2)
  tiltSide?: 'top' | 'left' | 'right' | 'bottom';
  blur?: number; // box blur radius, pixels
  light?: [number, number]; // brightness from one side of the photo to the other
  lightAngle?: number; // degrees
  noise?: number; // ± grey levels
  background?: number;
  shift?: [number, number]; // the page's centre off the photo's centre, pixels
  barrel?: number; // a phone lens's bulge: a point at the photo's corner moves out by this share
  seed?: number;
};

export function photograph(sheet: Gray, cam: Camera): Gray {
  const rnd = prng(cam.seed ?? 11);
  const ph = cam.pageHeight;
  const pw = (ph * sheet.width) / sheet.height;
  const cx = cam.width / 2 + (cam.shift?.[0] ?? 0);
  const cy = cam.height / 2 + (cam.shift?.[1] ?? 0);
  // The page as an upright rectangle about the centre, the far edge narrower, then turned.
  const t = (cam.tilt ?? 0) / 2;
  let q: { x: number; y: number }[] = [
    { x: -pw / 2, y: -ph / 2 },
    { x: pw / 2, y: -ph / 2 },
    { x: pw / 2, y: ph / 2 },
    { x: -pw / 2, y: ph / 2 },
  ];
  const side = cam.tiltSide ?? 'top';
  if (side === 'top') (q[0].x += pw * t), (q[1].x -= pw * t);
  if (side === 'bottom') (q[3].x += pw * t), (q[2].x -= pw * t);
  if (side === 'left') (q[0].y += ph * t), (q[3].y -= ph * t);
  if (side === 'right') (q[1].y += ph * t), (q[2].y -= ph * t);
  const a = ((cam.angle + 90 * (cam.quarter ?? 0)) * Math.PI) / 180;
  q = q.map((p) => ({ x: cx + p.x * Math.cos(a) - p.y * Math.sin(a), y: cy + p.x * Math.sin(a) + p.y * Math.cos(a) }));
  const H = invert3(rectToQuad(sheet.width, sheet.height, q as Quad));
  const out = new Uint8ClampedArray(cam.width * cam.height);
  const bg = cam.background ?? 95;
  const [lo, hi] = cam.light ?? [1, 1];
  const la = ((cam.lightAngle ?? 30) * Math.PI) / 180;
  const span = Math.abs(cam.width * Math.cos(la)) + Math.abs(cam.height * Math.sin(la));
  for (let y = 0; y < cam.height; y++)
    for (let x = 0; x < cam.width; x++) {
      let u = x + 0.5;
      let v = y + 0.5;
      if (cam.barrel) {
        const hx = cam.width / 2;
        const hy = cam.height / 2;
        const rr = ((u - hx) ** 2 + (v - hy) ** 2) / (hx * hx + hy * hy);
        u = hx + (u - hx) * (1 - cam.barrel * rr);
        v = hy + (v - hy) * (1 - cam.barrel * rr);
      }
      const z = H[6] * u + H[7] * v + H[8];
      const sx = (H[0] * u + H[1] * v + H[2]) / z;
      const sy = (H[3] * u + H[4] * v + H[5]) / z;
      const inside = sx >= 0 && sy >= 0 && sx < sheet.width && sy < sheet.height;
      const base = inside ? pixelAt(sheet, sx - 0.5, sy - 0.5) : bg + (rnd() - 0.5) * 20;
      const tpos = ((x - cam.width / 2) * Math.cos(la) + (y - cam.height / 2) * Math.sin(la)) / span + 0.5;
      out[y * cam.width + x] = base * (lo + (hi - lo) * tpos);
    }
  let photo: Gray = { width: cam.width, height: cam.height, data: out };
  if (cam.blur) photo = boxBlur(photo, cam.blur);
  if (cam.noise) for (let i = 0; i < photo.data.length; i++) photo.data[i] = photo.data[i] + (rnd() - 0.5) * 2 * cam.noise;
  return photo;
}
