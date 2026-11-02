import { afterEach, describe, expect, it } from 'vitest';
import type { Block } from '@/lib/family/blocks';
import { MIN_ANSWER_WORDS, QC_CODES, bandProblems, qcRules, qcValidator, registerQcValidator, unregisterQcValidator, type QcAnswer } from '@/lib/ai/qc/rules';

// W16-A5: the quality-check rules on the hot path. Pure, no database and no model. Every code fires on a fixture built
// for it and stays quiet on a good answer; an answer with no citation, when passages were given, is refused. The text
// is made up.

const SENTENCE = 'A cell is the small part that a living thing is built from, and every part of the body is made of cells.';
const text = (sentences: number) => Array.from({ length: sentences }, () => SENTENCE).join(' ');
const explanation = (body: string): Block => ({ type: 'explanation', title: 'Cells', idea: body, example: 'Look at an onion peel under a microscope.', steps: [], terms: [] }) as Block;
const sources: Block = { type: 'sources', links: [{ label: 'NCERT Science, Class 8', url: 'https://ncert.nic.in/' }] };

// 10 sentences of 21 words is about 210 words: right for classes 6 to 8.
const good = (over: Partial<QcAnswer> = {}): QcAnswer => ({
  blocks: [explanation(text(10)), sources],
  passagesGiven: true,
  firstTextMs: 2_000,
  wholeMs: 9_000,
  deadlineMs: 40_000,
  firstTextDeadlineMs: 12_000,
  band: 'c6_8',
  ...over,
});
const codes = (a: QcAnswer) => qcRules(a).problems.map((p) => p.code);

afterEach(() => {
  unregisterQcValidator('board');
  unregisterQcValidator('other');
});

describe('a good answer', () => {
  it('passes with no problem', () => {
    expect(qcRules(good())).toEqual({ ok: true, problems: [] });
  });
  it('passes without passages and without a sources block', () => {
    expect(qcRules(good({ blocks: [explanation(text(10))], passagesGiven: false })).ok).toBe(true);
  });
  it('is not judged on timing when no deadline for the first words is given', () => {
    expect(codes(good({ firstTextMs: 30_000, firstTextDeadlineMs: null }))).toEqual([]);
  });
});

describe('each code fires on its own fixture', () => {
  it('no_citation: passages were given and there is no sources block', () => {
    expect(codes(good({ blocks: [explanation(text(10))] }))).toEqual(['no_citation']);
  });
  it('citation_without_passages: a sources block with nothing behind it', () => {
    expect(codes(good({ passagesGiven: false }))).toEqual(['citation_without_passages']);
  });
  it('block_invalid: the parser dropped a block, left a line open, or dropped one for size', () => {
    expect(codes(good({ parser: { dropped: 1 } }))).toEqual(['block_invalid']);
    expect(codes(good({ parser: { unclosed: true } }))).toEqual(['block_invalid']);
    expect(codes(good({ parser: { droppedForSize: 2 } }))).toEqual(['block_invalid']);
    expect(codes(good({ parser: { dropped: 0, unclosed: false, droppedForSize: 0 } }))).toEqual([]);
  });
  it('board_invalid: a registered board validator reports a problem, and only for an answer that has a board block', () => {
    registerQcValidator('board', () => ['command 3 is not numbered']);
    const board = { type: 'board', commands: [] } as unknown as Block;
    expect(codes(good({ blocks: [explanation(text(10)), sources, board] }))).toEqual(['board_invalid']);
    expect(codes(good())).toEqual([]);
    unregisterQcValidator('board');
    expect(codes(good({ blocks: [explanation(text(10)), sources, board] }))).toEqual([]);
  });
  it('any other validator by name is reported as a block problem, and a validator that throws is a problem too', () => {
    registerQcValidator('other', () => ['bad']);
    expect(qcRules(good()).problems).toEqual([{ code: 'block_invalid', detail: 'other: bad' }]);
    registerQcValidator('other', () => {
      throw new Error('boom');
    });
    expect(codes(good())).toEqual(['block_invalid']);
  });
  it('late_first_text: the first words came after the profile allows', () => {
    expect(codes(good({ firstTextMs: 12_001 }))).toEqual(['late_first_text']);
    expect(codes(good({ firstTextMs: 12_000 }))).toEqual([]);
  });
  it('hung: no text and no end within the profile time, and nothing else is said', () => {
    expect(codes(good({ blocks: [], firstTextMs: null, wholeMs: null }))).toEqual(['hung']);
    expect(codes(good({ blocks: [], firstTextMs: null, wholeMs: 40_000 }))).toEqual(['hung']);
    // Text that arrived late is lateness, not a hang.
    expect(codes(good({ firstTextMs: 20_000 }))).toEqual(['late_first_text']);
  });
  it('too_short: too little to teach with', () => {
    const tiny = explanation('Cells are small.');
    expect(codes(good({ blocks: [{ ...(tiny as object), example: 'Yes.' } as Block, sources] }))).toEqual(['too_short']);
    expect(codes(good({ blocks: [sources] }))).toEqual(['too_short']);
    expect(MIN_ANSWER_WORDS).toBeGreaterThan(5);
  });
  it('off_band: the depth does not suit the class band', () => {
    // Long for a class 2 to 5 child.
    expect(codes(good({ band: 'c2_5', blocks: [explanation(text(14)), sources] }))).toEqual(['off_band']);
    // Thin for classes 6 to 8 (a few sentences).
    expect(codes(good({ blocks: [explanation(text(3)), sources] }))).toEqual(['off_band']);
    // Words of a later band for a class 1 child.
    const hard = 'An atom has a nucleus and an electron. The molecule holds an enzyme. We write an equation for it.';
    expect(codes(good({ band: 'lkg_1', blocks: [explanation(hard), sources] }))).toEqual(['off_band']);
    // Not judged without a band.
    expect(codes(good({ band: null, blocks: [explanation(text(3)), sources] }))).toEqual([]);
  });
  it('every code in the list is covered above', () => {
    expect(QC_CODES).toEqual(['no_citation', 'citation_without_passages', 'block_invalid', 'board_invalid', 'late_first_text', 'hung', 'too_short', 'off_band']);
  });
});

describe('the orchestrator validator', () => {
  it('rejects an uncited answer when passages were given, and passes a cited one', async () => {
    expect(await qcValidator(good({ blocks: [explanation(text(10))] }))).toEqual(['no_citation']);
    expect(await qcValidator(good())).toEqual([]);
  });
  it('returns every code an answer earns', async () => {
    expect(await qcValidator(good({ blocks: [explanation(text(10))], firstTextMs: 13_000, parser: { dropped: 1 } }))).toEqual(['late_first_text', 'no_citation', 'block_invalid']);
  });
});

describe('the band test', () => {
  it('suits a normal Class 8 answer and flags a one-line one', () => {
    expect(bandProblems(text(10), 'c6_8')).toEqual([]);
    expect(bandProblems('Cells are small.', 'c6_8')[0]).toMatch(/^thin/);
  });
});
