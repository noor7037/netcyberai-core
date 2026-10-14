import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_BANDS,
  CLOSINGS,
  CUSTOM,
  CUSTOM_NEXT_STEP,
  CUSTOM_STRENGTH,
  NEXT_STEPS,
  PERFORMANCE_BANDS,
  STRENGTHS,
  blankStudent,
  draftClass,
  draftRemark,
  firstName,
  percentProblem,
  phraseBank,
  remarksCsv,
  remarksReport,
  remarksText,
  studentTemplateCsv,
  studentsFromCsv,
  studentsToCsv,
  type RemarkStudent,
} from './remarks';
import { pct } from './report';

const S = (id: string, patch: Partial<RemarkStudent> = {}): RemarkStudent => ({ ...blankStudent(id), name: 'Asha Verma', overall: '72', attendance: '91', strength: 'neat-work', nextStep: 'read-daily', ...patch });

describe('the phrase bank', () => {
  const everything = [...phraseBank(), ...STRENGTHS.map((s) => s.label), ...NEXT_STEPS.map((s) => s.label)];

  it('never labels a child', () => {
    for (const p of everything) expect(p, p).not.toMatch(/\b(weak|slow|poor|lazy|dull|careless|stupid|naughty|fail)/i);
  });
  it('never uses he, she, his or her', () => {
    for (const p of everything) expect(p, p).not.toMatch(/\b(he|she|his|her|hers|him|himself|herself)\b/i);
  });
  it('covers every list it offers and names the student at most once in the middle of a remark', () => {
    expect(phraseBank().length).toBe(STRENGTHS.length * 3 + NEXT_STEPS.length * 3 + 6 + PERFORMANCE_BANDS.length * 4 + ATTENDANCE_BANDS.length * 3 + CLOSINGS.length);
    const names = (list: string[]) => list.map((p) => p.includes('{name}'));
    for (let k = 0; k < 3; k++) {
      for (const s of STRENGTHS) for (const a of ATTENDANCE_BANDS) for (const n of NEXT_STEPS) expect([names(s.phrases)[k], names(a.phrases)[k], names(n.phrases)[k]].filter(Boolean).length).toBeLessThanOrEqual(1);
      expect([names(CUSTOM_STRENGTH)[k], names(CUSTOM_NEXT_STEP)[k]].filter(Boolean).length).toBeLessThanOrEqual(1);
    }
  });
});

describe('drafting one remark', () => {
  it('uses the first name and picks phrases by band, strength and next step', () => {
    const r = draftRemark(S('a', { name: 'asha verma', overall: '91', attendance: '97' }), 0);
    expect(r).toBe('Asha has worked to an excellent standard this term. Work is always presented neatly and with care. Attendance has been excellent. Reading for ten minutes every day at home will help Asha grow as a reader. Well done, Asha, and keep it up!');
    expect(firstName('  meera  K ')).toBe('Meera');
  });
  it('gives the same draft for the same inputs, and a new one for the next draft number', () => {
    expect(draftRemark(S('a'), 3)).toBe(draftRemark(S('b'), 3));
    expect(draftRemark(S('a'), 4)).not.toBe(draftRemark(S('a'), 3));
  });
  it('encourages at the lowest band and leaves out what is not given', () => {
    const r = draftRemark(S('a', { overall: '22', attendance: '', strength: '', nextStep: '' }), 0);
    expect(r).toBe('Asha is building the basics step by step and has kept trying this term. Well done, Asha, and keep it up!');
    expect(draftRemark(S('a', { name: '  ' }), 0)).toBe('');
  });
  it('uses the teacher’s own words for a custom choice', () => {
    const r = draftRemark(S('a', { overall: '', attendance: '', strength: CUSTOM, strengthText: ' clear, careful diagrams. ', nextStep: CUSTOM, nextStepText: 'learning spellings' }), 0);
    expect(r).toBe('A real strength this term: clear, careful diagrams. The next step for Asha: learning spellings. Well done, Asha, and keep it up!');
    expect(draftRemark(S('a', { strength: CUSTOM, strengthText: '' }), 0)).not.toContain('strength this term');
  });
  it('does not say the same thing twice when the next step is attendance', () => {
    const r = draftRemark(S('a', { attendance: '70', nextStep: 'attend-regularly' }), 1);
    expect(r).toContain('The next step is to attend school regularly.');
    expect(r).not.toMatch(/Being in school every day/);
  });
  it('flags a percentage it cannot use', () => {
    expect(percentProblem(`${85}%`)).toBeNull();
    expect(percentProblem('')).toBeNull();
    expect(percentProblem('120')).toMatch(/0 to 100/);
    expect(draftRemark(S('a', { overall: 'abc', attendance: '', strength: '', nextStep: '' }), 0)).toBe('Well done, Asha, and keep it up!');
  });
});

describe('drafting a class', () => {
  it('never gives two students the same remark word for word, even with the same name and choices', () => {
    const cls = Array.from({ length: 60 }, (_, i) => S(`s${i}`));
    const { text } = draftClass(cls);
    expect(new Set(Object.values(text)).size).toBe(60);
    expect(draftClass(cls).text).toEqual(text);
  });
  it('moves past a draft another student already has', () => {
    const cls = [S('a'), S('b')];
    const first = draftClass(cls, { a: 1 });
    expect(first.variant).toEqual({ a: 1, b: 2 });
    expect(first.text.a).not.toBe(first.text.b);
  });
  it('gives a different remark on Draft again', () => {
    const cls = [S('a'), S('b'), S('c')];
    const before = draftClass(cls);
    const after = draftClass(cls, { b: before.variant.b + 1 });
    expect(after.text.b).not.toBe(before.text.b);
    expect(after.text.a).toBe(before.text.a);
  });
});

describe('outputs', () => {
  const cls = [S('a', { name: 'Asha Verma' }), S('b', { name: 'Kabir Das' }), S('c', { name: '' })];
  const remarks = { a: 'Remark one.', b: 'Remark, "two".', c: 'ignored' };

  it('prints a class list with the bands it used', () => {
    const r = remarksReport(cls, remarks, 'Class 5B');
    expect(r.subtitle).toBe('Class 5B · 2 students');
    expect(r.sections[0].kind === 'table' && r.sections[0].rows).toEqual([
      ['Asha Verma', 'Remark one.'],
      ['Kabir Das', 'Remark, "two".'],
    ]);
    expect(r.assumptions[1]).toBe(`Overall percentage bands for the first sentence: ${pct(85, 0)} and above, ${pct(70, 0)} to below ${pct(85, 0)}, ${pct(55, 0)} to below ${pct(70, 0)}, ${pct(40, 0)} to below ${pct(55, 0)}, below ${pct(40, 0)}.`);
  });
  it('copies and exports name and remark only', () => {
    expect(remarksText(cls, remarks)).toBe('Asha Verma: Remark one.\n\nKabir Das: Remark, "two".');
    expect(remarksCsv(cls, remarks)).toBe('Student,Remark\r\nAsha Verma,Remark one.\r\nKabir Das,"Remark, ""two""."');
  });
  it('round-trips the class through CSV, with listed and custom choices', () => {
    const list = [S('a'), S('b', { name: 'Kabir Das', strength: CUSTOM, strengthText: 'Kind to everyone', nextStep: '', overall: '', attendance: '88' })];
    const csv = studentsToCsv(list);
    expect(csv.split('\r\n')[0]).toBe(studentTemplateCsv());
    expect(csv.split('\r\n')[1]).toBe('Asha Verma,72,91,Neat work,Read for ten minutes each day');
    const back = studentsFromCsv(csv);
    expect(back.rows.map(({ id: _id, ...rest }) => rest)).toEqual(list.map(({ id: _id, ...rest }) => rest));
  });
  it('accepts other column names and explains a file it cannot use', () => {
    const { rows, problems } = studentsFromCsv('Name,Percentage,Attendance,Strength,Next step\nIra,64,80,asks good questions,attend regularly\n,50,,,\n');
    expect(rows.map((r) => [r.name, r.overall, r.strength, r.nextStep])).toEqual([['Ira', '64', 'good-questions', 'attend-regularly']]);
    expect(problems).toEqual(['1 row has no student name and was left out.']);
    expect(studentsFromCsv('Roll\n1\n').error).toMatch(/Student column/);
  });
});
