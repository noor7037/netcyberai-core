import { describe, expect, it } from 'vitest';
import { OPTION_KEYS, type OptionKey } from '@/lib/contracts/marking';
import { checkDigit, layoutKey, sheetDigits, sheetLayout, sheetNoFrom, MAX_SHEET_QUESTIONS, type SheetLayout } from '@/lib/bubbles/layout';
import { keptPicture, readSheet, READ_PX } from '@/lib/bubbles/read';
import { photograph, prng, renderSheet, type Camera, type ChildMarks } from './synth';

// The bubble reader (C364) on made-up sheets: the layout drawn in code, shaded as children do, photographed at angles,
// with perspective, blur, uneven light and noise, upside down and sideways. The acceptance test of docs/36 §5 (AQ-3):
// no wrong answer on any sheet; every smudged or half-rubbed-out bubble flagged; every double mark flagged; the sheet
// number read on every sheet.

// 48 questions: four options mostly, some with two, five and six.
const QUESTIONS = Array.from({ length: 48 }, (_, i) => ({ label: String(i + 1), options: i % 12 === 3 ? 2 : i % 12 === 7 ? 5 : i % 12 === 9 ? 6 : 4 }));
const LAYOUT = sheetLayout(QUESTIONS);

type Truth = { kind: 'answer' | 'blank' | 'double' | 'smudge'; key?: OptionKey };

// A child's sheet: mostly one clear answer; some blank; some rubbed out well and answered again; some double; some
// smudged (half rubbed out, nothing else) or answered beside a smudge.
function child(seed: number, layout: SheetLayout, sheetNo: number, extra: Partial<ChildMarks> = {}): { marks: ChildMarks; truth: Map<string, Truth> } {
  const rnd = prng(seed);
  const fills: Record<string, OptionKey[]> = {};
  const smudges: Record<string, OptionKey[]> = {};
  const faint: Record<string, OptionKey[]> = {};
  const truth = new Map<string, Truth>();
  layout.questions.forEach((q, i) => {
    const pick = () => q.keys[Math.floor(rnd() * q.keys.length)];
    const other = (k: OptionKey) => q.keys.filter((x) => x !== k)[Math.floor(rnd() * (q.keys.length - 1))];
    const r = (i * 7 + seed) % 16;
    if (r === 0) truth.set(q.label, { kind: 'blank' });
    else if (r === 1) {
      const a = pick();
      fills[q.label] = [a, other(a)];
      truth.set(q.label, { kind: 'double' });
    } else if (r === 2) {
      smudges[q.label] = [pick()];
      truth.set(q.label, { kind: 'smudge' });
    } else if (r === 3) {
      const a = pick();
      fills[q.label] = [a];
      smudges[q.label] = [other(a)];
      truth.set(q.label, { kind: 'smudge' });
    } else if (r === 4) {
      const a = pick();
      fills[q.label] = [a];
      faint[q.label] = [other(a)];
      truth.set(q.label, { kind: 'answer', key: a });
    } else {
      const a = pick();
      fills[q.label] = [a];
      truth.set(q.label, { kind: 'answer', key: a });
    }
  });
  return { marks: { sheetNo, fills, smudges, faint, seed, ...extra }, truth };
}

type Score = { wrong: string[]; missedFlag: string[]; flaggedClean: string[]; clean: number; read: number };

function score(truth: Map<string, Truth>, reading: { answers: Record<string, OptionKey[]>; unclear: string[]; multiple: string[] }): Score {
  const s: Score = { wrong: [], missedFlag: [], flaggedClean: [], clean: 0, read: 0 };
  for (const [label, t] of truth) {
    const flagged = reading.unclear.includes(label) || reading.multiple.includes(label);
    const got = reading.answers[label] ?? [];
    if (t.kind === 'answer') {
      s.clean++;
      if (flagged) s.flaggedClean.push(label);
      else if (got.length === 1 && got[0] === t.key) s.read++;
      else s.wrong.push(label);
    } else if (t.kind === 'blank') {
      s.clean++;
      if (flagged) s.flaggedClean.push(label);
      else if (got.length === 0) s.read++;
      else s.wrong.push(label);
    } else if (t.kind === 'double') {
      if (!flagged) s.missedFlag.push(label);
    } else if (!reading.unclear.includes(label)) s.missedFlag.push(label);
  }
  return s;
}

const CAMERAS: { name: string; cam: Camera }[] = [
  { name: 'straight, even light', cam: { width: 1500, height: 2000, pageHeight: 1850, angle: 0, noise: 4 } },
  { name: 'turned 4°, seen at an angle, blurred, lit from one side', cam: { width: 1500, height: 2000, pageHeight: 1750, angle: 4, tilt: 0.08, blur: 2, light: [0.55, 1], lightAngle: 20, noise: 8, seed: 3 } },
  { name: 'turned −3°, the other edge far, more blur, a dark corner', cam: { width: 1500, height: 2000, pageHeight: 1700, angle: -3, tilt: 0.1, tiltSide: 'bottom', blur: 3, light: [1, 0.5], lightAngle: 60, noise: 10, seed: 5 } },
  { name: 'upside down, turned 2°, off centre', cam: { width: 1500, height: 2000, pageHeight: 1650, angle: 2, quarter: 2, tilt: 0.05, tiltSide: 'left', blur: 1, light: [0.7, 1], noise: 6, shift: [40, -30], seed: 7 } },
  { name: 'sideways (a landscape photo), turned 5°, seen at an angle', cam: { width: 2000, height: 1500, pageHeight: 1350, angle: 5, quarter: 1, tilt: 0.07, tiltSide: 'right', blur: 2, light: [0.6, 1], lightAngle: 100, noise: 8, seed: 9 } },
  { name: 'a phone lens that bulges, turned 3°, blurred', cam: { width: 1500, height: 2000, pageHeight: 1900, angle: 3, barrel: 0.035, tilt: 0.04, blur: 2, light: [0.6, 1], noise: 6, seed: 17 } },
  { name: 'far away and small, blurred, dim', cam: { width: 1500, height: 2000, pageHeight: 1250, angle: -6, quarter: 3, tilt: 0.06, blur: 1, light: [0.45, 0.8], lightAngle: 140, noise: 7, seed: 13 } },
];

describe('the layout (C364)', () => {
  it('places every bubble inside the page, away from the corners, and never two on one another', () => {
    const layout = sheetLayout(Array.from({ length: MAX_SHEET_QUESTIONS }, (_, i) => ({ label: `${i + 1}`, options: 6 })));
    expect(layout.questions).toHaveLength(MAX_SHEET_QUESTIONS);
    const all = [...layout.sheetNo.flat(), ...layout.roll.flat(), ...layout.questions.flatMap((q) => q.bubbles)];
    for (const b of all) {
      expect(b.x - b.r).toBeGreaterThan(16);
      expect(b.x + b.r).toBeLessThan(194);
      expect(b.y - b.r).toBeGreaterThan(16);
      expect(b.y + b.r).toBeLessThan(280);
    }
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) expect(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y)).toBeGreaterThan(5);
  });

  it('a fingerprint of the questions; a check digit that catches one digit read wrong', () => {
    expect(layoutKey(QUESTIONS)).toMatch(/^v1-48-[0-9a-f]{8}$/);
    expect(layoutKey(QUESTIONS)).not.toBe(layoutKey(QUESTIONS.map((q, i) => (i === 5 ? { ...q, options: 5 } : q))));
    expect(sheetDigits(37)).toEqual([0, 0, 3, 7, checkDigit([0, 0, 3, 7])]);
    expect(sheetNoFrom(sheetDigits(37))).toBe(37);
    for (let n = 1; n <= 9999; n += 97) {
      const d = sheetDigits(n);
      for (let c = 0; c < 4; c++) for (let v = 0; v < 10; v++) if (v !== d[c]) expect(sheetNoFrom(d.map((x, i) => (i === c ? v : x)))).toBeNull();
    }
    expect(sheetNoFrom([0, 0, 0, 0, 0])).toBeNull();
  });
});

describe('reading made-up sheets photographed in many ways (C364)', () => {
  const results: string[] = [];
  CAMERAS.forEach(({ name, cam }, n) => {
    it(`${name}: no wrong answer, every unclear bubble and double mark flagged, the sheet number read`, () => {
      const sheetNo = 1000 + n * 137;
      const { marks, truth } = child(101 + n * 17, LAYOUT, sheetNo, { printedRoll: '0012' });
      const photo = photograph(renderSheet(LAYOUT, marks), cam);
      const out = readSheet(photo, LAYOUT);
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const s = score(truth, out.reading);
      results.push(`${name}: ${s.read}/${s.clean} clear answers read, ${s.flaggedClean.length} flagged for a look, ${s.wrong.length} wrong; confidence ${out.reading.confidence}`);
      expect(out.reading.sheetNo).toBe(sheetNo);
      expect(out.reading.layout).toBe(LAYOUT.key);
      expect(s.wrong).toEqual([]);
      expect(s.missedFlag).toEqual([]);
      // Clear answers are read, not merely flagged.
      expect(s.flaggedClean.length).toBeLessThanOrEqual(1);
      expect(out.reading.roll).toBe('0012');
      expect(out.page.width).toBe(210 * READ_PX);
    });
  });

  it('a blank sheet: the roll number the child shaded, no answers where none were given', () => {
    const fills: Record<string, OptionKey[]> = { '1': ['B'], '2': ['D'] };
    const photo = photograph(renderSheet(LAYOUT, { sheetNo: 58, shadedRoll: '0007', fills, seed: 3 }), CAMERAS[1].cam);
    const out = readSheet(photo, LAYOUT);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.reading).toMatchObject({ sheetNo: 58, roll: '0007', rollUnclear: false, answers: fills, unclear: [], multiple: [] });
  });

  it('a smudge anywhere from light to dark is flagged, never read as an answer or as blank', () => {
    for (const [share, cam] of [[0.33, CAMERAS[1].cam], [0.36, CAMERAS[3].cam], [0.45, CAMERAS[6].cam], [0.55, CAMERAS[2].cam], [0.6, CAMERAS[4].cam]] as const) {
      const { marks, truth } = child(55, LAYOUT, 777, { smudge: share });
      const out = readSheet(photograph(renderSheet(LAYOUT, marks), cam), LAYOUT);
      expect(out.ok).toBe(true);
      if (!out.ok) continue;
      const s = score(truth, out.reading);
      results.push(`smudges at ${Math.round(share * 100)}% of a pencil mark: ${s.read}/${s.clean} clear answers read, ${s.flaggedClean.length} flagged for a look, ${s.wrong.length} wrong, ${s.missedFlag.length} smudges or doubles missed`);
      expect(s.wrong).toEqual([]);
      expect(s.missedFlag).toEqual([]);
    }
  });

  it('a light pencil all over is still read; a sheet with nothing shaded reads blank', () => {
    const { marks, truth } = child(77, LAYOUT, 4321, { pencil: 125 });
    const out = readSheet(photograph(renderSheet(LAYOUT, marks), CAMERAS[2].cam), LAYOUT);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const s = score(truth, out.reading);
    results.push(`light pencil: ${s.read}/${s.clean} clear answers read, ${s.flaggedClean.length} flagged for a look, ${s.wrong.length} wrong; confidence ${out.reading.confidence}`);
    expect(s.wrong).toEqual([]);
    expect(s.missedFlag).toEqual([]);
    const blank = readSheet(photograph(renderSheet(LAYOUT, { sheetNo: 9, fills: {} }), CAMERAS[0].cam), LAYOUT);
    expect(blank.ok && blank.reading).toMatchObject({ sheetNo: 9, roll: null, answers: {}, unclear: [], multiple: [] });
  });

  it('a page with no corner squares, or not a page at all, is refused, never half-read', () => {
    const plain = photograph({ width: 1050, height: 1485, data: new Uint8ClampedArray(1050 * 1485).fill(236) }, CAMERAS[1].cam);
    expect(readSheet(plain, LAYOUT)).toEqual({ ok: false, why: 'no_corners' });
    const noise = { width: 800, height: 1000, data: new Uint8ClampedArray(800 * 1000).map(() => Math.random() * 255) };
    expect(readSheet(noise, LAYOUT).ok).toBe(false);
  });

  it('the kept picture is the straightened sheet at five pixels a millimetre', () => {
    const out = readSheet(photograph(renderSheet(LAYOUT, { sheetNo: 1, fills: {} }), CAMERAS[0].cam), LAYOUT);
    expect(out.ok).toBe(true);
    if (out.ok) expect(keptPicture(out.page)).toMatchObject({ width: 1050, height: 1485 });
  });

  it('says how each sheet went', () => {
    // Printed for the PR's record of the reader's results.
    console.log(`Bubble reader on made-up sheets (${LAYOUT.questions.length} questions, options ${[...new Set(QUESTIONS.map((q) => q.options))].join('/')}, ${OPTION_KEYS.length} keys at most):\n  ${results.join('\n  ')}`);
    expect(results.length).toBeGreaterThan(0);
  });
});
