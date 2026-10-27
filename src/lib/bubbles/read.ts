import type { BubbleReading, OptionKey } from '@/lib/contracts/marking';
import { evenContrast, paperLevel, pixelAt, rectToQuad, shrinkTo, straighten, type Gray, type Point, type Quad } from '@/lib/marking/scan-image';
import { CORNERS, CORNER_SIZE, ORIENT, PAGE_H, PAGE_W, ROLL_DIGITS, SHEET_DIGITS, sheetNoFrom, type Bubble, type SheetLayout } from './layout';

// Reading a bubble sheet by rules (docs/36 §1.2, C364): geometry and darkness, no AI, in the teacher's browser (the scan
// worker, src/components/marking/scan.worker.ts). Pure, on the grey pixels of src/lib/marking/scan-image.ts, so it is
// tested on made-up sheets photographed in code (test/bubbles/read.test.ts).
//
//   1. the corners     the photo made small, split into ink and paper against the paper's own brightness block by
//                      block (a shadow or a lamp on one side does not move the line), its dark regions found; the four
//                      solid squares are the outermost dark regions of one size; the small mark beside one of them says
//                      which way up the sheet is
//   2. the page        the photo mapped onto the layout's page through the four squares (a homography) and made
//                      straight at READ_PX pixels a millimetre; this picture is also what is kept and shown
//   3. each bubble     its row or digit column first fitted to where its printed rings are (a curled page or a lens
//                      bends a photo by a millimetre or two); then each bubble's darkness: the mean of its inside
//                      against the paper just around it
//   4. each question   against the sheet's own levels (its empty bubbles and its clearly shaded ones): one clearly filled
//                      bubble is the answer; none is blank; two or more is `multiple`; a bubble between empty and filled
//                      (an erasure, a smudge, a light tick) makes the question `unclear`. Nothing is guessed: an unclear
//                      question has no answer, and the server gives it no mark
//   5. the numbers     the pre-shaded sheet number (four digits and a check digit: a misread number is no number) and,
//                      on a blank sheet, the roll number the child shaded
//
// A reading the corners or the orientation cannot be found for is refused (`no_sheet`), never half-read.

export const READ_PX = 6; // pixels a millimetre of the straightened page
// The straightened page kept for the review screen: smaller than the reading's, the same shape.
export const KEEP_PX = 5;

export type { BubbleReading };

export type ReadFailure = 'no_corners' | 'no_orientation' | 'misaligned';
export type ReadOutcome = { ok: true; reading: BubbleReading; page: Gray; levels: { empty: number; filled: number } } | { ok: false; why: ReadFailure };

// ---- 1. the corner squares ---------------------------------------------------------------------------------------------

type Region = { area: number; minX: number; maxX: number; minY: number; maxY: number; cx: number; cy: number; edge: boolean };

// The dark regions of a small frame (four-connected), against the paper's own brightness around them.
export function darkRegions(small: Gray): Region[] {
  const { width: w, height: h, data } = small;
  const paper = paperLevel(small).data;
  const dark = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) dark[i] = data[i] < paper[i] * 0.55 && paper[i] - data[i] > 40 ? 1 : 0;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out: Region[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!dark[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const r: Region = { area: 0, minX: w, maxX: 0, minY: h, maxY: 0, cx: 0, cy: 0, edge: false };
    while (top) {
      const i = stack[--top];
      const x = i % w;
      const y = (i - x) / w;
      r.area++;
      r.cx += x;
      r.cy += y;
      if (x < r.minX) r.minX = x;
      if (x > r.maxX) r.maxX = x;
      if (y < r.minY) r.minY = y;
      if (y > r.maxY) r.maxY = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) r.edge = true;
      if (x > 0 && dark[i - 1] && !seen[i - 1]) (seen[i - 1] = 1), (stack[top++] = i - 1);
      if (x < w - 1 && dark[i + 1] && !seen[i + 1]) (seen[i + 1] = 1), (stack[top++] = i + 1);
      if (y > 0 && dark[i - w] && !seen[i - w]) (seen[i - w] = 1), (stack[top++] = i - w);
      if (y < h - 1 && dark[i + w] && !seen[i + w]) (seen[i + w] = 1), (stack[top++] = i + w);
    }
    r.cx = r.cx / r.area + 0.5;
    r.cy = r.cy / r.area + 0.5;
    out.push(r);
  }
  return out;
}

// A solid, square-ish dark region of a plausible size for a corner square.
function squareLike(r: Region, short: number): boolean {
  const bw = r.maxX - r.minX + 1;
  const bh = r.maxY - r.minY + 1;
  const side = Math.sqrt(r.area);
  return !r.edge && side >= short * 0.008 && side <= short * 0.12 && bw / bh >= 0.5 && bw / bh <= 2 && r.area / (bw * bh) >= 0.55;
}

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
function quadArea(q: Quad): number {
  let a = 0;
  for (let i = 0; i < 4; i++) a += q[i].x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * q[i].y;
  return Math.abs(a) / 2;
}
// Convex, every corner between 50 and 130 degrees, and longer one way than the other about as an A4 sheet is.
function plausibleQuad(q: Quad): boolean {
  const sign = Math.sign(cross(q[0], q[1], q[2]));
  for (let i = 0; i < 4; i++) {
    if (Math.sign(cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4])) !== sign || sign === 0) return false;
    const p = q[(i + 3) % 4];
    const c = q[i];
    const n = q[(i + 1) % 4];
    const a = Math.atan2(p.y - c.y, p.x - c.x) - Math.atan2(n.y - c.y, n.x - c.x);
    const deg = Math.abs((((a * 180) / Math.PI + 540) % 360) - 180);
    if (deg < 50 || deg > 130) return false;
  }
  const len = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const across = (len(q[0], q[1]) + len(q[3], q[2])) / 2;
  const down = (len(q[0], q[3]) + len(q[1], q[2])) / 2;
  const ratio = Math.max(across, down) / Math.max(1e-9, Math.min(across, down));
  const want = (CORNERS[3].y - CORNERS[0].y) / (CORNERS[1].x - CORNERS[0].x);
  return ratio > want * 0.72 && ratio < want * 1.35;
}

export type Corners = { quad: Quad; agree: number }; // the squares' centres in the small frame's pixels, image order

// The four corner squares: among dark regions of about one size, the outermost one towards each corner of the frame.
// Every size present is tried; the largest plausible sheet wins.
export function findCorners(small: Gray): Corners | null {
  const short = Math.min(small.width, small.height);
  const squares = darkRegions(small).filter((r) => squareLike(r, short)).sort((a, b) => b.area - a.area);
  let best: Corners | null = null;
  let bestArea = 0.12 * small.width * small.height;
  for (const ref of squares.slice(0, 16)) {
    const group = squares.filter((r) => r.area >= ref.area / 2.2 && r.area <= ref.area * 2.2);
    if (group.length < 4) continue;
    const pick = (score: (r: Region) => number) => group.reduce((a, b) => (score(b) > score(a) ? b : a));
    const four = [pick((r) => -(r.cx + r.cy)), pick((r) => r.cx - r.cy), pick((r) => r.cx + r.cy), pick((r) => r.cy - r.cx)];
    if (new Set(four).size !== 4) continue;
    const quad = four.map((r) => ({ x: r.cx, y: r.cy })) as Quad;
    if (!plausibleQuad(quad)) continue;
    const area = quadArea(quad);
    if (area > bestArea) {
      const areas = four.map((r) => r.area);
      bestArea = area;
      best = { quad, agree: Math.min(...areas) / Math.max(...areas) };
    }
  }
  return best;
}

// ---- 2. the page -------------------------------------------------------------------------------------------------------

// The homography taking the layout's millimetres to a frame's pixels, given where the four squares' centres are (in the
// sheet's own order: top-left, top-right, bottom-right, bottom-left).
export function layoutToFrame(centres: Quad): (p: Point) => Point {
  const x0 = CORNERS[0].x;
  const y0 = CORNERS[0].y;
  const H = rectToQuad(CORNERS[1].x - x0, CORNERS[3].y - y0, centres);
  return (p) => {
    const u = p.x - x0;
    const v = p.y - y0;
    const z = H[6] * u + H[7] * v + H[8];
    return { x: (H[0] * u + H[1] * v + H[2]) / z, y: (H[3] * u + H[4] * v + H[5]) / z };
  };
}

// The four ways the sheet may lie in the photo: the frame's corners taken from each in turn as the sheet's top-left.
const turned = (q: Quad, k: number): Quad => [q[k % 4], q[(k + 1) % 4], q[(k + 2) % 4], q[(k + 3) % 4]];

// How dark a small square of the layout is in a frame, against the paper a few millimetres around it (0 to 1).
function patchDarkness(frame: Gray, map: (p: Point) => Point, at: Point, half: number): number {
  const inside: number[] = [];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const p = map({ x: at.x + i * half * 0.5, y: at.y + j * half * 0.5 });
    inside.push(pixelAt(frame, p.x - 0.5, p.y - 0.5));
  }
  const around: number[] = [];
  for (let a = 0; a < 12; a++) {
    const p = map({ x: at.x + Math.cos((a * Math.PI) / 6) * (half + 2.5), y: at.y + Math.sin((a * Math.PI) / 6) * (half + 2.5) });
    around.push(pixelAt(frame, p.x - 0.5, p.y - 0.5));
  }
  around.sort((a, b) => a - b);
  const paper = Math.max(1, around[Math.floor(around.length * 0.75)]);
  const mean = inside.reduce((s, v) => s + v, 0) / inside.length;
  return Math.min(1, Math.max(0, 1 - mean / paper));
}

// Which way up: the turn whose orientation mark is dark while the others' places are paper.
function orientation(small: Gray, quad: Quad): { k: number; margin: number } | null {
  const marks = [0, 1, 2, 3].map((k) => patchDarkness(small, layoutToFrame(turned(quad, k)), ORIENT, ORIENT.size / 2));
  const order = marks.map((d, k) => ({ d, k })).sort((a, b) => b.d - a.d);
  if (order[0].d < 0.4 || order[1].d > Math.max(0.25, order[0].d * 0.5)) return null;
  return { k: order[0].k, margin: order[0].d - order[1].d };
}

// The photo mapped onto the layout's page at `px` pixels a millimetre.
export function straightenSheet(photo: Gray, centres: Quad, px: number): Gray {
  const map = layoutToFrame(centres);
  const pageQuad = [map({ x: 0, y: 0 }), map({ x: PAGE_W, y: 0 }), map({ x: PAGE_W, y: PAGE_H }), map({ x: 0, y: PAGE_H })] as Quad;
  return straighten(photo, pageQuad, Math.round(PAGE_W * px), Math.round(PAGE_H * px));
}

// ---- 3. each bubble ----------------------------------------------------------------------------------------------------

const at = (page: Gray, xMm: number, yMm: number) => pixelAt(page, xMm * READ_PX - 0.5, yMm * READ_PX - 0.5);

// How well a group of bubbles' printed rings sit at an offset: the paper just outside each ring against the ring itself.
function ringFit(page: Gray, bubbles: readonly Bubble[], dx: number, dy: number): number {
  let s = 0;
  for (const b of bubbles)
    for (let a = 0; a < 16; a++) {
      const c = Math.cos((a * Math.PI) / 8);
      const n = Math.sin((a * Math.PI) / 8);
      s += at(page, b.x + dx + c * (b.r + 0.75), b.y + dy + n * (b.r + 0.75)) - at(page, b.x + dx + c * b.r, b.y + dy + n * b.r);
    }
  return s;
}

// A group (a question's row, a digit column) moved to where its rings are, within 1.5 mm.
export function fitGroup(page: Gray, bubbles: readonly Bubble[]): Bubble[] {
  let best = { dx: 0, dy: 0, s: ringFit(page, bubbles, 0, 0) };
  for (let i = -3; i <= 3; i++)
    for (let j = -3; j <= 3; j++) {
      if (!i && !j) continue;
      const s = ringFit(page, bubbles, i * 0.5, j * 0.5);
      if (s > best.s) best = { dx: i * 0.5, dy: j * 0.5, s };
    }
  // A finer step about the best.
  const coarse = best;
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++) {
      if (!i && !j) continue;
      const s = ringFit(page, bubbles, coarse.dx + i * 0.125, coarse.dy + j * 0.125);
      if (s > best.s) best = { dx: coarse.dx + i * 0.125, dy: coarse.dy + j * 0.125, s };
    }
  return bubbles.map((b) => ({ ...b, x: b.x + best.dx, y: b.y + best.dy }));
}

// A bubble's darkness, 0 (paper) to 1 (black): the mean of its inside (well within the printed ring) against the paper
// just around it (the brighter part of a ring of points, so a neighbour's ink or a printed letter does not lower it).
export function bubbleDarkness(page: Gray, b: Bubble): number {
  const cx = b.x * READ_PX;
  const cy = b.y * READ_PX;
  const rIn = b.r * 0.6 * READ_PX;
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(cy - rIn); y <= Math.ceil(cy + rIn); y++)
    for (let x = Math.floor(cx - rIn); x <= Math.ceil(cx + rIn); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > rIn * rIn || x < 0 || y < 0 || x >= page.width || y >= page.height) continue;
      sum += page.data[y * page.width + x];
      n++;
    }
  const ring: number[] = [];
  for (let a = 0; a < 24; a++)
    for (const rr of [b.r + 0.5, b.r + 0.8]) ring.push(at(page, b.x + Math.cos((a * Math.PI) / 12) * rr, b.y + Math.sin((a * Math.PI) / 12) * rr));
  ring.sort((a, b2) => a - b2);
  const paper = Math.max(1, ring[Math.floor(ring.length * 0.8)]);
  return n ? Math.min(1, Math.max(0, 1 - sum / n / paper)) : 0;
}

// ---- 4. deciding -------------------------------------------------------------------------------------------------------

// The share of the way from an empty bubble to a filled one (the sheet's own levels) below which a bubble is empty, and
// from which it is filled; between the two it is unclear. A bubble barely darker than an empty one is always empty.
export const EMPTY_BELOW = 0.18;
export const FILLED_FROM = 0.6;
const NOISE = 0.07;

export type Mark = 'empty' | 'filled' | 'faint';
export type Levels = { empty: number; filled: number; contrast: number };

const quantile = (sorted: readonly number[], q: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1) + 0.5)))] : 0);

// The sheet's empty level (most bubbles are empty: the lower quarter) and filled level (the clearly darker ones); with
// nothing shaded, an assumed filled level well above the empty one.
export function sheetLevels(values: readonly number[]): Levels {
  const sorted = [...values].sort((a, b) => a - b);
  const empty = quantile(sorted, 0.25);
  const dark = sorted.filter((d) => d - empty >= 0.2);
  const filled = Math.max(empty + 0.25, dark.length ? quantile(dark, 0.6) : empty + 0.6);
  return { empty, filled, contrast: dark.length ? filled - empty : 0.6 };
}

export function markOf(d: number, lv: Levels): Mark {
  if (d - lv.empty < NOISE) return 'empty';
  const f = (d - lv.empty) / (lv.filled - lv.empty);
  return f < EMPTY_BELOW ? 'empty' : f >= FILLED_FROM ? 'filled' : 'faint';
}

// One digit column of a pre-shaded number: one bubble printed solid, clearly darker than the other nine.
function printedDigit(values: readonly number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  const base = sorted[4];
  const top = sorted[9];
  const second = sorted[8];
  if (top - base < 0.3 || second - base > 0.35 * (top - base)) return null;
  return values.indexOf(top);
}

// ---- the whole sheet ---------------------------------------------------------------------------------------------------

export function readSheet(photo: Gray, layout: SheetLayout): ReadOutcome {
  const small = shrinkTo(photo, 1000);
  const corners = findCorners(small);
  if (!corners) return { ok: false, why: 'no_corners' };
  const turn = orientation(small, corners.quad);
  if (!turn) return { ok: false, why: 'no_orientation' };
  const k = photo.width / small.width;
  const centres = turned(corners.quad, turn.k).map((p) => ({ x: p.x * k, y: p.y * (photo.height / small.height) })) as Quad;
  const page = straightenSheet(photo, centres, READ_PX);

  // The straightened page must show the four squares where the layout has them and paper beside them.
  const map = (p: Point) => ({ x: p.x * READ_PX, y: p.y * READ_PX });
  for (const c of CORNERS) {
    const inSquare = patchDarkness(page, map, c, CORNER_SIZE / 2 - 1);
    if (inSquare < 0.45) return { ok: false, why: 'misaligned' };
  }

  // Answers.
  const rows = layout.questions.map((q) => fitGroup(page, q.bubbles));
  const darkness = rows.map((bs) => bs.map((b) => bubbleDarkness(page, b)));
  const levels = sheetLevels(darkness.flat());
  const answers: Record<string, OptionKey[]> = {};
  const unclear: string[] = [];
  const multiple: string[] = [];
  layout.questions.forEach((q, i) => {
    const marks = darkness[i].map((d) => markOf(d, levels));
    const filled = q.keys.filter((_, j) => marks[j] === 'filled');
    if (marks.includes('faint')) unclear.push(q.label);
    else if (filled.length >= 2) multiple.push(q.label);
    if (filled.length) answers[q.label] = filled;
  });

  // The sheet number: printed, so read on its own levels; the check digit must agree.
  const sheetDigits = layout.sheetNo.map((col) => printedDigit(fitGroup(page, col).map((b) => bubbleDarkness(page, b))));
  const sheetNo = sheetDigits.length === SHEET_DIGITS + 1 && sheetDigits.every((d) => d !== null) ? sheetNoFrom(sheetDigits as number[]) : null;

  // The roll number: shaded by the child (or pre-shaded on a named sheet), on the answers' levels.
  const rollMarks = layout.roll.map((col) => fitGroup(page, col).map((b) => markOf(bubbleDarkness(page, b), levels)));
  let roll: string | null = null;
  let rollUnclear = false;
  const digits = rollMarks.map((m) => {
    if (m.includes('faint') || m.filter((x) => x === 'filled').length > 1) return 'bad' as const;
    const at1 = m.indexOf('filled');
    return at1 < 0 ? null : at1;
  });
  if (digits.includes('bad')) rollUnclear = true;
  else {
    const shaded = digits.map((d, i) => (d === null ? -1 : i)).filter((i) => i >= 0);
    if (shaded.length) {
      const first = shaded[0];
      const last = shaded[shaded.length - 1];
      if (last - first + 1 !== shaded.length || shaded.length > ROLL_DIGITS) rollUnclear = true;
      else roll = digits.slice(first, last + 1).join('');
    }
  }

  // How sure: the sheet's contrast between empty and filled, the squares' agreement and the orientation's margin.
  const separation = Math.min(1, Math.max(0, (levels.contrast - 0.2) / 0.3));
  const fit = 0.75 + 0.25 * Math.min(1, corners.agree / 0.7) * Math.min(1, turn.margin / 0.5);
  const confidence = Math.round(Math.min(1, (0.55 + 0.45 * separation) * fit * (sheetNo === null ? 0.9 : 1)) * 100) / 100;

  return {
    ok: true,
    reading: { layout: layout.key, sheetNo, roll, rollUnclear, answers, unclear, multiple, confidence },
    page,
    levels: { empty: levels.empty, filled: levels.filled },
  };
}

// The picture kept of a read sheet: the straightened page, evened, at KEEP_PX pixels a millimetre (1050 × 1485).
export function keptPicture(page: Gray): Gray {
  return evenContrast(shrinkTo(page, Math.round(PAGE_H * KEEP_PX)));
}
