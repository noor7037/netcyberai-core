import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { addStroke, clear, exportSize, isBlank, redrawList, smallerScale, strokesToPaths, undo, ERASER_WIDTH, EXPORT_WIDTH, MIN_EXPORT_SCALE, PAPER, PEN_WIDTH, SKETCH_COLOURS, type Stroke } from '@/lib/family/sketch';
import { TUTOR_FILE_MAX_BYTES } from '@/lib/family/tutor-shape';
import { TUTOR_KEYS } from '@/lib/family/tutor-words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { familyWords } from '@/lib/family/words';
import { checkBlock, type Timeline } from '@/lib/family/blocks';
import { TimelineView } from '@/components/family/blocks/TimelineView';
import { Composer } from '@/components/family/tutor/Composer';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// W18-P3: the sketch pad's stroke model, the PNG size fallback, the Draw button and the timeline's reveal. jsdom has no
// canvas, so the drawing itself (pointer events, the paint, toBlob) is NOT tested here; the harness shows it on a phone.

const dot = (x: number, y: number): Stroke => ({ tool: 'pen', colour: 'ink', points: [{ x, y }] });
const line = (colour: Stroke['colour'] = 'blue', tool: Stroke['tool'] = 'pen'): Stroke => ({ tool, colour, points: [{ x: 0.1, y: 0.2 }, { x: 0.5, y: 0.6 }] });

describe('the stroke model', () => {
  it('adds strokes in order and ignores one with no points', () => {
    const a = addStroke([], line());
    const b = addStroke(a, dot(0.3, 0.3));
    expect(b).toHaveLength(2);
    expect(addStroke(b, { tool: 'pen', colour: 'ink', points: [] })).toHaveLength(2);
    expect(a).toHaveLength(1); // the list is never changed in place
  });

  it('undo removes the last stroke, and nothing from an empty pad; clear empties it', () => {
    const s = [line('ink'), line('blue'), line('coral')];
    expect(undo(s).map((x) => x.colour)).toEqual(['ink', 'blue']);
    expect(undo([])).toEqual([]);
    expect(s).toHaveLength(3);
    expect(clear()).toEqual([]);
  });

  it('is blank until the pen has made a mark (the eraser alone leaves blank paper)', () => {
    expect(isBlank([])).toBe(true);
    expect(isBlank([line('ink', 'eraser')])).toBe(true);
    expect(isBlank([dot(0.5, 0.5)])).toBe(false);
  });

  it('redraws in pixels of the paper: a dot for one point, a line for more, the eraser in paper colour', () => {
    const ops = redrawList([dot(0.5, 0.5), line('blue'), line('coral', 'eraser')], 400, 300);
    expect(ops[0]).toEqual({ kind: 'dot', at: { x: 200, y: 150 }, colour: SKETCH_COLOURS.ink, width: PEN_WIDTH * 400 });
    expect(ops[1]).toEqual({ kind: 'line', points: [{ x: 40, y: 60 }, { x: 200, y: 180 }], colour: SKETCH_COLOURS.blue, width: PEN_WIDTH * 400 });
    expect(ops[2]).toMatchObject({ kind: 'line', colour: PAPER, width: ERASER_WIDTH * 400 });
  });

  it('draws the same strokes at any size: the paths scale with the paper', () => {
    expect(strokesToPaths([line()], 400, 300)).toEqual(['M40 60 L200 180']);
    expect(strokesToPaths([line()], 1200, 900)).toEqual(['M120 180 L600 540']);
    expect(strokesToPaths([dot(0.5, 0.5)], 400, 300)).toEqual(['M200 150 L200 150']);
  });

  it('uses three different family colours from the design tokens', () => {
    expect(Object.keys(SKETCH_COLOURS)).toEqual(['ink', 'blue', 'coral']);
    expect(new Set(Object.values(SKETCH_COLOURS)).size).toBe(3);
  });
});

describe('the PNG size fallback', () => {
  const MB = 1024 * 1024;
  it('keeps a picture that fits', () => {
    expect(smallerScale(2 * MB, TUTOR_FILE_MAX_BYTES, 1)).toBeNull();
    expect(smallerScale(TUTOR_FILE_MAX_BYTES, TUTOR_FILE_MAX_BYTES, 1)).toBeNull();
  });
  it('asks for a smaller scale when it is over the limit, by the pixel count, with a margin', () => {
    const next = smallerScale(2 * TUTOR_FILE_MAX_BYTES, TUTOR_FILE_MAX_BYTES, 1)!;
    expect(next).toBeLessThan(0.75);
    expect(next).toBeCloseTo(Math.sqrt(0.5) * 0.85, 5);
    // The smaller picture is about next^2 of the bytes: it fits.
    expect(2 * TUTOR_FILE_MAX_BYTES * next * next).toBeLessThan(TUTOR_FILE_MAX_BYTES);
  });
  it('always goes down by at least a quarter, and never below the floor', () => {
    expect(smallerScale(TUTOR_FILE_MAX_BYTES + 1, TUTOR_FILE_MAX_BYTES, 1)).toBeCloseTo(0.75, 5);
    expect(smallerScale(1000 * MB, TUTOR_FILE_MAX_BYTES, 1)).toBe(MIN_EXPORT_SCALE);
    expect(smallerScale(1000 * MB, TUTOR_FILE_MAX_BYTES, MIN_EXPORT_SCALE)).toBeNull();
  });
  it('sizes the picture at 4:3', () => {
    expect(exportSize(1)).toEqual({ width: EXPORT_WIDTH, height: 900 });
    expect(exportSize(0.5)).toEqual({ width: 600, height: 450 });
  });
});

describe('the words', () => {
  const keys = ['open', 'pen', 'eraser', 'undo', 'clear', 'clearSure', 'send', 'cancel', 'ask', 'colour.ink', 'colour.blue', 'colour.coral'].map((k) => `fam.sketch.${k}`);
  it('are in English and Hindi, and picked for the tutor window', () => {
    for (const k of [...keys, 'fam.sketch.err.picture_only', 'fam.timeline.showAll']) {
      expect(en).toHaveProperty([k]);
      expect(hi).toHaveProperty([k]);
    }
    for (const k of keys) expect(TUTOR_KEYS).toContain(k);
    expect(UNDERSTAND_KEYS).toContain('fam.timeline.showAll');
    expect((en as Record<string, string>)['fam.sketch.ask']).toBe('Here is my drawing.');
  });
});

describe('the composer', () => {
  const w = familyWords('en', TUTOR_KEYS);
  const props = {
    w, id: 'q', value: '', onChange: () => undefined, onSend: () => undefined, canSend: false, pinned: 'dock' as const, files: true, homework: false, attached: [],
    onAttach: () => undefined, onCheck: () => undefined, checking: false, onRemove: () => undefined, fileError: null, voice: null, historyOpen: false, historyFor: 'f', onHistory: () => undefined,
  };
  const withSketch = { ...props, onSketch: async () => null };
  it('shows a Draw button (44 px) when photos are allowed and the window can send a sketch', () => {
    const out = renderToStaticMarkup(h(Composer, withSketch));
    expect(out).toContain('data-sketch-open');
    expect(out).toMatch(/data-sketch-open[^>]*class="[^"]*min-h-\[44px\]/);
    expect(out).toContain('>Draw<');
    // The pad itself is loaded only when opened.
    expect(out).not.toContain('data-sketch-pad');
  });
  it("shows no Draw button without the parent's photo consent, once a file is attached, or when the chat is locked", () => {
    expect(renderToStaticMarkup(h(Composer, { ...withSketch, files: false }))).not.toContain('data-sketch-open');
    expect(renderToStaticMarkup(h(Composer, { ...withSketch, attached: [{ key: 'a', name: 'a.png', mime: 'image/png' as const, state: 'ready' as const, id: 'x' }] }))).not.toContain('data-sketch-open');
    expect(renderToStaticMarkup(h(Composer, { ...withSketch, locked: true }))).not.toContain('data-sketch-open');
    expect(renderToStaticMarkup(h(Composer, props))).not.toContain('data-sketch-open');
  });
  it('the pad is a lazy import with a label on each control, a touch-action of none, a PNG export and no confirm() dialog', () => {
    expect(readFileSync(path.join(__dirname, '../../src/components/family/tutor/Composer.tsx'), 'utf8')).toMatch(/dynamic\(\(\) => import\('\.\/SketchPad'\)/);
    const pad = readFileSync(path.join(__dirname, '../../src/components/family/tutor/SketchPad.tsx'), 'utf8');
    expect(pad).toMatch(/touchAction: 'none'/);
    expect(pad).toContain("toBlob(resolve, 'image/png')");
    expect(pad).not.toMatch(/\bconfirm\(/);
    for (const k of ['pen', 'eraser', 'undo']) expect(pad).toContain(`aria-label={w['fam.sketch.${k}']}`);
    expect(pad).toContain('aria-label={w[`fam.sketch.colour.${c}`]}');
    expect(pad).toContain('h-11');
  });
});

describe('the timeline reveal', () => {
  const TIMELINE = checkBlock({ type: 'timeline', title: 'Ideas about cells', items: [{ when: '1665', text: 'Cells are first seen.' }, { when: '1838', text: 'Plants are made of cells.' }, { when: '1855', text: 'Cells come from cells.' }] }) as Timeline;
  const w = familyWords('en', UNDERSTAND_KEYS);
  it('renders every item, the markup otherwise as before, with no control while all is shown', () => {
    const out = renderToStaticMarkup(h(TimelineView, { b: TIMELINE, tone: 'science', w }));
    for (const e of TIMELINE.items) expect(out).toContain(e.text);
    expect(out).toContain('data-reveal="all"');
    expect(out).toContain('border-l-2');
    expect(out).not.toContain('data-timeline-show-all');
  });
  it('while it waits or runs, every item is still in the page and a 44 px Show all control completes it', () => {
    for (const start of ['wait', 'run'] as const) {
      const out = renderToStaticMarkup(h(TimelineView, { b: TIMELINE, tone: 'science', w, start }));
      expect(out).toContain(`data-reveal="${start}"`);
      for (const e of TIMELINE.items) expect(out).toContain(e.text);
      expect(out).toMatch(/data-timeline-show-all[^>]*min-h-\[44px\][^>]*>Show all</);
    }
  });
  it('the stylesheet shows every item at once under prefers-reduced-motion, and steps 150 ms apart otherwise', () => {
    const css = readFileSync(path.join(__dirname, '../../src/app/(family)/family/family.css'), 'utf8');
    expect(css).toMatch(/animation-delay: calc\(var\(--i, 0\) \* 150ms\)/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.fam-timeline > li \{\s*opacity: 1 !important;\s*animation: none !important;/);
  });
});
