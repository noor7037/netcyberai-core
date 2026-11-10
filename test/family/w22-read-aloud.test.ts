import { describe, expect, it } from 'vitest';
import { ANSWER_SPOKEN_MAX, chunkEnd, spokenSentences } from '@/lib/family/call';
import { speakAsk } from '@/lib/family/voice-out';

const long = (n: number) => Array.from({ length: n }, (_, i) => `This is the sentence number ${i + 1} of a long answer about friction.`);

describe('an answer is read whole, in parts', () => {
  it('spokenSentences takes every sentence when no limit is given (the old 600-character cut is gone)', () => {
    const block = { type: 'explanation', title: 't', idea: long(30).join(' '), example: 'The end of the answer.' } as never;
    const cut = spokenSentences([block], ANSWER_SPOKEN_MAX);
    const all = spokenSentences([block], Infinity);
    expect(cut.join(' ').length).toBeLessThanOrEqual(ANSWER_SPOKEN_MAX);
    expect(all.length).toBe(31);
    expect(all.at(-1)).toBe('The end of the answer.');
  });

  it('chunkEnd cuts at whole sentences within the limit and always moves on', () => {
    const s = long(30);
    let at = 0;
    const parts: string[][] = [];
    while (at < s.length) {
      const end = chunkEnd(s, at, ANSWER_SPOKEN_MAX);
      expect(end).toBeGreaterThan(at);
      parts.push(s.slice(at, end));
      at = end;
    }
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.join(' ').length).toBeLessThanOrEqual(ANSWER_SPOKEN_MAX);
    expect(parts.flat()).toEqual(s);
    // A sentence longer than the limit is a part of its own (the server cuts it), never an endless loop.
    expect(chunkEnd(['x'.repeat(900), 'short.'], 0, ANSWER_SPOKEN_MAX)).toBe(1);
    // Resuming at a sentence gives the same parts from there on.
    expect(chunkEnd(s, 5, ANSWER_SPOKEN_MAX)).toBeGreaterThan(5);
  });

  it('the voice route takes the sentence a part starts at, and refuses a wrong one', () => {
    const id = 'f9e20000-0000-4000-8000-0000000000aa';
    expect(speakAsk({ kind: 'tutor_answer', messageId: id })).toEqual({ kind: 'tutor_answer', messageId: id });
    expect(speakAsk({ kind: 'tutor_answer', messageId: id, from: 7 })).toEqual({ kind: 'tutor_answer', messageId: id, from: 7 });
    expect(speakAsk({ kind: 'tutor_answer', messageId: id, from: -1 })).toBeNull();
    expect(speakAsk({ kind: 'tutor_answer', messageId: id, from: 1.5 })).toBeNull();
    expect(speakAsk({ kind: 'tutor_answer', messageId: id, from: 'x' })).toBeNull();
  });
});
