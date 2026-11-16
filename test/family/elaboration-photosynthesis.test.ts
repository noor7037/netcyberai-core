import { beforeEach, describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ElaborationView } from '@/components/family/blocks/ElaborationView';
import { parseBlockLine } from '@/lib/family/blocks';
import { checkCount, ELAB_KEYS, elaborationBlock, type Elaboration } from '@/lib/family/elaboration';
import { withPics } from '@/lib/family/elaboration-pics';
import { commonsSearchUrl, pickPhoto } from '@/lib/family/visuals/commons';
import { fillElaboration, forgetElabPhotos } from '@/lib/family/visuals/elab-fill';
import { askable, nasa, routeFor, searchSources } from '@/lib/family/visuals/sources';
import { FORBIDDEN } from './picture-labels';

// The founder's live question, 16 Nov 2026: "how photosynthesis work and why trees die". It gave one MCQ and one photo
// labelled as real. Now: five steps in order, a real picture on each, no picture label, the multiple-choice questions
// only after step 5, and a question set that is never an answer by itself.
const QUESTION = 'how photosynthesis work and why trees die';
const step = (text: string, q: string) => ({ text, say: text, q });
const LINE = {
  type: 'elaboration',
  term: 'Photosynthesis and why trees die',
  icon: '🌳',
  definition: step('Photosynthesis is how green plants make food from sunlight, water and air.', 'green leaf sunlight'),
  levels: { basic: 'A leaf catches sunlight to make food.', intermediate: 'Chlorophyll turns carbon dioxide and water into glucose and oxygen.', advanced: '6CO2 + 6H2O + light gives C6H12O6 + 6O2 in two stages.', say: 'Three levels.', q: 'chlorophyll leaf' },
  real_life: step('The tree outside school makes shade and fresh air.', 'banyan tree'),
  try_it: { question: 'Put one plant in a dark cupboard. What happens to its leaves?', right: 'They turn pale: no light, no food.', hint: 'What does a leaf need?', say: 'What happens in the cupboard?', q: 'pale plant' },
  future: step('Trees die without water, light or healthy roots.', 'dead tree'),
  checks: [
    { question: 'What do leaves use?', options: ['Sunlight, water and air', 'Only soil'], answer: 0, right: 'Sunlight, water and air.', hint: 'Look at step 1.' },
    { question: 'Which gas do trees give out?', options: ['Oxygen', 'Smoke'], answer: 0, right: 'Oxygen.', hint: 'We breathe it.' },
    { question: 'Where is food made?', options: ['Leaves', 'Roots'], answer: 0, right: 'In the leaves.', hint: 'Where is the chlorophyll?' },
  ],
};
const words = new Proxy({}, { get: (_t, k) => String(k) }) as never;
const parse = (o: object) => parseBlockLine(JSON.stringify(o)) as unknown as Elaboration;
let n = 0;
const stub = async (q: string) => ({ url: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/a${++n}/${q.replace(/\W/g, '_')}.jpg/500px-x.jpg`, pageUrl: 'https://commons.wikimedia.org/wiki/File:x.jpg', author: 'A. Author', licence: 'CC BY 4.0', licenceUrl: null, source: 'commons' });

beforeEach(() => forgetElabPhotos());

describe('photosynthesis answer', () => {
  it('is five steps in order, a real picture on each, and the questions only after step 5', async () => {
    const built = withPics(parse(LINE), [], QUESTION, 9);
    const b = await fillElaboration(built, { subject: 'science', search: stub, model: async () => null });
    expect(b.pics).toHaveLength(5);
    expect(b.pics.every((p) => p?.kind === 'photo' && p.url && p.svg === '')).toBe(true);
    expect(new Set(b.pics.map((p) => p?.url)).size).toBe(5);
    const html = renderToStaticMarkup(h(ElaborationView, { b, w: words, tone: 'science' }));
    const at = ELAB_KEYS.map((k) => html.indexOf(`data-elab-key="${k}"`));
    expect(at.every((x) => x > 0)).toBe(true);
    expect([...at].sort((x, y) => x - y)).toEqual(at);
    expect(html.indexOf('data-elab-checks')).toBeGreaterThan(at[4]);
    expect(html.match(/data-elab-check="/g)?.length).toBe(b.checks.length);
    expect(b.checks.length).toBeGreaterThanOrEqual(1);
    expect(b.checks.length).toBeLessThanOrEqual(3);
    // Step 4 has no choices; the choices are only in the checks after step 5.
    const four = html.slice(at[3], at[4]);
    expect(four).not.toContain('data-elab-option');
    expect(four).toContain('data-elab-try');
    // The Real life and Future steps are real pictures, not the old placeholder cards.
    expect(html).not.toContain('data-elab-img="card"');
    expect(html.match(/data-elab-img="photo"/g)?.length).toBeGreaterThanOrEqual(5);
  });
  it('shows no label, badge, caption prefix or credit on any picture', async () => {
    const b = await fillElaboration(withPics(parse(LINE), [], QUESTION, 9), { subject: 'science', search: stub, model: async () => null });
    const html = renderToStaticMarkup(h(ElaborationView, { b, w: words, tone: 'science' }));
    expect(html).not.toMatch(FORBIDDEN);
    expect(html).not.toContain('A. Author');
    expect(html).not.toContain('CC BY');
  });
  it('a question set on its own, or a block missing any step, is rejected', () => {
    expect(elaborationBlock({ type: 'elaboration', term: 'x', checks: LINE.checks }, false)).toBeNull();
    const { future: _f, ...noFuture } = LINE;
    expect(elaborationBlock(noFuture as never, false)).toBeNull();
    const { checks: _c, ...noChecks } = LINE;
    expect(elaborationBlock(noChecks as never, false)).toBeNull();
    expect(parseBlockLine(JSON.stringify({ type: 'check', items: [] }))).toBeNull();
  });
  it('chooses one to three questions by how complex the topic is', () => {
    expect(checkCount(1, 'cow', 'x')).toBe(1);
    expect(checkCount(4, 'what is a seed', 'x')).toBe(1);
    expect(checkCount(7, 'how does a seed grow', 'x')).toBe(2);
    expect(checkCount(11, 'x', 'x')).toBe(3);
    expect(withPics(parse(LINE), [], QUESTION, 3).checks).toHaveLength(1);
    expect(withPics(parse(LINE), [], QUESTION, 10).checks).toHaveLength(3);
  });
});

describe('picture sources', () => {
  it('assessed Commons files are a ranking bonus, not a filter', () => {
    expect(decodeURIComponent(commonsSearchUrl('leaf'))).not.toMatch(/incategory/i);
    const page = (title: string, cats: string, index: number) => ({ title, index, imageinfo: [{ url: 'https://upload.wikimedia.org/a.jpg', thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${title}/500px-${title}`, descriptionurl: `https://commons.wikimedia.org/wiki/File:${title}`, mime: 'image/jpeg', size: 1000, width: 800, height: 600, extmetadata: { LicenseShortName: { value: 'CC BY 4.0' }, Artist: { value: 'A' }, Categories: { value: cats } } }] });
    const got = pickPhoto({ query: { pages: [page('Plain.jpg', 'Leaves', 0), page('Good.jpg', 'Quality images|Leaves', 1)] } });
    expect(got?.pageUrl).toContain('Good.jpg');
    expect(pickPhoto({ query: { pages: [page('Plain.jpg', 'Leaves', 0)] } })).not.toBeNull();
  });
  it('routes by subject, and a source with no key is skipped silently', async () => {
    expect(routeFor('history', 'fort')[0]).toBe('commons');
    expect(routeFor('science', 'the moon')[0]).toBe('nasa');
    expect(askable(['pixabay', 'pexels', 'commons'], {}).map((s) => s.id)).toEqual(['commons']);
    expect(askable(['pixabay'], { PIXABAY_API_KEY: 'k' }).map((s) => s.id)).toEqual(['pixabay']);
    const none = await searchSources('leaf', { subject: 'biology', env: {}, fetcher: (async () => { throw new Error('down'); }) as never });
    expect(none).toBeNull();
  });
  it('the NASA adapter keeps public-domain previews and skips credited ones', async () => {
    const item = (id: string, description: string) => ({ data: [{ nasa_id: id, title: 'Leaf', description, center: 'JPL' }], links: [{ rel: 'preview', href: `https://images-assets.nasa.gov/image/${id}/${id}~thumb.jpg` }] });
    const f = (async () => new Response(JSON.stringify({ collection: { items: [item('A1', 'Photo courtesy of someone'), item('B2', 'A leaf')] } }))) as never;
    const hit = await nasa('leaf', {}, f);
    expect(hit?.pageUrl).toContain('B2');
    expect(hit?.licence).toBe('Public domain');
  });
});
