import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FAMILY_MODULES, TABS, visibleTabs } from '@/lib/family/modules';
import { familyModuleRows } from '@/lib/control/apps';
import { EDITABLE_SETTINGS, SETTING_SCREENS } from '@/lib/control/system-settings';
import { DRAW_DAILY_DEFAULT, DRAW_DAILY_SETTING } from '@/lib/family/draw-contract';
import { BRUSH_LOOK, STABILISER_PULL, StrokeBuilder, catmullRom, easeWidth, grainTile, ribbonPieces, stabilise, targetWidth, usablePressure } from '@/lib/family/draw-brush';
import { LONG_PRESS_MS, WHEEL, WHEEL_HUES, nearestHue, normaliseTurn, outlineBox, pushRecent, twistSticker, wheelCentre, wheelColour, wheelHit, wheelSpot, hueColour } from '@/lib/family/draw-geometry';
import { sanitiseOutline, outlineDataUrl } from '@/lib/family/draw-svg';
import { canStartNew, dayKey, drawDailyLimit, placesLeft, readDrawDaily } from '@/lib/family/draw-daily';
import { SEND_RETRY_DELAYS, sendErrorKey, sendWithRetry, singleFlight, type UploadAnswer } from '@/lib/family/draw-send';
import { LAYERS, exportLayers, layersTouched, type LayerAction } from '@/lib/family/draw-layers';
import { DRAW_PAGE_KEYS, DRAW_STUDIO_KEYS } from '@/lib/family/draw-words';
import { SKETCH_KEYS } from '@/lib/family/sketch-words';
import { floodFill, hexToRgba } from '@/lib/family/sketch';
import { readDayCount } from '@/lib/family/sketch-store';
import { artColors, lessonColors } from '@/lib/design-tokens';
import { FamilyTabs } from '@/components/family/FamilyTabs';
import { DrawTemplatesSlot } from '@/components/family/draw/templates/Slot';
import { DrawLimit } from '@/components/family/draw/DrawLimit';
import { setDrawDaily } from '@/lib/control/family-settings';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// C513: the Draw tab and the art table studio. The test runner has no canvas, so the painting is seen in a browser
// (docs/screenshots/c513-draw); here: the module and the dock, the brush model, the stabiliser, the colour wheel's
// geometry, the outline's sanitiser and its layer, the daily limit and the patient send.

const ROOT = path.resolve(__dirname, '../..');
const SRC = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

describe('the Draw module', () => {
  it('is registered once, on its own tab, free and on by default, and Control lists it', () => {
    const mods = FAMILY_MODULES.filter((m) => m.id === 'draw');
    expect(mods).toHaveLength(1);
    expect(mods[0]).toMatchObject({ tab: 'draw', flag: 'draw', entitlement: 'public', built: true });
    expect(mods[0].offByDefault).toBeUndefined();
    expect(familyModuleRows([]).map((r) => r.flag.module)).toContain('draw');
    expect(familyModuleRows([]).find((r) => r.flag.module === 'draw')?.flag.enabled).toBe(true);
    expect(en['control.apps.module.label.draw' as keyof typeof en]).toBeTruthy();
  });
  it('sits between English and Future, and its switch hides the tab', () => {
    expect(TABS).toEqual(['home', 'study', 'english', 'draw', 'future']);
    expect(visibleTabs(() => true)).toContain('draw');
    expect(visibleTabs((f) => f !== 'draw')).not.toContain('draw');
  });
  it('gates its page on the switch, pre-primary included, and keeps the templates slot', () => {
    const page = SRC('src/app/(family)/family/(app)/draw/page.tsx');
    expect(page).toMatch(/if \(!switches \|\| !switchOn\(switches, 'draw'\)\) redirect\('\/family'\)/);
    expect(page).not.toMatch(/isPrePrimary\(child\.classLevel\)\) redirect/);
    expect(page).toContain('readDrawDaily');
    const home = SRC('src/components/family/draw/DrawHome.tsx');
    expect(home).toContain("import { DrawTemplatesSlot } from './templates/Slot'");
    expect(home).toContain('<DrawTemplatesSlot');
    expect(home).toMatch(/dynamic\(\(\) => import\('\.\/Studio'\)/);
    expect(renderToStaticMarkup(h(DrawTemplatesSlot, { classLevel: 3 }))).toBe('');
  });
});

describe('the dock with five tabs', () => {
  const labels = { home: 'Home', study: 'Study', english: 'English', draw: 'Draw', future: 'Future' };
  it('shows Draw between English and Future, each tab a link with its name', () => {
    const html = renderToStaticMarkup(h(FamilyTabs, { tabs: [...TABS], navLabel: 'Main menu', labels }));
    expect(html.match(/class="fam-press fam-tab"/g)?.length).toBe(5);
    const order = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual(['/family', '/family/study', '/family/english', '/family/draw', '/family/future']);
    expect(html).toContain('>Draw<');
    expect(html).toContain('data-count="5"');
  });
  // 17 Nov 2026: edge to edge on a phone, five equal columns, each its icon over its name.
  it('fits a 360 px phone with five equal tabs of 56 px and more', () => {
    const css = SRC('src/app/(family)/family/family.css');
    expect(css).toMatch(/\.fam-tab \{[^}]*flex-direction: column/);
    expect(css).toMatch(/\.fam-tab \{[^}]*min-height: 56px/);
    const html = renderToStaticMarkup(h(FamilyTabs, { tabs: [...TABS], navLabel: 'Main menu', labels }));
    expect(html.match(/class="min-w-0 flex-1"/g)?.length).toBe(5);
    // 360 px less the dock's 4 px sides: each of the five columns is wider than 56 px.
    expect((360 - 2 * 4) / 5).toBeGreaterThan(56);
  });
});

describe('the brush', () => {
  it('reads pressure only from a stylus that reports it', () => {
    expect(usablePressure({ x: 0, y: 0, t: 0, pressure: 0.5, pen: false })).toBeNull();
    expect(usablePressure({ x: 0, y: 0, t: 0, pressure: 0, pen: true })).toBeNull();
    expect(usablePressure({ x: 0, y: 0, t: 0, pressure: 0.8, pen: true })).toBe(0.8);
  });
  it('is thicker under a firm press and thinner under a light one', () => {
    const light = targetWidth('brush', 10, 0, 0.1);
    const firm = targetWidth('brush', 10, 0, 1);
    expect(firm).toBeGreaterThan(light);
    expect(light).toBeGreaterThanOrEqual(10 * BRUSH_LOOK.brush.widthK * BRUSH_LOOK.brush.minK - 1e-9);
  });
  it('without pressure, a slow line is thicker than a fast one; the highlighter keeps one width', () => {
    expect(targetWidth('brush', 10, 0.05, null)).toBeGreaterThan(targetWidth('brush', 10, 2, null));
    expect(targetWidth('highlighter', 10, 0.05, null)).toBe(targetWidth('highlighter', 10, 2.5, null));
    expect(targetWidth('pencil', 10, 99, null)).toBe(targetWidth('pencil', 10, 2.5, null));
  });
  it('eases the width, so a change of speed tapers instead of stepping', () => {
    expect(easeWidth(10, 20)).toBeCloseTo(13.5);
    const b = new StrokeBuilder('brush', 10);
    b.add({ x: 0, y: 0, t: 0 });
    for (let i = 1; i < 6; i++) b.add({ x: i * 2, y: 0, t: i * 16 });
    for (let i = 6; i < 12; i++) b.add({ x: 10 + (i - 5) * 60, y: 0, t: i * 16 });
    const ws = b.points.map((p) => p.w);
    for (let i = 1; i < ws.length; i++) expect(Math.abs(ws[i] - ws[i - 1])).toBeLessThan(ws[0] * 0.4);
    expect(ws[ws.length - 1]).toBeLessThan(ws[3]);
  });
  it('gives each tool its own look: a textured crayon, a see-through watercolour with a wash, an eraser', () => {
    expect(BRUSH_LOOK.crayon.grain).toBeGreaterThan(0);
    expect(BRUSH_LOOK.watercolour).toMatchObject({ wash: true });
    expect(BRUSH_LOOK.watercolour.alpha).toBeLessThan(0.7);
    expect(BRUSH_LOOK.eraser.erase).toBe(true);
    // The grain never removes more than about half of a crayon's colour, so the fill bucket still stops at its lines.
    const g = grainTile(48, 7, 0.5);
    expect(Math.max(...g) * BRUSH_LOOK.crayon.grain).toBeLessThan(0.5);
    expect(grainTile(48, 7, 0.5)).toEqual(g);
  });
  it('fills a ribbon of discs joined by quadrilaterals', () => {
    const pieces = ribbonPieces([{ x: 0, y: 0, w: 4 }, { x: 10, y: 0, w: 8 }]);
    expect(pieces.map((p) => p.kind)).toEqual(['disc', 'disc', 'quad']);
    const quad = pieces[2];
    if (quad.kind !== 'quad') throw new Error('quad');
    expect(quad.pts).toEqual([[0, -2], [10, -4], [10, 4], [0, 2]]);
    // Clockwise on screen (y down), as canvas arcs are: a positive shoelace area, so overlaps never cancel.
    const area = quad.pts.reduce((sum, [x, y], i) => {
      const [nx, ny] = quad.pts[(i + 1) % quad.pts.length];
      return sum + x * ny - nx * y;
    }, 0);
    expect(area).toBeGreaterThan(0);
  });
});

describe('the stabiliser', () => {
  it('moves part of the way to the finger (a small lag), and starts where the finger is', () => {
    expect(stabilise(null, { x: 5, y: 5, t: 0 }, 3)).toEqual({ x: 5, y: 5, t: 0, w: 3 });
    const s = stabilise({ x: 0, y: 0, t: 0, w: 3 }, { x: 10, y: 0, t: 16 }, 3);
    expect(s.x).toBeCloseTo(10 * STABILISER_PULL);
  });
  it('irons out a shaky hand and ends where the finger lifted', () => {
    const b = new StrokeBuilder('pencil', 6);
    const raw = Array.from({ length: 40 }, (_, i) => ({ x: i * 5, y: i % 2 === 0 ? 4 : -4, t: i * 16 }));
    for (const p of raw) b.add(p);
    const kept = b.finish({ x: 200, y: 0, t: 700 });
    const shakeIn = Math.max(...raw.map((p) => Math.abs(p.y)));
    const shakeOut = Math.max(...kept.slice(5, -1).map((p) => Math.abs(p.y)));
    expect(shakeOut).toBeLessThan(shakeIn * 0.5);
    expect(kept[kept.length - 1]).toMatchObject({ x: 200, y: 0 });
  });
  it('draws a Catmull-Rom curve that passes through the kept points', () => {
    const pts = [{ x: 0, y: 0, w: 2 }, { x: 10, y: 10, w: 2 }, { x: 20, y: 0, w: 2 }, { x: 30, y: 10, w: 2 }];
    const c = catmullRom(pts, 4);
    expect(c).toHaveLength(1 + 3 * 4);
    for (let i = 0; i < pts.length; i++) {
      expect(c[i * 4].x).toBeCloseTo(pts[i].x);
      expect(c[i * 4].y).toBeCloseTo(pts[i].y);
    }
  });
});

describe('the radial colour wheel', () => {
  it('opens after about 350 ms', () => expect(LONG_PRESS_MS).toBe(350));
  it('finds the ring and the item under the finger, item 0 at the top, clockwise', () => {
    expect(wheelHit(0, 0, 5)).toEqual({ ring: 'centre' });
    expect(wheelHit(0, -(WHEEL.centre + 10), 5)).toEqual({ ring: 'petal', index: 0 });
    expect(wheelHit(WHEEL.centre + 10, 0, 4)).toEqual({ ring: 'petal', index: 1 });
    expect(wheelHit(0, -(WHEEL.centre + 10), 0)).toEqual({ ring: 'centre' });
    expect(wheelHit(0, (WHEEL.petals + WHEEL.tones) / 2, 5).ring).toBe('tone');
    const r = (WHEEL.tones + WHEEL.hues) / 2;
    for (let i = 0; i < WHEEL_HUES; i++) {
      const at = wheelSpot(i, WHEEL_HUES, r);
      expect(wheelHit(at.x, at.y, 6)).toEqual({ ring: 'hue', index: i });
    }
    expect(wheelHit(0, WHEEL.hues + 40, 6)).toEqual({ ring: 'outside' });
  });
  it('names the colour of each ring, and nothing for the middle', () => {
    expect(wheelColour({ ring: 'hue', index: 0 }, [], 0)).toBe(hueColour(0));
    expect(wheelColour({ ring: 'petal', index: 1 }, ['#111111', '#222222'], 0)).toBe('#222222');
    expect(wheelColour({ ring: 'tone', index: 0 }, [], 4)).toMatch(/^#[0-9A-F]{6}$/);
    expect(wheelColour({ ring: 'centre' }, ['#111111'], 0)).toBeNull();
    expect(nearestHue('#FF0000')).toBe(0);
    expect(nearestHue('#0000FF')).toBe(8);
  });
  it('stays on the screen near an edge', () => {
    const c = wheelCentre({ x: 5, y: 630 }, { w: 360, h: 640 });
    expect(c.x).toBe(WHEEL.hues + 8);
    expect(c.y).toBe(640 - WHEEL.hues - 8);
  });
  it('keeps recent colours newest first, without repeats', () => {
    expect(pushRecent(['#AAAAAA', '#BBBBBB'], '#bbbbbb')).toEqual(['#BBBBBB', '#AAAAAA']);
    expect(pushRecent(['1', '2', '3', '4', '5', '6'].map((n) => `#00000${n}`), '#FFFFFF')).toHaveLength(6);
  });
});

describe('stickers as objects', () => {
  it('turn and resize together from the corner handle, within the bounds', () => {
    const s = { key: 'k', id: 'star', at: { x: 100, y: 100 }, px: 100, rot: 0 };
    const t = twistSticker(s, { x: 150, y: 100 }, { x: 100, y: 200 }, { px: 100, rot: 0 });
    expect(t.px).toBeCloseTo(200);
    expect(t.rot).toBeCloseTo(Math.PI / 2);
    expect(twistSticker(s, { x: 150, y: 100 }, { x: 5000, y: 100 }, { px: 100, rot: 0 }).px).toBe(480);
    expect(normaliseTurn(Math.PI * 3)).toBeCloseTo(Math.PI);
  });
});

describe("a template's outline", () => {
  const OK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g fill="none" stroke="#1C1B1A" stroke-width="3"><circle cx="50" cy="50" r="30"/><path d="M100 20 L180 80"/></g><text x="10" y="90" font-size="12">Frog &amp; egg</text></svg>';
  it('keeps the allowed parts and its size', () => {
    const c = sanitiseOutline(OK);
    expect(c).not.toBeNull();
    expect(c!.width).toBe(200);
    expect(c!.height).toBe(100);
    expect(c!.svg).toContain('<circle cx="50" cy="50" r="30"/>');
    expect(c!.svg).toContain('Frog &amp; egg');
    expect(outlineDataUrl(c!)).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
  });
  it.each([
    ['a script', '<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>'],
    ['a foreignObject', '<svg viewBox="0 0 10 10"><foreignObject><div/></foreignObject></svg>'],
    ['an image', '<svg viewBox="0 0 10 10"><image href="https://x.example/a.png"/></svg>'],
    ['a link', '<svg viewBox="0 0 10 10"><a href="javascript:alert(1)"><path d="M0 0"/></a></svg>'],
    ['a use', '<svg viewBox="0 0 10 10"><use href="#a"/></svg>'],
    ['an external href', '<svg viewBox="0 0 10 10"><path d="M0 0" href="https://x.example"/></svg>'],
    ['an xlink:href', '<svg viewBox="0 0 10 10"><path d="M0 0" xlink:href="#x"/></svg>'],
    ['a url() reference', '<svg viewBox="0 0 10 10"><path d="M0 0" fill="url(https://x.example/#p)"/></svg>'],
    ['an event handler', '<svg viewBox="0 0 10 10" onload="alert(1)"><path d="M0 0"/></svg>'],
    ['a style sheet', '<svg viewBox="0 0 10 10"><style>@import url(x)</style></svg>'],
    ['a DOCTYPE', '<!DOCTYPE svg [<!ENTITY x "y">]><svg viewBox="0 0 10 10"/>'],
    ['a style attribute', '<svg viewBox="0 0 10 10"><path d="M0 0" style="fill:red"/></svg>'],
    ['no viewBox', '<svg><path d="M0 0"/></svg>'],
    ['not an SVG', '<div><path d="M0 0"/></div>'],
    ['an unclosed tag', '<svg viewBox="0 0 10 10"><g>'],
  ])('refuses %s', (_, svg) => {
    expect(sanitiseOutline(svg)).toBeNull();
  });
  it('is its own top layer: the eraser and Clear never touch it, and the picture carries it last', () => {
    expect(LAYERS).toEqual(['paper', 'drawing', 'stickers', 'outline']);
    for (const a of ['ink', 'erase', 'shape', 'fill', 'text', 'label', 'stick', 'clear', 'paper'] as LayerAction[]) expect(layersTouched(a)).not.toContain('outline');
    expect(layersTouched('erase')).toEqual(['drawing']);
    expect(layersTouched('clear')).toEqual(['drawing', 'stickers']);
    expect(exportLayers(true)).toEqual(['paper', 'drawing', 'outline']);
    const studio = SRC('src/components/family/draw/Studio.tsx');
    // The outline is an <img> of the sanitised SVG above the canvases, never drawn into the drawing's canvas.
    expect(studio).toMatch(/<img src=\{outlineUrl\}[^>]*data-draw-outline[^>]*pointer-events-none/);
    expect(studio).toContain('sanitiseOutline(template.outlineSvg)');
    expect(studio).not.toMatch(/dangerouslySetInnerHTML/);
  });
  it("stops the fill at its lines, and leaves the drawing's pixels under them unpainted", () => {
    // A row of 10 clear pixels; the outline has a line at x = 5.
    const data = new Uint8ClampedArray(10 * 4);
    const read = new Uint8ClampedArray(10 * 4);
    read.set([0, 0, 0, 255], 5 * 4);
    const r = floodFill(data, 10, 1, 1, 0, hexToRgba('#FF0000'), 48, 10, read);
    expect(r.filled).toBe(5);
    expect([...data.slice(4 * 4, 4 * 4 + 4)]).toEqual([255, 0, 0, 255]);
    expect([...data.slice(5 * 4, 5 * 4 + 4)]).toEqual([0, 0, 0, 0]);
    expect([...data.slice(6 * 4, 6 * 4 + 4)]).toEqual([0, 0, 0, 0]);
  });
  it('sits centred on the paper inside a margin, keeping its shape', () => {
    const b = outlineBox(1000, 800, 200, 100);
    expect(b.w / b.h).toBeCloseTo(2);
    expect(b.x).toBeCloseTo((1000 - b.w) / 2);
    expect(b.w).toBeLessThanOrEqual(1000 - 2 * 48);
  });
  it('Done is the child’s own tap: it says the template and nothing about the drawing', () => {
    const studio = SRC('src/components/family/draw/Studio.tsx');
    expect(studio).toMatch(/data-draw-done\s+onClick=\{\(\) => \{\s+onEvent\?\.\(\{ t: 'done', templateId: template\.id \}\);/);
    expect(studio).toContain("onEvent?.({ t: 'saved', drawingId: id, templateId: template?.id ?? null })");
    expect(studio).toContain("onEvent?.({ t: 'closed' })");
    // The template's palette is offered first, and its words sit in a tray the child taps, then places.
    expect(studio).toContain('data-draw-themed');
    expect(studio).toContain('data-draw-labels');
  });
});

describe('the daily creation limit', () => {
  it('reads the stored number, else the default', async () => {
    expect(drawDailyLimit(5)).toBe(5);
    expect(drawDailyLimit('7')).toBe(7);
    expect(drawDailyLimit(0)).toBe(0);
    for (const bad of [-1, 2.5, 'x', null, undefined, 10_000]) expect(drawDailyLimit(bad)).toBe(DRAW_DAILY_DEFAULT);
    const db = { query: vi.fn(async () => ({ rows: [{ value: 3 }] })) };
    expect(await readDrawDaily(db)).toBe(3);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('control.settings'), [DRAW_DAILY_SETTING]);
    expect(await readDrawDaily({ query: async () => ({ rows: [] }) })).toBe(DRAW_DAILY_DEFAULT);
  });
  it('lets a new drawing start under the limit, stops it at the limit, and never blocks when the phone cannot count', () => {
    expect(canStartNew(11, 12)).toBe(true);
    expect(canStartNew(12, 12)).toBe(false);
    expect(canStartNew(0, 0)).toBe(false);
    expect(canStartNew(null, 0)).toBe(true);
    expect(placesLeft(10, 12)).toBe(2);
    expect(placesLeft(20, 12)).toBe(0);
    expect(placesLeft(null, 12)).toBeNull();
  });
  it('counts per child and per India day (a new day at midnight in India, 18:30 UTC)', () => {
    expect(dayKey('a', new Date('2026-11-13T18:29:00Z'))).toBe('a|2026-11-13');
    expect(dayKey('a', new Date('2026-11-13T18:31:00Z'))).toBe('a|2026-11-14');
    expect(dayKey('b', new Date('2026-11-13T10:00:00Z'))).not.toBe(dayKey('a', new Date('2026-11-13T10:00:00Z')));
  });
  it('answers "unavailable" with no IndexedDB, so the child is not stopped', async () => {
    const r = await readDayCount('a|2026-11-13');
    expect(r).toEqual({ ok: false, reason: 'unavailable' });
    expect(canStartNew(r.ok ? r.value : null, 1)).toBe(true);
  });
  it('counts a drawing once, at its first colour on a fresh page, and gates only a new one', () => {
    const studio = SRC('src/components/family/draw/Studio.tsx');
    expect(studio).toMatch(/if \(daily && inks\(step\) && current\.id === null && !counted\.current\)/);
    expect(studio).toMatch(/const fresh = async \(\) => \{\s+if \(daily\) \{/);
    const html = renderToStaticMarkup(h(DrawLimit, { w: { 'fam.draw.limitTitle': "That's a lot of art for today.", 'fam.draw.limitBody': 'Come back tomorrow, or open one you already made.', 'fam.draw.limitOpen': 'Open my drawings', 'fam.draw.limitClose': 'Close' }, onOpenMine: () => undefined, onClose: () => undefined }));
    expect(html).toContain("That&#x27;s a lot of art for today.");
    expect(html).toContain('Come back tomorrow, or open one you already made.');
    expect(html).toContain('fixed inset-0');
    expect(html).toContain('data-draw-limit-open');
  });
  it('is a number on Control → Family, with its range and meaning', async () => {
    expect(SETTING_SCREENS[DRAW_DAILY_SETTING]).toBe('/control/family');
    expect(EDITABLE_SETTINGS.find((s) => s.key === DRAW_DAILY_SETTING)).toMatchObject({ kind: 'number', min: 0, max: 200, whole: true });
    expect(en['control.m6.sys.meaning.family_draw_daily_creations' as keyof typeof en]).toBeTruthy();
    const db = { query: vi.fn() };
    for (const bad of [-1, 1.5, '3', 201]) expect(await setDrawDaily(db as never, { userId: 'u' }, bad)).toEqual({ ok: false, code: 'bad_value' });
    expect(db.query).not.toHaveBeenCalled();
    expect(SRC('src/app/(admin)/control/family/page.tsx')).toContain('<DrawDailyForm initial={lists.drawDaily} />');
  });
});

describe('send to tutor: one at a time, patient, and tidy', () => {
  const deps = (answers: UploadAnswer[], removable = true) => {
    const calls = { upload: 0, removed: [] as string[], waits: [] as number[] };
    const leftovers = new Set<string>();
    return {
      calls,
      leftovers,
      d: {
        upload: async () => answers[Math.min(calls.upload++, answers.length - 1)],
        remove: async (id: string) => {
          calls.removed.push(id);
          return removable;
        },
        wait: async (ms: number) => void calls.waits.push(ms),
        leftovers,
      },
    };
  };
  it('a double tap sends once', async () => {
    let runs = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const send = singleFlight(async () => {
      runs++;
      await gate;
      return 'sent';
    });
    const a = send();
    const b = send();
    expect(await b).toBeNull();
    release();
    expect(await a).toBe('sent');
    expect(runs).toBe(1);
    expect(await send()).toBe('sent');
  });
  it('takes its own file back when a send fails after the ticket', async () => {
    const t = deps([{ code: 'storage_unavailable', id: 'att-1' }]);
    expect(await sendWithRetry(t.d)).toEqual({ ok: false, code: 'storage_unavailable', tries: 1 });
    expect(t.calls.removed).toEqual(['att-1']);
    expect(t.leftovers.size).toBe(0);
  });
  it('keeps a file it could not take back, and takes it back before retrying a "too many files"', async () => {
    const t = deps([{ code: 'upload_unreadable', id: 'att-1' }], false);
    await sendWithRetry(t.d);
    expect([...t.leftovers]).toEqual(['att-1']);
    const u = deps([{ code: 'too_many_files' }, { id: 'att-2' }]);
    u.leftovers.add('old-1');
    const out = await sendWithRetry(u.d);
    expect(out).toEqual({ ok: true, id: 'att-2', tries: 2 });
    expect(u.calls.removed).toEqual(['old-1']);
    expect(u.leftovers.size).toBe(0);
    expect(u.calls.waits).toEqual([1000]);
  });
  it('retries "too many files" twice (1 s, 3 s), then says the day is full in its own words', async () => {
    const t = deps([{ code: 'too_many_files' }]);
    const out = await sendWithRetry(t.d);
    expect(out).toEqual({ ok: false, code: 'files_today', tries: 3 });
    expect(t.calls.waits).toEqual([...SEND_RETRY_DELAYS]);
    expect(SEND_RETRY_DELAYS).toEqual([1000, 3000]);
    expect(t.calls.upload).toBe(3);
  });
  it('does not retry any other refusal, and a thrown network error is the network line', async () => {
    const t = deps([{ code: 'photo_consent' }]);
    expect(await sendWithRetry(t.d)).toEqual({ ok: false, code: 'photo_consent', tries: 1 });
    expect(t.calls.waits).toEqual([]);
    const n = await sendWithRetry({ upload: async () => Promise.reject(new Error('offline')), remove: async () => true, wait: async () => undefined, leftovers: new Set() });
    expect(n).toEqual({ ok: false, code: 'network', tries: 1 });
  });
  it('has its own words for each refusal', () => {
    for (const code of ['files_today', 'not_signed_in', 'consent_required', 'files_not_read_yet', 'not_found']) {
      const key = sendErrorKey(code);
      expect(en[key as keyof typeof en], key).toBeTruthy();
      expect(hi[key as keyof typeof hi], key).toBeTruthy();
    }
    for (const code of ['too_many_files', 'photo_consent', 'homework_off', 'storage_unavailable', 'file_too_large']) expect(en[sendErrorKey(code) as keyof typeof en], code).toBeTruthy();
    // The answering route's own limits already speak in their own words in the tutor's feed.
    expect(en['ai.cap_reached' as keyof typeof en]).toBeTruthy();
    expect(en['fam.tutor.files.photo_limit' as keyof typeof en]).toBeTruthy();
  });
  it("is the tutor window's path, for the composer and the Draw tab alike", () => {
    const win = SRC('src/components/family/tutor/TutorWindow.tsx');
    expect(win).toContain('sendWithRetry({ upload: () => uploadTutorFile(subject, file, mime), remove: removeTutorFile, leftovers: sketchLeftovers.current })');
    expect(win).toMatch(/method: 'DELETE'/);
    const studio = SRC('src/components/family/draw/Studio.tsx');
    expect(studio).toContain('singleFlight(');
    expect(studio).toMatch(/data-sketch-send-now disabled=\{busy\}/);
  });
});

describe('the art table looks', () => {
  it('has the five soft paints and the table as tokens, with ink text passing AA on each', () => {
    expect(Object.keys(artColors)).toEqual(['coral', 'sky', 'mint', 'butter', 'lavender', 'table']);
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    for (const hex of Object.values(artColors)) expect((lum(hex) + 0.05) / (lum(lessonColors.ink) + 0.05)).toBeGreaterThan(4.5);
    expect(SRC('scripts/check_contrast.py')).toContain('"art-lavender": "#D9CCF6"');
    expect(SRC('tailwind.config.ts')).toContain('art: artColors');
  });
  it('draws the paper procedurally (no bitmap), keeps 48 px controls, and moves only with motion allowed', () => {
    const paint = SRC('src/components/family/draw/studio-paint.ts');
    expect(paint).toContain('createRadialGradient');
    expect(paint).toContain("createPattern(t, 'repeat')");
    expect(paint).not.toMatch(/\.png|\.jpg|\.webp/);
    const css = SRC('src/app/(family)/family/family.css');
    expect(css).toMatch(/\.draw-tool \{[^}]*height: 3rem;[^}]*min-width: 3rem;/);
    expect(css).toMatch(/transform 240ms cubic-bezier/);
    const reduced = css.slice(css.search(/@media \(prefers-reduced-motion: reduce\) \{\s*\.draw-tool,/));
    for (const c of ['.draw-tray-in', '.draw-sticker-in', '.draw-wheel']) expect(reduced).toContain(c);
    const studio = SRC('src/components/family/draw/Studio.tsx');
    expect(studio).not.toMatch(/h-11|min-h-\[44px\]/);
  });
  it('has every word in English and Hindi', () => {
    for (const k of [...DRAW_PAGE_KEYS, ...DRAW_STUDIO_KEYS, 'fam.tab.draw', 'fam.sketch.tool.crayon', 'fam.sketch.tool.watercolour']) {
      expect(en[k as keyof typeof en], k).toBeTruthy();
      expect(hi[k as keyof typeof hi], k).toBeTruthy();
    }
    for (const k of DRAW_STUDIO_KEYS) expect(SKETCH_KEYS).toContain(k);
  });
});
