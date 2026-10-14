import { describe, expect, it } from 'vitest';
import { LESSON_EXAMPLE } from '@/demo-fixture/lesson-plan-example';
import {
  BLANK_LINE,
  LIMITS,
  PHASE_PARTS,
  balancePhases,
  blankLesson,
  blankQuestion,
  classLabel,
  cleanLesson,
  lessonErrors,
  lessonReport,
  mcqChoices,
  numberQuestions,
  phaseTotal,
  phasesFromMinutes,
  splitPeriod,
  worksheetErrors,
  worksheetOf,
  type Lesson,
} from './lesson-plan';
import { reportToCsv } from './report';

const clone = (l: Lesson): Lesson => JSON.parse(JSON.stringify(l));
const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);

describe('splitPeriod', () => {
  it('splits a period in the default proportion', () => {
    expect(splitPeriod(40)).toEqual({ warmup: 4, teaching: 16, practice: 14, review: 6 });
    expect(splitPeriod(100)).toEqual(PHASE_PARTS);
  });
  it('always adds up exactly, with no phase below zero', () => {
    for (let total = 0; total <= LIMITS.maxPeriod; total++) {
      const m = splitPeriod(total);
      expect(sum(m)).toBe(total);
      expect(Object.values(m).every((x) => x >= 0 && Number.isInteger(x))).toBe(true);
    }
  });
  it('keeps the teacher’s own balance when the period changes', () => {
    expect(splitPeriod(60, { warmup: 5, teaching: 15, practice: 15, review: 5 })).toEqual({ warmup: 8, teaching: 22, practice: 23, review: 7 });
    expect(sum(splitPeriod(45, { warmup: 0, teaching: 0, practice: 0, review: 0 }))).toBe(45);
  });
});

describe('balancePhases', () => {
  const phases = phasesFromMinutes(splitPeriod(40));
  it('lets the last phase take up a change', () => {
    const next = balancePhases({ ...phases, teaching: { minutes: '20', activity: 'x' } }, 40, 'teaching');
    expect(next.review.minutes).toBe('2');
    expect(phaseTotal(next)).toBe(40);
  });
  it('moves nothing when it cannot add up, and the error says so', () => {
    const over = balancePhases({ ...phases, teaching: { minutes: '30', activity: '' } }, 40, 'teaching');
    expect(over.review.minutes).toBe('6');
    const l = { ...blankLesson(), className: '5', subject: 'Maths', topic: 'T', objectives: ['o'], phases: over };
    expect(lessonErrors(l)).toEqual(['The timings add up to 54 minutes, but the period is 40. Change them so they add up.']);
    const own = balancePhases({ ...phases, review: { minutes: '9', activity: '' } }, 40, 'review');
    expect(own.review.minutes).toBe('9');
  });
});

describe('lessonErrors', () => {
  it('accepts the example and lists what a blank lesson needs', () => {
    expect(lessonErrors(LESSON_EXAMPLE)).toEqual([]);
    expect(lessonErrors(blankLesson())).toEqual(['Type the class.', 'Type the subject.', 'Type the topic.', 'Write at least one learning objective.']);
  });
  it('checks the period and the minutes', () => {
    const l = clone(LESSON_EXAMPLE);
    l.period = '2';
    l.phases.warmup.minutes = 'four';
    expect(lessonErrors(l)).toEqual([`Period length: a whole number of minutes from ${LIMITS.minPeriod} to ${LIMITS.maxPeriod}.`, 'Warm-up: the minutes must be a whole number.']);
  });
});

describe('questions and the worksheet', () => {
  it('numbers only questions with text, and letters options without gaps', () => {
    const q = { ...blankQuestion('mcq'), text: 'Pick one', options: ['Red', '', 'Blue', 'Green'], answer: '2' };
    expect(mcqChoices(q).map((c) => c.label)).toEqual(['a', 'b', 'c']);
    const items = numberQuestions([blankQuestion(), q, { ...blankQuestion('blank'), text: 'The sky is', answer: 'blue' }]);
    expect(items.map((i) => i.no)).toEqual([1, 2]);
    expect(items[0].options).toEqual([
      { label: 'a', text: 'Red' },
      { label: 'b', text: 'Blue' },
      { label: 'c', text: 'Green' },
    ]);
    expect(items[0].answer).toBe('(b) Blue');
    expect(items[1].text).toBe(`The sky is ${BLANK_LINE}`);
  });
  it('puts the blank where the teacher typed underscores', () => {
    const ws = worksheetOf(LESSON_EXAMPLE);
    expect(ws.title).toBe('Worksheet: Equivalent fractions');
    expect(ws.subtitle).toBe('Class 5 B · Mathematics · 19/10/2026');
    expect(ws.items[0].text).toBe(`1/2 = ${BLANK_LINE}/8`);
    expect(ws.items.map((i) => i.answer)).toEqual(['4', '(a) 4/6', 'Any two, such as 6/8 and 9/12', 'True', 'False']);
  });
  it('needs an answer for every question in the key', () => {
    expect(worksheetErrors(LESSON_EXAMPLE)).toEqual([]);
    expect(worksheetErrors(blankLesson())).toEqual(['Add at least one question for the worksheet.']);
    const l = clone(LESSON_EXAMPLE);
    l.questions = [
      { ...blankQuestion('mcq'), text: 'One option only', options: ['Yes', '', '', ''], answer: '1' },
      { ...blankQuestion('truefalse'), text: 'Sure?' },
      { ...blankQuestion('short'), text: 'Why?' },
    ];
    expect(worksheetErrors(l)).toEqual([
      'Question 1: give at least two options.',
      'Question 1: choose the correct option for the key.',
      'Question 2: choose True or False for the key.',
      'Question 3: type the answer for the key.',
    ]);
  });
});

describe('lessonReport', () => {
  it('lays the plan out with timings that add up to the period', () => {
    const r = lessonReport(LESSON_EXAMPLE);
    expect(r.title).toBe('Lesson plan: Equivalent fractions');
    const timings = r.sections.find((s) => s.kind === 'table' && s.heading === 'Timings');
    expect(timings && timings.kind === 'table' && timings.rows.map((row) => row.slice(0, 3))).toEqual([
      ['Warm-up', '4', '0–4 min'],
      ['Teaching', '16', '4–20 min'],
      ['Practice', '14', '20–34 min'],
      ['Review', '6', '34–40 min'],
    ]);
    const checks = r.sections.find((s) => s.kind === 'table' && s.heading === 'Checks for understanding');
    expect(checks && checks.kind === 'table' && checks.rows[1]).toEqual(['2', 'Multiple choice', 'Which fraction is equal to 2/3?  (a) 4/6  (b) 3/4  (c) 2/6  (d) 3/5', '(a) 4/6']);
    expect(reportToCsv(r)).toContain('Homework');
  });
  it('writes "Class" once', () => {
    expect(classLabel('6')).toBe('Class 6');
    expect(classLabel('Class 6')).toBe('Class 6');
    expect(classLabel('Grade 4')).toBe('Grade 4');
  });
});

describe('cleanLesson', () => {
  it('keeps a saved lesson as it was', () => {
    expect(cleanLesson(JSON.parse(JSON.stringify(LESSON_EXAMPLE)))).toEqual(LESSON_EXAMPLE);
  });
  it('drops anything unknown, cuts long text and falls back to a blank lesson', () => {
    expect(cleanLesson(null)).toEqual(blankLesson());
    const l = cleanLesson({ topic: 'x'.repeat(500), date: '2026-02-30', studentName: 'never', questions: [{ type: 'essay', text: 'Q', options: ['a', 7] }], objectives: ['1', '2', '3', '4'] });
    expect(l.topic).toHaveLength(90);
    expect(l.date).toBe('');
    expect(l).not.toHaveProperty('studentName');
    expect(l.questions).toEqual([{ type: 'short', text: 'Q', options: ['a', '', '', ''], answer: '' }]);
    expect(l.objectives).toHaveLength(LIMITS.objectives);
  });
});
