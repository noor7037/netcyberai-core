import { describe, expect, it } from 'vitest';
import { basicRowErrors, isRealIsoDate } from './rules';
import { parseCsv, rowsToRecords } from './csv';

describe('student import rules (shared by importer and free checker)', () => {
  it('requires a name', () => {
    expect(basicRowErrors({ name: '  ' })).toEqual(['name is required']);
    expect(basicRowErrors({ name: 'Aarav Sharma' })).toEqual([]);
  });
  it('rejects wrong date formats', () => {
    expect(basicRowErrors({ name: 'A', dob: '23/04/2015' })).toEqual(['dob must be in YYYY-MM-DD format']);
  });
  it('rejects impossible calendar dates that Postgres would refuse mid-batch', () => {
    expect(isRealIsoDate('2015-02-30')).toBe(false);
    expect(basicRowErrors({ name: 'A', dob: '2015-02-30' })).toEqual(['dob is not a real calendar date']);
    expect(isRealIsoDate('2016-02-29')).toBe(true);
  });
  it('treats blank optional fields as absent', () => {
    expect(basicRowErrors({ name: 'A', dob: '' })).toEqual([]);
  });
  it('normalises header names the same way as the importer', () => {
    const recs = rowsToRecords(parseCsv('Name, Admission No ,DOB\nAarav,A-101,2015-04-23\n'));
    expect(recs[0]).toEqual({ name: 'Aarav', admission_no: 'A-101', dob: '2015-04-23' });
  });
});
