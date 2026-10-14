import { describe, expect, it } from 'vitest';
import { teacherRegisterExample } from '@/demo-fixture/teacher-qualification-register-example';
import { readDeviceList, writeDeviceList } from './device-list';
import type { KeyValueStore } from './school-profile';
import { dateOf } from './student-data-check';
import {
  REGISTER_KEY,
  REGISTER_SLUG,
  TEACHER_TEMPLATE_CSV,
  blankTeacher,
  buildRegister,
  checkTeacher,
  cleanRegisterSettings,
  cleanTeacher,
  defaultRegisterSettings,
  expiryStatus,
  readRegisterSettings,
  readStage,
  readTetPaper,
  readTetType,
  saveRegisterSettings,
  teachersFromCsv,
  teachersToCsv,
  type RegisterSettings,
  type Teacher,
} from './teacher-register';

const TODAY = { y: 2026, m: 10, d: 14 };
const rules = defaultRegisterSettings();
const teacher = (p: Partial<Teacher>): Teacher => ({ ...blankTeacher(), name: 'T', ...p });

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

describe('teacher register: rules', () => {
  it('starts with TET needed for Primary and Upper primary only, and nothing else', () => {
    expect(Object.entries(rules.rules).map(([k, r]) => [k, r.tet, r.degree, r.professional, r.pg])).toEqual([
      ['pre', false, false, false, false],
      ['primary', true, false, false, false],
      ['upper', true, false, false, false],
      ['secondary', false, false, false, false],
      ['senior', false, false, false, false],
    ]);
    expect(rules.window).toBe(90);
  });
  it('flags each requirement the stage needs and the teacher lacks', () => {
    const s: RegisterSettings = cleanRegisterSettings({ rules: { secondary: { degree: true, professional: true, pg: true, tet: true } }, window: 60 });
    expect(checkTeacher(teacher({ stage: 'secondary', degree: 'none', pg: '-', professional: '' }), s, TODAY).gaps).toEqual([
      'No degree recorded',
      'No postgraduate degree recorded',
      'No professional qualification recorded',
      'No TET recorded',
    ]);
    expect(checkTeacher(teacher({ stage: 'secondary', degree: 'B.A.', pg: 'M.A.', professional: 'B.Ed', tetType: 'State TET' }), s, TODAY).gaps).toEqual([]);
    expect(checkTeacher(teacher({ stage: '' }), rules, TODAY).gaps).toEqual(['Stage not chosen']);
  });
  it('flags a CTET paper that does not cover the stage', () => {
    const gaps = (stage: Teacher['stage'], tetPaper: Teacher['tetPaper']) => checkTeacher(teacher({ stage, tetType: 'CTET', tetPaper }), rules, TODAY).gaps;
    expect(gaps('primary', 'I')).toEqual([]);
    expect(gaps('primary', 'both')).toEqual([]);
    expect(gaps('primary', 'II')).toEqual(['CTET paper II does not cover classes I to V (paper I does)']);
    expect(gaps('upper', 'II')).toEqual([]);
    expect(gaps('upper', 'I')).toEqual(['CTET paper I does not cover classes VI to VIII (paper II does)']);
    expect(gaps('upper', '')).toEqual(['CTET paper not recorded']);
    expect(gaps('secondary', 'I')).toEqual([]);
    expect(checkTeacher(teacher({ stage: 'upper', tetType: 'State TET', tetPaper: 'I' }), rules, TODAY).gaps).toEqual([]);
  });
});

describe('teacher register: expiries', () => {
  it('lists dates inside the window or already passed', () => {
    const c = checkTeacher(teacher({ stage: 'primary', tetType: 'CTET', tetPaper: 'I', tetValidUntil: '2026-12-01', other: 'Approval', otherValidUntil: '2026-10-01' }), rules, TODAY);
    expect(c.expiries.map((e) => [e.item, e.days])).toEqual([
      ['CTET certificate', 48],
      ['Approval', -13],
    ]);
    const narrow = { ...rules, window: 30 as const };
    expect(checkTeacher(teacher({ otherValidUntil: '2026-12-01' }), narrow, TODAY).expiries).toEqual([]);
    expect(checkTeacher(teacher({ otherValidUntil: '2026-11-13' }), narrow, TODAY).expiries[0]).toMatchObject({ item: 'Other approval', days: 30 });
  });
  it('words the status plainly', () => {
    expect([-2, -1, 0, 1, 5].map(expiryStatus)).toEqual(['Passed 2 days ago', 'Passed 1 day ago', 'Ends today', '1 day left', '5 days left']);
  });
});

describe('teacher register: report', () => {
  it('puts gaps and expiries before the register', () => {
    const r = buildRegister(teacherRegisterExample(), rules, dateOf(new Date()));
    expect(r.errors).toEqual([]);
    const headings = r.report!.sections.map((s) => s.heading ?? '');
    expect(headings).toEqual(['', 'Gaps, teacher by teacher', 'Ending within 90 days or already passed', 'Register', 'Rules used for each stage']);
    const gaps = r.report!.sections[1];
    expect(gaps.kind === 'table' && gaps.rows.map((row) => row[0])).toEqual(['Carol D’Souza', 'Deepak Rawat']);
    const ending = r.report!.sections[2];
    expect(ending.kind === 'table' && ending.rows.map((row) => row[0])).toEqual(['Harpreet Kaur', 'Gopal Iyer', 'Imran Sheikh']);
    expect(r.report!.assumptions[0]).toContain('TET starts marked as needed for classes I to VIII, as the NCTE requires under the RTE Act.');
  });
  it('asks for names and shows nothing for an empty list', () => {
    expect(buildRegister([teacher({ name: '', stage: 'primary' })], rules, TODAY).errors).toEqual(['Add the name of the teacher in row 1.']);
    expect(buildRegister([blankTeacher()], rules, TODAY)).toMatchObject({ errors: [], report: null });
  });
});

describe('teacher register: storage and CSV', () => {
  it('saves only the rules and window, cleaned, and fails soft', () => {
    const store = memoryStore();
    expect(readRegisterSettings(store)).toEqual(defaultRegisterSettings());
    const s = cleanRegisterSettings({ rules: { pre: { degree: true } }, window: 30 });
    expect(saveRegisterSettings(s, store)).toBe(true);
    expect(readRegisterSettings(store)).toEqual(s);
    store.data.set(REGISTER_KEY, JSON.stringify({ rules: { pre: { degree: 'yes' } }, window: 45, teachers: [{ name: 'X' }] }));
    expect(readRegisterSettings(store)).toEqual(defaultRegisterSettings());
    store.data.set(REGISTER_KEY, '{');
    expect(readRegisterSettings(store)).toEqual(defaultRegisterSettings());
    expect(saveRegisterSettings(s, null)).toBe(false);
  });
  it('keeps the opt-in list only through cleanTeacher', () => {
    const store = memoryStore();
    writeDeviceList(REGISTER_SLUG, [teacher({ stage: 'upper', tetType: 'CTET', tetPaper: 'II', tetDate: '2019-08-16' })], store);
    expect(readDeviceList(REGISTER_SLUG, cleanTeacher, store)).toEqual([teacher({ stage: 'upper', tetType: 'CTET', tetPaper: 'II', tetDate: '2019-08-16' })]);
    expect(cleanTeacher({ name: 'X', stage: 'admin', tetType: 'X', tetDate: '16-08-2019', extra: 1 })).toEqual({ ...blankTeacher(), name: 'X' });
    expect(cleanTeacher('X')).toBeNull();
  });
  it('round-trips teachers through CSV', () => {
    const list = teacherRegisterExample();
    const back = teachersFromCsv(teachersToCsv(list));
    expect(back.teachers).toEqual(list);
    expect(back.unreadableDates).toBe(0);
    expect(TEACHER_TEMPLATE_CSV.split(',')[0]).toBe('name');
  });
  it('reads stages, TET types and papers written in the usual ways', () => {
    expect(['Pre-primary', 'primary', 'Upper Primary (VI–VIII)', 'Secondary', 'Senior secondary', 'Higher secondary', 'Admin'].map(readStage)).toEqual(['pre', 'primary', 'upper', 'secondary', 'senior', 'senior', '']);
    expect(['CTET', 'ctet', 'State TET', 'HTET', 'none', ''].map(readTetType)).toEqual(['CTET', 'CTET', 'State TET', 'State TET', '', '']);
    expect(['I', 'Paper 1', 'II', '2', 'both', 'I and II', 'x'].map(readTetPaper)).toEqual(['I', 'I', 'II', 'II', 'both', 'both', '']);
    const r = teachersFromCsv('Name,Stage,TET certificate date\nA,Nursery,2019\n');
    expect(r).toMatchObject({ unreadableDates: 1, unknownStages: 1 });
    expect(teachersFromCsv('stage\nprimary\n').error).toContain('name column');
  });
});
