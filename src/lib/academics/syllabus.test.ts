import { describe, expect, it } from 'vitest';
import { parseSubjectName, parseSyllabusInput, todayInIndia } from './syllabus';

const C = '11111111-1111-4111-8111-111111111111';
const S = '22222222-2222-4222-8222-222222222222';
const today = '2026-09-27';

describe('syllabus input', () => {
  it('accepts a minimal valid lesson and defaults status and date', () => {
    const r = parseSyllabusInput({ classId: C, subjectId: S, topic: '  Fractions   comparing ' }, today);
    expect(r).toEqual({ ok: true, value: { classId: C, subjectId: S, topic: 'Fractions comparing', status: 'taught', date: today, teacherId: null } });
  });
  it('rejects unknown status, missing ids and empty topics', () => {
    expect(parseSyllabusInput({ classId: C, subjectId: S, topic: 'x', status: 'done' }, today).ok).toBe(false);
    expect(parseSyllabusInput({ classId: 'nope', subjectId: S, topic: 'x' }, today).ok).toBe(false);
    expect(parseSyllabusInput({ classId: C, subjectId: S, topic: '   ' }, today).ok).toBe(false);
  });
  it('rejects future dates, impossible dates and entries older than the backdate window', () => {
    expect(parseSyllabusInput({ classId: C, subjectId: S, topic: 'x', date: '2026-09-28' }, today)).toMatchObject({ ok: false, error: 'date cannot be in the future' });
    expect(parseSyllabusInput({ classId: C, subjectId: S, topic: 'x', date: '2026-02-30' }, today).ok).toBe(false);
    expect(parseSyllabusInput({ classId: C, subjectId: S, topic: 'x', date: '2026-09-19' }, today).ok).toBe(false);
    expect(parseSyllabusInput({ classId: C, subjectId: S, topic: 'x', date: '2026-09-20' }, today).ok).toBe(true);
  });
  it('accepts not_taught, the state that suppresses a Pulse line', () => {
    expect(parseSyllabusInput({ classId: C, subjectId: S, topic: 'Holiday', status: 'not_taught' }, today)).toMatchObject({ ok: true });
  });
});

describe('subject name', () => {
  it('normalises whitespace and rejects empty or long names', () => {
    expect(parseSubjectName({ name: '  Social   Studies ' })).toEqual({ ok: true, value: 'Social Studies' });
    expect(parseSubjectName({ name: '' }).ok).toBe(false);
    expect(parseSubjectName({ name: 'x'.repeat(81) }).ok).toBe(false);
  });
});

describe('todayInIndia', () => {
  it('uses the India calendar day, not UTC', () => {
    // 20:00 UTC on the 26th is 01:30 IST on the 27th.
    expect(todayInIndia(new Date('2026-09-26T20:00:00Z'))).toBe('2026-09-27');
  });
});
