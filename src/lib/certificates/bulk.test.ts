import { describe, expect, it } from 'vitest';
import { CERT_EXAMPLES, CERT_SCHOOL_EXAMPLE } from '@/demo-fixture/certificate-examples';
import { toCsv } from '@/lib/free-tools/report';
import { BULK_LIMIT, buildBatch, nextNumber, numberSeries, readCsv, registerRows, rowFields, templateCsv, templateHeader, toIsoDate, toPlainNumber } from './bulk';
import { CERT_DEFS, findCertDef, type CertDef, type CertDoc, type CertValues } from './definitions';
import { renderCertificateSvg } from './render';

const def = (t: string) => findCertDef(t) as CertDef;
const baseDoc = (t: string, values: CertValues = {}): CertDoc => ({
  def: def(t),
  template: def(t).templates[0],
  values: { ...CERT_SCHOOL_EXAMPLE, ...values },
  rows: {},
  images: {},
  options: { stampBox: true, qr: false },
});
const csv = (rows: string[][]) => readCsv('﻿' + toCsv(rows));

describe('numbering', () => {
  it('moves a number on by one, keeping its prefix and zeros', () => {
    expect(nextNumber('SPS/TC/2026/041')).toBe('SPS/TC/2026/042');
    expect(nextNumber('099')).toBe('100');
    expect(nextNumber('A-9-X')).toBe('A-10-X');
    expect(nextNumber('ABC')).toBe('ABC');
  });
  it('issues a series in sequence', () => {
    expect(numberSeries('SPS/AC/2026/198', 4)).toEqual(['SPS/AC/2026/198', 'SPS/AC/2026/199', 'SPS/AC/2026/200', 'SPS/AC/2026/201']);
    expect(numberSeries('7', 0)).toEqual([]);
  });
});

describe('cells', () => {
  it('reads dates written day first or as ISO, and rejects impossible ones', () => {
    expect(toIsoDate('23/04/2012')).toBe('2012-04-23');
    expect(toIsoDate('3-4-2012')).toBe('2012-04-03');
    expect(toIsoDate('2012/04/23')).toBe('2012-04-23');
    expect(toIsoDate('2012-04-23')).toBe('2012-04-23');
    expect(toIsoDate('31/02/2012')).toBeNull();
    expect(toIsoDate('April 23')).toBeNull();
  });
  it('reads amounts with commas or a currency mark', () => {
    expect(toPlainNumber('12,800')).toBe('12800');
    expect(toPlainNumber('Rs. 12800')).toBe('12800');
    expect(toPlainNumber('₹ 1,20,000.50')).toBe('120000.50');
    expect(toPlainNumber('twelve')).toBeNull();
  });
});

describe('template', () => {
  it('has a column for every row field, never the school or the issued number', () => {
    const tc = def('transfer');
    const head = templateHeader(tc);
    expect(head).toContain('studentName');
    expect(head).toContain('dob');
    expect(head).not.toContain('number');
    expect(head).not.toContain('schoolName');
    expect(head).not.toContain('signName');
    // The report card keeps its roll number: it is not issued in sequence.
    expect(templateHeader(def('marksheet'))).toContain('rollNo');
  });
  it('numbers table columns and fills one example row for every type', () => {
    for (const d of CERT_DEFS) {
      const [head, row] = templateCsv(d, CERT_EXAMPLES[d.type]);
      expect(row).toHaveLength(head.length);
      expect(row[head.indexOf(d.personField)]).toBe(CERT_EXAMPLES[d.type].values[d.personField]);
    }
    const [head, row] = templateCsv(def('marksheet'), CERT_EXAMPLES.marksheet);
    expect(head).toContain('subject_6');
    expect(row[head.indexOf('theory_2')]).toBe('68');
    // Dates are written day first, as the studio asks.
    const [tcHead, tcRow] = templateCsv(def('transfer'), CERT_EXAMPLES.transfer);
    expect(tcRow[tcHead.indexOf('dob')]).toBe('23/04/2012');
  });
  it('round-trips: the template opened again makes one ready certificate per type', () => {
    for (const d of CERT_DEFS) {
      const table = csv(templateCsv(d, CERT_EXAMPLES[d.type]));
      const first = d.numberField === 'rollNo' ? '' : CERT_EXAMPLES[d.type].values[d.numberField] || 'X/1';
      const b = buildBatch(table, baseDoc(d.type, { [d.numberField]: first }), BULK_LIMIT.desktop);
      expect(b.error).toBe('');
      expect(b.batchProblems).toEqual([]);
      expect(b.rows[0].problems).toEqual([]);
      expect(b.ready).toHaveLength(1);
      const svg = renderCertificateSvg(b.ready[0].doc);
      expect(svg).toContain(CERT_EXAMPLES[d.type].values[d.personField]);
      expect(svg).not.toContain('undefined');
    }
  });
});

describe('buildBatch', () => {
  const head = ['studentName', 'admissionNo', 'parentName', 'relation', 'className', 'year', 'purpose', 'issueDate'];
  const row = (name: string, extra: Partial<Record<string, string>> = {}) => head.map((h) => extra[h] ?? ({ studentName: name, admissionNo: `A-${name.length}`, parentName: 'P', relation: 'daughter', className: '7', year: '2026-27', purpose: 'a bank account', issueDate: '27/09/2026' } as Record<string, string>)[h]);

  it('numbers ready rows in sequence and lists rows with problems by spreadsheet row', () => {
    const table = csv([head, row('Asha'), row('', {}), ['', '', '', '', '', '', '', ''], row('Bina', { issueDate: '31/02/2026' }), row('Chitra')]);
    const b = buildBatch(table, baseDoc('bonafide', { number: 'SPS/BC/2026/099' }), BULK_LIMIT.desktop);
    expect(b.total).toBe(4); // the wholly blank row is skipped
    expect(b.ready.map((r) => r.person)).toEqual(['Asha', 'Chitra']);
    expect(b.ready.map((r) => r.doc.values.number)).toEqual(['SPS/BC/2026/099', 'SPS/BC/2026/100']);
    const bad = b.rows.filter((r) => r.problems.length);
    expect(bad.map((r) => r.line)).toEqual([3, 5]);
    expect(bad[0].problems).toContain('Student name');
    expect(bad[1].problems).toContain('Date of issue: write the date as DD/MM/YYYY');
    expect(b.ready[0].doc.values.issueDate).toBe('2026-09-27');
    expect(b.ready[0].doc.values.schoolName).toBe(CERT_SCHOOL_EXAMPLE.schoolName);
  });

  it('matches columns by label as well as id, and lists the ones it cannot use', () => {
    const table = csv([
      ['Student name', 'Admission number', 'Father’s or guardian’s name', 'Student is the', 'Class', 'Academic year', 'Purpose', 'Date of issue', 'Shoe size'],
      ['Asha', 'A-1', 'P', 'Daughter', '7', '2026-27', 'a passport', '2026-09-27', '4'],
    ]);
    const b = buildBatch(table, baseDoc('bonafide', { number: '1' }), BULK_LIMIT.desktop);
    expect(b.unknown).toEqual(['Shoe size']);
    expect(b.ready).toHaveLength(1);
    expect(b.ready[0].doc.values.relation).toBe('daughter');
  });

  it('takes batch-wide fields from step 3 only when the file has no column for them', () => {
    const d = def('achievement');
    const form = { number: 'AC/1', event: 'Annual Sports Day', issueDate: '2026-11-20', award: 'First Prize', kind: 'Participation' };
    const names = csv([['recipientName'], ['Asha'], ['Bina']]);
    const b = buildBatch(names, baseDoc('achievement', form), BULK_LIMIT.desktop);
    expect(b.fromForm).toEqual(expect.arrayContaining(['event', 'issueDate', 'award', 'kind']));
    expect(b.ready.map((r) => [r.doc.values.event, r.doc.values.kind, r.doc.values.number])).toEqual([
      ['Annual Sports Day', 'Participation', 'AC/1'],
      ['Annual Sports Day', 'Participation', 'AC/2'],
    ]);
    // A blank award in the file stays blank: the form's award is never copied in.
    const withAward = buildBatch(csv([['recipientName', 'award'], ['Asha', ''], ['Bina', 'Second Prize']]), baseDoc('achievement', form), BULK_LIMIT.desktop);
    expect(withAward.ready.map((r) => r.doc.values.award)).toEqual(['', 'Second Prize']);
    expect(d.fields.some((f) => f.id === 'award')).toBe(true);
  });

  it('never fills a personal choice or a person’s details from step 3', () => {
    const table = csv([['studentName', 'admissionNo', 'parentName', 'className', 'year', 'purpose', 'issueDate'], ['Asha', 'A-1', 'P', '7', '2026-27', 'x', '2026-09-27']]);
    const b = buildBatch(table, baseDoc('bonafide', { number: '1', relation: 'son', dob: '2013-01-01' }), BULK_LIMIT.desktop);
    expect(b.rows[0].problems).toContain('Student is the: use one of son, daughter, ward');
    expect(b.rows[0].doc.values.dob).toBe('');
  });

  it('reports problems with the studio once, not on every row', () => {
    const table = csv([head, row('Asha'), row('Bina')]);
    const b = buildBatch(table, { ...baseDoc('bonafide'), values: { number: '' } }, BULK_LIMIT.desktop);
    expect(b.batchProblems).toEqual(['School name: type it in step 2.', 'Certificate number: type the first number of the batch.']);
    expect(b.rows.every((r) => r.problems.length === 0)).toBe(true);
    const words = buildBatch(table, baseDoc('bonafide', { number: 'FIRST' }), BULK_LIMIT.desktop);
    expect(words.batchProblems[0]).toMatch(/needs digits/);
    // A required batch-wide field missing from both the file and step 3.
    const noDate = buildBatch(csv([['recipientName', 'event'], ['Asha', 'Quiz'], ['Bina', 'Quiz']]), baseDoc('achievement'), BULK_LIMIT.desktop);
    expect(noDate.batchProblems).toEqual(['Date of issue: type it in step 3, or add a column named issueDate to the file.']);
    expect(noDate.rows.every((r) => r.problems.length === 0)).toBe(true);
  });

  it('refuses numbers already issued in this session', () => {
    const b = buildBatch(csv([head, row('Asha'), row('Bina')]), baseDoc('bonafide', { number: 'BC/7' }), BULK_LIMIT.desktop, ['BC/8']);
    expect(b.batchProblems).toEqual(['Number BC/8 was already issued in this session. Change the first number.']);
  });

  it('stops at the row limit and needs a name column', () => {
    const many = csv([head, ...Array.from({ length: BULK_LIMIT.phone + 1 }, (_, i) => row(`S${i}`))]);
    expect(buildBatch(many, baseDoc('bonafide', { number: '1' }), BULK_LIMIT.phone).error).toMatch(/has 51 rows\. Up to 50/);
    expect(buildBatch(many, baseDoc('bonafide', { number: '1' }), BULK_LIMIT.desktop).ready).toHaveLength(BULK_LIMIT.phone + 1);
    expect(buildBatch(csv([['admissionNo'], ['A-1']]), baseDoc('bonafide', { number: '1' }), BULK_LIMIT.desktop).error).toMatch(/needs a column for Student name/);
    expect(buildBatch(csv([head]), baseDoc('bonafide'), BULK_LIMIT.desktop).error).toMatch(/no students/);
  });

  it('reads each student’s marks from numbered columns, and fee heads from step 3 when absent', () => {
    const marks = csv([
      ['studentName', 'rollNo', 'className', 'examName', 'year', 'issueDate', 'subject_1', 'max_1', 'theory_1', 'practical_1', 'subject_2', 'max_2', 'theory_2', 'practical_2'],
      ['Asha', '1', '8', 'Half-Yearly', '2026-27', '2026-10-18', 'English', '100', '70', '15', 'Hindi', '100', '66', ''],
      ['Bina', '2', '8', 'Half-Yearly', '2026-27', '2026-10-18', '', '', '', '', '', '', '', ''],
    ]);
    const m = buildBatch(marks, baseDoc('marksheet'), BULK_LIMIT.desktop);
    expect(m.ready).toHaveLength(1);
    expect(m.ready[0].doc.values.rollNo).toBe('1');
    expect(m.ready[0].doc.rows.subjects).toEqual([
      { subject: 'English', max: '100', theory: '70', practical: '15' },
      { subject: 'Hindi', max: '100', theory: '66', practical: '' },
    ]);
    expect(m.rows[1].problems).toEqual(['Subjects and marks']);

    const heads = [{ head: 'Tuition fee', amount: '10500' }];
    const fees = buildBatch(csv([['studentName', 'paid', 'mode', 'paymentDate'], ['Asha', '10,500', 'UPI', '10/07/2026']]), { ...baseDoc('fee-receipt', { number: 'FR/1' }), rows: { heads } }, BULK_LIMIT.desktop);
    expect(fees.ready).toHaveLength(1);
    expect(fees.ready[0].doc.rows.heads).toEqual(heads);
    expect(fees.ready[0].doc.values.paid).toBe('10500');
    expect(fees.ready[0].doc.values.paymentDate).toBe('2026-07-10');
  });

  it('rejects bad choices, numbers and over-long text', () => {
    const b = buildBatch(
      csv([['recipientName', 'level', 'event', 'issueDate', 'eventDate'], ['x'.repeat(81), 'Galactic', 'Quiz', '2026-01-01', 'soon']]),
      baseDoc('achievement'),
      BULK_LIMIT.desktop
    );
    expect(b.rows[0].problems).toEqual([
      'Student or teacher name: longer than 80 characters',
      'Level: use one of Class, School, Inter-school, District, State, National, International',
      'Event date: write the date as DD/MM/YYYY',
    ]);
  });
});

describe('issue register', () => {
  it('keeps the existing register columns', () => {
    expect(registerRows([{ no: '1', type: 'Bonafide Certificate', name: 'Asha', admissionNo: 'A-1', date: '2026-09-27' }])).toEqual([
      ['Certificate', 'Number', 'Name', 'Admission No.', 'Date'],
      ['Bonafide Certificate', '1', 'Asha', 'A-1', '2026-09-27'],
    ]);
  });
  it('row fields never include the school', () => {
    for (const d of CERT_DEFS) expect(rowFields(d).some((f) => f.id === 'schoolName' || f.id === 'signName')).toBe(false);
  });
});
