import { describe, expect, it } from 'vitest';
import { markPrompt } from '@/lib/ai/prompts/exams.mark';
import { stepsPrompt } from '@/lib/ai/prompts/exams.steps';
import { checkReasonOf, checksOf, markChecks } from '@/lib/marking/check';
import { needsSteps } from '@/lib/marking/question-form';
import { parseSuggestedSteps } from '@/lib/marking/steps';

// W14-C (the founder's live test of 31 Oct, DAV Agra 6-A): marking prompt v2, the check of the AI's marks against its
// own words, and the marking steps suggested for the setup form. Pure; the database side is in pipeline-db.test.ts.

const ask = {
  grade: '6',
  subject: 'Mathematics',
  language: 'en' as const,
  guidance: '',
  questions: [{ label: '1', maxMarks: 2, kind: 'numerical' as const, prompt: 'Solve 5x = 25.', answerKey: 'x = 5', steps: [], chapter: null, topic: null }],
  topics: [],
  pages: 1,
};
const q = (over: Partial<Parameters<typeof markChecks>[0] & object> = {}) => ({ attempted: true, marks: 1, steps: [], reason: '"x = 5" Correct value of x.', confidence: 0.8, ...over });

describe('prompt v2 (W14-C)', () => {
  it('is the active version, keeps v1’s JSON answer and states the five rules', () => {
    const v2 = markPrompt(null);
    expect(v2.version).toBe('v2');
    const system = v2.system(ask);
    const v1 = markPrompt('v1').system(ask);
    // The same answer schema as v1, so parse.ts and store.ts read both.
    for (const field of ['"questions"', '"attempted"', '"marks"', '"steps"', '"awarded"', '"reason"', '"error_type"', '"confidence"', '"y_from"', '"strengths"', '"practice"']) {
      expect(system).toContain(field);
      expect(v1).toContain(field);
    }
    expect(system).toMatch(/No marking steps given\. A correct final answer earns the question's full marks/);
    expect(system).toMatch(/never "coincidental"/);
    expect(system).toMatch(/the same answer always earns the same marks/);
    expect(system).toMatch(/never against other students' answers/);
    expect(system).toMatch(/marks null and a confidence below 0\.5/);
    expect(system).toMatch(/Begin reason with the exact words and numbers you read/);
    expect(system).toMatch(/the steps awarded add up exactly to marks/);
    expect(system).toContain('"answer_key":"x = 5"');
    expect(system).not.toBe(v1);
  });
});

describe('the AI’s marks checked against its own words (W14-C)', () => {
  it('the founder’s cases: “fully correct” with 0 marks, and sure with no reason', () => {
    expect(markChecks(q({ marks: 0, reason: 'Area = 12 × 7 = 84 sq cm, which is fully correct.' }), 1)).toEqual(['says_right']);
    expect(markChecks(q({ marks: 2, reason: null, confidence: 0.95 }), 2)).toEqual(['no_reason']);
    expect(markChecks(q({ marks: 2, reason: '   ', confidence: 0.9 }), 2)).toEqual(['no_reason']);
  });

  it('full marks while the reason says wrong; marks above the question’s; steps that do not add up', () => {
    expect(markChecks(q({ marks: 2, reason: 'The final answer is wrong.' }), 2)).toEqual(['says_wrong']);
    expect(markChecks(q({ marks: 4, reason: 'Good.' }), 3)).toEqual(['above_max']);
    expect(markChecks(q({ marks: 3, steps: [{ step: 'Set-up', awarded: 2, note: null }] }), 4)).toEqual(['steps_sum']);
    expect(markChecks(q({ marks: 3, steps: [{ step: 'Set-up', awarded: 2, note: null }, { step: 'Answer', awarded: 1.05, note: null }] }), 4)).toEqual([]);
  });

  it('says nothing where marks and words agree, or the words only name the key or are the child’s', () => {
    expect(markChecks(q({ marks: 0, reason: 'The correct answer is 84; the student wrote 48.' }), 1)).toEqual([]);
    expect(markChecks(q({ marks: 0, reason: 'The working is not correct.' }), 1)).toEqual([]);
    expect(markChecks(q({ marks: 0, reason: 'It isn’t fully correct: the unit is missing.' }), 1)).toEqual([]);
    expect(markChecks(q({ marks: 0, reason: '"x = 6 is correct" The value of x is wrong.' }), 2)).toEqual([]);
    expect(markChecks(q({ marks: 2, reason: 'Nothing wrong: full marks.' }), 2)).toEqual([]);
    expect(markChecks(q({ attempted: false, marks: 0, reason: 'Not attempted.', confidence: 0.99 }), 2)).toEqual([]);
    expect(markChecks(q({ attempted: false, marks: 0, reason: null, confidence: 0.99 }), 2)).toEqual([]);
    expect(markChecks(q({ marks: 2, reason: 'Correct; working shown.' }), 2)).toEqual([]);
    expect(markChecks(undefined, 2)).toEqual([]);
  });

  it('is kept as short codes and read back, unknown codes dropped', () => {
    expect(checkReasonOf([])).toBeNull();
    expect(checkReasonOf(['says_right', 'steps_sum'])).toBe('says_right,steps_sum');
    expect(checksOf('says_right,made_up,steps_sum')).toEqual(['says_right', 'steps_sum']);
    expect(checksOf(null)).toEqual([]);
  });
});

describe('marking steps for the setup form (W14-C)', () => {
  it('a numerical or long question with no steps asks for them', () => {
    expect(needsSteps({ kind: 'numerical', steps: [] })).toBe(true);
    expect(needsSteps({ kind: 'long', steps: [] })).toBe(true);
    expect(needsSteps({ kind: 'long', steps: [{ step: 'Point', marks: '1' }] })).toBe(false);
    expect(needsSteps({ kind: 'short', steps: [] })).toBe(false);
    expect(needsSteps({ kind: 'objective', steps: [] })).toBe(false);
  });

  it('the suggestion is read as steps the form takes, never more marks than the question’s', () => {
    const text = '```json\n{"steps": [{"step": "Divide both sides by 5", "marks": 1}, {"step": "x = 5", "marks": 1}, {"step": "Extra", "marks": 1}, {"step": "", "marks": 1}, {"step": "Bad", "marks": 0.25}]}\n```';
    expect(parseSuggestedSteps(text, 2)).toEqual([
      { step: 'Divide both sides by 5', marks: 1 },
      { step: 'x = 5', marks: 1 },
    ]);
    expect(parseSuggestedSteps('I cannot help.', 2)).toEqual([]);
    expect(parseSuggestedSteps('{"steps": "none"}', 2)).toEqual([]);
    expect(parseSuggestedSteps(JSON.stringify({ steps: Array.from({ length: 9 }, (_, i) => ({ step: `S${i}`, marks: 0.5 })) }), 10)).toHaveLength(6);
  });

  it('the prompt carries only the teacher’s question, as data, and asks for JSON', () => {
    const p = stepsPrompt();
    const a = { grade: '6', subject: 'Mathematics', kind: 'numerical' as const, maxMarks: 2, prompt: 'Solve 5x = 25.', answerKey: 'x = 5' };
    expect(p.version).toBe('v1');
    expect(p.system(a)).toContain('worth 2 marks');
    expect(p.system(a)).toContain('{"steps": [{"step": "...", "marks": 1}]}');
    expect(JSON.parse(p.user(a))).toEqual({ question: 'Solve 5x = 25.', answer_key: 'x = 5' });
  });
});
