import { describe, expect, it } from 'vitest';
import type { ModuleSettingsSchema } from '@/lib/contracts/settings';
import { applySettingsUpdate, effectiveValues, schemaProblems } from '@/lib/frameworks/settings-engine';
import { assignedMap, notAssigned, notAssignedIn, parseTimetableCsv, planImport, type Lookups } from '@/lib/timetable/plan';

// The rules of docs/28 slice 10g (C231) with no database in them: who teaches what, as the timetable reads it, and a
// setting with no default, as the settings framework now allows one.

describe('who teaches what, as the timetable reads it', () => {
  it('a class and subject with assignments take only those teachers; with none, anyone', () => {
    expect(notAssigned([], 't1')).toBe(false);
    expect(notAssigned(['t1'], 't1')).toBe(false);
    expect(notAssigned(['t1', 't2'], 't2')).toBe(false);
    expect(notAssigned(['t1'], 't2')).toBe(true);
    const map = assignedMap([
      { classId: 'c5', subjectId: 'maths', teacherUserId: 't1' },
      { classId: 'c5', subjectId: 'maths', teacherUserId: 't2' },
      { classId: 'c6', subjectId: 'hindi', teacherUserId: 't3' },
    ]);
    expect(notAssignedIn(map, { classId: 'c5', subjectId: 'maths', teacherUserId: 't2' })).toBe(false);
    expect(notAssignedIn(map, { classId: 'c5', subjectId: 'maths', teacherUserId: 't3' })).toBe(true);
    expect(notAssignedIn(map, { classId: 'c5', subjectId: 'hindi', teacherUserId: 't3' })).toBe(false);
  });

  it('a CSV line whose teacher is not assigned is a problem of its own line; nothing is imported', () => {
    const lookups: Lookups = { classes: new Map([['5-a', 'c5']]), subjects: new Map([['maths', 'maths'], ['hindi', 'hindi']]), teachers: new Map([['t1@a.invalid', 't1'], ['t2@a.invalid', 't2']]) };
    const csv = 'class,day,period,subject,teacher\n5-A,MON,1,Maths,t1@a.invalid\n5-A,MON,2,Maths,t2@a.invalid\n5-A,MON,3,Hindi,t2@a.invalid\n';
    const assigned = assignedMap([{ classId: 'c5', subjectId: 'maths', teacherUserId: 't1' }]);
    expect(planImport([], parseTimetableCsv(csv).rows, lookups, 8, assigned)).toEqual({ ok: false, problems: [{ line: 3, code: 'not_assigned', value: 't2@a.invalid' }] });
    // With no assignments given, as before C231.
    expect(planImport([], parseTimetableCsv(csv).rows, lookups, 8)).toMatchObject({ ok: true });
  });
});

describe('a setting with no default', () => {
  const schema: ModuleSettingsSchema = {
    moduleId: 'timetable',
    version: 1,
    fields: [
      { key: 'limit', label: 'Limit', section: 'S', type: 'number', default: null, min: 1, max: 12, required: true, editableBy: ['principal'] },
      { key: 'days', label: 'Days', section: 'S', type: 'number', default: 8, min: 1, max: 12, editableBy: ['principal'] },
    ],
    // A rule between fields sees only what is set.
    check: (v) => (typeof v.limit === 'number' && typeof v.days === 'number' && v.limit > v.days ? [{ key: 'limit', message: 'cannot be more than days' }] : []),
  };

  it('is a valid schema; not set, it is absent from the values in force: nothing stands in for it', () => {
    expect(schemaProblems(schema)).toEqual([]);
    expect(effectiveValues(schema, {})).toEqual({ days: 8 });
    expect('limit' in effectiveValues(schema, {})).toBe(false);
    expect(effectiveValues(schema, { limit: 99 })).toEqual({ days: 8 }); // not a valid value: still not set
    expect(effectiveValues(schema, { limit: 4 })).toEqual({ limit: 4, days: 8 });
  });

  it('is set and changed, checked against the other fields, and never reset', () => {
    expect(applySettingsUpdate(schema, {}, { set: { limit: 4 } }, 'principal')).toEqual({ ok: true, values: { limit: 4 }, changes: [{ key: 'limit', from: null, to: 4 }] });
    expect(applySettingsUpdate(schema, { limit: 4 }, { set: { limit: 6 } }, 'principal')).toMatchObject({ ok: true, values: { limit: 6 } });
    expect(applySettingsUpdate(schema, { limit: 4 }, { set: { days: 3 } }, 'principal')).toMatchObject({ ok: false, reason: 'invalid', errors: [{ key: 'limit' }] });
    expect(applySettingsUpdate(schema, {}, { set: { days: 3 } }, 'principal')).toMatchObject({ ok: true, values: { days: 3 } });
    expect(applySettingsUpdate(schema, { limit: 4 }, { resetToDefault: ['limit'] }, 'principal')).toMatchObject({ ok: false, reason: 'invalid', errors: [{ key: 'limit', message: 'has no default: choose another value instead' }] });
    // An unknown key in a reset is still refused as before, not a crash.
    expect(applySettingsUpdate(schema, {}, { resetToDefault: ['nope'] }, 'principal')).toMatchObject({ ok: false, reason: 'invalid', errors: [{ key: 'nope' }] });
  });
});
