import { describe, expect, it } from 'vitest';
import { SUBJECT_IDS, isSubject, stageSubjects, subjectsOfClass } from '@/lib/family/subjects';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';

// Wave A step 2a (C264): a child studies the subjects of their class. Each stage has its school subjects; the catalog
// adds any other known subject it holds for the class; Nursery to UKG have none (their module is Wave B).
describe('the subjects of a class', () => {
  it('follows the stages: 1–2, 3–5, 6–10, 11–12; none before Class 1', () => {
    expect(stageSubjects(-1)).toEqual([]);
    expect(stageSubjects(1)).toEqual(['mathematics', 'english', 'hindi']);
    expect(stageSubjects(4)).toEqual(['mathematics', 'evs', 'english', 'hindi']);
    expect(stageSubjects(8)).toEqual(['mathematics', 'science', 'social_science', 'english', 'hindi']);
    expect(stageSubjects(12)).toContain('physics');
  });

  it('adds the catalog’s other known subjects after the stage’s, and ignores anything unknown', () => {
    expect(subjectsOfClass(9, ['science', 'sanskrit', 'astrology'])).toEqual(['mathematics', 'science', 'social_science', 'english', 'hindi', 'sanskrit']);
    expect(subjectsOfClass(0, ['mathematics'])).toEqual([]);
    expect(isSubject('astrology')).toBe(false);
  });

  it('every subject has its name in English and Hindi', () => {
    for (const id of SUBJECT_IDS) {
      expect((en as Record<string, string>)[`fam.subject.${id}`], id).toBeTruthy();
      expect((hi as Record<string, string>)[`fam.subject.${id}`], id).toMatch(/[ऀ-ॿ]/);
    }
  });
});
