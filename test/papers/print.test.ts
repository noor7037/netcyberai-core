import { describe, expect, it } from 'vitest';
import { markingSchemeBlocks, printLang, questionPaperBlocks } from '@/lib/papers/print';
import type { PrintData } from '@/lib/papers/types';

// A kept paper as the PDF's blocks (C362): the school's header, time and marks, the instructions, each section with
// its internal choice and every question's marks and options; the marking scheme with answers and steps. Made-up words.

const data: PrintData = {
  schoolName: 'Illustrative School',
  examName: 'Half-yearly',
  className: '7-A',
  subjectName: 'Mathematics',
  date: '2026-09-25',
  minutes: 180,
  maxMarks: 9,
  language: 'en',
  choiceCounts: { B: 1 },
  questions: [
    { label: '1', section: 'A', choiceGroup: null, maxMarks: 1, kind: 'objective', prompt: 'Which is larger?', options: [{ key: 'A', text: '1/2' }, { key: 'B', text: '1/4' }], correct: { keys: ['A'] }, answerKey: 'A: one half.', steps: [{ step: 'Right option', marks: 1 }] },
    { label: '2', section: 'B', choiceGroup: 'B', maxMarks: 4, kind: 'long', prompt: 'Explain halves.', options: [], correct: null, answerKey: 'Two equal parts.', steps: [{ step: 'Two parts', marks: 2 }, { step: 'Equal', marks: 2 }] },
    { label: '3', section: 'B', choiceGroup: 'B', maxMarks: 4, kind: 'numerical', prompt: 'Half of 9?', options: [], correct: { value: 4.5, tolerance: 0 }, answerKey: '4.5', steps: [{ step: 'Divide', marks: 4 }] },
  ],
};

describe('the question paper', () => {
  it('has the header, time and marks, instructions, sections with their choice, and each question’s marks and options', () => {
    const b = questionPaperBlocks(data, 'en');
    expect(b[0]).toEqual({ kind: 'title', text: 'Illustrative School' });
    expect(b[1]).toEqual({ kind: 'subtitle', text: 'Half-yearly · 7-A · Mathematics' });
    expect(b[2]).toEqual({ kind: 'line', text: 'Time: 180 minutes · Maximum marks: 9', strong: true });
    const texts = b.map((x) => ('text' in x ? x.text : ''));
    expect(texts).toContain('Section B: answer any 1 of these 2 questions');
    expect(texts).toContain('Section B · answer any 1 of these 2 questions');
    expect(texts).toContain('1. Which is larger?  (1 mark)');
    expect(texts).toContain('(A) 1/2');
    expect(texts).toContain('2. Explain halves.  (4 marks)');
    // No answer reaches the question paper.
    expect(texts.join(' ')).not.toContain('one half');
  });

  it('the marking scheme gives each answer, right option or number, and the steps', () => {
    const texts = markingSchemeBlocks(data, 'en').map((x) => ('text' in x ? x.text : ''));
    expect(texts).toContain('Right option: A');
    expect(texts).toContain('Answer: 4.5');
    expect(texts).toContain('• Equal (2 marks)');
    expect(texts).toContain('For teachers only.');
  });

  it('a Hindi paper prints in Hindi whatever the reader’s language', () => {
    expect(printLang({ language: 'hi' }, 'en')).toBe('hi');
    expect(printLang({ language: 'mixed' }, 'hi')).toBe('hi');
    const b = questionPaperBlocks({ ...data, language: 'hi' }, 'hi');
    expect(b.some((x) => 'text' in x && /[ऀ-ॿ]/.test(x.text))).toBe(true);
  });
});
