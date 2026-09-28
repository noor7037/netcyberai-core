import type { Lang } from './engine';
import { num, pct, type ReportSection, type ReportTone, type ToolReport } from './report';
import { picker } from './specs/common';

// Exam marks analysis for one class. Pure, so the arithmetic (totals,
// percentages, grade bands, pass rule, missing marks) is unit-tested.

export interface Subject {
  name: string;
  max: string;
  pass: string;
}
export interface StudentMarks {
  name: string;
  roll: string;
  marks: Record<string, string>;
  previous: string; // previous exam overall percentage, optional
}
export interface MarksInput {
  exam: string;
  subjects: Subject[];
  students: StudentMarks[];
  grades: string; // "A1:91, A2:81, ... E:0"
  atRiskBelow: string; // overall percentage that flags a student
}

export interface GradeBand {
  grade: string;
  min: number;
}

// Parses "A1:91, A2:81, B1:71" into bands sorted high to low. The lowest
// band should start at 0 so every mark gets a grade.
export function parseGrades(s: string): GradeBand[] | null {
  const bands: GradeBand[] = [];
  for (const part of s.split(/[,;\n]+/)) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^([A-Za-z0-9+\- ]{1,14})\s*[:=]\s*(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    bands.push({ grade: m[1].trim(), min: Number(m[2]) });
  }
  if (bands.length === 0) return null;
  return bands.sort((a, b) => b.min - a.min);
}

export function gradeFor(percent: number, bands: GradeBand[]): string {
  return bands.find((b) => percent >= b.min - 1e-9)?.grade ?? '—';
}

export interface StudentResult {
  name: string;
  roll: string;
  total: number;
  maxTotal: number;
  percent: number;
  grade: string;
  failed: string[];
  missing: string[];
  previous: number | null;
  change: number | null;
}

export function analyseMarks(input: MarksInput, lang: Lang): { errors: string[]; results: StudentResult[]; report: ToolReport } {
  const p = picker(lang);
  const errors: string[] = [];
  const subjects = input.subjects
    .map((s) => ({ name: s.name.trim(), max: Number(s.max), pass: s.pass.trim() === '' ? 0 : Number(s.pass) }))
    .filter((s) => s.name);
  if (subjects.length === 0) errors.push(p('Add at least one subject.', 'Kam se kam ek subject jodein.'));
  subjects.forEach((s) => {
    if (!Number.isFinite(s.max) || s.max <= 0) errors.push(p(`${s.name}: maximum marks must be more than 0.`, `${s.name}: maximum marks 0 se zyada ho.`));
    if (!Number.isFinite(s.pass) || s.pass < 0 || s.pass > s.max) errors.push(p(`${s.name}: pass marks must be between 0 and the maximum.`, `${s.name}: pass marks 0 aur maximum ke beech ho.`));
  });
  if (new Set(subjects.map((s) => s.name.toLowerCase())).size !== subjects.length) errors.push(p('Two subjects have the same name.', 'Do subjects ka naam ek jaisa hai.'));
  const bands = parseGrades(input.grades);
  if (!bands) errors.push(p('Grade scale must look like A1:91, A2:81, B1:71 … E:0.', 'Grade scale aisa ho: A1:91, A2:81, B1:71 … E:0.'));
  const atRisk = input.atRiskBelow.trim() === '' ? 40 : Number(input.atRiskBelow);
  if (!Number.isFinite(atRisk) || atRisk < 0 || atRisk > 100) errors.push(p('The at-risk line must be between 0 and 100.', 'At-risk seema 0 se 100 ke beech ho.'));
  const students = input.students.filter((s) => s.name.trim() || s.roll.trim() || Object.values(s.marks).some((m) => m.trim()));
  if (students.length === 0) errors.push(p('Add at least one student’s marks.', 'Kam se kam ek student ke marks jodein.'));
  students.forEach((s, i) => {
    for (const sub of subjects) {
      const raw = (s.marks[sub.name] ?? '').trim();
      if (raw === '' || /^(ab|absent|-)$/i.test(raw)) continue;
      const m = Number(raw);
      if (!Number.isFinite(m) || m < 0 || m > sub.max) errors.push(p(`${s.name || `Row ${i + 1}`}, ${sub.name}: “${raw}” is not between 0 and ${sub.max}.`, `${s.name || `Row ${i + 1}`}, ${sub.name}: “${raw}” 0 aur ${sub.max} ke beech nahi.`));
    }
    if (s.previous.trim() !== '' && !(Number(s.previous) >= 0 && Number(s.previous) <= 100)) errors.push(p(`${s.name || `Row ${i + 1}`}: previous percentage must be 0 to 100.`, `${s.name || `Row ${i + 1}`}: pichhla percentage 0 se 100 ho.`));
  });
  const empty: ToolReport = { title: '', sections: [], assumptions: [], disclaimer: '' };
  if (errors.length || !bands) return { errors: errors.slice(0, 12), results: [], report: empty };

  const results: StudentResult[] = students.map((s, i) => {
    let total = 0;
    let maxTotal = 0;
    const failed: string[] = [];
    const missing: string[] = [];
    for (const sub of subjects) {
      const raw = (s.marks[sub.name] ?? '').trim();
      if (raw === '' || /^(ab|absent|-)$/i.test(raw)) {
        missing.push(sub.name);
        continue;
      }
      const m = Number(raw);
      total += m;
      maxTotal += sub.max;
      if (m < sub.pass) failed.push(sub.name);
    }
    const percent = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
    const previous = s.previous.trim() === '' ? null : Number(s.previous);
    return {
      name: s.name.trim() || p(`Student ${i + 1}`, `Student ${i + 1}`),
      roll: s.roll.trim(),
      total,
      maxTotal,
      percent,
      grade: maxTotal > 0 ? gradeFor(percent, bands) : '—',
      failed,
      missing,
      previous,
      change: previous === null || maxTotal === 0 ? null : percent - previous,
    };
  });

  const complete = results.filter((r) => r.missing.length === 0);
  const passed = complete.filter((r) => r.failed.length === 0);
  const classAvg = results.filter((r) => r.maxTotal > 0).reduce((a, r) => a + r.percent, 0) / Math.max(1, results.filter((r) => r.maxTotal > 0).length);
  const subjectStats = subjects.map((sub) => {
    const vals = students
      .map((s) => (s.marks[sub.name] ?? '').trim())
      .filter((raw) => raw !== '' && !/^(ab|absent|-)$/i.test(raw))
      .map(Number);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return {
      name: sub.name,
      entered: vals.length,
      avgPct: sub.max ? (avg / sub.max) * 100 : 0,
      high: vals.length ? Math.max(...vals) : 0,
      low: vals.length ? Math.min(...vals) : 0,
      fails: vals.filter((m) => m < sub.pass).length,
      max: sub.max,
    };
  });
  const risky = results.filter((r) => r.maxTotal > 0 && (r.percent < atRisk || r.failed.length > 0 || (r.change !== null && r.change <= -10)));
  const distribution = bands.map((b) => ({ grade: b.grade, count: results.filter((r) => r.grade === b.grade).length }));
  const improved = results.filter((r) => r.change !== null && r.change > 0).length;
  const withPrev = results.filter((r) => r.change !== null).length;
  const missingCount = results.reduce((a, r) => a + r.missing.length, 0);

  const sections: ReportSection[] = [
    {
      kind: 'stats',
      items: [
        { label: p('Class average', 'Class ausat'), value: pct(classAvg), note: p(`${results.length} students`, `${results.length} students`) },
        { label: p('Passed every subject', 'Har subject mein pass'), value: `${passed.length} / ${complete.length}`, tone: passed.length === complete.length ? 'good' : 'warn', note: p('students with all marks entered', 'jin students ke saare marks bhare') },
        { label: p('At-risk students', 'At-risk students'), value: num(risky.length), tone: risky.length ? 'bad' : 'good', note: p(`below ${pct(atRisk, 0)}, a failed subject, or down 10+ points`, `${pct(atRisk, 0)} se kam, koi subject fail, ya 10+ point giravat`) },
        { label: p('Missing marks', 'Chhoote marks'), value: num(missingCount), tone: missingCount ? 'warn' : 'good' },
        ...(withPrev ? [{ label: p('Improved since last exam', 'Pichhle exam se sudhaar'), value: `${improved} / ${withPrev}`, tone: 'good' as ReportTone }] : []),
      ],
    },
    {
      kind: 'table',
      heading: p('Subject averages', 'Subject ausat'),
      columns: [p('Subject', 'Subject'), p('Entered', 'Bhare'), p('Average', 'Ausat'), p('Highest', 'Sabse zyada'), p('Lowest', 'Sabse kam'), p('Below pass', 'Pass se kam')],
      rows: subjectStats.map((s) => [s.name, num(s.entered), pct(s.avgPct), `${num(s.high, 1)} / ${s.max}`, `${num(s.low, 1)} / ${s.max}`, num(s.fails)]),
      numeric: [false, true, true, true, true, true],
      rowTones: subjectStats.map((s) => (s.fails ? 'warn' : undefined)),
    },
    {
      kind: 'table',
      heading: p('Grade distribution', 'Grade vitaran'),
      columns: [p('Grade', 'Grade'), p('From', 'Se'), p('Students', 'Students'), p('Share', 'Hissa')],
      rows: distribution.map((d, i) => [d.grade, pct(bands[i].min, 0), num(d.count), pct(results.length ? (d.count / results.length) * 100 : 0)]),
      numeric: [false, true, true, true],
    },
    {
      kind: 'table',
      heading: p('Student results', 'Student results'),
      columns: [p('Roll', 'Roll'), p('Student', 'Student'), p('Total', 'Kul'), p('Percentage', 'Percentage'), p('Grade', 'Grade'), p('Result', 'Result'), p('Change', 'Badlaav')],
      rows: [...results]
        .sort((a, b) => a.roll.localeCompare(b.roll, undefined, { numeric: true }) || a.name.localeCompare(b.name))
        .map((r) => [
          r.roll,
          r.name,
          `${num(r.total, 1)} / ${num(r.maxTotal)}`,
          pct(r.percent),
          r.grade,
          r.missing.length ? p(`Incomplete (${r.missing.join(', ')})`, `Adhoora (${r.missing.join(', ')})`) : r.failed.length ? p(`Fail: ${r.failed.join(', ')}`, `Fail: ${r.failed.join(', ')}`) : p('Pass', 'Pass'),
          r.change === null ? '' : `${r.change >= 0 ? '+' : ''}${num(r.change, 1)}`,
        ]),
      numeric: [false, false, true, true, false, false, true],
      rowTones: [...results]
        .sort((a, b) => a.roll.localeCompare(b.roll, undefined, { numeric: true }) || a.name.localeCompare(b.name))
        .map((r): ReportTone | undefined => (r.failed.length ? 'bad' : r.missing.length ? 'warn' : undefined)),
    },
  ];
  if (risky.length) {
    sections.push({
      kind: 'notes',
      heading: p('Students who need support first', 'Pehle madad chahiye in students ko'),
      tone: 'warn',
      items: risky.map((r) =>
        [
          r.name,
          pct(r.percent),
          r.failed.length ? p(`below pass in ${r.failed.join(', ')}`, `${r.failed.join(', ')} mein pass se kam`) : '',
          r.change !== null && r.change <= -10 ? p(`down ${num(-r.change, 1)} points`, `${num(-r.change, 1)} point neeche`) : '',
        ]
          .filter(Boolean)
          .join(' · ')
      ),
    });
  }

  return {
    errors: [],
    results,
    report: {
      title: p(`Exam Marks Analysis${input.exam.trim() ? `: ${input.exam.trim()}` : ''}`, `Exam Marks Vishleshan${input.exam.trim() ? `: ${input.exam.trim()}` : ''}`),
      subtitle: p(`${results.length} students · ${subjects.length} subjects`, `${results.length} students · ${subjects.length} subjects`),
      sections,
      assumptions: [
        p('Percentage uses only the subjects with marks entered; a missing or absent mark makes the result incomplete, not zero.', 'Percentage sirf bhare gaye subjects se; chhoota ya absent mark result ko adhoora banata hai, zero nahi.'),
        p('A student passes when every subject is at or above its pass marks.', 'Student tab pass jab har subject mein pass marks ya usse zyada.'),
        p('The grade scale is the one you entered; it is not any board’s official scale unless you set it so.', 'Grade scale wahi jo aapne bhara; ye kisi board ka official scale nahi jab tak aap waisa na rakhein.'),
      ],
      disclaimer: p('An analysis aid. Results declared to families must follow your board’s and school’s rules.', 'Ye vishleshan ki madad hai. Parivaaron ko result board aur school ke niyam se hi dein.'),
    },
  };
}
