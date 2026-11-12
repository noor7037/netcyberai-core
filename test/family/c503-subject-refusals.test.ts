import { describe, expect, it } from 'vitest';
import { RESOLVER_PROMPTS, resolverPrompt } from '@/lib/ai/prompts/family.resolver';
import { nearSubject, stageSubjects } from '@/lib/family/subjects';

// C503: the tutor refused learning questions as "not your subject". The class list and the prompt both failed closed.
describe('a named subject the class does not list is taught as the nearest one (C503)', () => {
  it('Science in Class 4 is EVS; EVS in Class 8 is Science; Physics in CBSE Class 10 is Science', () => {
    expect(nearSubject('science', stageSubjects(4))).toBe('evs');
    expect(nearSubject('evs', stageSubjects(8))).toBe('science');
    expect(nearSubject('physics', stageSubjects(10, 'CBSE'))).toBe('science');
    expect(nearSubject('history', stageSubjects(7))).toBe('social_science');
  });
  it('the open tab wins inside a family, and stands in when the class has none of it', () => {
    expect(nearSubject('science', stageSubjects(10, 'CISCE'), 'chemistry')).toBe('chemistry');
    expect(nearSubject('science', stageSubjects(10, 'CISCE'))).toBe('physics');
    expect(nearSubject('evs', stageSubjects(2), 'english')).toBe('english');
    expect(nearSubject('evs', stageSubjects(2))).toBeNull();
  });
  it('a listed subject is itself', () => {
    expect(nearSubject('mathematics', stageSubjects(10), 'science')).toBe('mathematics');
  });
});

describe('prompt v14 (C503)', () => {
  const ask = { board: 'CBSE', classLevel: 4, subject: null, openSubjects: ['mathematics', 'evs'], classSubjects: ['mathematics', 'evs', 'english', 'hindi'], chapter: null, topic: null, style: 'en', question: 'why do plants need water', tab: 'evs' } as never;
  const v14 = resolverPrompt('v14', true);
  const v13 = resolverPrompt('v13', true);
  it('is registered and Control can choose it by name', () => {
    expect(RESOLVER_PROMPTS.map((p) => p.version)).toContain('v14');
    expect(v14.version).toBe('v14');
  });
  it('names the open tab and asks for the nearest subject, where v13 decided alone and wrote nothing', () => {
    const s13 = v13.system(ask);
    const s14 = v14.system(ask);
    expect(s13).toContain('decided from the question alone');
    expect(s13).toContain('write only the subject line and nothing else. Otherwise');
    expect(s14).not.toContain('decided from the question alone');
    expect(s14).toContain('the subject the student has open (evs)');
    expect(s14).toContain('NEAREST subject on the list');
  });
  it('teaches a curious question; v13 refused what was not school study', () => {
    expect(v13.user(ask)).toContain('If it is not about school study');
    expect(v14.user(ask)).not.toContain('If it is not about school study');
    expect(v14.user(ask)).toContain('Teach anything a student can learn from');
  });
  it('ignores a tab the class does not have', () => {
    expect(v14.system({ ...(ask as object), tab: 'physics' } as never)).not.toContain('has open');
  });
});
