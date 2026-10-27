import { describe, expect, it } from 'vitest';
import { CHILD_CLASSES, checkChild } from '@/lib/family/children';
import { subjectAccess } from '@/lib/family/modules';
import { STUDY_STATUS_KEY, subjectStatus } from '@/lib/family/study-status';
import { STREAMS, stageSubjects, subjectsOfClass } from '@/lib/family/subjects';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// S4 (C377): Nursery to Class 12, streams for Classes 11 and 12, boards from the database, honest status badges, and
// the first-subject-free rule unchanged.
const base = { firstName: 'Asha', classLevel: 11, board: 'CBSE', language: 'en', style: 'en', stateCode: 'IN-UP' };

describe('streams for Classes 11 and 12', () => {
  it('every class from Nursery to 12 is offered', () => {
    expect([...CHILD_CLASSES]).toEqual([-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('a stream narrows the subjects; none chosen keeps the whole stage', () => {
    expect(stageSubjects(11, 'CBSE', 'science')).toEqual(['mathematics', 'physics', 'chemistry', 'biology', 'english', 'hindi']);
    expect(stageSubjects(12, 'CBSE', 'commerce')).toEqual(['mathematics', 'accountancy', 'business_studies', 'economics', 'english', 'hindi']);
    expect(stageSubjects(12, 'CBSE', 'humanities')).toEqual(['economics', 'history', 'geography', 'political_science', 'english', 'hindi']);
    expect(stageSubjects(11)).toEqual(stageSubjects(11, 'CBSE', null));
    expect(stageSubjects(11)).toHaveLength(12);
    // A class below 11 ignores a stream.
    expect(stageSubjects(9, 'CBSE', 'science')).toEqual(stageSubjects(9));
  });

  it('another stream’s catalog subjects are not added back, other subjects are', () => {
    const got = subjectsOfClass(11, ['accountancy', 'physics', 'sanskrit'], 'CBSE', 'science');
    expect(got).not.toContain('accountancy');
    expect(got).toContain('sanskrit');
  });

  it('checkChild keeps a stream only for Classes 11 and 12 and rejects an unknown one', () => {
    for (const s of STREAMS) expect(checkChild({ ...base, stream: s })).toMatchObject({ ok: true, child: { stream: s } });
    expect(checkChild({ ...base })).toMatchObject({ ok: true, child: { stream: null } });
    expect(checkChild({ ...base, classLevel: 9, stream: 'science' })).toMatchObject({ ok: true, child: { stream: null } });
    expect(checkChild({ ...base, stream: 'arts' })).toEqual({ ok: false, problems: ['stream'] });
  });

  it('boards: the built-in list by default, a given list, or any well-formed id when the caller checks the database', () => {
    expect(checkChild({ ...base, board: 'ICSE' })).toEqual({ ok: false, problems: ['board'] });
    expect(checkChild({ ...base, board: 'ICSE' }, ['ICSE'])).toMatchObject({ ok: true });
    expect(checkChild({ ...base, board: 'MH-HSC' }, 'shape')).toMatchObject({ ok: true });
    expect(checkChild({ ...base, board: 'drop table' }, 'shape')).toEqual({ ok: false, problems: ['board'] });
  });
});

describe('the first subject is free (unchanged)', () => {
  it('a child who has not chosen can open any subject; once chosen only that one, unless Control opens others', () => {
    expect(subjectAccess({ freeSubject: null }, 'physics')).toEqual({ subject: 'physics', open: true, isFree: false });
    expect(subjectAccess({ freeSubject: 'mathematics' }, 'mathematics')).toEqual({ subject: 'mathematics', open: true, isFree: true });
    expect(subjectAccess({ freeSubject: 'mathematics' }, 'physics')).toEqual({ subject: 'physics', open: false, isFree: false });
    expect(subjectAccess({ freeSubject: 'mathematics' }, 'physics', ['physics']).open).toBe(true);
  });
});

describe('status badges are derived, never invented', () => {
  it('Published only for a subject with a released version; nothing otherwise', () => {
    expect(subjectStatus('physics', ['physics'])).toBe('published');
    expect(subjectStatus('chemistry', ['physics'])).toBeNull();
    expect(subjectStatus('chemistry', [], 'digitizing')).toBe('digitizing');
  });

  it('the status and stream words exist in English and Hindi, Hindi in Devanagari and different', () => {
    const keys = [...Object.values(STUDY_STATUS_KEY), 'fam.child.stream', 'fam.child.streamPick', 'fam.child.streamHelp', 'fam.err.stream', ...STREAMS.map((s) => `fam.stream.${s}`)];
    for (const k of keys) {
      const e = (en as Record<string, string>)[k];
      const h = (hi as Record<string, string>)[k];
      expect(e, k).toBeTruthy();
      expect(h, k).toMatch(/[ऀ-ॿ]/);
      expect(h, k).not.toBe(e);
    }
  });
});
