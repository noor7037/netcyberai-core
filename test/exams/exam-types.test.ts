import { describe, expect, it } from 'vitest';
import { DEFAULT_EXAM_TYPES } from '@/lib/contracts/exam-types';
import { cleanExamTypes, examTypeName } from '@/lib/exams/exam-types';

// The school's exam types (C230-AJ part 2, C357), as they are used: always safe, "other" always there.
describe('exam types', () => {
  it('the defaults, as set', () => {
    expect(cleanExamTypes(null).map((t) => t.key)).toEqual(DEFAULT_EXAM_TYPES.map((t) => t.key));
  });
  it('a bad key, a second row with the same key and a row with no name are left out; "other" always stays, shown', () => {
    const got = cleanExamTypes([
      { key: 'unit', en: 'Class test', hi: '', hidden: false },
      { key: 'unit', en: 'Twice', hi: 'दो बार', hidden: false },
      { key: 'Bad Key', en: 'Bad', hi: 'ख़राब', hidden: false },
      { key: 'quiz', en: '', hi: '', hidden: false },
      { key: 'other', en: 'Other', hi: 'अन्य', hidden: true },
    ]);
    expect(got).toEqual([
      { key: 'unit', en: 'Class test', hi: 'Class test', hidden: false },
      { key: 'other', en: 'Other', hi: 'अन्य', hidden: false },
    ]);
    expect(cleanExamTypes([{ key: 'unit', en: 'Unit', hi: 'इकाई', hidden: false }]).map((t) => t.key)).toEqual(['unit', 'other']);
  });
  it('a key no longer in the list reads as "other"', () => {
    const types = cleanExamTypes(null);
    expect(examTypeName(types, 'half_yearly', 'hi')).toBe('अर्धवार्षिक परीक्षा');
    expect(examTypeName(types, 'gone', 'en')).toBe('Other');
  });
});
