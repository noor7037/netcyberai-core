#!/usr/bin/env node
// How big a scanned answer-sheet page needs to be (C230-AJ, "size from evidence, not a guess").
//
//   node scripts/measure_scan_sizes.mjs [--out <dir>] [--sizes 2000,1600,1400,1200] [--qualities 0.85,0.75,0.7,0.65,0.6,0.5]
//
// Eight made-up answer sheets (English and Hindi; pen, pencil, a pencil diagram, and small writing with fine pencil) are drawn in Playwright's Chromium on
// ruled paper at 300 dpi, with handwriting-like fonts, every word a little turned and lifted. Each is then "photographed":
// laid on a table in perspective, lit unevenly with a warm cast, softened, given sensor noise, and saved as a phone
// would (JPEG 0.92, 12 MP). Each photo goes through the scan worker's own pipeline (src/lib/marking/scan-image.ts,
// bundled here with esbuild): the page found, cut out, straightened, deskewed and its contrast evened, at each long edge,
// then made a JPEG by the browser's own encoder at each quality, as the scan screen does.
//
// Today's 2000 px (C350's file path: the photo itself, in colour, made at most 2000 px and JPEG 0.85) is measured too.
//
// No AI provider is cleared for marking yet, so "reads as well as the 2000 px page" is judged by objective proxies, each
// against the same page made at 2000 px with no JPEG loss (the reference):
//   ssim     structural similarity, the candidate enlarged back to the reference's size (8×8 blocks)
//   edges    how well the strokes' edges are kept: the correlation of the two pictures' gradient strengths
//   pencil   thin-stroke visibility: of the pencil pixels visible in the reference (darker than the paper around them
//            by 15 levels or more), the share still visible in the candidate
// A setting passes when, on every sheet, ssim ≥ 0.95, edges ≥ 0.95 and pencil ≥ 0.98 (a judgement, said as one: near
// what JPEG alone costs a page at 2000 px, and nearly every pencil pixel kept). The smallest median size that
// passes is the one to use, if it is 150 KB or less a page (PAGE_MAX_BYTES stays the hard cap).
//
// Prints the table (markdown) and writes it, with each sheet's numbers as JSON, to --out (default: a temp folder).
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
};
const OUT = path.resolve(arg('--out') ?? path.join(tmpdir(), 'nca-scan-sizes'));
const SIZES = (arg('--sizes') ?? '2000,1600,1400,1200').split(',').map(Number);
const QUALITIES = (arg('--qualities') ?? '0.85,0.75,0.7,0.65,0.6,0.5').split(',').map(Number);
const PASS = { ssim: 0.95, edges: 0.95, pencil: 0.98 };
const TARGET_KB = 150;

// ---- the sheets ---------------------------------------------------------------------------------------------------------

const PAGE_W = 2480; // A4 at 300 dpi
const PAGE_H = 3508;
const EN = [
  'Q1. Photosynthesis is the process by which green plants make their food.',
  'They use sunlight, water and carbon dioxide, and give out oxygen.',
  'The green colour comes from chlorophyll in the leaves.',
  'Q2. 3/4 + 1/8 = 6/8 + 1/8 = 7/8',
  'Q3. A force can change the speed, the direction or the shape of a body.',
  'Friction is a force that opposes motion between two surfaces.',
  'It produces heat, and it wears away the surfaces in contact.',
  'Q4. The area of a rectangle is length × breadth = 12 × 5 = 60 sq cm.',
  'Q5. Water boils at 100 °C at sea level and freezes at 0 °C.',
  'Evaporation is faster on a hot, dry and windy day.',
  'Q6. Rivers carry soil from the mountains and leave it on the plains.',
  'This makes the plains fertile for farming.',
];
const HI = [
  'प्र.1 प्रकाश संश्लेषण वह प्रक्रिया है जिसमें हरे पौधे भोजन बनाते हैं।',
  'पौधे सूर्य का प्रकाश, जल और कार्बन डाइऑक्साइड लेते हैं।',
  'इस क्रिया में ऑक्सीजन गैस बाहर निकलती है।',
  'प्र.2 3/4 + 1/8 = 6/8 + 1/8 = 7/8',
  'प्र.3 बल किसी वस्तु की चाल, दिशा या आकार बदल सकता है।',
  'घर्षण वह बल है जो दो सतहों के बीच गति का विरोध करता है।',
  'प्र.4 आयत का क्षेत्रफल = लंबाई × चौड़ाई = 12 × 5 = 60 वर्ग सेमी',
  'प्र.5 जल समुद्र तल पर 100 °C पर उबलता है।',
  'गर्म और सूखे दिन में वाष्पीकरण तेज़ होता है।',
  'प्र.6 नदियाँ पहाड़ों से मिट्टी लाकर मैदानों में छोड़ती हैं।',
  'इससे मैदान खेती के लिए उपजाऊ बनते हैं।',
  'प्र.7 पृथ्वी सूर्य के चारों ओर एक वर्ष में घूमती है।',
];
// `small`: small writing (about 1.5 mm letters, 6 mm lines) and fine pencil (0.17 mm), the hardest to keep.
const SHEETS = [
  { name: 'en-pen', lang: 'en', ink: 'pen', diagram: false },
  { name: 'en-pencil', lang: 'en', ink: 'pencil', diagram: false },
  { name: 'en-diagram', lang: 'en', ink: 'pen', diagram: true },
  { name: 'en-small-pencil', lang: 'en', ink: 'pencil', diagram: false, small: true },
  { name: 'hi-pen', lang: 'hi', ink: 'pen', diagram: false },
  { name: 'hi-pencil', lang: 'hi', ink: 'pencil', diagram: false },
  { name: 'hi-diagram', lang: 'hi', ink: 'pen', diagram: true },
  { name: 'hi-small-pen', lang: 'hi', ink: 'pen', diagram: false, small: true },
];

// A small seeded random, so every run draws the same sheets.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function sheetHtml(sheet, seed) {
  const r = rng(seed);
  const LINE = sheet.small ? 71 : 94; // 6 or 8 mm ruled lines
  const top = 330;
  const penFont = sheet.lang === 'hi' ? "'Kohinoor Devanagari', 'ITF Devanagari', sans-serif" : "'Bradley Hand', 'Noteworthy', cursive";
  const pencilFont = sheet.lang === 'hi' ? "'Kohinoor Devanagari', 'ITF Devanagari', sans-serif" : "'Noteworthy', 'Bradley Hand', cursive";
  const penWeight = sheet.lang === 'hi' ? 500 : 400;
  const pencilWeight = 300;
  const lines = sheet.lang === 'hi' ? HI : EN;
  const words = [];
  let row = 0;
  const rows = sheet.diagram ? 17 : sheet.small ? 42 : 30;
  for (let i = 0; row < rows; i++) {
    const text = lines[i % lines.length];
    let x = 260;
    for (const w of text.split(' ')) {
      const size = (sheet.small ? 36 : 50) + r() * (sheet.small ? 5 : 8);
      const width = w.length * size * (sheet.lang === 'hi' ? 0.5 : 0.42) + 24;
      if (x + width > PAGE_W - 140) {
        row++;
        x = 260;
        if (row >= rows) break;
      }
      // Pencil sheets: all pencil; pen sheets: pen, with an underline or working in pencil now and then.
      const pencil = sheet.ink === 'pencil' || r() < 0.08;
      const rot = (r() - 0.5) * 4;
      const lift = (r() - 0.5) * 8;
      words.push(
        `<span class="${pencil ? 'pencil' : 'pen'}" style="left:${x.toFixed(0)}px;top:${(top + row * LINE - (sheet.small ? 46 : 62) + lift).toFixed(0)}px;font-size:${size.toFixed(1)}px;transform:rotate(${rot.toFixed(2)}deg)">${esc(w)}</span>`
      );
      x += width;
    }
    row++;
  }
  // Pencil marks on every sheet: a margin tick, an underline, a crossed-out word, light working in the margin.
  const marks = [];
  for (let k = 0; k < 6; k++) {
    const y = top + Math.floor(r() * rows) * LINE + 8;
    marks.push(`<path class="pencil" d="M ${300 + r() * 900} ${y} q ${200 + r() * 200} ${(r() - 0.5) * 10} ${500 + r() * 300} ${(r() - 0.5) * 6}" />`);
  }
  for (let k = 0; k < 8; k++) {
    const y = top + Math.floor(r() * rows) * LINE - 30;
    marks.push(`<path class="pencil" d="M ${120} ${y} l 14 18 l 30 -40" />`);
  }
  let diagram = '';
  if (sheet.diagram) {
    const y0 = top + rows * LINE + 80;
    const label = (x, y, t) => `<text class="pencil-text" x="${x}" y="${y}">${esc(t)}</text>`;
    const ticks = [];
    for (let i = 0; i <= 10; i++) ticks.push(`<path class="pencil" d="M ${1320 + i * 90} ${y0 + 1000} v 14" />`, label(1310 + i * 90, y0 + 1060, String(i - 5)));
    const curve = [];
    for (let i = 0; i <= 60; i++) {
      const xv = -5 + i / 6;
      curve.push(`${(1320 + (xv + 5) * 90).toFixed(1)} ${(y0 + 1000 - xv * xv * 36).toFixed(1)}`);
    }
    diagram = `
      <path class="pencil" d="M 300 ${y0 + 900} L 900 ${y0 + 900} L 600 ${y0 + 300} Z" />
      <path class="pencil" d="M 600 ${y0 + 300} L 600 ${y0 + 900}" stroke-dasharray="12 10" />
      ${label(580, y0 + 280, 'A')}${label(270, y0 + 950, 'B')}${label(905, y0 + 950, 'C')}${label(610, y0 + 950, 'D')}
      ${label(470, y0 + 640, sheet.lang === 'hi' ? '5 सेमी' : '5 cm')}${label(700, y0 + 1010, sheet.lang === 'hi' ? 'आधार = 6 सेमी' : 'base = 6 cm')}
      <path class="pencil" d="M 1320 ${y0 + 1000} H 2300 M 1770 ${y0 + 60} V ${y0 + 1080}" />
      ${ticks.join('')}
      <path class="pencil" d="M ${curve.join(' L ')}" />
      ${label(1800, y0 + 120, 'y = x²')}`;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; width: ${PAGE_W}px; height: ${PAGE_H}px; background: #fbfaf6; overflow: hidden; }
    .ruled { position: absolute; inset: 0; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent ${LINE - 3}px, #a9c4e6 ${LINE - 3}px, #a9c4e6 ${LINE}px);
             background-position: 0 ${top - LINE + 4}px; }
    .margin { position: absolute; top: 0; bottom: 0; left: 220px; width: 3px; background: #e7a0a0; }
    span { position: absolute; white-space: nowrap; transform-origin: 0 100%; }
    span.pen { font-family: ${penFont}; font-weight: ${penWeight}; color: #1d2f86; }
    span.pencil { font-family: ${pencilFont}; font-weight: ${pencilWeight}; color: #7b7b7b; opacity: 0.85; }
    svg { position: absolute; inset: 0; }
    svg .pencil { fill: none; stroke: #808080; stroke-width: ${sheet.small ? 2 : 3}; stroke-linecap: round; opacity: 0.85; }
    svg .pencil-text { font-family: ${pencilFont}; font-weight: ${pencilWeight}; font-size: 40px; fill: #7b7b7b; opacity: 0.85; }
    body.no-pencil .pencil, body.no-pencil .pencil-text { visibility: hidden; }
    .head { position: absolute; left: 260px; top: 120px; font: 400 54px ${penFont}; color: #1d2f86; }
  </style></head><body><div class="ruled"></div><div class="margin"></div>
    <div class="head">${sheet.lang === 'hi' ? 'नाम: क. उदाहरण &nbsp;&nbsp; रोल नं. 12 &nbsp;&nbsp; कक्षा 7-अ' : 'Name: A. Example &nbsp;&nbsp; Roll No. 12 &nbsp;&nbsp; Class 7-A'}</div>
    ${words.join('\n')}
    <svg width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">${marks.join('')}${diagram}</svg>
  </body></html>`;
}

// How each sheet is photographed: where its corners land in a 3024×4032 photo, the light, and the noise.
const PHOTOS = [
  { quad: [[260, 300], [2790, 360], [2860, 3830], [170, 3760]], light: [1.0, 0.72], cast: [1.0, 0.97, 0.9], noise: 4, seed: 11 },
  { quad: [[330, 420], [2700, 300], [2840, 3700], [240, 3880]], light: [0.75, 1.0], cast: [1.0, 0.98, 0.92], noise: 5, seed: 12 },
  { quad: [[420, 280], [2640, 280], [2900, 3900], [140, 3900]], light: [0.95, 0.8], cast: [1.0, 0.96, 0.88], noise: 4, seed: 13 },
  { quad: [[200, 260], [2820, 330], [2780, 3860], [240, 3790]], light: [0.8, 1.0], cast: [1.0, 0.97, 0.9], noise: 5, seed: 14 },
  { quad: [[300, 340], [2760, 260], [2880, 3800], [180, 3860]], light: [1.0, 0.7], cast: [1.0, 0.98, 0.93], noise: 6, seed: 15 },
  { quad: [[380, 300], [2680, 330], [2860, 3870], [150, 3840]], light: [0.85, 1.0], cast: [1.0, 0.96, 0.9], noise: 4, seed: 16 },
  { quad: [[240, 280], [2800, 300], [2830, 3880], [210, 3840]], light: [1.0, 0.78], cast: [1.0, 0.97, 0.91], noise: 5, seed: 17 },
  { quad: [[290, 330], [2740, 290], [2870, 3850], [190, 3870]], light: [0.8, 1.0], cast: [1.0, 0.97, 0.9], noise: 5, seed: 18 },
];

// ---- in the browser: the photo, the pipeline, the metrics ---------------------------------------------------------------------

async function lab({ name, page, noPencil, photo, sizes, qualities, pageW, pageH }) {
  const S = window.ScanImage;
  const decode = async (b64OrBlob) => {
    const blob = typeof b64OrBlob === 'string' ? await (await fetch(`data:image/png;base64,${b64OrBlob}`)).blob() : b64OrBlob;
    const bmp = await createImageBitmap(blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    return ctx.getImageData(0, 0, c.width, c.height);
  };
  const encode = async (rgba, w, h, q) => {
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
    return c.convertToBlob({ type: 'image/jpeg', quality: q });
  };
  const pageImg = await decode(page);
  const plain = await decode(noPencil);
  // Where the pencil is, on the page: the two renders differ.
  const mask = S.gray(pageW, pageH, 0);
  for (let i = 0, j = 0; i < mask.data.length; i++, j += 4) {
    const a = (pageImg.data[j] + pageImg.data[j + 1] + pageImg.data[j + 2]) / 3;
    const b = (plain.data[j] + plain.data[j + 1] + plain.data[j + 2]) / 3;
    mask.data[i] = b - a > 20 ? 255 : 0;
  }

  // The photo: the page in perspective on a darker table, lit from one side, a warm cast, softened, with noise.
  const PW = 3024;
  const PH = 4032;
  const quad = photo.quad.map(([x, y]) => ({ x, y }));
  const H = S.rectToQuad(pageW, pageH, quad);
  // The inverse homography (photo → page), by the adjugate of [a b c; d e f; g h 1].
  const [a, b, c, d, e, f, g, h] = H;
  const inv = [e - f * h, c * h - b, b * f - c * e, f * g - d, a - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
  let seed = photo.seed;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const shot = new Uint8ClampedArray(PW * PH * 4);
  const pg = pageImg.data;
  const samp = (u, v, k) => {
    const x = Math.min(Math.max(u, 0), pageW - 1.001);
    const y = Math.min(Math.max(v, 0), pageH - 1.001);
    const x0 = x | 0;
    const y0 = y | 0;
    const fx = x - x0;
    const fy = y - y0;
    const i = (y0 * pageW + x0) * 4 + k;
    return (pg[i] * (1 - fx) + pg[i + 4] * fx) * (1 - fy) + (pg[i + pageW * 4] * (1 - fx) + pg[i + pageW * 4 + 4] * fx) * fy;
  };
  for (let y = 0; y < PH; y++) {
    for (let x = 0; x < PW; x++) {
      const z = inv[6] * x + inv[7] * y + inv[8];
      const u = (inv[0] * x + inv[1] * y + inv[2]) / z;
      const v = (inv[3] * x + inv[4] * y + inv[5]) / z;
      const light = photo.light[0] + (photo.light[1] - photo.light[0]) * (x / PW) * 0.8 + (photo.light[1] - photo.light[0]) * (y / PH) * 0.2;
      const o = (y * PW + x) * 4;
      const inPage = u >= 0 && v >= 0 && u < pageW && v < pageH;
      for (let k = 0; k < 3; k++) {
        const base = inPage ? samp(u, v, k) : [96, 72, 52][k] + 18 * Math.sin(y / 37 + k) * Math.sin(x / 211);
        shot[o + k] = base * light * photo.cast[k] + gauss() * photo.noise;
      }
      shot[o + 3] = 255;
    }
  }
  // The lens softens: a light blur, done by drawing smaller and back up in the canvas, then saved as the camera would.
  const cam = new OffscreenCanvas(PW, PH);
  cam.getContext('2d').putImageData(new ImageData(shot, PW, PH), 0, 0);
  const soft = new OffscreenCanvas(PW, PH);
  const sctx = soft.getContext('2d');
  sctx.filter = 'blur(1.1px)';
  sctx.drawImage(cam, 0, 0);
  const camJpeg = await soft.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  const photoImg = await decode(camJpeg);

  // Today (C350, a photo chosen as a file): the photo itself, in colour, at most 2000 px, JPEG 0.85, drawn as
  // src/components/marking/render-pages.ts draws it.
  const fit = S.fitEdge(PW, PH, 2000);
  const today = new OffscreenCanvas(fit.width, fit.height);
  const tctx = today.getContext('2d');
  const bmp = await createImageBitmap(camJpeg);
  tctx.fillStyle = '#ffffff';
  tctx.fillRect(0, 0, fit.width, fit.height);
  tctx.drawImage(bmp, 0, 0, fit.width, fit.height);
  const todayBytes = (await today.convertToBlob({ type: 'image/jpeg', quality: 0.85 })).size;

  // The scan screen's pipeline: the page found on a small frame, then cut out, straightened, deskewed and evened.
  const grayPhoto = S.rgbaToGray(photoImg.data, PW, PH);
  const cornerError = (edge) => {
    const small = S.shrinkTo(grayPhoto, edge);
    const found = S.detectPage(small);
    const detected = found ? S.scaleQuad(found.quad, PW / small.width, PH / small.height) : null;
    return detected ? Math.max(...detected.map((p, i) => Math.hypot(p.x - quad[i].x, p.y - quad[i].y))) : null;
  };
  const corners = { live: cornerError(256), capture: cornerError(640) };
  // The metrics use the true corners (so the pencil map lines up exactly); the found corners are reported beside them.
  const t0 = performance.now();
  const ref = S.processPage(grayPhoto, quad, { maxEdge: 2000 });
  const msAt2000 = performance.now() - t0;
  const skew = S.estimateSkew(ref);

  const sobel = (img) => {
    const { width: w, height: hh, data } = img;
    const out = new Float32Array(w * hh);
    for (let y = 1; y < hh - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const gx = data[i - w + 1] + 2 * data[i + 1] + data[i + w + 1] - data[i - w - 1] - 2 * data[i - 1] - data[i + w - 1];
        const gy = data[i + w - 1] + 2 * data[i + w] + data[i + w + 1] - data[i - w - 1] - 2 * data[i - w] - data[i - w + 1];
        out[i] = Math.hypot(gx, gy);
      }
    return out;
  };
  const corr = (p, q) => {
    let sp = 0;
    let sq = 0;
    for (let i = 0; i < p.length; i++) (sp += p[i]), (sq += q[i]);
    const mp = sp / p.length;
    const mq = sq / q.length;
    let num = 0;
    let dp = 0;
    let dq = 0;
    for (let i = 0; i < p.length; i++) {
      const x = p[i] - mp;
      const y = q[i] - mq;
      num += x * y;
      dp += x * x;
      dq += y * y;
    }
    return num / Math.sqrt(dp * dq);
  };
  const ssim = (p, q) => {
    const { width: w, height: hh } = p;
    const C1 = (0.01 * 255) ** 2;
    const C2 = (0.03 * 255) ** 2;
    let total = 0;
    let n = 0;
    for (let by = 0; by + 8 <= hh; by += 8)
      for (let bx = 0; bx + 8 <= w; bx += 8) {
        let s1 = 0;
        let s2 = 0;
        let s11 = 0;
        let s22 = 0;
        let s12 = 0;
        for (let y = by; y < by + 8; y++)
          for (let x = bx; x < bx + 8; x++) {
            const u = p.data[y * w + x];
            const v = q.data[y * w + x];
            s1 += u;
            s2 += v;
            s11 += u * u;
            s22 += v * v;
            s12 += u * v;
          }
        const m1 = s1 / 64;
        const m2 = s2 / 64;
        const v1 = s11 / 64 - m1 * m1;
        const v2 = s22 / 64 - m2 * m2;
        const cv = s12 / 64 - m1 * m2;
        total += ((2 * m1 * m2 + C1) * (2 * cv + C2)) / ((m1 * m1 + m2 * m2 + C1) * (v1 + v2 + C2));
        n++;
      }
    return total / n;
  };
  // Pencil pixels on the reference's grid, and which of them the reference shows (15 levels darker than the paper near it).
  const refMask = S.resize(mask, ref.width, ref.height);
  const localPaper = S.paperLevel(ref);
  const pencilPx = [];
  for (let i = 0; i < ref.data.length; i++) if (refMask.data[i] > 100 && localPaper.data[i] - ref.data[i] >= 15) pencilPx.push(i);
  const refEdges = sobel(ref);

  const rows = [];
  for (const size of sizes) {
    const proc = size === 2000 ? ref : S.processPage(grayPhoto, quad, { maxEdge: size });
    const rgba = S.grayToRgba(proc);
    for (const q of qualities) {
      const blob = await encode(rgba, proc.width, proc.height, q);
      const back = await decode(blob);
      const dec = S.rgbaToGray(back.data, back.width, back.height);
      const up = S.resize(dec, ref.width, ref.height);
      const upPaper = S.paperLevel(up);
      let visible = 0;
      for (const i of pencilPx) if (upPaper.data[i] - up.data[i] >= 15) visible++;
      rows.push({
        sheet: name,
        size,
        quality: q,
        width: proc.width,
        height: proc.height,
        bytes: blob.size,
        ssim: ssim(up, ref),
        edges: corr(sobel(up), refEdges),
        pencil: pencilPx.length ? visible / pencilPx.length : 1,
      });
    }
  }
  return { rows, todayBytes, corners, skew, msAt2000, pencilPixels: pencilPx.length };
}

// ---- the run ------------------------------------------------------------------------------------------------------------------

const bundled = await build({
  entryPoints: [path.join(ROOT, 'src/lib/marking/scan-image.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'ScanImage',
  write: false,
  platform: 'browser',
  target: 'es2020',
});
const code = bundled.outputFiles[0].text;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: PAGE_W, height: PAGE_H }, deviceScaleFactor: 1 });
const sheetPage = await context.newPage();
const labPage = await (await browser.newContext()).newPage();
await labPage.setContent('<!doctype html><title>lab</title>');
await labPage.addScriptTag({ content: code });

const all = [];
const notes = [];
for (const [i, sheet] of SHEETS.entries()) {
  await sheetPage.setContent(sheetHtml(sheet, 100 + i), { waitUntil: 'load' });
  await sheetPage.evaluate(() => document.fonts.ready);
  const page = (await sheetPage.screenshot({ type: 'png' })).toString('base64');
  await sheetPage.evaluate(() => document.body.classList.add('no-pencil'));
  const noPencil = (await sheetPage.screenshot({ type: 'png' })).toString('base64');
  if (sheet.small) writeFileSync(path.join(OUT, `${sheet.name}-sheet.png`), Buffer.from(page, 'base64'));
  const r = await labPage.evaluate(lab, { name: sheet.name, page, noPencil, photo: PHOTOS[i], sizes: SIZES, qualities: QUALITIES, pageW: PAGE_W, pageH: PAGE_H });
  all.push(...r.rows);
  notes.push({ sheet: sheet.name, todayBytes: r.todayBytes, cornerErrorPx: { live: r.corners.live === null ? null : Math.round(r.corners.live), capture: r.corners.capture === null ? null : Math.round(r.corners.capture) }, skewDeg: r.skew, msAt2000: Math.round(r.msAt2000), pencilPixels: r.pencilPixels });
  process.stderr.write(`measured ${sheet.name}\n`);
}
await browser.close();

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const kb = (b) => Math.round(b / 1024);
const table = [];
for (const size of SIZES)
  for (const quality of QUALITIES) {
    const rows = all.filter((r) => r.size === size && r.quality === quality);
    const worst = { ssim: Math.min(...rows.map((r) => r.ssim)), edges: Math.min(...rows.map((r) => r.edges)), pencil: Math.min(...rows.map((r) => r.pencil)) };
    const pass = worst.ssim >= PASS.ssim && worst.edges >= PASS.edges && worst.pencil >= PASS.pencil;
    table.push({ size, quality, medianKB: kb(median(rows.map((r) => r.bytes))), maxKB: kb(Math.max(...rows.map((r) => r.bytes))), ...worst, pass });
  }
const todayMedianKB = kb(median(notes.map((n) => n.todayBytes)));
const chosen = table.filter((t) => t.pass && t.medianKB <= TARGET_KB).sort((a, b) => a.medianKB - b.medianKB)[0] ?? null;

const lines = [
  `Today's 2000 px (the photo in colour, JPEG 0.85): median ${todayMedianKB} KB a page (${notes.map((n) => `${n.sheet} ${kb(n.todayBytes)}`).join(', ')}).`,
  '',
  '| Long edge | JPEG quality | Median KB | Largest KB | SSIM (worst) | Edges (worst) | Pencil kept (worst) | Passes |',
  '|---|---|---|---|---|---|---|---|',
  ...table.map((t) => `| ${t.size} | ${t.quality} | ${t.medianKB} | ${t.maxKB} | ${t.ssim.toFixed(3)} | ${t.edges.toFixed(3)} | ${(t.pencil * 100).toFixed(1)}% | ${t.pass ? 'yes' : 'no'} |`),
  '',
  `Bar: SSIM ≥ ${PASS.ssim}, edges ≥ ${PASS.edges}, pencil kept ≥ ${PASS.pencil * 100}% on every sheet, against the same page at 2000 px with no JPEG loss; target median ≤ ${TARGET_KB} KB.`,
  chosen ? `Chosen: long edge ${chosen.size} px, JPEG ${chosen.quality}: median ${chosen.medianKB} KB, largest ${chosen.maxKB} KB.` : 'Chosen: none passes within the target.',
  `Page found, largest corner error in px of the 3024×4032 photo, live 256 px frame / capture 640 px frame: ${notes.map((n) => `${n.sheet} ${n.cornerErrorPx.live}/${n.cornerErrorPx.capture}`).join(', ')}.`,
  `Slant found after straightening (deg): ${notes.map((n) => `${n.sheet} ${n.skewDeg}`).join(', ')}. Pipeline time at 2000 px (ms, this machine): ${notes.map((n) => n.msAt2000).join(', ')}.`,
];
const report = lines.join('\n');
writeFileSync(path.join(OUT, 'scan-sizes.md'), report + '\n');
writeFileSync(path.join(OUT, 'scan-sizes.json'), JSON.stringify({ table, rows: all, notes }, null, 2));
console.log(report);
console.log(`\n(written to ${OUT})`);
