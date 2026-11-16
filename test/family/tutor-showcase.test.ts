import { describe, expect, it } from 'vitest';
import { checkStoredBlock, parseBlockLine } from '@/lib/family/blocks';
import { bestDiagram, showcaseFor } from '@/lib/family/visuals/showcase';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>.a{animation:a 1s infinite}</style><circle class="a" cx="5" cy="5" r="3"/></svg>';
const d = (title: string) => ({ title, svg, caption: title, text: title });

describe('tutor showcase', () => {
  it('keeps our own animated svg', () => expect(checkStoredBlock({ type: 'showcase', title: 'Magnesium burning', caption: 'x', svg })).not.toBeNull());
  it.each(['<script>1</script>', '<foreignObject/>', '<g onload="x()"/>', '<image href="http://x"/>', '<use href="#a"/>'])('refuses %s', (bad) =>
    expect(checkStoredBlock({ type: 'showcase', title: 't', caption: 'c', svg: svg.replace('<circle', `${bad}<circle`) })).toBeNull());
  it('is never taken from the model', () => expect(parseBlockLine(JSON.stringify({ type: 'showcase', title: 't', caption: 'c', svg }))).toBeNull());
  it('picks the diagram that shares words with the question', () => {
    expect(bestDiagram([d('Photosynthesis in a leaf'), d('Magnesium burning in air')], 'why does magnesium burn')?.title).toBe('Magnesium burning in air');
    expect(bestDiagram([d('Photosynthesis in a leaf')], 'what is a triangle')).toBeNull();
  });
  it('needs a chapter key', async () => expect(await showcaseFor(null, 'magnesium', 'en')).toBeNull());
  it('reads a real chapter from disk', async () => {
    const b = await showcaseFor('u.c10.science.jesc1.ch01', 'what is a precipitate when two solutions mix', 'en');
    expect(b?.type).toBe('showcase');
    expect(b && 'title' in b ? b.title : '').toBe('Two clear solutions, one white solid');
  });
  // Bug 1 (founder, 16 Nov): an Equal-fractions question showed the chemistry diagram "From reactants to product".
  it('shows nothing when the chapter has no diagram about the question', async () => {
    expect(await showcaseFor('u.c10.science.jesc1.ch01', 'What are equal fractions?', 'en')).toBeNull();
    expect(await showcaseFor('u.c10.science.jesc1.ch01', 'what is the capital of france', 'en')).toBeNull();
  });
  it('shows nothing from a chapter of another class or subject', async () => {
    expect(await showcaseFor('u.c10.science.jesc1.ch01', 'what is a precipitate when two solutions mix', 'en', undefined, { classLevel: 3 })).toBeNull();
    expect(await showcaseFor('u.c10.science.jesc1.ch01', 'what is a precipitate when two solutions mix', 'en', undefined, { classLevel: 10, subject: 'mathematics' })).toBeNull();
    expect(await showcaseFor('u.c10.science.jesc1.ch01', 'what is a precipitate when two solutions mix', 'en', undefined, { classLevel: 10, subject: 'science' })).not.toBeNull();
  });
  it('needs two shared words, or a bare keyword that is in the title', () => {
    expect(bestDiagram([d('Photosynthesis in a leaf')], 'what is a leaf in the garden')).toBeNull();
    expect(bestDiagram([d('Photosynthesis in a leaf')], 'photosynthesis')?.title).toBe('Photosynthesis in a leaf');
    expect(bestDiagram([{ ...d('Water cycle'), text: 'Water cycle rain clouds leaf' }], 'leaf')).toBeNull();
  });
});

import { citationOf } from '@/lib/family/citation';
describe('grounding', () => {
  it('a showcase answer is never "not from your book"', () => {
    const blocks = [{ type: 'showcase' }, { type: 'explanation', idea: 'x', paragraphs: [] }] as never;
    expect(citationOf(blocks, true)).toBeNull();
    expect(citationOf([{ type: 'explanation', idea: 'x', paragraphs: [] }] as never, true)).toEqual({ kind: 'general' });
  });
});
