import { describe, expect, it } from 'vitest';
import { STUDENT_DATA_CHECK_EXAMPLE_CSV } from '@/demo-fixture/student-data-check-example';
import {
  SDC_TEMPLATE_CSV,
  checkStudents,
  compareDob,
  compareGender,
  compareName,
  countChecks,
  correctionLetter,
  dataCheckReport,
  editDistance,
  lettersFor,
  looksLikeAadhaarNumber,
  mismatchClasses,
  mismatchRows,
  mismatchesCsv,
  parseStudentList,
  readDate,
  studentsToCsv,
  studentsWithMismatch,
} from './student-data-check';

const HEAD = 'admission_no,class,name_in_school,dob_in_school,gender_in_school,name_in_aadhaar,dob_in_aadhaar,gender_in_aadhaar';

describe('student data check: names', () => {
  it('separates exact, spacing or capitals, order, initials and short forms', () => {
    expect(compareName('Aarav Sharma', 'Aarav Sharma')).toBe('exact');
    expect(compareName(' Aarav Sharma ', 'Aarav Sharma')).toBe('exact');
    expect(compareName('AARAV  SHARMA', 'Aarav Sharma')).toBe('format');
    expect(compareName('AaravSharma', 'Aarav Sharma')).toBe('format');
    expect(compareName('A.Sharma', 'A Sharma')).toBe('format');
    expect(compareName('Sharma Aarav', 'Aarav Sharma')).toBe('order');
    expect(compareName('R Kumar Verma', 'Ravi Kumar Verma')).toBe('order');
    expect(compareName('Ravi Kumar Verma', 'R. K. Verma')).toBe('order');
    expect(compareName('Md Arif', 'Mohammed Arif')).toBe('order');
    expect(compareName('Mohd. Arif', 'Mohammad Arif')).toBe('order');
    expect(compareName('Ravi Kr Verma', 'Ravi Kumar Verma')).toBe('order');
  });
  it('calls one or two changed letters a likely slip only on names longer than three letters', () => {
    expect(compareName('Aarav Sharma', 'Arav Sharma')).toBe('spelling');
    expect(compareName('Priya Sharma', 'Pirya Sharma')).toBe('spelling');
    expect(compareName('Sharma Arav', 'Aarav Sharma')).toBe('spelling');
    expect(compareName('Mohd Arif', 'Mohammed Aarif')).toBe('spelling');
    expect(compareName('Ram', 'Raj')).toBe('different');
    expect(compareName('Aarav Sharma', 'Kabir Sharma')).toBe('different');
    expect(compareName('Rahul Sharma', 'Rahul Kumar Sharma')).toBe('different');
  });
  it('marks a blank name as missing', () => {
    expect(compareName('', 'Aarav')).toBe('missing');
    expect(compareName('Aarav', '  ')).toBe('missing');
  });
  it('measures edit distance and stops past the limit', () => {
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('a', 'abcdefgh', 2)).toBe(3);
  });
});

describe('student data check: dates of birth', () => {
  it('reads the four accepted formats and rejects others', () => {
    for (const s of ['05-04-2015', '5/4/2015', '05.04.2015', '2015-04-05']) expect(readDate(s), s).toEqual({ y: 2015, m: 4, d: 5 });
    for (const s of ['31-02-2015', '05-04-15', '05/04-2015', '2015/04/05', 'Apr 5 2015', '13-13-2015', '']) expect(readDate(s), s).toBeNull();
    expect(readDate('29-02-2016')).toEqual({ y: 2016, m: 2, d: 29 });
    expect(readDate('29-02-2015')).toBeNull();
  });
  it('finds exact, swapped, different, missing and unreadable', () => {
    expect(compareDob('05-04-2015', '2015-04-05')).toBe('exact');
    expect(compareDob('05-04-2015', '04-05-2015')).toBe('swapped');
    expect(compareDob('05-04-2015', '05-04-2016')).toBe('different');
    expect(compareDob('05-04-2015', '06-04-2015')).toBe('different');
    expect(compareDob('', '05-04-2015')).toBe('missing');
    expect(compareDob('5th April 2015', '05-04-2015')).toBe('unreadable');
  });
});

describe('student data check: gender', () => {
  it('normalises the usual words', () => {
    expect(compareGender('M', 'Male')).toBe('exact');
    expect(compareGender('Boy', 'MALE')).toBe('exact');
    expect(compareGender('Girl', 'F')).toBe('exact');
    expect(compareGender('Other', 'Transgender')).toBe('exact');
    expect(compareGender('T', 't')).toBe('exact');
    expect(compareGender('M', 'Female')).toBe('different');
    expect(compareGender('', 'F')).toBe('missing');
    expect(compareGender('X', 'F')).toBe('missing');
  });
});

describe('student data check: reading the list', () => {
  it('reads the template columns, ignores unknown ones and lists missing ones', () => {
    const r = parseStudentList(`﻿${HEAD},Roll\nADM-1,5A,Aarav,05-04-2015,M,Aarav,05-04-2015,M,7\n\n`);
    expect(r.students).toHaveLength(1);
    expect(r.students[0]).toMatchObject({ admission_no: 'ADM-1', class: '5A', name_in_school: 'Aarav', parent_name: '' });
    expect(r.unknownColumns).toEqual(['Roll']);
    expect(r.missingColumns).toEqual([]);
    expect(parseStudentList('admission_no,class\nA1,5A\n').missingColumns).toContain('name_in_aadhaar');
    expect(parseStudentList('').missingColumns).toHaveLength(8);
  });
  it('accepts headings written with spaces and capitals', () => {
    const r = parseStudentList('Admission No,Class,Name in school,DOB in school,Gender in school,Name in Aadhaar,DOB in Aadhaar,Gender in Aadhaar\nA1,5A,X,01-01-2015,M,X,01-01-2015,M\n');
    expect(r.missingColumns).toEqual([]);
  });
  it('never keeps a column that looks like Aadhaar numbers', () => {
    const csv = `${HEAD},aadhaar\nADM-1,5A,Aarav,05-04-2015,M,Aarav,05-04-2015,M,2345 6789 0123\nA2,5A,Riya,05-04-2015,F,Riya,05-04-2015,F,\n`;
    const r = parseStudentList(csv);
    expect(r.droppedColumns).toEqual(['aadhaar']);
    expect(r.unknownColumns).toEqual([]);
    expect(JSON.stringify(r.students)).not.toContain('2345');
    expect(studentsToCsv(r.students)).not.toContain('2345');
    expect(looksLikeAadhaarNumber('234567890123')).toBe(true);
    expect(looksLikeAadhaarNumber('2345-6789-0123')).toBe(true);
    expect(looksLikeAadhaarNumber('98765 43210')).toBe(false);
  });
  it('drops even a known column holding a 12-digit number, so it is reported missing', () => {
    const r = parseStudentList(`${HEAD}\n234567890123,5A,Aarav,05-04-2015,M,Aarav,05-04-2015,M\n`);
    expect(r.droppedColumns).toEqual(['admission_no']);
    expect(r.missingColumns).toEqual(['admission_no']);
  });
  it('round-trips the saved list, including guarded cells', () => {
    const r = parseStudentList(`${HEAD},parent_name,parent_phone\nADM-1,5A,Aarav,05-04-2015,M,Aarav,05-04-2015,M,Meena,+91 98765 43210\n`);
    const again = parseStudentList(studentsToCsv(r.students));
    expect(again.students).toEqual(r.students);
    expect(again.students[0].parent_phone).toBe('+91 98765 43210');
    expect(SDC_TEMPLATE_CSV.startsWith(HEAD)).toBe(true);
  });
});

describe('student data check: results and letters', () => {
  const list = parseStudentList(
    `${HEAD},parent_name\n` +
      'ADM-1,5A,Aarav Sharma,05-04-2015,M,Aarav Sharma,05-04-2015,Male,\n' +
      'ADM-2,5A,AARAV KUMAR,05-04-2015,M,Aarav Kumar,05-04-2015,M,\n' +
      'ADM-3,5B,Riya Sen,05-04-2015,F,Riya Sen,04-05-2015,F,Meena Sen\n' +
      'ADM-4,4A,Kabir Das,01-01-2016,M,Ishaan Das,01-01-2016,F,\n'
  );
  const checked = checkStudents(list.students);

  it('counts matching, needing a check and real differences by student', () => {
    expect(countChecks(checked)).toEqual({ rows: 4, allMatching: 1, needCheck: 2, realDifferences: 1 });
  });
  it('sorts differences most serious first', () => {
    const rows = mismatchRows(checked);
    expect(rows.map((r) => `${r.c.student.admission_no}:${r.f.field}:${r.f.finding}`)).toEqual(['ADM-4:name:different', 'ADM-4:gender:different', 'ADM-3:dob:swapped', 'ADM-2:name:format']);
    expect(studentsWithMismatch(checked).map((c) => c.student.admission_no)).toEqual(['ADM-4', 'ADM-3', 'ADM-2']);
  });
  it('builds a report and a mismatches CSV', () => {
    const r = dataCheckReport(checked);
    const stats = r.sections[0];
    expect(stats.kind === 'stats' && stats.items.map((i) => i.value)).toEqual(['4', '1', '2', '1']);
    const table = r.sections[1];
    expect(table.kind === 'table' && table.rows).toHaveLength(4);
    const csv = mismatchesCsv(checked);
    expect(csv.split('\r\n')).toHaveLength(5);
    expect(csv).toContain('ADM-3,5B,Riya Sen,Date of birth,05-04-2015,04-05-2015,Day and month swapped,Meena Sen,');
  });
  it('writes one letter per student with a difference, with only the differing details', () => {
    const letters = lettersFor(checked);
    expect(letters.map((l) => l.admissionNo)).toEqual(['ADM-4', 'ADM-3', 'ADM-2']);
    const a3 = correctionLetter(checked[2]);
    expect(a3.salutation).toBe('Dear Meena Sen,');
    expect(a3.fields).toEqual([{ label: 'Date of birth', school: '05-04-2015', aadhaar: '04-05-2015', finding: 'Day and month swapped' }]);
    expect(a3.choices).toEqual(['School record is correct', 'Aadhaar is correct', 'Neither — the correct details are:']);
    expect(correctionLetter(checked[3]).salutation).toBe('Dear parent or guardian,');
    expect(lettersFor(checked, '5A').map((l) => l.admissionNo)).toEqual(['ADM-2']);
    expect(mismatchClasses(checked)).toEqual(['4A', '5A', '5B']);
  });
  it('says so when everything matches', () => {
    const r = dataCheckReport(checkStudents(parseStudentList(`${HEAD}\nADM-1,5A,Aarav,05-04-2015,M,Aarav,05-04-2015,M\n`).students));
    expect(r.sections[1]).toMatchObject({ kind: 'notes', tone: 'good' });
  });
  it('checks the example list, which shows every kind of finding', () => {
    const ex = parseStudentList(STUDENT_DATA_CHECK_EXAMPLE_CSV);
    expect(ex.missingColumns).toEqual([]);
    expect(ex.droppedColumns).toEqual([]);
    const findings = new Set(checkStudents(ex.students).flatMap((c) => c.fields.map((f) => f.finding)));
    for (const f of ['exact', 'format', 'order', 'spelling', 'swapped', 'missing', 'unreadable', 'different']) expect(findings.has(f as never), f).toBe(true);
  });
});
