// The phone scanner's picture work (C230-AJ), in-house and small: no OpenCV.js (about 8 MB), no dependency. Every function
// here works on plain arrays of grey pixels, so it runs in the scan screen's Web Worker (src/components/marking/
// scan.worker.ts), in the measurement (scripts/measure_scan_sizes.mjs) and in the tests on small made-up pictures
// (test/marking/scan-image.test.ts) alike.
//
//   finding the page    the frame made small and soft, split into paper and the rest at Otsu's line, the largest bright
//                       region taken, its outline's convex hull, and the four hull corners that hold the most area
//   straightening       the four corners mapped to a rectangle (a homography), read near 1:1 after an area-average
//                       shrink, so a thin pencil line is never skipped between the pixels read
//   deskew              the small slant left in the writing, from the rows of ink (a projection profile), turned back
//   evening             the paper's own brightness found block by block (shadows, a lamp on one side) and divided out;
//                       then the ink's darkest level set to black and the paper to white. Never a hard black-and-white:
//                       pencil and diagrams keep their greys.

export type Gray = { width: number; height: number; data: Uint8ClampedArray };
export type Point = { x: number; y: number };
// Top-left, top-right, bottom-right, bottom-left.
export type Quad = [Point, Point, Point, Point];

export const gray = (width: number, height: number, fill = 255): Gray => ({ width, height, data: new Uint8ClampedArray(width * height).fill(fill) });

// ---- colour to grey, and smaller ----------------------------------------------------------------------------------------

export function rgbaToGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Gray {
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114 + 500) / 1000;
  return { width, height, data: out };
}

export function grayToRgba(g: Gray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(g.width * g.height * 4);
  for (let i = 0, j = 0; i < g.data.length; i++, j += 4) {
    const v = g.data[i];
    out[j] = v;
    out[j + 1] = v;
    out[j + 2] = v;
    out[j + 3] = 255;
  }
  return out;
}

// The longest side at most `maxEdge`, the shape kept; never larger.
export function fitEdge(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  const k = maxEdge / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

// Area-average resampling to the given size (each output pixel the mean of the source pixels it covers): a thin line
// becomes a lighter line, never a gap.
export function resize(g: Gray, width: number, height: number): Gray {
  if (width === g.width && height === g.height) return { width, height, data: new Uint8ClampedArray(g.data) };
  const out = new Uint8ClampedArray(width * height);
  const sx = g.width / width;
  const sy = g.height / height;
  if (sx < 1 || sy < 1) {
    // Larger: bilinear.
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) out[y * width + x] = pixelAt(g, (x + 0.5) * sx - 0.5, (y + 0.5) * sy - 0.5);
    return { width, height, data: out };
  }
  for (let y = 0; y < height; y++) {
    const y0 = y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < width; x++) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      let sum = 0;
      let area = 0;
      for (let yy = Math.floor(y0); yy < Math.min(g.height, Math.ceil(y1)); yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        if (wy <= 0) continue;
        const row = yy * g.width;
        for (let xx = Math.floor(x0); xx < Math.min(g.width, Math.ceil(x1)); xx++) {
          const w = wy * (Math.min(xx + 1, x1) - Math.max(xx, x0));
          if (w <= 0) continue;
          sum += g.data[row + xx] * w;
          area += w;
        }
      }
      out[y * width + x] = area > 0 ? sum / area : 255;
    }
  }
  return { width, height, data: out };
}

export function shrinkTo(g: Gray, maxEdge: number): Gray {
  const size = fitEdge(g.width, g.height, maxEdge);
  return resize(g, size.width, size.height);
}

// A pixel read between pixels (bilinear); outside the picture is white (paper).
export function pixelAt(g: Gray, x: number, y: number): number {
  if (x < -0.5 || y < -0.5 || x > g.width - 0.5 || y > g.height - 0.5) return 255;
  const cx = Math.min(Math.max(x, 0), g.width - 1);
  const cy = Math.min(Math.max(y, 0), g.height - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(x0 + 1, g.width - 1);
  const y1 = Math.min(y0 + 1, g.height - 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const d = g.data;
  const w = g.width;
  return (d[y0 * w + x0] * (1 - fx) + d[y0 * w + x1] * fx) * (1 - fy) + (d[y1 * w + x0] * (1 - fx) + d[y1 * w + x1] * fx) * fy;
}

// A box blur of radius r, in two passes over running sums.
export function boxBlur(g: Gray, r: number): Gray {
  if (r < 1) return { ...g, data: new Uint8ClampedArray(g.data) };
  const { width: w, height: h } = g;
  const tmp = new Float32Array(w * h);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    let acc = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) acc += g.data[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / (2 * r + 1);
      acc += g.data[row + Math.min(w - 1, x + r + 1)] - g.data[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / (2 * r + 1);
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return { width: w, height: h, data: out };
}

// Otsu's line between dark and bright.
export function otsu(g: Gray): number {
  const hist = new Float64Array(256);
  for (const v of g.data) hist[v]++;
  const total = g.data.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let line = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      line = t;
    }
  }
  return line;
}

// ---- finding the page ----------------------------------------------------------------------------------------------------

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

export function convexHull(points: readonly Point[]): Point[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const lower: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Point[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function polygonArea(pts: readonly Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

// The four corners in the order top-left, top-right, bottom-right, bottom-left.
export function orderQuad(pts: readonly Point[]): Quad {
  const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  const byAngle = [...pts].sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x));
  // Clockwise on the screen from the one nearest the top-left.
  let start = 0;
  for (let i = 1; i < 4; i++) if (byAngle[i].x + byAngle[i].y < byAngle[start].x + byAngle[start].y) start = i;
  return [0, 1, 2, 3].map((k) => byAngle[(start + k) % 4]) as Quad;
}

// The four hull corners that hold the most area (the hull thinned first, so this stays small).
function largestQuad(hull: readonly Point[]): Point[] {
  // Thinned only when very long, keeping the points that turn the most (the corners), so the search stays small.
  let pts = hull;
  while (pts.length > 120) {
    const turn = (i: number) => Math.abs(cross(pts[(i + pts.length - 1) % pts.length], pts[i], pts[(i + 1) % pts.length]));
    const order = pts.map((_, i) => i).sort((x, y) => turn(y) - turn(x));
    const keep = new Set(order.slice(0, Math.ceil(pts.length / 2)));
    pts = pts.filter((_, i) => keep.has(i));
  }
  const n = pts.length;
  if (n <= 4) return [...pts];
  let best = -1;
  let bestQ: Point[] = [];
  for (let i = 0; i < n; i++)
    for (let k = i + 2; k < n; k++) {
      // The best third and fourth corners on either side of the diagonal i–k.
      let a1 = -1;
      let j1 = -1;
      for (let j = i + 1; j < k; j++) {
        const a = Math.abs(cross(pts[i], pts[j], pts[k]));
        if (a > a1) (a1 = a), (j1 = j);
      }
      let a2 = -1;
      let j2 = -1;
      for (let j = k + 1; j < n + i; j++) {
        const a = Math.abs(cross(pts[i], pts[j % n], pts[k]));
        if (a > a2) (a2 = a), (j2 = j % n);
      }
      if (j1 < 0 || j2 < 0) continue;
      if (a1 + a2 > best) {
        best = a1 + a2;
        bestQ = [pts[i], pts[j1], pts[k], pts[j2]];
      }
    }
  return bestQ;
}

export type Detected = { quad: Quad; score: number };

// The page in a small grey frame (a long edge of about 160 to 320 px): its four corners in the frame's own pixels, and
// how sure (0 to 1: how much of the four-cornered shape the bright region fills, and how much of the frame it takes).
// Null when no page-like bright region is there.
export function detectPage(frame: Gray): Detected | null {
  const g = boxBlur(frame, 2);
  const { width: w, height: h } = g;
  const line = otsu(g);
  // Paper is the bright side; too little contrast means nothing to tell apart.
  let lo = 0;
  let hi = 0;
  let nLo = 0;
  let nHi = 0;
  for (const v of g.data) {
    if (v > line) (hi += v), nHi++;
    else (lo += v), nLo++;
  }
  if (!nHi) return null;
  // The paper fills the whole frame: the whole frame is the page.
  if (!nLo || hi / nHi - lo / nLo < 25) {
    return nHi / g.data.length > 0.9 ? { quad: [{ x: 0, y: 0 }, { x: w - 1, y: 0 }, { x: w - 1, y: h - 1 }, { x: 0, y: h - 1 }], score: 0.5 } : null;
  }
  // The largest bright region (four-connected), by a flood from each unseen bright pixel.
  const label = new Int32Array(w * h).fill(-1);
  let bestId = -1;
  let bestSize = 0;
  const stack = new Int32Array(w * h);
  let id = 0;
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || g.data[start] <= line) continue;
    let top = 0;
    stack[top++] = start;
    label[start] = id;
    let size = 0;
    while (top) {
      const i = stack[--top];
      size++;
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0 && label[i - 1] === -1 && g.data[i - 1] > line) (label[i - 1] = id), (stack[top++] = i - 1);
      if (x < w - 1 && label[i + 1] === -1 && g.data[i + 1] > line) (label[i + 1] = id), (stack[top++] = i + 1);
      if (y > 0 && label[i - w] === -1 && g.data[i - w] > line) (label[i - w] = id), (stack[top++] = i - w);
      if (y < h - 1 && label[i + w] === -1 && g.data[i + w] > line) (label[i + w] = id), (stack[top++] = i + w);
    }
    if (size > bestSize) (bestSize = size), (bestId = id);
    id++;
  }
  if (bestSize < 0.12 * w * h) return null;
  // Its outline: the region's leftmost and rightmost pixel on each row, and topmost and bottommost on each column.
  const edge: Point[] = [];
  for (let y = 0; y < h; y++) {
    let a = -1;
    let b = -1;
    for (let x = 0; x < w; x++) if (label[y * w + x] === bestId) (a = a < 0 ? x : a), (b = x);
    if (a >= 0) edge.push({ x: a, y }, { x: b, y });
  }
  const hull = convexHull(edge);
  const corners = largestQuad(hull);
  if (corners.length !== 4) return null;
  const quad = orderQuad(corners);
  const area = polygonArea(quad);
  if (area < 0.12 * w * h) return null;
  const fill = Math.min(1, bestSize / area);
  // A page is a fairly regular shape: no corner far from a right angle.
  for (let i = 0; i < 4; i++) {
    const p = quad[(i + 3) % 4];
    const q = quad[i];
    const r = quad[(i + 1) % 4];
    const a = Math.atan2(p.y - q.y, p.x - q.x) - Math.atan2(r.y - q.y, r.x - q.x);
    const deg = Math.abs(((a * 180) / Math.PI + 540) % 360 - 180);
    if (deg < 45 || deg > 135) return null;
  }
  return { quad, score: Math.max(0, Math.min(1, fill * Math.min(1, area / (0.35 * w * h)))) };
}

// Corners from one frame's pixels to another's (the small detection frame to the full photo), or to 0..1 and back.
export const scaleQuad = (q: Quad, kx: number, ky: number): Quad => q.map((p) => ({ x: p.x * kx, y: p.y * ky })) as Quad;

// ---- straightening -------------------------------------------------------------------------------------------------------

// The 3×3 homography taking the rectangle (0,0)–(w,h) to the quad (row-major, h33 = 1).
export function rectToQuad(w: number, h: number, q: Quad): number[] {
  const [p0, p1, p2, p3] = q;
  // Unit square to quad (Heckbert), then scaled by the rectangle.
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  let g = 0;
  let hh = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (sx * dy2 - dx2 * sy) / den;
    hh = (dx1 * sy - sx * dy1) / den;
  }
  const a = p1.x - p0.x + g * p1.x;
  const b = p3.x - p0.x + hh * p3.x;
  const c = p0.x;
  const d = p1.y - p0.y + g * p1.y;
  const e = p3.y - p0.y + hh * p3.y;
  const f = p0.y;
  return [a / w, b / h, c, d / w, e / h, f, g / w, hh / h, 1];
}

// The size the straightened page is made at: its sides' lengths in the photo, the longest at most `maxEdge`.
export function pageSize(q: Quad, maxEdge: number): { width: number; height: number } {
  const len = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const width = (len(q[0], q[1]) + len(q[3], q[2])) / 2;
  const height = (len(q[0], q[3]) + len(q[1], q[2])) / 2;
  return fitEdge(width, height, maxEdge);
}

// The page cut out along the quad and made a rectangle of the given size. The photo is first made smaller (area
// average) until the page in it is about the size asked for, so the sampling is near one to one.
export function straighten(photo: Gray, q: Quad, width: number, height: number): Gray {
  const len = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const across = Math.max(len(q[0], q[1]), len(q[3], q[2]), len(q[0], q[3]), len(q[1], q[2]));
  const k = Math.min(1, (Math.max(width, height) * 1.05) / across);
  let src = photo;
  let quad = q;
  if (k < 0.95) {
    src = resize(photo, Math.max(1, Math.round(photo.width * k)), Math.max(1, Math.round(photo.height * k)));
    quad = scaleQuad(q, src.width / photo.width, src.height / photo.height);
  }
  const H = rectToQuad(width, height, quad);
  const out = new Uint8ClampedArray(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x + 0.5;
      const v = y + 0.5;
      const z = H[6] * u + H[7] * v + H[8];
      out[y * width + x] = pixelAt(src, (H[0] * u + H[1] * v + H[2]) / z - 0.5, (H[3] * u + H[4] * v + H[5]) / z - 0.5);
    }
  }
  return { width, height, data: out };
}

// ---- deskew -----------------------------------------------------------------------------------------------------------

// The writing's slant in degrees (positive: lines fall to the right), within ±maxDeg: the angle at which the rows of ink
// are the most sharply separated (the sum of squared row counts, on a small copy).
export function estimateSkew(g: Gray, maxDeg = 4, step = 0.25): number {
  const small = shrinkTo(g, 600);
  const { width: w, height: h } = small;
  const line = Math.min(otsu(small), 200);
  const ink: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (small.data[y * w + x] < line) ink.push(x, y);
  if (ink.length < 2 * 50) return 0;
  let bestDeg = 0;
  let best = -1;
  let flat = -1;
  for (let deg = -maxDeg; deg <= maxDeg + 1e-9; deg += step) {
    const t = Math.tan((deg * Math.PI) / 180);
    const rows = new Float64Array(h * 2 + 2);
    for (let i = 0; i < ink.length; i += 2) {
      const r = Math.round(ink[i + 1] - ink[i] * t) + h;
      if (r >= 0 && r < rows.length) rows[r]++;
    }
    let score = 0;
    for (const c of rows) score += c * c;
    if (Math.abs(deg) < 1e-9) flat = score;
    if (score > best) (best = score), (bestDeg = deg);
  }
  // Not clearly better than straight: leave it.
  return best > flat * 1.02 ? Math.round(bestDeg * 100) / 100 : 0;
}

// The content turned about the centre by `deg` (positive: clockwise on the screen), the same size, white where nothing
// comes in.
export function rotate(g: Gray, deg: number): Gray {
  if (Math.abs(deg) < 1e-6) return { ...g, data: new Uint8ClampedArray(g.data) };
  const a = (deg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const cx = (g.width - 1) / 2;
  const cy = (g.height - 1) / 2;
  const out = new Uint8ClampedArray(g.width * g.height);
  for (let y = 0; y < g.height; y++)
    for (let x = 0; x < g.width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      out[y * g.width + x] = pixelAt(g, cx + dx * cos + dy * sin, cy - dx * sin + dy * cos);
    }
  return { width: g.width, height: g.height, data: out };
}

// ---- evening the contrast ------------------------------------------------------------------------------------------------

// The paper's own brightness everywhere: a bright level (the 90th percentile) of each block, smoothed, then spread
// over the page bilinearly. Ink is a small part of any block, so it does not pull the paper down.
export function paperLevel(g: Gray, block?: number): Gray {
  const { width: w, height: h } = g;
  const b = block ?? Math.max(12, Math.round(Math.max(w, h) / 32));
  const gw = Math.ceil(w / b);
  const gh = Math.ceil(h / b);
  const grid = new Float32Array(gw * gh);
  const hist = new Uint32Array(256);
  for (let by = 0; by < gh; by++)
    for (let bx = 0; bx < gw; bx++) {
      hist.fill(0);
      let n = 0;
      for (let y = by * b; y < Math.min(h, (by + 1) * b); y++)
        for (let x = bx * b; x < Math.min(w, (bx + 1) * b); x++) {
          hist[g.data[y * w + x]]++;
          n++;
        }
      let seen = 0;
      let v = 255;
      for (let i = 255; i >= 0; i--) {
        seen += hist[i];
        if (seen >= n * 0.1) {
          v = i;
          break;
        }
      }
      grid[by * gw + bx] = v;
    }
  // A block that is nearly all ink (a filled diagram) takes its neighbours' paper: the brightest of the 3×3 around it.
  const smooth = new Float32Array(gw * gh);
  for (let by = 0; by < gh; by++)
    for (let bx = 0; bx < gw; bx++) {
      let m = 0;
      let sum = 0;
      let n = 0;
      for (let yy = Math.max(0, by - 1); yy <= Math.min(gh - 1, by + 1); yy++)
        for (let xx = Math.max(0, bx - 1); xx <= Math.min(gw - 1, bx + 1); xx++) {
          const v = grid[yy * gw + xx];
          m = Math.max(m, v);
          sum += v;
          n++;
        }
      smooth[by * gw + bx] = Math.max(grid[by * gw + bx], 0.5 * m + 0.5 * (sum / n));
    }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const gy = Math.min(gh - 1, Math.max(0, (y + 0.5) / b - 0.5));
    const y0 = Math.floor(gy);
    const y1 = Math.min(gh - 1, y0 + 1);
    const fy = gy - y0;
    for (let x = 0; x < w; x++) {
      const gx = Math.min(gw - 1, Math.max(0, (x + 0.5) / b - 0.5));
      const x0 = Math.floor(gx);
      const x1 = Math.min(gw - 1, x0 + 1);
      const fx = gx - x0;
      out[y * w + x] = (smooth[y0 * gw + x0] * (1 - fx) + smooth[y0 * gw + x1] * fx) * (1 - fy) + (smooth[y1 * gw + x0] * (1 - fx) + smooth[y1 * gw + x1] * fx) * fy;
    }
  }
  return { width: w, height: h, data: out };
}

// The paper made evenly white and the ink's darkest level black, with the greys between kept in order: shadows and an
// uneven lamp go, pencil stays grey. `white`: from this level up (after the paper is divided out) is paper.
export function evenContrast(g: Gray, { white = 232 }: { white?: number } = {}): Gray {
  const paper = paperLevel(g);
  const n = g.data.length;
  const flat = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) flat[i] = (g.data[i] * 255) / Math.max(24, paper.data[i]);
  // The ink's darkest level: the 0.5th percentile, held below the paper so a blank page is not stretched into noise.
  const hist = new Uint32Array(256);
  for (const v of flat) hist[v]++;
  let seen = 0;
  let black = 0;
  for (let i = 0; i < 256; i++) {
    seen += hist[i];
    if (seen >= n * 0.005) {
      black = i;
      break;
    }
  }
  black = Math.min(black, 110);
  const span = Math.max(40, white - black);
  const out = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) out[i] = ((flat[i] - black) * 255) / span;
  return { width: g.width, height: g.height, data: out };
}

// ---- one page, start to end ------------------------------------------------------------------------------------------------

export type ProcessOptions = { maxEdge: number; deskew?: boolean };

// A photographed page made ready to send: cut out and straightened along `quad` (in the photo's pixels; null: the whole
// photo), turned straight if its writing slants, and its contrast evened; at most `maxEdge` on its longest side.
export function processPage(photo: Gray, quad: Quad | null, { maxEdge, deskew = true }: ProcessOptions): Gray {
  const q: Quad = quad ?? [{ x: 0, y: 0 }, { x: photo.width, y: 0 }, { x: photo.width, y: photo.height }, { x: 0, y: photo.height }];
  const size = pageSize(q, maxEdge);
  let page = straighten(photo, q, size.width, size.height);
  if (deskew) {
    const deg = estimateSkew(page);
    // Lines that fall to the right are turned back, anticlockwise.
    if (Math.abs(deg) >= 0.3) page = rotate(page, -deg);
  }
  return evenContrast(page);
}
