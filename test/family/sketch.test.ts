import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  DRAWINGS_CAP,
  DRAWING_MAX_PIXELS,
  FREEHAND_TOOLS,
  MAX_PAPER_DOTS,
  MIN_EXPORT_SCALE,
  SEND_MAX_SIDE,
  SHAPE_TOOLS,
  SKETCH_PALETTE,
  SKETCH_SIZES,
  UNDO_STEPS,
  addPoint,
  canSave,
  clampSticker,
  copyName,
  downloadRoute,
  drawingSize,
  emptyHistory,
  fitWithin,
  floodFill,
  hexToRgba,
  inFamilyApp,
  inkStyle,
  oldestFirst,
  paperLines,
  record,
  redoStep,
  shapeGeometry,
  smallerScale,
  smoothPath,
  starPoints,
  undoStep,
} from '@/lib/family/sketch';
import { STICKERS, STICKER_BOX } from '@/lib/family/sketch-stickers';
import { PHOTO_SHEET_KEYS, SKETCH_KEYS } from '@/lib/family/sketch-words';
import { TUTOR_FILE_MAX_BYTES } from '@/lib/family/tutor-shape';
import { TUTOR_KEYS } from '@/lib/family/tutor-words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';
import { familyWords } from '@/lib/family/words';
import { checkBlock, type Timeline } from '@/lib/family/blocks';
import { TimelineView } from '@/components/family/blocks/TimelineView';
import { Composer } from '@/components/family/tutor/Composer';
import { CAMERA_ACCEPT, GALLERY_ACCEPT, PhotoSheet } from '@/components/family/tutor/PhotoSheet';
import { StudioToolbar } from '@/components/family/tutor/StudioToolbar';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// W18-P3, rebuilt in C510: the drawing studio's maths (src/lib/family/sketch.ts), its stickers, its words, the photo
// sheet (Take a photo / Choose from gallery), the studio's tool bar and the timeline's reveal. The test runner has no
// canvas, so the painting itself (pointer events, Canvas 2D, toBlob) is seen in a browser (docs/screenshots/c510-paint).

const SRC = (p: string) => readFileSync(path.join(__dirname, '../../src', p), 'utf8');

describe('the tools', () => {
  it('has five freehand tools, six shapes and five sizes', () => {
    expect(FREEHAND_TOOLS).toEqual(['pencil', 'brush', 'marker', 'highlighter', 'eraser']);
    expect(SHAPE_TOOLS).toEqual(['line', 'rect', 'ellipse', 'triangle', 'star', 'arrow']);
    expect(SKETCH_SIZES).toHaveLength(5);
  });
  it('lays each ink its own way: the highlighter see-through and flat, the brush soft, the eraser erases', () => {
    expect(inkStyle('highlighter', 10)).toMatchObject({ alpha: 0.35, cap: 'butt', erase: false });
    expect(inkStyle('brush', 10).blur).toBeGreaterThan(0);
    expect(inkStyle('marker', 10).cap).toBe('square');
    expect(inkStyle('eraser', 10).erase).toBe(true);
    expect(inkStyle('pencil', 1).width).toBe(1);
  });
  it('has at least sixteen different palette colours, each a six-digit hex', () => {
    expect(SKETCH_PALETTE.length).toBeGreaterThanOrEqual(16);
    expect(new Set(SKETCH_PALETTE.map((c) => c.hex.toLowerCase())).size).toBe(SKETCH_PALETTE.length);
    for (const c of SKETCH_PALETTE) expect(c.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('strokes', () => {
  it('thins points closer than the minimum, keeping the list unchanged then', () => {
    const a = addPoint([], { x: 0, y: 0 });
    const same = addPoint(a, { x: 0.5, y: 0.5 }, 1.5);
    expect(same).toBe(a);
    expect(addPoint(a, { x: 3, y: 0 }, 1.5)).toHaveLength(2);
  });
  it('smooths through the midpoints, ending on the last point; one point is a dot', () => {
    expect(smoothPath([])).toBeNull();
    expect(smoothPath([{ x: 1, y: 1 }])).toEqual({ kind: 'dot', at: { x: 1, y: 1 } });
    const s = smoothPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
    expect(s).toEqual({ kind: 'path', start: { x: 0, y: 0 }, curves: [{ c: { x: 10, y: 0 }, to: { x: 10, y: 5 } }, { c: { x: 10, y: 10 }, to: { x: 10, y: 10 } }] });
  });
});

describe('shapes', () => {
  const a = { x: 10, y: 50 };
  const b = { x: 110, y: 10 };
  it('normalises the box whichever way it is dragged', () => {
    expect(shapeGeometry('rect', a, b)).toEqual({ kind: 'poly', closed: true, points: [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 50 }, { x: 10, y: 50 }] });
    expect(shapeGeometry('ellipse', a, b)).toEqual({ kind: 'ellipse', cx: 60, cy: 30, rx: 50, ry: 20 });
    expect(shapeGeometry('triangle', a, b)).toEqual({ kind: 'poly', closed: true, points: [{ x: 60, y: 10 }, { x: 110, y: 50 }, { x: 10, y: 50 }] });
    expect(shapeGeometry('line', a, b)).toEqual({ kind: 'poly', closed: false, points: [a, b] });
  });
  it('draws a five-pointed star with its first point at the top', () => {
    const pts = starPoints(50, 50, 40, 40);
    expect(pts).toHaveLength(10);
    expect(pts[0].x).toBeCloseTo(50);
    expect(pts[0].y).toBeCloseTo(10);
    expect(Math.hypot(pts[1].x - 50, pts[1].y - 50)).toBeCloseTo(18);
  });
  it('gives the arrow a head at its end, never longer than nearly half the arrow', () => {
    const g = shapeGeometry('arrow', { x: 0, y: 0 }, { x: 100, y: 0 }, 4);
    if (g.kind !== 'arrow') throw new Error('not an arrow');
    expect(g.head[1]).toEqual({ x: 100, y: 0 });
    expect(g.head[0].x).toBeLessThan(100);
    expect(g.head[0].y).toBeCloseTo(-g.head[2].y);
    const short = shapeGeometry('arrow', { x: 0, y: 0 }, { x: 10, y: 0 }, 20);
    if (short.kind !== 'arrow') throw new Error('not an arrow');
    expect(Math.hypot(short.head[0].x - 10, short.head[0].y)).toBeLessThanOrEqual(4.5 + 1e-9);
  });
});

describe('the fill bucket', () => {
  // A 10 x 10 picture, see-through, with an ink ring around (2..7, 2..7).
  const ring = () => {
    const d = new Uint8ClampedArray(10 * 10 * 4);
    for (let y = 2; y <= 7; y++)
      for (let x = 2; x <= 7; x++)
        if (x === 2 || x === 7 || y === 2 || y === 7) {
          const i = (y * 10 + x) * 4;
          d.set([0, 0, 0, 255], i);
        }
    return d;
  };
  const at = (d: Uint8ClampedArray, x: number, y: number) => Array.from(d.slice((y * 10 + x) * 4, (y * 10 + x) * 4 + 4));
  it('fills inside a closed line and stops at it', () => {
    const d = ring();
    const r = floodFill(d, 10, 10, 4, 4, hexToRgba('#FF0000'));
    expect(r).toEqual({ filled: 16, stopped: false });
    expect(at(d, 4, 4)).toEqual([255, 0, 0, 255]);
    expect(at(d, 2, 2)).toEqual([0, 0, 0, 255]);
    expect(at(d, 0, 0)).toEqual([0, 0, 0, 0]);
  });
  it('fills outside around it, and is bounded by its pixel cap so it cannot run away', () => {
    const d = ring();
    expect(floodFill(d, 10, 10, 0, 0, hexToRgba('#00FF00')).filled).toBe(100 - 36);
    const big = new Uint8ClampedArray(2000 * 1500 * 4);
    const t = Date.now();
    const r = floodFill(big, 2000, 1500, 5, 5, hexToRgba('#00FF00'), 40, 50_000);
    expect(r).toEqual({ filled: 50_000, stopped: true });
    expect(Date.now() - t).toBeLessThan(2000);
  });
  it('fills a whole large drawing in bounded time', () => {
    const big = new Uint8ClampedArray(1600 * 1200 * 4);
    const t = Date.now();
    expect(floodFill(big, 1600, 1200, 800, 600, hexToRgba('#123456')).filled).toBe(1600 * 1200);
    expect(Date.now() - t).toBeLessThan(5000);
  });
  it('does nothing outside the picture or with the colour already there', () => {
    const d = ring();
    expect(floodFill(d, 10, 10, -1, 4, hexToRgba('#FF0000')).filled).toBe(0);
    expect(floodFill(d, 10, 10, 2, 2, [0, 0, 0, 255]).filled).toBe(0);
  });
  it('keeps to the tolerance', () => {
    const d = new Uint8ClampedArray(3 * 1 * 4);
    d.set([100, 100, 100, 255, 120, 100, 100, 255, 200, 100, 100, 255]);
    expect(floodFill(d.slice(), 3, 1, 0, 0, [0, 0, 0, 255], 30).filled).toBe(2);
    expect(floodFill(d.slice(), 3, 1, 0, 0, [0, 0, 0, 255], 5).filled).toBe(1);
  });
});

describe('undo and redo', () => {
  it('undoes and redoes in order; a new step clears what was undone', () => {
    let h = record(record(emptyHistory<number>(), 1).history, 2).history;
    h = undoStep(h);
    expect(h).toEqual({ done: [1], undone: [2] });
    expect(redoStep(h)).toEqual({ done: [1, 2], undone: [] });
    expect(record(h, 3).history).toEqual({ done: [1, 3], undone: [] });
    expect(undoStep(emptyHistory())).toEqual(emptyHistory());
  });
  it('keeps at least 30 steps, at most the cap, and bakes the oldest beyond it', () => {
    expect(UNDO_STEPS).toBeGreaterThanOrEqual(30);
    let h = emptyHistory<number>();
    const baked: number[] = [];
    for (let i = 0; i < UNDO_STEPS + 5; i++) {
      const r = record(h, i);
      h = r.history;
      baked.push(...r.baked);
    }
    expect(h.done).toHaveLength(UNDO_STEPS);
    expect(baked).toEqual([0, 1, 2, 3, 4]);
  });
  it('is bounded by weight too: heavy steps are baked sooner, but the newest is always kept', () => {
    let h = emptyHistory<number>();
    h = record(h, 600, 40, (n) => n, 1000).history;
    const r = record(h, 700, 40, (n) => n, 1000);
    expect(r.baked).toEqual([600]);
    expect(r.history.done).toEqual([700]);
    expect(record(emptyHistory<number>(), 5000, 40, (n) => n, 1000).history.done).toEqual([5000]);
  });
});

describe('the paper', () => {
  it('rules lines with a margin, squares both ways, and bounded dots', () => {
    const ruled = paperLines('ruled', 320, 320, 32);
    expect(ruled.lines[0][0].y).toBe(48);
    expect(ruled.margin).not.toBeNull();
    const sq = paperLines('squares', 96, 96, 32);
    expect(sq.lines.every(([a, b]) => a.x === b.x || a.y === b.y)).toBe(true);
    expect(paperLines('plain', 100, 100, 32)).toEqual({ lines: [], margin: null, dots: [] });
    expect(paperLines('dots', 20000, 20000, 8).dots.length).toBeLessThanOrEqual(MAX_PAPER_DOTS);
  });
});

describe('sizes', () => {
  it('sizes the drawing at the pixel ratio (at most 2) and under the memory bound', () => {
    expect(drawingSize(390, 600, 3)).toEqual({ width: 780, height: 1200, scale: 2 });
    expect(drawingSize(390, 600, 1)).toEqual({ width: 390, height: 600, scale: 1 });
    const big = drawingSize(1440, 900, 2);
    expect(big.width * big.height).toBeLessThanOrEqual(DRAWING_MAX_PIXELS + 2000);
    expect(big.width / big.height).toBeCloseTo(1.6, 2);
  });
  it('fits the picture sent to the tutor inside 1600 px, never larger than it is', () => {
    expect(fitWithin(780, 1200, SEND_MAX_SIDE)).toEqual({ width: 780, height: 1200 });
    expect(fitWithin(2000, 1000, SEND_MAX_SIDE)).toEqual({ width: 1600, height: 800 });
  });
  it('makes a picture over the file door limit smaller, by its pixel count, never below the floor', () => {
    const MB = 1024 * 1024;
    expect(smallerScale(2 * MB, TUTOR_FILE_MAX_BYTES, 1)).toBeNull();
    const next = smallerScale(2 * TUTOR_FILE_MAX_BYTES, TUTOR_FILE_MAX_BYTES, 1)!;
    expect(next).toBeCloseTo(Math.sqrt(0.5) * 0.85, 5);
    expect(smallerScale(1000 * MB, TUTOR_FILE_MAX_BYTES, 1)).toBe(MIN_EXPORT_SCALE);
    expect(smallerScale(1000 * MB, TUTOR_FILE_MAX_BYTES, MIN_EXPORT_SCALE)).toBeNull();
  });
  it('keeps a sticker between its smallest and largest size', () => {
    expect(clampSticker(1)).toBe(40);
    expect(clampSticker(9999)).toBe(480);
    expect(clampSticker(150.4)).toBe(150);
  });
});

describe('My drawings on the device', () => {
  it('saves until the cap, then only over the open drawing; shows the oldest first for removal', () => {
    expect(DRAWINGS_CAP).toBe(40);
    expect(canSave(39, false)).toBe(true);
    expect(canSave(40, false)).toBe(false);
    expect(canSave(40, true)).toBe(true);
    const list = [{ id: 'b', name: 'B', updatedAt: 2 }, { id: 'a', name: 'A', updatedAt: 1 }, { id: 'c', name: 'C', updatedAt: 3 }];
    expect(oldestFirst(list).map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(list[0].id).toBe('b');
  });
  it('names a copy with the next free number', () => {
    expect(copyName('Cat', ['Cat'])).toBe('Cat 2');
    expect(copyName('Cat 2', ['Cat', 'Cat 2'])).toBe('Cat 3');
  });
  it('wraps every IndexedDB access and answers "unavailable" where there is none', async () => {
    const store = await import('@/lib/family/sketch-store');
    expect(await store.listDrawings()).toEqual({ ok: false, reason: 'unavailable' });
    const src = SRC('lib/family/sketch-store.ts');
    expect(src).toMatch(/try \{/);
    expect(src).toContain("'full'");
  });
  it('downloads by the share sheet, a link in a browser, and not at all in the app (the button is hidden there)', () => {
    expect(downloadRoute({ inApp: true, shareFiles: true })).toBe('share');
    expect(downloadRoute({ inApp: false, shareFiles: false })).toBe('link');
    expect(downloadRoute({ inApp: true, shareFiles: false })).toBe('none');
    expect(inFamilyApp('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile NetCyberAIFamily/2')).toBe(true);
    expect(inFamilyApp('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile')).toBe(false);
  });
});

describe('the stickers', () => {
  const PATH = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/;
  it('has at least 24 named pictures, each with valid path data inside the 64 px box', () => {
    expect(STICKERS.length).toBeGreaterThanOrEqual(24);
    expect(new Set(STICKERS.map((s) => s.id)).size).toBe(STICKERS.length);
    for (const id of ['house', 'tree', 'sun', 'cloud', 'flower', 'cat', 'dog', 'fish', 'bird', 'butterfly', 'apple', 'banana', 'ball', 'bicycle', 'car', 'bus', 'boat', 'kite', 'balloon', 'book', 'pencil', 'heart', 'star', 'smiley'])
      expect(STICKERS.map((s) => s.id)).toContain(id);
    for (const s of STICKERS) {
      expect(s.parts.length, s.id).toBeGreaterThan(0);
      for (const p of s.parts) {
        expect(p.d, s.id).toMatch(PATH);
        expect(p.d.trim()[0], s.id).toBe('M');
        expect(p.d, s.id).not.toMatch(/NaN|Infinity/);
        // Every number that is a coordinate stays in (or just around) the box; arc flags and radii are small too.
        for (const n of p.d.match(/-?\d+(\.\d+)?/g) ?? []) expect(Math.abs(Number(n)), s.id).toBeLessThanOrEqual(STICKER_BOX + 2);
        if (p.fill !== null) expect(p.fill, s.id).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });
});

describe('the words', () => {
  it('are in English and Hindi, and picked for the tutor window', () => {
    for (const k of [...SKETCH_KEYS, ...PHOTO_SHEET_KEYS, 'fam.sketch.err.picture_only', 'fam.sketch.err.unreadable', 'fam.timeline.showAll']) {
      expect(en, k).toHaveProperty([k]);
      expect(hi, k).toHaveProperty([k]);
    }
    for (const k of [...SKETCH_KEYS, ...PHOTO_SHEET_KEYS]) expect(TUTOR_KEYS).toContain(k);
    expect(UNDERSTAND_KEYS).toContain('fam.timeline.showAll');
    expect((en as Record<string, string>)['fam.sketch.ask']).toBe('Here is my drawing.');
  });
});

describe('the photo sheet (Check my work, Ask about this)', () => {
  const w = familyWords('en', TUTOR_KEYS);
  const out = renderToStaticMarkup(h(PhotoSheet, { w, id: 's', title: 'Check my work', onPick: () => undefined, onClose: () => undefined }));
  it('offers two big buttons: Take a photo first, then Choose from gallery', () => {
    expect(out).toMatch(/data-photo-take[^>]*min-h-\[56px\][^>]*>.*Take a photo</);
    expect(out).toMatch(/data-photo-choose[^>]*min-h-\[56px\][^>]*>.*Choose from gallery</);
    expect(out.indexOf('data-photo-take')).toBeLessThan(out.indexOf('data-photo-choose'));
  });
  it('opens the back camera with accept exactly image/* (what the Android app needs), and the gallery without capture', () => {
    expect(CAMERA_ACCEPT).toBe('image/*');
    expect(out).toMatch(/<input[^>]*accept="image\/\*"[^>]*capture="environment"[^>]*data-photo-camera/);
    const gallery = /<input[^>]*data-photo-gallery[^>]*>/.exec(out)?.[0] ?? '';
    expect(gallery).toContain(`accept="${GALLERY_ACCEPT}"`);
    expect(gallery).not.toContain('capture');
  });
  it('is opened by both menu items in the composer, which no longer opens a picker or leaves the page directly', () => {
    const src = SRC('components/family/tutor/Composer.tsx');
    expect(src).toContain("openSheet('check')");
    expect(src).toContain("openSheet('ask')");
    expect(src).not.toContain('checkInput');
    expect(src).not.toContain('href="/family/study/homework"');
  });
  it('the Android app declares the camera intent (so the chooser finds a camera app on Android 11+)', () => {
    const manifest = readFileSync(path.join(__dirname, '../../android/app/src/main/AndroidManifest.xml'), 'utf8');
    expect(manifest).toContain('android.media.action.IMAGE_CAPTURE');
    expect(manifest).toContain('androidx.core.content.FileProvider');
  });
});

describe('the composer and the studio', () => {
  const w = familyWords('en', TUTOR_KEYS);
  const props = {
    w, id: 'q', value: '', onChange: () => undefined, onSend: () => undefined, canSend: false, pinned: 'dock' as const, files: true, homework: false, attached: [],
    onAttach: () => undefined, onCheck: () => undefined, checking: false, onRemove: () => undefined, fileError: null, voice: null, historyOpen: false, historyFor: 'f', onHistory: () => undefined,
  };
  const withSketch = { ...props, onSketch: async () => null };
  it('shows a Draw button (44 px) when photos are allowed and the window can send a drawing', () => {
    const out = renderToStaticMarkup(h(Composer, withSketch));
    expect(out).toMatch(/data-sketch-open[^>]*class="[^"]*min-h-\[44px\]/);
    expect(out).toContain('>Draw<');
    expect(out).not.toContain('data-sketch-pad');
  });
  it("shows no Draw button without the parent's photo consent, once a file is attached, or when the chat is locked", () => {
    expect(renderToStaticMarkup(h(Composer, { ...withSketch, files: false }))).not.toContain('data-sketch-open');
    expect(renderToStaticMarkup(h(Composer, { ...withSketch, attached: [{ key: 'a', name: 'a.png', mime: 'image/png' as const, state: 'ready' as const, id: 'x' }] }))).not.toContain('data-sketch-open');
    expect(renderToStaticMarkup(h(Composer, { ...withSketch, locked: true }))).not.toContain('data-sketch-open');
    expect(renderToStaticMarkup(h(Composer, props))).not.toContain('data-sketch-open');
  });
  it('the tool bar has every tool and panel, each a labelled 44 px button saying whether it is on', () => {
    const out = renderToStaticMarkup(h(StudioToolbar, { w, tool: 'brush', colour: '#E8702A', panel: null, onTool: () => undefined, onPanel: () => undefined, onClear: () => undefined }));
    expect(out).toContain('role="toolbar"');
    for (const t of ['pencil', 'brush', 'marker', 'highlighter', 'eraser', 'fill', 'text']) expect(out).toContain(`data-studio-tool="${t}"`);
    for (const p of ['shapes', 'stickers', 'colours', 'paper']) expect(out).toContain(`data-studio-panel="${p}"`);
    expect(out).toContain('data-studio-clear');
    expect(out).toMatch(/data-studio-tool="brush" aria-pressed="true" aria-label="Brush"/);
    expect(out).toMatch(/data-studio-tool="pencil" aria-pressed="false" aria-label="Pencil"/);
    const buttons = out.match(/<button[^>]*>/g) ?? [];
    expect(buttons.length).toBe(12);
    for (const b of buttons) {
      expect(b).toMatch(/aria-label="[^"]+"/);
      expect(b).toMatch(/h-11 w-11/);
    }
    expect(out).toContain('background-color:#E8702A');
  });
  it('the studio: a lazy import, full screen, safe-area aware, touch-action none, pointer events, no confirm() and no library', () => {
    expect(SRC('components/family/tutor/Composer.tsx')).toMatch(/dynamic\(\(\) => import\('\.\/SketchPad'\)/);
    const pad = SRC('components/family/tutor/SketchPad.tsx');
    expect(pad).toMatch(/fixed inset-0 z-50/);
    expect(pad).toContain('safe-area-inset-top');
    expect(pad).toMatch(/touchAction: 'none'/);
    expect(pad).toContain('onPointerDown={down}');
    expect(pad).toContain('getCoalescedEvents');
    expect(pad).not.toMatch(/\bconfirm\(/);
    expect(pad).not.toMatch(/\.pressure\b/);
    expect(pad).toContain('devicePixelRatio');
    expect(pad).toContain('data-sketch-clear-yes');
    for (const s of ['sending', 'sent', 'failed']) expect(pad).toContain(`data-sketch-state="${s}"`);
    expect(pad).toContain("w['fam.sketch.tryAgain']");
    const imports = [...pad.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    for (const i of imports) expect(i, i).toMatch(/^(react|react-dom|@\/lib\/|\.\/)/);
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
