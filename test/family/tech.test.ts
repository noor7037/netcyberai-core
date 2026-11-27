import { describe, expect, it } from 'vitest';
import { blockIds, narrationScript } from '@/lib/family/blocks';
import { techlabToBlocks } from '@/lib/family/tech/blocks';
import { courseCatalog, lessonById, lessonCount, lessonForChild } from '@/lib/family/tech/catalog';
import { flatLab, forChild, isRight, labMatches, levelOfClass, outcome, scoreAll } from '@/lib/family/tech/score';
import { speakAsk } from '@/lib/family/voice-out';

describe('Tech Lab scoring', () => {
  it('maps a class to its level, including Nursery', () => {
    expect(levelOfClass(-2)).toBe(1);
    expect(levelOfClass(0)).toBe(1);
    expect(levelOfClass(5)).toBe(1);
    expect(levelOfClass(6)).toBe(2);
    expect(levelOfClass(8)).toBe(2);
    expect(levelOfClass(9)).toBe(3);
    expect(levelOfClass(12)).toBe(3);
  });

  it('passes at 60 percent, gives stars at 80 and 95, and a retry only adds the extra XP', () => {
    expect(outcome(5, 10, 20).passed).toBe(false);
    expect(outcome(6, 10, 20)).toMatchObject({ passed: true, stars: 1, xp: 16, gain: 16 });
    expect(outcome(8, 10, 20)).toMatchObject({ stars: 2 });
    expect(outcome(10, 10, 20, 18)).toMatchObject({ stars: 3, xp: 20, gain: 2 });
    expect(outcome(10, 10, 20, 20).gain).toBe(0);
  });

  it('marks every question shape, and a lab-check only from a lab event', () => {
    expect(isRight({ id: 'q', type: 'mcq', answer: 1 }, 1)).toBe(true);
    expect(isRight({ id: 'q', type: 'mcq', answer: 1 }, 0)).toBe(false);
    expect(isRight({ id: 'q', type: 'multi', answer: [0, 2] }, [2, 0])).toBe(true);
    expect(isRight({ id: 'q', type: 'order', answer: [1, 0] }, [1, 0])).toBe(true);
    expect(isRight({ id: 'q', type: 'short', answer: ['Eight', { en: '8', hi: 'आठ' }] }, 'aath')).toBe(false);
    expect(isRight({ id: 'q', type: 'short', answer: ['Eight', { en: '8', hi: 'आठ' }] }, 'आठ')).toBe(true);
    expect(isRight({ id: 'q', type: 'short', answer: { accept: ['router'] } }, 'Router!')).toBe(true);
    const match = { id: 'q', type: 'match', options: { left: ['a', 'b'], right: ['A', 'B'] }, answer: [[0, 1], [1, 0]] };
    expect(isRight(match, [1, 0])).toBe(true);
    expect(isRight(match, [0, 1])).toBe(false);
    const lefts = { id: 'q', type: 'match', options: ['cat', 'dog'], answer: ['billi', 'kutta'] };
    expect(isRight(lefts, [0, 1])).toBe(true);
    const event = flatLab({ type: 'techlab:lab-complete', lab: 'secret-codes', mode: 'bulbs', result: { solved: true } }, 'secret-codes');
    expect(labMatches({ lab: 'secret-codes', mode: 'bulbs', solved: true }, event)).toBe(true);
    expect(isRight({ id: 'q', type: 'lab-check', answer: { lab: 'secret-codes', mode: 'bulbs', solved: true } }, true, [])).toBe(false);
    expect(isRight({ id: 'q', type: 'lab-check', answer: { lab: 'secret-codes', mode: 'bulbs', solved: true } }, true, [event])).toBe(true);
  });

  it('strips answers before a lesson reaches the phone, and still shows both sides of a match', () => {
    const lesson = lessonById('L1.binary-secret-codes.02');
    expect(lesson).toBeTruthy();
    const child = lessonForChild('L1.binary-secret-codes.02');
    const dumped = JSON.stringify(child);
    expect(dumped).not.toContain('"answer"');
    expect(dumped).not.toContain('"explain"');
    const match = child?.try?.questions?.find((question) => question.type === 'match');
    const options = match?.options as { left: unknown[]; right: unknown[] };
    expect(options.left.length).toBeGreaterThan(0);
    expect(options.right.length).toBe(options.left.length);
    const full = lessonById('L1.computer-body.01');
    expect(full).toBeTruthy();
    const scored = scoreAll(full!, { q1: 0 }, [], 'en');
    expect(scored.total).toBeGreaterThan(0);
  });
});

describe('Tech Lab read-aloud blocks', () => {
  it('reads See and Understand, and never a practice question', () => {
    const lesson = lessonById('L1.computer-body.01');
    expect(lesson).toBeTruthy();
    const blocks = techlabToBlocks(lesson!, 'en');
    const ids = blockIds(blocks);
    expect(new Set(ids).size).toBe(ids.length);
    expect(blocks.some((block) => block.type === 'check' || block.type === 'practice')).toBe(false);
    const script = narrationScript(blocks);
    expect(script[0]?.sentence).toBe(0);
    expect(script[0]?.blockId).toBe(ids[0]);
    const spoken = script.map((line) => line.text).join(' ');
    for (const question of lesson?.try?.questions ?? []) {
      const prompt = typeof question.prompt === 'object' ? question.prompt?.en : question.prompt;
      if (prompt) expect(spoken).not.toContain(prompt);
    }
    const copy = forChild(lesson);
    expect(JSON.stringify(techlabToBlocks(copy!, 'hinglish'))).not.toContain('"answer"');
  });
});

describe('Tech Lab catalog', () => {
  it('loads every written lesson and keeps the three levels', () => {
    expect(lessonCount()).toBe(277);
    const course = courseCatalog();
    expect(course.units).toHaveLength(50);
    expect(course.units.filter((unit) => unit.level === 1)).toHaveLength(14);
    expect(course.units.filter((unit) => unit.level === 2)).toHaveLength(15);
    expect(course.units.filter((unit) => unit.level === 3)).toHaveLength(21);
    expect(course.labs.length).toBeGreaterThanOrEqual(39);
    const nursery = course.units.filter((unit) => unit.level === 1 && unit.classes.includes(-2));
    expect(nursery.length).toBeGreaterThan(0);
  });
});

describe('Tech Lab server voice', () => {
  it('accepts a lesson sentence and refuses a phone-supplied line of text', () => {
    expect(speakAsk({ kind: 'techlab', lessonId: 'L1.computer-body.01', blockId: 'key-points-abcd1234', sentence: 0, lang: 'hinglish' })).toEqual({
      kind: 'techlab', lessonId: 'L1.computer-body.01', blockId: 'key-points-abcd1234', sentence: 0, lang: 'hinglish',
    });
    expect(speakAsk({ kind: 'techlab', lessonId: 'L1.computer-body.01', blockId: 'x', sentence: 0, lang: 'fr' })).toBeNull();
    expect(speakAsk({ kind: 'techlab', lessonId: '../secret', blockId: 'x', sentence: 0, lang: 'en' })).toBeNull();
    expect(speakAsk({ kind: 'techlab', lessonId: 'L1.computer-body.01', blockId: 'x', sentence: 0, lang: 'en', text: 'read this' })).toEqual({
      kind: 'techlab', lessonId: 'L1.computer-body.01', blockId: 'x', sentence: 0, lang: 'en',
    });
  });
});
