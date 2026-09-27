import { describe, expect, it } from 'vitest';
import { calculateAttendance } from './attendance';
import { checkImportCsv } from './import-check';

describe('attendance calculator', () => {
  it('finds the exact consecutive days needed', () => {
    // 60 of 100 days, target 75: (60+x)/(100+x) >= 0.75 gives x >= 60
    const r = calculateAttendance({ attended: 60, total: 100, targetPercent: 75 });
    expect(r).toMatchObject({ ok: true, currentPercent: 60, meetsTarget: false, daysNeeded: 60, canMiss: 0 });
  });
  it('counts exactly-on-target as meeting it, with nothing to spare', () => {
    expect(calculateAttendance({ attended: 75, total: 100, targetPercent: 75 })).toMatchObject({ meetsTarget: true, daysNeeded: 0, canMiss: 0 });
  });
  it('finds how many days can still be missed', () => {
    // 90 of 100 days, target 75: 90/(100+y) >= 0.75 gives y <= 20
    expect(calculateAttendance({ attended: 90, total: 100, targetPercent: 75 })).toMatchObject({ canMiss: 20 });
  });
  it('rejects impossible input with a message', () => {
    expect(calculateAttendance({ attended: 110, total: 100, targetPercent: 75 }).ok).toBe(false);
    expect(calculateAttendance({ attended: 5, total: 0, targetPercent: 75 }).ok).toBe(false);
    expect(calculateAttendance({ attended: 5, total: 10, targetPercent: 100 }).ok).toBe(false);
  });
});

describe('import checker', () => {
  it('reports missing names, bad dates, duplicates, unknown columns and classes', () => {
    const csv = 'Name,Admission No,Class Name,DOB,Mother\nAarav,A1,5A,2015-04-23,x\n,A2,5A,2015-13-01,y\nRiya,A1,6B,23/4/2015,z\n';
    const r = checkImportCsv(csv);
    expect(r.rowCount).toBe(3);
    expect(r.okRows).toBe(1);
    expect(r.unknownColumns).toEqual(['mother']);
    expect(r.missingRequired).toEqual([]);
    expect(r.duplicateAdmissionNos).toEqual([{ admissionNo: 'A1', rows: [1, 3] }]);
    expect(r.classNames).toEqual([{ name: '5A', count: 2 }, { name: '6B', count: 1 }]);
    expect(r.rowIssues.map((i) => i.row)).toEqual([2, 3]);
  });
  it('flags a missing name column', () => {
    expect(checkImportCsv('admission_no\nA1\n').missingRequired).toEqual(['name']);
  });
});
