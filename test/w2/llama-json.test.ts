import { describe, expect, it } from 'vitest';
import { jsonObjectScanner, parseBlockLine } from '@/lib/family/blocks';

// W2 (C316): the shapes open models give our blocks in. Each complete object is handed on as it closes; what lies
// around it is dropped.

const explanation = { type: 'explanation', title: 'Magnets', idea: 'A magnet pulls iron.', example: 'A fridge magnet holds a note.', steps: ['Bring it close', 'Watch'], terms: [] };
const scanAll = (chunks: string[]) => {
  const scan = jsonObjectScanner();
  return chunks.flatMap((c) => scan(c));
};

describe('reading JSON blocks however the model lays them out', () => {
  it('one block per line, as the prompt asks', () => {
    expect(scanAll([`${JSON.stringify(explanation)}\n{"type":"refuse"}\n`])).toEqual([JSON.stringify(explanation), '{"type":"refuse"}']);
  });

  it('a block spread over many lines, in a code fence, with a sentence before it', () => {
    const pretty = `Here is your answer:\n\`\`\`json\n${JSON.stringify(explanation, null, 2)}\n\`\`\`\n`;
    const out = scanAll(pretty.match(/[\s\S]{1,7}/g)!);
    expect(out).toHaveLength(1);
    expect(parseBlockLine(out[0])).toMatchObject({ type: 'explanation', title: 'Magnets' });
  });

  it('blocks in a list, and braces and quotes inside strings', () => {
    const tricky = { ...explanation, idea: 'A "pole" is an end {not the middle} \\ of it.' };
    const out = scanAll([`[${JSON.stringify(tricky)},`, ` ${JSON.stringify({ type: 'refuse' })}]`]);
    expect(out.map((o) => JSON.parse(o).type)).toEqual(['explanation', 'refuse']);
    expect(JSON.parse(out[0]).idea).toBe(tricky.idea);
  });

  it('an object that never closes is dropped, and so is one past the size limit, whatever it holds', () => {
    expect(scanAll(['{"type":"explanation","title":"cut'])).toEqual([]);
    expect(scanAll([`{"type":"x","v":"${'a'.repeat(20_100)}"}`, '{"type":"refuse"}'])).toEqual(['{"type":"refuse"}']);
    // A block hidden inside an oversized one never comes out as a block of its own.
    const inner = JSON.stringify({ type: 'key_points', points: ['x'] });
    expect(scanAll([`{"type":"x","v":"${'a'.repeat(20_100)}","inner":${inner}}`, '\n{"type":"refuse"}'])).toEqual(['{"type":"refuse"}']);
  });

  it('a brace in a sentence is not an object: the blocks after it are still read', () => {
    expect(scanAll([`Use { and } with care.\n${JSON.stringify(explanation)}`])).toEqual([JSON.stringify(explanation)]);
    expect(scanAll(['A lone { here.\n', JSON.stringify(explanation)])).toEqual([JSON.stringify(explanation)]);
  });
});
