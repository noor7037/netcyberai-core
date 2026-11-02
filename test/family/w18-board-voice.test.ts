import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Block, Board, NarrationLine } from '@/lib/family/blocks';
import { boardCursorFromSentence, boardStepOnSpoken } from '@/lib/family/board';
import { ANSWER_SPOKEN_MAX, sentenceAtChar, spokenAnswer, spokenSentences } from '@/lib/family/call';
import { PAST_THE_END, boardSentence } from '@/components/family/reader/narration';
import { familyWords } from '@/lib/family/words';
import { TUTOR_KEYS } from '@/lib/family/tutor-words';
import { UNDERSTAND_KEYS } from '@/lib/family/understand-words';

// The lazy views (board, figure, 3D model, simulations) are drawn here as a stub that names the block it was given and the
// step it was told to draw, so a static render shows which renderer a saved answer's block went to.
vi.mock('next/dynamic', () => ({
  default: () => (props: { b?: { type?: string }; cursor?: number }) => h('i', { 'data-lazy-block': props.b?.type ?? '', 'data-lazy-cursor': props.cursor === undefined ? 'none' : String(props.cursor) }),
}));

const { KeptAnswer } = await import('@/components/family/tutor/TutorWindow');

const w = familyWords('en', [...UNDERSTAND_KEYS, ...TUTOR_KEYS]);

const EXPLANATION: Block = {
  type: 'explanation',
  title: 'Equal fractions',
  idea: 'Half of a roti is the same amount as two quarters of it.',
  paragraphs: ['Cut the roti into four equal parts and take two of them.', 'You still have exactly half of the whole roti.'],
  example: 'So one half and two quarters are equal fractions.',
  steps: [],
  terms: [],
};
const BOARD: Board = {
  type: 'board',
  title: 'Halves and quarters',
  steps: [
    { n: 1, say: 'Half of a roti.', commands: [{ kind: 'shape', shape: 'circle', at: [50, 50], r: 30 }] },
    { n: 2, commands: [{ kind: 'label', at: [10, 10], text: 'half' }] },
    { n: 3, say: 'Four equal parts.', commands: [{ kind: 'label', at: [10, 20], text: 'quarters' }] },
    { n: 4, say: 'Still half.', commands: [{ kind: 'label', at: [10, 30], text: 'equal' }] },
  ],
};

describe('the sentence being spoken (W18-P1)', () => {
  it('spokenSentences is spokenAnswer cut into its sentences, within the same limit', () => {
    const s = spokenSentences([EXPLANATION], ANSWER_SPOKEN_MAX);
    expect(s.length).toBe(4);
    expect(s.join(' ')).toBe(spokenAnswer([EXPLANATION], ANSWER_SPOKEN_MAX));
    expect(spokenSentences([EXPLANATION], 70).join(' ')).toBe(spokenAnswer([EXPLANATION], 70));
    expect(spokenSentences([BOARD], ANSWER_SPOKEN_MAX)).toEqual([]);
  });

  it('sentenceAtChar finds the sentence a character of the joined text falls in', () => {
    const s = ['One two three four five.', 'Six seven eight nine ten.', 'Eleven twelve thirteen.'];
    const text = s.join(' ');
    expect(sentenceAtChar(s, 0)).toBe(0);
    expect(sentenceAtChar(s, s[0].length)).toBe(0); // the space after a sentence is its own
    expect(sentenceAtChar(s, s[0].length + 1)).toBe(1);
    expect(sentenceAtChar(s, text.indexOf('Eleven'))).toBe(2);
    expect(sentenceAtChar(s, text.length + 50)).toBe(2);
    expect(sentenceAtChar(s, -3)).toBe(0);
    expect(sentenceAtChar(s, Number.NaN)).toBe(0);
    expect(sentenceAtChar([], 4)).toBe(-1);
    // The server voice's share played, turned into a character: half way through is the middle sentence.
    expect(sentenceAtChar(s, 0.5 * text.length)).toBe(1);
  });

  it('boardCursorFromSentence: a step without a say line comes with the one before it; past the last, the last', () => {
    const say = BOARD.steps.map((x) => x.say);
    expect(boardCursorFromSentence(say, 0)).toBe(2);
    expect(boardCursorFromSentence(say, 1)).toBe(3);
    expect(boardCursorFromSentence(say, 2)).toBe(4);
    expect(boardCursorFromSentence(say, 9)).toBe(4);
    expect(boardCursorFromSentence(say, PAST_THE_END)).toBe(4);
  });

  it('the board follows the voice, a Next tapped ahead stays, a Back holds until the next step, Replay starts over', () => {
    // The voice starts: its step.
    expect(boardStepOnSpoken(1, undefined, 1)).toBe(1);
    expect(boardStepOnSpoken(3, undefined, 2)).toBe(2);
    // The voice moves on: the further of the voice and the tap.
    expect(boardStepOnSpoken(2, 2, 3)).toBe(3);
    expect(boardStepOnSpoken(4, 2, 3)).toBe(4); // Next tapped ahead of the voice stays
    expect(boardStepOnSpoken(1, 3, 4)).toBe(4); // Back held until the voice's next step
    // Replay: the voice goes back to its first step, so does the board.
    expect(boardStepOnSpoken(4, 4, 1)).toBe(1);
  });

  it('a chapter board follows the explanation before it, less its title, and shows everything once it is passed', () => {
    const script: NarrationLine[] = [
      { blockId: 'intro', sentence: 0, text: 'Equal fractions' },
      { blockId: 'intro', sentence: 1, text: 'Half of a roti.' },
      { blockId: 'intro', sentence: 2, text: 'Four equal parts.' },
      { blockId: 'points', sentence: 0, text: 'Remember this.' },
    ];
    expect(boardSentence(script, 0, 'intro', 1)).toBe(0);
    expect(boardSentence(script, 2, 'intro', 1)).toBe(1);
    expect(boardSentence(script, 3, 'intro', 1)).toBe(PAST_THE_END);
    expect(boardSentence(script, 0, 'points')).toBeUndefined();
    expect(boardSentence(script, 0, null)).toBeUndefined();
  });
});

describe('a saved answer keeps every visual (W18-P1)', () => {
  const render = (b: Block[]) => renderToStaticMarkup(h(KeptAnswer, { b, w, tone: 'mathematics', lang: 'en', speak: { id: 'f1800000-0000-4000-8000-000000000001', serverVoice: true } }));

  it('a kept board goes through the lesson page’s renderer (AnswerBlock), at its first step until a voice moves it', () => {
    const html = render([EXPLANATION, BOARD]);
    expect(html).toContain('data-lazy-block="board"');
    expect(html).toContain('data-lazy-cursor="none"');
    expect(html).toContain('data-teach-me="f1800000-0000-4000-8000-000000000001"');
    expect(html).toContain('>Teach me<');
    expect(html).toContain('data-answer-speaker=');
  });

  it('a check or practice in history stays out, as before; an answer with nothing to say has no voice buttons', () => {
    const check = { type: 'check', items: [{ kind: 'mcq', question: 'Which is half?', options: ['1/2', '1/3'], answer: 0, why: 'One of two equal parts.' }] } as unknown as Block;
    const html = render([BOARD, check]);
    expect(html).toContain('data-lazy-block="board"');
    expect(html).not.toContain('Which is half?');
    expect(html).not.toContain('data-teach-me');
    expect(html).not.toContain('data-answer-speaker');
  });
});
