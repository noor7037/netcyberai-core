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
    const b = await showcaseFor('u.c10.science.jesc1.ch01', 'what happens when magnesium burns in air', 'en');
    expect(b?.type).toBe('showcase');
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
