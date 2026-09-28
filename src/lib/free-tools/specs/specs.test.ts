import { describe, expect, it } from 'vitest';
import { MARKS_EXAMPLE, TOOL_EXAMPLES } from '@/demo-fixture/free-tool-examples';
import { decodeShare, encodeShare, shareableValues, type Values } from '../engine';
import { analyseMarks, gradeFor, parseGrades } from '../marks';
import { csvCell, money, reportToCsv, type ReportSection } from '../report';
import { jpegPagesToPdf } from '../../pdf/jpeg-pdf';
import { attendanceRecovery } from './attendance-recovery';
import { CBSE_REFERENCE } from './capacity';
import { splitInstalments } from './fee-planner';
import { findToolSpec, toolSpecs } from './index';
import { parseDay, parsePeriods } from './timetable';

const stat = (sections: ReportSection[], label: string) => {
  for (const s of sections) if (s.kind === 'stats') for (const it of s.items) if (it.label === label) return it.value;
  throw new Error(`no stat ${label}`);
};

describe('every tool spec', () => {
  for (const spec of toolSpecs) {
    it(`${spec.slug}: example computes cleanly in English and Hinglish`, () => {
      const ex = TOOL_EXAMPLES[spec.slug];
      expect(ex, 'example exists').toBeDefined();
      for (const lang of ['en', 'hi'] as const) {
        const r = spec.compute(ex, lang);
        expect(r.errors, `${spec.slug} ${lang}`).toEqual([]);
        expect(r.report.title.length).toBeGreaterThan(5);
        expect(r.report.assumptions.length).toBeGreaterThan(0);
        expect(r.report.disclaimer.length).toBeGreaterThan(20);
      }
    });
    it(`${spec.slug}: blank defaults ask for input instead of computing`, () => {
      expect(spec.compute(spec.defaults, 'en').errors.length).toBeGreaterThan(0);
    });
  }
});

describe('fee planner', () => {
  it('splits instalments into whole rupees that add up exactly', () => {
    expect(splitInstalments(43000, 3)).toEqual([14333, 14333, 14334]);
    expect(splitInstalments(43000, 3).reduce((a, b) => a + b, 0)).toBe(43000);
  });
  it('forecasts collection and shortfall from the example', () => {
    const r = findToolSpec('school-fee-planner')!.compute(TOOL_EXAMPLES['school-fee-planner'], 'en');
    // gross 48,000 x 620 = 2,97,60,000; discounts 4,800 x 64 + 12,000 x 22 = 5,71,200
    expect(stat(r.report.sections, 'Net fee billable this year')).toBe(money(29188800));
    // 5,000 x 620 down payments + 92 of every 100 instalment rupees
    expect(stat(r.report.sections, 'Expected collection')).toBe(money(3100000 + 26088800 * 0.92));
    expect(stat(r.report.sections, 'Instalment for a full-fee student')).toBe(money(10750));
  });
  it('refuses on-time plus late above 100', () => {
    const r = findToolSpec('school-fee-planner')!.compute({ ...TOOL_EXAMPLES['school-fee-planner'], onTime: '90', late: '20' }, 'en');
    expect(r.errors.join(' ')).toContain('100 percent');
  });
});

describe('attendance recovery', () => {
  it('finds the days that must be attended and the most that can be missed', () => {
    // 98 + 34 + 64 = 196 days; 75 of every 100 is 147, so 49 more presents
    expect(attendanceRecovery(98, 34, 64, 75)).toMatchObject({ mustAttend: 49, maxMisses: 15 });
  });
  it('is exact on the boundary and reports unreachable targets', () => {
    expect(attendanceRecovery(150, 50, 0, 75)).toMatchObject({ mustAttend: 0, maxMisses: 0 });
    expect(attendanceRecovery(40, 60, 20, 75).mustAttend).toBeNull();
  });
});

describe('capacity planner', () => {
  it('uses area or section size, whichever is tighter', () => {
    const r = findToolSpec('school-capacity-planner')!.compute(TOOL_EXAMPLES['school-capacity-planner'], 'en');
    // 480 sq ft x 0.85 / 10.76 = 37.9, so 37 seats (below the 40 limit)
    expect(stat(r.report.sections, 'Safe seats per classroom')).toBe('37');
    expect(stat(r.report.sections, 'Maximum capacity')).toBe('888');
    expect(stat(r.report.sections, 'Sections required')).toBe('24');
    // 24 sections x 48 periods / 30 = 38.4, so 39 teachers
    expect(stat(r.report.sections, 'Teachers required (teaching load)')).toBe('39');
  });
  it('keeps the reference norms as cited', () => {
    expect(CBSE_REFERENCE).toEqual({ classroomSqft: 500, sectionSize: 40, sqmPerStudent: 1 });
  });
});

describe('timetable checker', () => {
  const r = findToolSpec('timetable-clash-checker')!.compute(TOOL_EXAMPLES['timetable-clash-checker'], 'en');
  it('finds the teacher clash, the unavailability break and short subjects', () => {
    expect(stat(r.report.sections, 'Teacher clashes')).toBe('1');
    expect(stat(r.report.sections, 'Unavailability breaks')).toBe('1');
    expect(stat(r.report.sections, 'Subjects short of required periods')).toBe('4');
  });
  it('suggests only free, available substitutes', () => {
    const subs = r.report.sections.find((s) => s.kind === 'table' && s.heading.startsWith('Substitutes'));
    expect(subs && subs.kind === 'table' && subs.rows.length).toBe(2);
    const p1 = subs && subs.kind === 'table' ? subs.rows[0][3] : '';
    expect(p1).not.toContain('Farah Khan');
    expect(p1).toContain('Neha Joshi');
  });
  it('parses days and period ranges', () => {
    expect(parseDay('Tuesday', 6)).toBe(1);
    expect(parseDay('7', 6)).toBeNull();
    expect([...parsePeriods('1-3, 6', 8)]).toEqual([1, 2, 3, 6]);
    expect(parsePeriods('all', 4).size).toBe(4);
  });
});

describe('payroll, leakage, admission, workload, operations', () => {
  it('payroll annual budget includes employer contributions', () => {
    const r = findToolSpec('school-payroll-planner')!.compute({ staff: [{ role: 'T', teaching: 'Y', count: '2', basic: '10000', allowances: '2000', deduction: '10', employer: '12' }], students: '40', months: '12', incA: '0', incB: '10' }, 'en');
    // (10,000 + 2,000 + 1,200) x 2 x 12
    expect(stat(r.report.sections, 'Annual staff budget')).toBe(money(316800));
    expect(stat(r.report.sections, 'Students per teacher')).toBe('20');
  });
  it('fee leakage adds its three sources', () => {
    const r = findToolSpec('fee-leakage-calculator')!.compute({ students: '100', fee: '10000', overdue: '10', online: '50', failed: '10', cash: '10', reminder: '50', retry: '0', months: '5' }, 'en');
    // overdue 1,00,000 + failed 50,000 + cash 50,000
    expect(stat(r.report.sections, 'Annual fee leakage')).toBe(money(200000));
    expect(stat(r.report.sections, 'Expected recovery')).toBe(money(100000));
  });
  it('admissions never exceed open seats', () => {
    const r = findToolSpec('admission-revenue-planner')!.compute({ ...TOOL_EXAMPLES['admission-revenue-planner'], seats: '800', continuing: '790' }, 'en');
    expect(stat(r.report.sections, 'Expected admissions')).toBe('10');
  });
  it('workload flags overload and never suggests an overloaded substitute', () => {
    const r = findToolSpec('teacher-workload-planner')!.compute(TOOL_EXAMPLES['teacher-workload-planner'], 'en');
    expect(stat(r.report.sections, 'Over your limits')).toBe('1');
    const subs = r.report.sections.find((s) => s.kind === 'table' && s.heading === 'Substitute suggestions');
    expect(subs && subs.kind === 'table' ? subs.rows[0][2] : '').not.toContain('Anita Verma');
    expect(subs && subs.kind === 'table' ? subs.rows[0][2] : '').toMatch(/^Imran Sheikh \(same subject\)/);
  });
  it('operations break-even fee accounts for collection', () => {
    const r = findToolSpec('school-operations-cost-calculator')!.compute({ payroll: '100000', students: '100', fee: '15000', collection: '80', margin: '0' }, 'en');
    // 12,00,000 a year / (100 x 0.8)
    expect(stat(r.report.sections, 'Break-even annual fee')).toBe(money(15000));
  });
});

describe('share links never carry personal data', () => {
  const spec = findToolSpec('timetable-clash-checker')!;
  const ex = TOOL_EXAMPLES['timetable-clash-checker'];
  it('replaces names with stable stand-ins and drops free text', () => {
    const s = shareableValues(spec, ex);
    const text = JSON.stringify(s);
    expect(text).not.toContain('Anita');
    expect(text).not.toContain('Farah');
    expect(s.absent).toBeUndefined();
    // Farah is the same stand-in in the timetable and the unavailability list.
    const entries = s.entries as Values[string] as { teacher: string; day: string; period: string; subject: string }[];
    const farah = entries.find((e) => e.day === 'Mon' && e.period === '3' && e.subject === 'Science')!.teacher;
    expect((s.unavailable as { teacher: string }[])[0].teacher).toBe(farah);
  });
  it('round-trips and still finds the same clash', () => {
    const back = decodeShare(spec, encodeShare(spec, ex))!;
    const r = spec.compute(back, 'en');
    const clashes = r.report.sections.find((x) => x.kind === 'stats');
    expect(clashes && clashes.kind === 'stats' ? clashes.items[0].value : '').toBe('1');
  });
  it('rejects junk and unknown fields', () => {
    expect(decodeShare(spec, '!!!')).toBeNull();
    const crafted = btoa(JSON.stringify({ days: '6', evil: '<script>', absent: 'x' })).replace(/=+$/, '');
    const v = decodeShare(spec, crafted)!;
    expect(v.evil).toBeUndefined();
    expect(v.absent).toBe('');
  });
});

describe('marks analyzer', () => {
  const r = analyseMarks(MARKS_EXAMPLE, 'en');
  it('computes results, fails, missing marks and at-risk', () => {
    expect(r.errors).toEqual([]);
    const kabir = r.results.find((x) => x.name === 'Kabir Singh')!;
    expect(kabir.failed).toEqual(['Maths']);
    const meera = r.results.find((x) => x.name === 'Meera Pillai')!;
    expect(meera.missing).toEqual(['Social Science']);
    const rohan = r.results.find((x) => x.name === 'Rohan Das')!;
    // 199 of 400 = 49.75, down from 66
    expect(rohan.percent).toBeCloseTo(49.75, 5);
    expect(rohan.change).toBeCloseTo(-16.25, 5);
  });
  it('applies a configurable grade scale', () => {
    const bands = parseGrades('A:90, B:75, C:0')!;
    expect(gradeFor(90, bands)).toBe('A');
    expect(gradeFor(89.9, bands)).toBe('B');
    expect(parseGrades('nonsense')).toBeNull();
  });
  it('rejects marks above the maximum', () => {
    const bad = { ...MARKS_EXAMPLE, students: [{ name: 'X', roll: '1', previous: '', marks: { English: '95' } }] };
    expect(analyseMarks(bad, 'en').errors.join(' ')).toContain('English');
  });
});

describe('report output', () => {
  it('neutralises spreadsheet formulas in CSV', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('-1,200')).toBe('"-1,200"');
    const r = findToolSpec('school-operations-cost-calculator')!.compute(TOOL_EXAMPLES['school-operations-cost-calculator'], 'en');
    expect(reportToCsv(r.report)).toContain('Annual budget by category');
  });
  it('writes a structurally valid PDF with correct xref offsets', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const pdf = jpegPagesToPdf([{ bytes: jpeg, widthPx: 2480, heightPx: 3508 }, { bytes: jpeg, widthPx: 2480, heightPx: 3508 }], { title: 'Test (1)' });
    const text = new TextDecoder('latin1').decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Count 2');
    const xrefAt = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const offsets = text.slice(xrefAt).split('\n').slice(3, 12).map((l) => Number(l.slice(0, 10)));
    offsets.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });
});
