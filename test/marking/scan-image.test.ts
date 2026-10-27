import { describe, expect, it } from 'vitest';
import { SteadyWatch } from '@/lib/marking/scan-steady';
import {
  convexHull,
  detectPage,
  estimateSkew,
  evenContrast,
  fitEdge,
  gray,
  grayToRgba,
  orderQuad,
  otsu,
  pageSize,
  processPage,
  rectToQuad,
  resize,
  rgbaToGray,
  rotate,
  pixelAt,
  straighten,
  type Gray,
  type Quad,
} from '@/lib/marking/scan-image';

// The scan worker's picture functions (C230-AJ) on small made-up pictures: finding the page, straightening it, the
// writing's slant, evening the contrast without losing pencil, and holding still.

const at = (g: Gray, x: number, y: number) => g.data[Math.round(y) * g.width + Math.round(x)];
const inside = (p: { x: number; y: number }, q: Quad) => {
  // Inside a convex quad (corners in order): on the same side of each edge.
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (c !== 0) {
      if (sign === 0) sign = Math.sign(c);
      else if (Math.sign(c) !== sign) return false;
    }
  }
  return true;
};
// A frame: dark table, a white page with the given corners, a few dark marks on the page.
function photo(width: number, height: number, page: Quad, { table = 50, paper = 235 } = {}): Gray {
  const g = gray(width, height, table);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (inside({ x: x + 0.5, y: y + 0.5 }, page)) g.data[y * width + x] = paper;
  return g;
}
const near = (a: { x: number; y: number }, b: { x: number; y: number }, tol: number) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

describe('grey pixels and sizes', () => {
  it('colour to grey and back', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 200, 200, 200, 255]);
    const g = rgbaToGray(rgba, 2, 2);
    expect([...g.data]).toEqual([77, 150, 30, 200]);
    expect([...grayToRgba(g)].slice(12)).toEqual([200, 200, 200, 255]);
  });

  it('a long edge fitted, the shape kept, never made larger', () => {
    expect(fitEdge(4000, 3000, 1400)).toEqual({ width: 1400, height: 1050 });
    expect(fitEdge(900, 1200, 1400)).toEqual({ width: 900, height: 1200 });
  });

  it('made smaller by area average: a one-pixel pencil line becomes a lighter line, never a gap', () => {
    const g = gray(99, 99, 255);
    for (let y = 0; y < 99; y++) g.data[y * 99 + 50] = 155; // a pencil line, one pixel wide, at x = 50
    const small = resize(g, 33, 33);
    // Every row of the small picture still shows it (at x = 16, the block 48..51).
    for (let y = 0; y < 33; y++) expect(at(small, 16, y)).toBeLessThan(230);
    // Reading the nearest pixel alone would have missed it on two thirds of the columns; the paper stays white.
    expect(at(small, 5, 5)).toBe(255);
  });

  it('Otsu’s line falls between the two levels', () => {
    const g = gray(10, 10, 40);
    for (let i = 0; i < 50; i++) g.data[i] = 220;
    const t = otsu(g);
    expect(t).toBeGreaterThanOrEqual(40);
    expect(t).toBeLessThan(220);
  });

  it('a convex hull and the corners in reading order', () => {
    const hull = convexHull([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 5 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
    expect(hull).toHaveLength(4);
    expect(orderQuad([{ x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 0 }])).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]);
  });
});

describe('finding the page', () => {
  it('a tilted page on a dark table: its four corners, in order, within a few pixels', () => {
    const page: Quad = [{ x: 40, y: 22 }, { x: 170, y: 35 }, { x: 160, y: 225 }, { x: 28, y: 210 }];
    const found = detectPage(photo(200, 250, page));
    expect(found).not.toBeNull();
    for (let i = 0; i < 4; i++) expect(near(found!.quad[i], page[i], 4)).toBe(true);
    expect(found!.score).toBeGreaterThan(0.8);
  });

  it('a page seen in perspective (narrower at the top) is found too', () => {
    const page: Quad = [{ x: 70, y: 30 }, { x: 150, y: 30 }, { x: 190, y: 230 }, { x: 20, y: 230 }];
    const found = detectPage(photo(220, 260, page));
    for (let i = 0; i < 4; i++) expect(near(found!.quad[i], page[i], 4)).toBe(true);
  });

  it('nothing page-like: a plain frame, or a bright spot too small to be a page', () => {
    expect(detectPage(gray(160, 200, 90))).toBeNull();
    expect(detectPage(photo(160, 200, [{ x: 70, y: 80 }, { x: 90, y: 80 }, { x: 90, y: 100 }, { x: 70, y: 100 }]))).toBeNull();
  });

  it('a page filling the whole frame is the whole frame', () => {
    const found = detectPage(gray(120, 160, 230));
    expect(found?.quad).toEqual([{ x: 0, y: 0 }, { x: 119, y: 0 }, { x: 119, y: 159 }, { x: 0, y: 159 }]);
  });
});

describe('straightening', () => {
  it('the rectangle’s corners go to the quad’s, and a mark on the page lands where it is on the paper', () => {
    const q: Quad = [{ x: 30, y: 20 }, { x: 260, y: 40 }, { x: 280, y: 330 }, { x: 10, y: 300 }];
    const H = rectToQuad(100, 140, q);
    const map = (u: number, v: number) => {
      const z = H[6] * u + H[7] * v + H[8];
      return { x: (H[0] * u + H[1] * v + H[2]) / z, y: (H[3] * u + H[4] * v + H[5]) / z };
    };
    for (const [[u, v], p] of [[[0, 0], q[0]], [[100, 0], q[1]], [[100, 140], q[2]], [[0, 140], q[3]]] as const) expect(near(map(u, v), p, 1e-6)).toBe(true);
    // A page photographed in perspective, with a dark square a quarter of the way across and down.
    const src = gray(300, 360, 60);
    for (let y = 0; y < 360; y++)
      for (let x = 0; x < 300; x++) {
        if (!inside({ x, y }, q)) continue;
        // Where on the page (0..1) this pixel is: invert by searching the map (the test's own slow way).
        src.data[y * 300 + x] = 240;
      }
    const mark = map(25, 35);
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) src.data[Math.round(mark.y + y) * 300 + Math.round(mark.x + x)] = 10;
    const out = straighten(src, q, 100, 140);
    expect(out.width).toBe(100);
    expect(out.height).toBe(140);
    expect(at(out, 25, 35)).toBeLessThan(80);
    expect(at(out, 70, 100)).toBeGreaterThan(200);
    // The table is cut away: the corners are paper.
    expect(at(out, 2, 2)).toBeGreaterThan(150);
    expect(at(out, 97, 137)).toBeGreaterThan(150);
  });

  it('the size follows the page’s sides, at most the long edge asked for', () => {
    expect(pageSize([{ x: 0, y: 0 }, { x: 2100, y: 0 }, { x: 2100, y: 2970 }, { x: 0, y: 2970 }], 1400)).toEqual({ width: 990, height: 1400 });
  });
});

describe('the writing’s slant', () => {
  // Lines of "writing": short dark dashes in rows, every 12 px.
  function lines(width: number, height: number): Gray {
    const g = gray(width, height, 250);
    for (let y = 20; y < height - 20; y += 12) for (let x = 20; x < width - 20; x++) if (x % 9 < 6) for (let t = 0; t < 3; t++) g.data[(y + t) * width + x] = 30;
    return g;
  }

  it('straight writing is left as it is', () => {
    expect(estimateSkew(lines(300, 300))).toBe(0);
  });

  it('writing that falls 2° to the right is found, and turning it back leaves none', () => {
    const slanted = rotate(lines(320, 320), 2);
    // Positive: the lines fall to the right.
    expect(pixelAt(slanted, 280, 100)).toBeDefined();
    const deg = estimateSkew(slanted);
    expect(deg).toBeGreaterThanOrEqual(1.5);
    expect(deg).toBeLessThanOrEqual(2.5);
    expect(Math.abs(estimateSkew(rotate(slanted, -deg)))).toBeLessThanOrEqual(0.5);
  });
});

describe('evening the contrast', () => {
  // A page lit from the left: paper 220 at the left, 120 at the right; pen (dark) and pencil (light grey) strokes.
  function lit(): { g: Gray; pen: number[]; pencil: number[]; paper: number[] } {
    const w = 240;
    const h = 160;
    const g = gray(w, h, 0);
    const pen: number[] = [];
    const pencil: number[] = [];
    const paper: number[] = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const light = 220 - (100 * x) / (w - 1);
        let v = light;
        const i = y * w + x;
        if (y >= 40 && y < 42 && x > 10 && x < 230) (v = light * 0.2), pen.push(i);
        else if (y >= 100 && y < 101 && x > 10 && x < 230) (v = light * 0.8), pencil.push(i);
        else if (y > 60 && y < 90) paper.push(i);
        g.data[i] = v;
      }
    return { g, pen, pencil, paper };
  }

  it('the paper is evenly white from the bright side to the shadow; pen is near black; pencil stays a grey', () => {
    const { g, pen, pencil, paper } = lit();
    const out = evenContrast(g);
    const values = (ix: number[]) => ix.map((i) => out.data[i]);
    // Before: the paper went from 220 to 120. After: white everywhere.
    expect(Math.min(...values(paper))).toBeGreaterThanOrEqual(250);
    expect(Math.max(...values(pen))).toBeLessThanOrEqual(40);
    // Pencil is still there, clearly darker than the paper, and not made black (no hard black-and-white).
    const p = values(pencil);
    expect(Math.max(...p)).toBeLessThan(235);
    expect(Math.min(...p)).toBeGreaterThan(60);
    // The same on the bright and the shadowed side.
    expect(Math.abs(p[5] - p[p.length - 5])).toBeLessThanOrEqual(12);
  });

  it('a blank page is not stretched into noise', () => {
    const g = gray(100, 100, 200);
    for (let i = 0; i < g.data.length; i += 7) g.data[i] = 196;
    const out = evenContrast(g);
    expect(Math.min(...out.data)).toBeGreaterThanOrEqual(240);
  });
});

describe('one page, start to end', () => {
  it('a photo of a tilted page comes out straight, cut to the page, grey, at most the long edge asked for', () => {
    const page: Quad = [{ x: 60, y: 40 }, { x: 330, y: 55 }, { x: 320, y: 440 }, { x: 45, y: 425 }];
    const g = photo(380, 480, page);
    const found = detectPage(resize(g, 190, 240))!;
    const quad = found.quad.map((p) => ({ x: p.x * 2, y: p.y * 2 })) as Quad;
    const out = processPage(g, quad, { maxEdge: 300 });
    expect(Math.max(out.width, out.height)).toBe(300);
    expect(out.height).toBeGreaterThan(out.width);
    // No table left at the edges: all paper.
    expect(at(out, 3, 3)).toBeGreaterThan(200);
    expect(at(out, out.width - 4, out.height - 4)).toBeGreaterThan(200);
  });
});

describe('holding still', () => {
  const q = (dx = 0): Quad => [{ x: 0.1 + dx, y: 0.1 }, { x: 0.9 + dx, y: 0.1 }, { x: 0.9 + dx, y: 0.9 }, { x: 0.1 + dx, y: 0.9 }];

  it('takes the page once it is held still long enough, and not again until the page changes', () => {
    const w = new SteadyWatch(1000, 0.015, 0.08);
    expect(w.see(q(), 0)).toBe(false);
    expect(w.see(q(0.005), 400)).toBe(false);
    expect(w.progress(800)).toBeCloseTo(0.8);
    expect(w.see(q(0.004), 1000)).toBe(true);
    // Still the same page: never twice.
    expect(w.see(q(0.004), 2500)).toBe(false);
    expect(w.see(q(0.004), 5000)).toBe(false);
    // The next page is put down (it moves), then held still.
    expect(w.see(q(0.2), 5200)).toBe(false);
    expect(w.see(q(0.2), 5600)).toBe(false);
    expect(w.see(q(0.2), 6200)).toBe(true);
  });

  it('a shaking hand starts the count again; no page seen resets it; taken by hand is not taken again', () => {
    const w = new SteadyWatch(1000, 0.015, 0.08);
    w.see(q(), 0);
    w.see(q(0.03), 600);
    expect(w.see(q(0.03), 1200)).toBe(false);
    expect(w.see(q(0.03), 1600)).toBe(true);
    w.see(null, 1700);
    w.see(q(), 1800);
    w.taken(q());
    expect(w.see(q(), 4000)).toBe(false);
  });
});
