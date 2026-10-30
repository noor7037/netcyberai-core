import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { FIGURE_SHAPES, checkBlock, checkStoredBlock, completeResponse, parseBlockLine, parseStoredBlockLine, placeBlock, unfilled, type Block, type Figure, type ImageBlock, type Steps, type Timeline, type Videos } from '@/lib/family/blocks';
import { allowedLicence, pickPhoto, searchCommons } from '@/lib/family/visuals/commons';
import { fillVisuals, queryKey, type WithDb } from '@/lib/family/visuals/fill';
import { FigureView, placeFigure } from '@/components/family/blocks/FigureView';
import { StepsView } from '@/components/family/blocks/StepsView';
import { TimelineView } from '@/components/family/blocks/TimelineView';
import { ImageView } from '@/components/family/blocks/ImageView';
import { VideosView } from '@/components/family/blocks/VideosView';
import { familyWords } from '@/lib/family/words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';

// W9-C: the visual engine. The checker for the five new blocks, the licensed-photo search (a mocked Commons answer, no
// network), fillVisuals on the real migrations (PGlite) and each view as the phone draws it. Made-up content only.

const FIGURE = { type: 'figure', title: 'A plant cell', kind: 'schematic', shape: 'cell', labels: [{ at: 'centre', text: 'Nucleus' }, { at: 'ring', text: 'Cell wall' }, { at: 'left', text: 'Cytoplasm' }] };
const STEPS = { type: 'steps', title: 'How water rises', items: [{ label: 'Roots', text: 'Roots take in water.' }, { label: 'Stem', text: 'Water moves up the stem.' }, { label: 'Leaves', text: 'Leaves lose water to the air.' }] };
const TIMELINE = { type: 'timeline', title: 'Ideas about cells', items: [{ when: '1665', text: 'Cells are first seen.' }, { when: '1838', text: 'Plants are made of cells.' }, { when: '1855', text: 'Cells come from cells.' }] };
const IMAGE = { type: 'image', query: 'onion cells microscope', caption: 'Onion skin cells seen under a microscope.' };
const PHOTO = {
  type: 'image',
  url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Onion_cells.jpg/960px-Onion_cells.jpg',
  caption: 'Onion skin cells seen under a microscope.',
  credit: 'A. Maker',
  licence: 'CC BY-SA 4.0',
  source: 'https://commons.wikimedia.org/wiki/File:Onion_cells.jpg',
};
const w = familyWords('en', UNDERSTAND_KEYS);
const html = (el: ReturnType<typeof h>) => renderToStaticMarkup(el);

describe('the checker: figure, steps, timeline, image and videos (docs/39 §3)', () => {
  it('accepts each new block as written', () => {
    expect(checkBlock(FIGURE)).toEqual(FIGURE);
    expect(checkBlock(STEPS)).toEqual(STEPS);
    expect(checkBlock(TIMELINE)).toEqual(TIMELINE);
    expect(checkBlock(IMAGE)).toEqual(IMAGE);
    expect(checkBlock({ type: 'videos' })).toEqual({ type: 'videos' });
    for (const shape of FIGURE_SHAPES) expect(checkBlock({ ...FIGURE, shape })).not.toBeNull();
  });

  it('drops a block over its limits whole, never cut short', () => {
    const label = (text: string) => ({ at: 'top', text });
    expect(checkBlock({ ...FIGURE, labels: [label('One')] })).toBeNull();
    expect(checkBlock({ ...FIGURE, labels: Array.from({ length: 7 }, (_, i) => label(`Part ${i}`)) })).toBeNull();
    expect(checkBlock({ ...FIGURE, labels: [label('x'.repeat(41)), label('Two')] })).toBeNull();
    expect(checkBlock({ ...FIGURE, labels: [{ at: 'middle', text: 'One' }, label('Two')] })).toBeNull();
    expect(checkBlock({ ...FIGURE, shape: 'star' })).toBeNull();
    expect(checkBlock({ ...STEPS, items: STEPS.items.slice(0, 2) })).toBeNull();
    expect(checkBlock({ ...STEPS, items: [...STEPS.items, ...STEPS.items] })).toBeNull();
    expect(checkBlock({ ...STEPS, items: [{ label: 'x'.repeat(31), text: 'A.' }, ...STEPS.items.slice(1)] })).toBeNull();
    expect(checkBlock({ ...STEPS, items: [{ label: 'One', text: 'x'.repeat(121) }, ...STEPS.items.slice(1)] })).toBeNull();
    expect(checkBlock({ ...TIMELINE, items: Array.from({ length: 9 }, (_, i) => ({ when: `${1900 + i}`, text: 'A.' })) })).toBeNull();
    expect(checkBlock({ ...TIMELINE, items: [{ when: 'x'.repeat(21), text: 'A.' }, ...TIMELINE.items.slice(1)] })).toBeNull();
    expect(checkBlock({ ...TIMELINE, items: [{ when: '1900', text: 'x'.repeat(101) }, ...TIMELINE.items.slice(1)] })).toBeNull();
    expect(checkBlock({ ...IMAGE, query: 'x'.repeat(81) })).toBeNull();
    expect(checkBlock({ ...IMAGE, caption: 'x'.repeat(121) })).toBeNull();
  });

  it('never takes a photograph or a video list from the model; reads them back only from what the server kept', () => {
    expect(checkBlock(PHOTO)).toBeNull();
    expect(checkBlock({ ...IMAGE, url: PHOTO.url })).toBeNull();
    expect(checkBlock({ type: 'videos', items: [{ videoId: 'abcdefghijk', title: 'T', channel: 'C', seconds: 60 }] })).toEqual({ type: 'videos' });
    expect(checkStoredBlock(PHOTO)).toEqual(PHOTO);
    expect(parseStoredBlockLine(JSON.stringify(PHOTO))).toEqual(PHOTO);
    expect(parseBlockLine(JSON.stringify(PHOTO))).toBeNull();
    expect(checkStoredBlock({ ...PHOTO, url: 'https://example.org/a.jpg' })).toBeNull();
    expect(checkStoredBlock({ ...PHOTO, source: 'https://commons.wikimedia.org/wiki/Main_Page' })).toBeNull();
    expect(checkStoredBlock({ ...PHOTO, licence: 'CC BY-NC 4.0' })).toBeNull();
    expect(checkStoredBlock({ ...PHOTO, credit: '' })).toBeNull();
    expect(checkStoredBlock({ type: 'videos', items: [] })).toBeNull();
  });

  it('orders them: figure and photo after the explanation, steps next, timeline after key points, videos last', () => {
    const explanation = { type: 'explanation', title: 'Cells', idea: 'An idea.', example: 'An example.', steps: ['One.', 'Two.'], terms: [] };
    const quiz = (id: string) => ({ id, question: 'Q?', options: ['A', 'B'], answer: 0, hint: 'H.', why: 'W.', wrong: ['', 'No.'] });
    const blocks = [{ type: 'videos' }, TIMELINE, { type: 'key_points', points: ['One.', 'Two.'] }, STEPS, IMAGE, { type: 'check', items: [quiz('c1')] }, { type: 'practice', items: [quiz('p1')] }, FIGURE, explanation].map((b) => checkBlock(b) as Block);
    expect(completeResponse(blocks)?.map((b) => b.type)).toEqual(['explanation', 'figure', 'image', 'steps', 'key_points', 'timeline', 'check', 'practice', 'videos']);
  });

  it('on the phone, a filled photograph takes the place of the unfilled one', () => {
    const list = [checkBlock(FIGURE), checkBlock(IMAGE), checkBlock(STEPS)] as Block[];
    expect(unfilled(list[1])).toBe(true);
    const placed = placeBlock(list, PHOTO as Block);
    expect(placed.map((b) => b.type)).toEqual(['figure', 'image', 'steps']);
    expect(placed[1]).toEqual(PHOTO);
    expect(placeBlock(list, checkBlock(TIMELINE) as Block).map((b) => b.type)).toEqual(['figure', 'image', 'steps', 'timeline']);
  });
});

// ---- Commons, mocked ----

const page = (title: string, o: { licence?: string; artist?: string; width?: number; height?: number; mime?: string; size?: number; restrictions?: string; index?: number } = {}) => ({
  title: `File:${title}`,
  index: o.index ?? 1,
  imageinfo: [
    {
      url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${title}`,
      thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${title}/960px-${title}`,
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${title}`,
      mime: o.mime ?? 'image/jpeg',
      size: o.size ?? 400_000,
      width: o.width ?? 1600,
      height: o.height ?? 1200,
      extmetadata: {
        LicenseShortName: { value: o.licence ?? 'CC BY-SA 4.0' },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
        Artist: { value: o.artist ?? '<a href="//commons.wikimedia.org/wiki/User:Maker">A. Maker</a>' },
        ...(o.restrictions ? { Restrictions: { value: o.restrictions } } : {}),
      },
    },
  ],
});
const answer = (...pages: unknown[]) => ({ query: { pages } });
const fetchOf = (body: unknown, ok = true) => vi.fn(async () => new Response(JSON.stringify(body), { status: ok ? 200 : 503 })) as unknown as typeof fetch;

describe('licensed photographs from Wikimedia Commons', () => {
  it('keeps only CC0, CC BY, CC BY-SA (any version) or public domain', () => {
    for (const ok of ['CC0', 'CC0 1.0', 'CC BY 2.0', 'CC BY-SA 3.0', 'CC BY-SA 2.0 de', 'Public domain', 'CC-BY-SA-3.0']) expect(allowedLicence(ok), ok).not.toBeNull();
    for (const no of ['CC BY-NC 4.0', 'CC BY-ND 4.0', 'CC BY-NC-SA 3.0', 'GFDL', 'Fair use', '', 'All rights reserved']) expect(allowedLicence(no), no).toBeNull();
  });

  it('picks a licensed landscape JPEG with an author, and credits the author as words', () => {
    const photo = pickPhoto(answer(page('Tall.jpg', { width: 800, height: 1200, index: 1 }), page('Wide.jpg', { index: 2 })));
    expect(photo).toEqual({ url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Wide.jpg/960px-Wide.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Wide.jpg', author: 'A. Maker', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0' });
  });

  it('skips a file that is not licensed, has no author, is restricted, is not a photo, or is not for children', () => {
    expect(pickPhoto(answer(page('A.jpg', { licence: 'CC BY-NC 4.0' })))).toBeNull();
    expect(pickPhoto(answer(page('A.jpg', { artist: '' })))).toBeNull();
    expect(pickPhoto(answer(page('A.jpg', { restrictions: 'personality' })))).toBeNull();
    expect(pickPhoto(answer(page('A.svg', { mime: 'image/svg+xml' })))).toBeNull();
    expect(pickPhoto(answer(page('Autopsy_room.jpg')))).toBeNull();
    expect(pickPhoto({ error: 'x' })).toBeNull();
  });

  it('a network failure, a redirect or an error status is no photograph', async () => {
    expect(await searchCommons('cells', vi.fn(async () => { throw new TypeError('network'); }) as unknown as typeof fetch)).toBeNull();
    expect(await searchCommons('cells', fetchOf(answer(page('A.jpg')), false))).toBeNull();
    const asked = fetchOf(answer(page('A.jpg')));
    expect(await searchCommons('cells', asked)).not.toBeNull();
    const [url, init] = (asked as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url.startsWith('https://commons.wikimedia.org/w/api.php?')).toBe(true);
    expect(init.redirect).toBe('error');
  });
});

// ---- fillVisuals, on the real migrations ----

let db: any;
type Tx = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };
const ACCOUNT = 'f9c00000-0000-4000-8000-0000000000a1';
const TOPIC = 'cbse.c7.science.ch02.t01';
const REVIEWER = 'f9c00000-0000-4000-8000-0000000000f1';
const asFamily: WithDb = (fn) =>
  db.pg.transaction(async (tx: Tx) => {
    await tx.query('set local role family_app');
    await tx.query(`select set_config('app.current_account_id', $1, true)`, [ACCOUNT]);
    return fn(tx);
  });

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into content.video_picks (topic_key, language, video_id, channel_id, channel_title, title, duration_s, captions, score, status, reviewed_by, reviewed_at) values
      ('${TOPIC}', 'en', 'pinnedvid01', 'UCmadeup0001', 'A made-up channel', 'Cells, pinned', 300, true, 1, 'pinned', '${REVIEWER}', now()),
      ('${TOPIC}', 'en', 'rejectvid01', 'UCmadeup0001', 'A made-up channel', 'Cells, rejected', 300, true, 9, 'rejected', '${REVIEWER}', now());
    insert into content.video_picks (topic_key, language, video_id, channel_id, channel_title, title, duration_s, captions, score) values
      ('${TOPIC}', 'en', 'autovideo01', 'UCmadeup0002', 'Another made-up channel', 'Cells, fresh', 420, true, 5),
      ('${TOPIC}', 'en', 'autovideo02', 'UCmadeup0002', 'Another made-up channel', 'Cells, fresh two', 420, true, 4),
      ('${TOPIC}', 'en', 'autovideo03', 'UCmadeup0002', 'Another made-up channel', 'Cells, fresh three', 420, true, 3),
      ('${TOPIC}', 'en', 'autovideo04', 'UCmadeup0002', 'Another made-up channel', 'Cells, fresh four', 420, true, 2),
      ('${TOPIC}', 'hi', 'hindivideo1', 'UCmadeup0002', 'Another made-up channel', 'Cells in Hindi', 420, true, 2);
  `);
}, 60_000);
afterAll(async () => {
  await db?.stop();
});

describe('fillVisuals', () => {
  const answerBlocks = () => [checkBlock({ type: 'explanation', title: 'Cells', idea: 'An idea.', example: 'An example.', steps: ['One.', 'Two.'], terms: [] }), checkBlock(FIGURE), checkBlock(IMAGE), checkBlock({ type: 'videos' })] as Block[];

  it('replaces an image block with its licensed photograph, keeps it for the next answer, and fills the videos', async () => {
    const fetcher = fetchOf(answer(page('Onion_cells.jpg')));
    const emitted: Block[] = [];
    const out = await fillVisuals(asFamily, answerBlocks(), { chapterKey: TOPIC, lang: 'en', search: (q) => searchCommons(q, fetcher), emit: (b) => emitted.push(b) });
    expect(out.map((b) => b.type)).toEqual(['explanation', 'figure', 'image', 'videos']);
    const photo = out[2] as ImageBlock;
    expect(photo).toEqual({ type: 'image', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Onion_cells.jpg/960px-Onion_cells.jpg', caption: IMAGE.caption, credit: 'A. Maker', licence: 'CC BY-SA 4.0', source: 'https://commons.wikimedia.org/wiki/File:Onion_cells.jpg' });
    // Up to four: the pinned pick first, never the rejected one, only this language.
    const videos = (out[3] as Videos).items!;
    expect(videos.map((v) => v.videoId)).toEqual(['pinnedvid01', 'autovideo01', 'autovideo02', 'autovideo03']);
    expect(videos[0]).toEqual({ videoId: 'pinnedvid01', title: 'Cells, pinned', channel: 'A made-up channel', seconds: 300 });
    expect(emitted.map((b) => b.type)).toEqual(['image', 'videos']);
    // Kept per query: the next answer with the same words (spaced differently) does not search again.
    const again = vi.fn(async () => null);
    const second = await fillVisuals(asFamily, [checkBlock({ ...IMAGE, query: '  Onion cells   MICROSCOPE ' }) as Block], { chapterKey: null, lang: 'en', search: again });
    expect(again).not.toHaveBeenCalled();
    expect((second[0] as ImageBlock & { url: string }).url).toBe(photo && 'url' in photo ? photo.url : '');
    expect((await db.pg.query(`select query_key, licence from content.image_picks`)).rows).toEqual([{ query_key: queryKey(IMAGE.query), licence: 'CC BY-SA 4.0' }]);
  });

  it('drops the image block when the only hit is not licensed', async () => {
    const out = await fillVisuals(asFamily, [checkBlock({ ...IMAGE, query: 'leaf cells' }) as Block], { chapterKey: null, lang: 'en', search: (q) => searchCommons(q, fetchOf(answer(page('Leaf.jpg', { licence: 'CC BY-NC 4.0' })))) });
    expect(out).toEqual([]);
  });

  it('drops the image block on a network failure, and the videos when the chapter has none', async () => {
    const fail = vi.fn(async () => {
      throw new TypeError('network');
    }) as unknown as typeof fetch;
    const out = await fillVisuals(asFamily, [checkBlock(FIGURE), checkBlock({ ...IMAGE, query: 'root hair cells' }), checkBlock({ type: 'videos' })] as Block[], { chapterKey: 'cbse.c7.science.ch09.t01', lang: 'en', search: (q) => searchCommons(q, fail) });
    expect(out.map((b) => b.type)).toEqual(['figure']);
  });

  it('a database that fails drops the photograph and the videos, never the answer', async () => {
    const broken: WithDb = async () => {
      throw new Error('down');
    };
    const out = await fillVisuals(broken, answerBlocks(), { chapterKey: TOPIC, lang: 'en' });
    expect(out.map((b) => b.type)).toEqual(['explanation', 'figure']);
  });

  it('an answer without a photograph or videos is returned as it is, with no database call', async () => {
    const none = vi.fn() as unknown as WithDb;
    const blocks = [checkBlock(FIGURE)] as Block[];
    expect(await fillVisuals(none, blocks, { chapterKey: TOPIC, lang: 'en' })).toBe(blocks);
    expect(none).not.toHaveBeenCalled();
  });
});

// ---- the views, as the phone draws them (390 first) ----

describe('the views', () => {
  it('a figure: drawn by our SVG, the numbered list at 390, callout boxes from 640 px, violet', () => {
    for (const shape of FIGURE_SHAPES) {
      const out = html(h(FigureView, { b: checkBlock({ ...FIGURE, shape }) as Figure, tone: 'science' }));
      expect(out).toContain(`data-figure="${shape}"`);
      expect(out).toContain('data-block="figure"');
      expect(out).toContain('border-l-violet');
      expect(out).not.toMatch(/<(linear|radial)Gradient/);
    }
    const out = html(h(FigureView, { b: checkBlock(FIGURE) as Figure, tone: 'science' }));
    expect(out).toMatch(/<svg[^>]*class="mx-auto w-full max-w-xs sm:hidden"/);
    expect(out).toMatch(/<svg[^>]*class="hidden w-full sm:block"/);
    expect(out).toContain('data-figure-labels');
    for (const l of FIGURE.labels) expect(out).toContain(l.text);
  });

  it('a figure places each label on its side, without overlapping boxes', () => {
    const b = checkBlock({ ...FIGURE, labels: [{ at: 'left', text: 'One' }, { at: 'left', text: 'Two' }, { at: 'right', text: 'Three' }, { at: 'top', text: 'Four' }, { at: 'bottom', text: 'Five' }, { at: 'ring', text: 'Six' }] }) as Figure;
    const placed = placeFigure(b);
    expect(placed.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(placed.filter((c) => c.side === 'left').map((c) => c.text)).toEqual(expect.arrayContaining(['One', 'Two']));
    expect(placed.find((c) => c.text === 'Three')?.side).toBe('right');
    for (const side of ['left', 'right']) {
      const col = placed.filter((c) => c.side === side).sort((a, z) => a.box.y - z.box.y);
      for (let i = 1; i < col.length; i++) expect(col[i].box.y).toBeGreaterThanOrEqual(col[i - 1].box.y + col[i - 1].box.h);
    }
  });

  it('steps: a column at 390, a row from 768 px, numbered in order', () => {
    const out = html(h(StepsView, { b: checkBlock(STEPS) as Steps, tone: 'science' }));
    expect(out).toContain('data-block="steps"');
    expect(out).toMatch(/data-steps="?[^"]*"? class="flex flex-col gap-3 md:flex-row/);
    expect(out.indexOf('Roots')).toBeLessThan(out.indexOf('Leaves'));
  });

  it('a timeline: dated events down one line', () => {
    const out = html(h(TimelineView, { b: checkBlock(TIMELINE) as Timeline, tone: 'science' }));
    expect(out).toContain('data-block="timeline"');
    expect(out).toContain('border-l-2');
    for (const e of TIMELINE.items) expect(out).toContain(e.when);
  });

  it('a photograph: lazy, in a fixed box, with its caption and its credit linking to the file page; an unfilled one is not drawn', () => {
    const out = html(h(ImageView, { b: PHOTO as ImageBlock, w, tone: 'science' }));
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('aspect-[4/3]');
    expect(out).toContain(`alt="${PHOTO.caption}"`);
    expect(out).toContain('Photo: A. Maker · CC BY-SA 4.0 · Wikimedia Commons');
    expect(out).toContain(`href="${PHOTO.source}"`);
    expect(out).toContain('min-h-[44px]');
    expect(html(h(ImageView, { b: IMAGE as ImageBlock, w, tone: 'science' }))).toBe('');
    const hi = familyWords('hi', UNDERSTAND_KEYS);
    expect(html(h(ImageView, { b: PHOTO as ImageBlock, w: hi, tone: 'science' }))).toContain('Wikimedia Commons');
  });

  it('videos: drawn cards with title, channel and length, nothing loaded from YouTube before a tap; an unfilled block is not drawn', () => {
    const b: Videos = { type: 'videos', items: [{ videoId: 'pinnedvid01', title: 'Cells, pinned', channel: 'A made-up channel', seconds: 300 }] };
    const out = html(h(VideosView, { b, w }));
    expect(out).toContain('data-block="videos"');
    expect(out).toContain('Cells, pinned');
    expect(out).toContain('A made-up channel');
    expect(out).toContain('5:00');
    expect(out).not.toContain('<iframe');
    expect(out).not.toContain('ytimg');
    expect(html(h(VideosView, { b: { type: 'videos' }, w }))).toBe('');
  });
});
