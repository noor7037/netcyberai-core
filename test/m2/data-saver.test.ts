import { describe, expect, it } from 'vitest';
import { dataSaverBlocks, dataSaverState, droppedCount, sizeText } from '@/lib/family/data-saver';

// M2-9 (C283): the data-saver loads text only, text first (07 §1). Pure: which blocks are drawn, in what order.
const b = (type: string) => ({ type });
const ALL = ['explanation', 'diagram', 'worked_example', 'check', 'video', 'key_points', 'practice', 'interactive', 'english_moment', 'image', 'sources'].map(b);

describe('the data-saver block filter', () => {
  it('off: every block, in the order it came', () => {
    expect(dataSaverBlocks(ALL, false)).toEqual(ALL);
    expect(droppedCount(ALL, false)).toBe(0);
  });

  it('on: diagrams, pictures, interactive and video blocks are dropped; text first, then the questions', () => {
    expect(dataSaverBlocks(ALL, true).map((x) => x.type)).toEqual(['explanation', 'worked_example', 'key_points', 'english_moment', 'sources', 'check', 'practice']);
    expect(droppedCount(ALL, true)).toBe(4);
  });

  it('on: a block type it does not know is dropped, never drawn', () => {
    expect(dataSaverBlocks([b('explanation'), b('simulation'), b('graph')], true).map((x) => x.type)).toEqual(['explanation']);
  });

  it('keeps each block whole and does not change the list it was given', () => {
    const blocks = [{ type: 'practice', items: [1] }, { type: 'explanation', title: 'x' }];
    const out = dataSaverBlocks(blocks, true);
    expect(out[0]).toBe(blocks[1]);
    expect(blocks.map((x) => x.type)).toEqual(['practice', 'explanation']);
  });
});

describe('the switch', () => {
  it('off by default; the phone’s save-data hint turns it on; the family’s choice wins', () => {
    expect(dataSaverState(null, undefined)).toEqual({ on: false, source: 'default' });
    expect(dataSaverState(null, true)).toEqual({ on: true, source: 'phone' });
    expect(dataSaverState('0', true)).toEqual({ on: false, source: 'chosen' });
    expect(dataSaverState('1', false)).toEqual({ on: true, source: 'chosen' });
    expect(dataSaverState('maybe', false)).toEqual({ on: false, source: 'default' });
  });
});

describe('pack sizes as families read them', () => {
  it('KB under a megabyte, never under 1; MB with one decimal', () => {
    expect(sizeText(100)).toEqual({ n: '1', unit: 'KB' });
    expect(sizeText(122_880)).toEqual({ n: '120', unit: 'KB' });
    expect(sizeText(1_468_006)).toEqual({ n: '1.4', unit: 'MB' });
  });
});
