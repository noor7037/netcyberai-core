import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checkBlock, checkStoredBlock, placeBlock, type Block, type ImageBlock } from '@/lib/family/blocks';
import { commonsSearchUrl, commonsThumb, pickPhoto } from '@/lib/family/visuals/commons';
import { HIT_MS, MISS_MS, clearOpenverseCache, openverseLicence, openverseSearchUrl, pickOpenverse, searchOpenverse } from '@/lib/family/visuals/openverse';
import { PHOTO_HEIGHT, PHOTO_WIDTH, photoSizes } from '@/lib/family/visuals/photo-size';
import { youngPhotoQuery, youngThing } from '@/lib/family/visuals/young';
import { fillVisuals, searchPhoto, withYoungPhoto, type WithDb } from '@/lib/family/visuals/fill';
import { ImageView } from '@/components/family/blocks/ImageView';
import { familyWords } from '@/lib/family/words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';

// C526: low-data tutor photos, Openverse as the second licensed source, and the youngest children's photo beside the
// board. Mocked answers only, no network. Made-up content.

const ID = '0a1b2c3d-1111-4222-8333-444455556666';
const THUMB = `https://api.openverse.org/v1/images/${ID}/thumb/`;
const PAGE = `https://openverse.org/image/${ID}`;
const COMMONS = { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cow.jpg/500px-Cow.jpg', pageUrl: 'https://commons.wikimedia.org/wiki/File:Cow.jpg', author: 'A. Maker', licence: 'CC BY 4.0', licenceUrl: null };
const OPENVERSE = { url: THUMB, pageUrl: PAGE, author: 'B. Maker', licence: 'CC0 1.0', licenceUrl: null };

const result = (over: Record<string, unknown> = {}) => ({ id: ID, title: 'A cow in a field', creator: 'B. <b>Maker</b>', license: 'by-sa', license_version: '4.0', license_url: 'https://creativecommons.org/licenses/by-sa/4.0/', mature: false, width: 1200, height: 800, tags: [{ name: 'cow' }], ...over });
const fetchOf = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

afterEach(() => clearOpenverseCache());

describe('a low-data photo', () => {
  it('asks Commons for the 500 px step (the standard size nearest 480 px)', () => {
    expect(new URL(commonsSearchUrl('cow')).searchParams.get('iiurlwidth')).toBe('500');
  });

  it('keeps the scaled copy Commons names on thumb.wikimedia.org, on the upload host with no tracking words; never a big original', () => {
    expect(commonsThumb('https://thumb.wikimedia.org/wikipedia/commons/thumb/f/fb/CH_cow_2.jpg/500px-CH_cow_2.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo')).toBe('https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/CH_cow_2.jpg/500px-CH_cow_2.jpg');
    expect(commonsThumb('https://thumb.example.org/wikipedia/commons/thumb/f/fb/A.jpg/500px-A.jpg')).toBeNull();
    expect(commonsThumb('https://upload.wikimedia.org/wikipedia/commons/f/fb/A.jpg')).toBeNull();
    const page = (width: number) => ({ query: { pages: [{ title: 'File:Cow.jpg', index: 1, imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/f/fb/Cow.jpg', thumburl: 'https://example.org/x.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Cow.jpg', mime: 'image/jpeg', size: 9000, width, height: 300, extmetadata: { LicenseShortName: { value: 'CC0' }, Artist: { value: 'A. Maker' } } }] }] } });
    expect(pickPhoto(page(400))?.url).toBe('https://upload.wikimedia.org/wikipedia/commons/f/fb/Cow.jpg');
    expect(pickPhoto(page(6000))).toBeNull();
  });

  it('draws the 500 px copy everywhere and offers the 960 px copy to a wide screen only', () => {
    expect(photoSizes('https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Earth.jpg/960px-Earth.jpg')).toEqual({
      src: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Earth.jpg/500px-Earth.jpg',
      wide: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Earth.jpg/960px-Earth.jpg',
    });
    // An original (smaller than the step) and an Openverse thumbnail are used as they are.
    expect(photoSizes('https://upload.wikimedia.org/wikipedia/commons/9/97/Earth.jpg')).toEqual({ src: 'https://upload.wikimedia.org/wikipedia/commons/9/97/Earth.jpg', wide: null });
    expect(photoSizes(THUMB)).toEqual({ src: THUMB, wide: null });
  });

  it('renders lazily with its size given, a tint box, the wide copy by screen width, and the right credit', () => {
    const w = familyWords('en', UNDERSTAND_KEYS);
    const commons = checkStoredBlock({ type: 'image', url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cow.jpg/960px-Cow.jpg', caption: 'A cow.', credit: 'A. Maker', licence: 'CC BY 4.0', source: 'https://commons.wikimedia.org/wiki/File:Cow.jpg' }) as ImageBlock;
    const html = renderToStaticMarkup(h(ImageView, { b: commons, w, tone: 'blue' }));
    expect(html).toContain('src="https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cow.jpg/500px-Cow.jpg"');
    expect(html).toContain('media="(min-width: 768px)" srcSet="https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cow.jpg/960px-Cow.jpg"');
    expect(html).toContain(`width="${PHOTO_WIDTH}" height="${PHOTO_HEIGHT}"`);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('bg-off-white');
    // The first paint is still (motion starts only once the browser says motion is allowed).
    expect(html).not.toContain('opacity-0');
    expect(html).not.toContain('A. Maker');
    expect(commons).toMatchObject({ credit: 'A. Maker', licence: 'CC BY 4.0' });
    const ov = checkStoredBlock({ type: 'image', url: THUMB, caption: 'A cow.', credit: 'B. Maker', licence: 'CC0 1.0', source: PAGE }) as ImageBlock;
    const ovHtml = renderToStaticMarkup(h(ImageView, { b: ov, w, tone: 'blue' }));
    expect(ovHtml).toContain(`src="${THUMB}"`);
    expect(ovHtml).not.toContain('<source');
    expect(ovHtml).not.toContain('B. Maker');
    expect(ovHtml).not.toContain('Openverse');
    expect(ov).toMatchObject({ credit: 'B. Maker', licence: 'CC0 1.0' });
  });
});

describe('the Openverse adapter', () => {
  it('asks only for reusable licences and no mature content, at the fixed address', () => {
    const u = new URL(openverseSearchUrl('cow'));
    expect(`${u.origin}${u.pathname}`).toBe('https://api.openverse.org/v1/images/');
    expect(u.searchParams.get('license')).toBe('cc0,pdm,by,by-sa');
    expect(u.searchParams.get('mature')).toBe('false');
  });

  it('keeps CC0, public domain, CC BY and CC BY-SA only', () => {
    expect(openverseLicence('cc0', '1.0')).toBe('CC0 1.0');
    expect(openverseLicence('pdm', '')).toBe('Public domain');
    expect(openverseLicence('by', '4.0')).toBe('CC BY 4.0');
    expect(openverseLicence('by-sa', '2.0')).toBe('CC BY-SA 2.0');
    for (const code of ['by-nc', 'by-nd', 'by-nc-sa', 'by-nc-nd', 'sampling+', 'nc-sampling+', '', null]) expect(openverseLicence(code, '4.0')).toBeNull();
  });

  it('keeps the credit (author as words, licence, the image page) and builds the thumbnail address itself', () => {
    expect(pickOpenverse({ results: [result()] })).toEqual({ url: THUMB, pageUrl: PAGE, author: 'B. Maker', licence: 'CC BY-SA 4.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0/' });
  });

  it('skips a result that is mature, unlicensed, uncredited, not for children or has a bad id; landscape first', () => {
    const tall = '1a1b2c3d-1111-4222-8333-444455556666';
    const wide = '2a1b2c3d-1111-4222-8333-444455556666';
    expect(
      pickOpenverse({
        results: [
          result({ mature: true }),
          result({ mature: undefined }),
          result({ license: 'by-nc' }),
          result({ creator: '' }),
          result({ title: 'A gun' }),
          result({ tags: [{ name: 'nude' }] }),
          result({ id: '../../x' }),
          result({ id: tall, width: 400, height: 900 }),
          result({ id: wide }),
        ],
      })?.url
    ).toBe(`https://api.openverse.org/v1/images/${wide}/thumb/`);
    expect(pickOpenverse({ results: [result({ mature: true })] })).toBeNull();
    expect(pickOpenverse({})).toBeNull();
  });

  it('a timeout, a network failure, a redirect or an error status is no photograph', async () => {
    const timeout = vi.fn(async () => { throw new DOMException('The operation timed out.', 'TimeoutError'); }) as unknown as typeof fetch;
    expect(await searchOpenverse('cow', timeout)).toBeNull();
    expect(await searchOpenverse('cow', vi.fn(async () => { throw new TypeError('network'); }) as unknown as typeof fetch)).toBeNull();
    expect(await searchOpenverse('cow', fetchOf({ results: [result()] }, false))).toBeNull();
    const asked = fetchOf({ results: [result()] });
    expect(await searchOpenverse('cow', asked)).not.toBeNull();
    const [, init] = (asked as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('remembers a hit for a day and a miss for an hour, so a popular question does not ask again', async () => {
    let t = 0;
    const now = () => t;
    const asked = fetchOf({ results: [result()] });
    await searchOpenverse('Cow ', asked, now);
    await searchOpenverse('cow', asked, now);
    expect(asked).toHaveBeenCalledTimes(1);
    t = HIT_MS + 1;
    await searchOpenverse('cow', asked, now);
    expect(asked).toHaveBeenCalledTimes(2);
    const none = fetchOf({ results: [] });
    await searchOpenverse('nothing', none, now);
    t += MISS_MS - 1;
    await searchOpenverse('nothing', none, now);
    expect(none).toHaveBeenCalledTimes(1);
    t += 2;
    await searchOpenverse('nothing', none, now);
    expect(none).toHaveBeenCalledTimes(2);
  });

  it('Commons first; Openverse only when Commons has nothing or fails', async () => {
    const openverse = vi.fn(async () => OPENVERSE);
    expect(await searchPhoto('cow', { commons: async () => COMMONS, openverse })).toEqual(COMMONS);
    expect(openverse).not.toHaveBeenCalled();
    expect(await searchPhoto('cow', { commons: async () => null, openverse })).toEqual(OPENVERSE);
    expect(await searchPhoto('cow', { commons: async () => { throw new Error('down'); }, openverse })).toEqual(OPENVERSE);
    expect(await searchPhoto('cow', { commons: async () => null, openverse: async () => null })).toBeNull();
  });

  it('a kept Openverse photo must name one image twice: its thumbnail and its own page', () => {
    const base = { type: 'image', caption: 'A cow.', credit: 'B. Maker', licence: 'CC BY 4.0' };
    expect(checkStoredBlock({ ...base, url: THUMB, source: PAGE })).not.toBeNull();
    expect(checkStoredBlock({ ...base, url: THUMB, source: 'https://openverse.org/image/9a1b2c3d-1111-4222-8333-444455556666' })).toBeNull();
    expect(checkStoredBlock({ ...base, url: THUMB, source: 'https://commons.wikimedia.org/wiki/File:Cow.jpg' })).toBeNull();
    expect(checkStoredBlock({ ...base, url: `https://api.openverse.org/v1/images/${ID}/`, source: PAGE })).toBeNull();
    expect(checkStoredBlock({ ...base, url: `https://openverse.org/v1/images/${ID}/thumb/`, source: PAGE })).toBeNull();
    expect(checkStoredBlock({ ...base, url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Cow.jpg', source: PAGE })).toBeNull();
  });
});

describe('the youngest children: a real photo beside the animated board', () => {
  const board = (title = 'The cow') => checkBlock({ type: 'board', title, steps: [1, 2, 3].map((n) => ({ n, say: `Step ${n}.`, commands: [{ kind: 'shape', shape: 'circle', at: [50, 50], r: 10 }] })) }) as Block;
  const explanation = () => checkBlock({ type: 'explanation', title: 'Cows', idea: 'A cow gives milk.', example: 'We drink milk.', steps: ['One.', 'Two.'], terms: [] }) as Block;

  it('finds the real thing or the shape the question names, in English, Hindi or Roman Hindi, first one first', () => {
    expect(youngThing(['Why does a cow eat grass?'])?.query).toBe('cow');
    expect(youngThing(['hathi ki sund lambi kyon hoti hai'])?.query).toBe('elephant');
    expect(youngThing(['पेड़ों पर पत्ते क्यों होते हैं?'])?.query).toBe('tree');
    expect(youngThing(['What shape is a circle?'])?.query).toBe('wheel');
    expect(youngThing(['Is the sun bigger than the moon?'])?.query).toBe('sun sky');
    // Words that only contain a listed word are not it.
    for (const q of ['What is the water cycle?', 'Why do plants need water?', 'Count to ten', 'Which is more?', 'बस इतना बताओ', '']) expect(youngThing([q])).toBeNull();
    // The board's title when the question names nothing.
    expect(youngThing(['Why?', 'A butterfly'])?.query).toBe('butterfly');
  });

  it('adds the photo after the board, in the child\'s language; never a second photo, never for an older child', () => {
    const blocks = [board(), explanation()];
    const out = withYoungPhoto(blocks, { question: 'What does a cow eat?' }, 'hi');
    expect(out.map((b) => b.type)).toEqual(['board', 'image', 'explanation']);
    expect(out[1]).toEqual({ type: 'image', query: 'cow', caption: 'गाय।' });
    expect(checkBlock(out[1])).toEqual(out[1]);
    expect(withYoungPhoto(blocks, undefined, 'en')).toBe(blocks);
    const sums = [board('Two and two'), explanation()];
    expect(withYoungPhoto(sums, { question: 'What is 2 + 2?' }, 'en')).toBe(sums);
    const withPhoto = [board(), checkBlock({ type: 'image', query: 'cow', caption: 'A cow.' }) as Block];
    expect(withYoungPhoto(withPhoto, { question: 'cow' }, 'en')).toBe(withPhoto);
    expect(youngPhotoQuery(['a cube'], 'en')).toEqual({ type: 'image', query: 'dice', caption: 'A dice is shaped like a cube.' });
  });

  it('fillVisuals fills the youngest child\'s photo (Commons, else Openverse) and sends it after the board', async () => {
    const queries: string[] = [];
    const withDb: WithDb = (fn) => fn({ query: async (sql: string) => { queries.push(sql); return { rows: [] }; } });
    const emitted: Block[] = [];
    const out = await fillVisuals(withDb, [board(), explanation()], { chapterKey: null, lang: 'en', young: { question: 'Why is a cow big?' }, search: async () => OPENVERSE, emit: (b) => emitted.push(b) });
    expect(out.map((b) => b.type)).toEqual(['board', 'image', 'explanation']);
    expect(out[1]).toMatchObject({ url: THUMB, source: PAGE, credit: 'B. Maker', licence: 'CC0 1.0', caption: 'Cow.' });
    // An Openverse photo is not written to the Commons cache table.
    expect(queries.some((q) => q.includes('save_image_pick'))).toBe(false);
    // Live, the photo arrives after the answer's blocks and is placed after the board.
    expect(placeBlock([board(), explanation()], emitted[0]).map((b) => b.type)).toEqual(['board', 'image', 'explanation']);
    // No photo found: the answer stands as written.
    const none = await fillVisuals(withDb, [board(), explanation()], { chapterKey: null, lang: 'en', young: { question: 'cow' }, search: async () => null });
    expect(none.map((b) => b.type)).toEqual(['board', 'explanation']);
  });
});
