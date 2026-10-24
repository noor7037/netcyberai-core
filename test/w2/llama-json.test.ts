import { describe, expect, it } from 'vitest';
import { jsonObjectScanner, parseBlockLine } from '@/lib/family/blocks';

// W2 (C316): the shapes open models give our blocks in. Each complete object is handed on as it closes; what lies
// around it is dropped.

const explanation = { type: 'explanation', title: 'Magnets', idea: 'A magnet pulls iron.', example: 'A fridge magnet holds a note.', steps: ['Bring it close', 'Watch'], terms: [] };
const scanAll = (chunks: string[]) => {
  const scan = jsonObjectScanner();
  return chunks.flatMap((c) => scan(c));
};
// What the scanner hands on, and what it says it dropped once the answer has ended (C330).
const scanWithDropped = (chunks: string[]) => {
  const scan = jsonObjectScanner();
  const out = chunks.flatMap((c) => scan(c));
  return { out, dropped: scan.dropped() };
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

  it('says what it dropped: an object left open, and each object past the size limit (C330)', () => {
    // Nothing dropped.
    expect(scanWithDropped([`${JSON.stringify(explanation)}\n{"type":"refuse"}`])).toEqual({ out: [JSON.stringify(explanation), '{"type":"refuse"}'], dropped: { unclosed: false, droppedForSize: 0 } });
    // Cut off mid-object.
    expect(scanWithDropped([JSON.stringify(explanation), '\n{"type":"check","items":[{"id":"c1"'])).toEqual({ out: [JSON.stringify(explanation)], dropped: { unclosed: true, droppedForSize: 0 } });
    // An unescaped quote leaves the scanner inside a string to the end: the block after it is lost too, and the answer
    // ends inside an object.
    const unescaped = `${JSON.stringify(explanation)}\n{"type":"check","note":"a 5" bar"}\n{"type":"refuse"}\n`;
    expect(scanWithDropped(unescaped.match(/[\s\S]{1,5}/g)!)).toEqual({ out: [JSON.stringify(explanation)], dropped: { unclosed: true, droppedForSize: 0 } });
    // Two objects past the limit, each counted once however many chunks it spans; the blocks around them still come.
    const big = `{"type":"x","v":"${'a'.repeat(20_100)}"}`;
    const sized = scanWithDropped([...`${big}\n{"type":"refuse"}\n${big}`.match(/[\s\S]{1,999}/g)!, '\n{"type":"refuse"}']);
    expect(sized).toEqual({ out: ['{"type":"refuse"}', '{"type":"refuse"}'], dropped: { unclosed: false, droppedForSize: 2 } });
    // One past the limit that never closes is both.
    expect(scanWithDropped([`{"type":"x","v":"${'a'.repeat(20_100)}`]).dropped).toEqual({ unclosed: true, droppedForSize: 1 });
    // A "{" followed only by spaces at the end is not an object yet.
    expect(scanWithDropped(['Done. { \n']).dropped).toEqual({ unclosed: false, droppedForSize: 0 });
  });

  it('a brace in a sentence is not an object: the blocks after it are still read', () => {
    expect(scanAll([`Use { and } with care.\n${JSON.stringify(explanation)}`])).toEqual([JSON.stringify(explanation)]);
    expect(scanAll(['A lone { here.\n', JSON.stringify(explanation)])).toEqual([JSON.stringify(explanation)]);
  });
});
