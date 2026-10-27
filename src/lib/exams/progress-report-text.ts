import type { ProgressExam, ProgressGroup } from '@/lib/contracts/progress-report';
import { t, type Lang } from '@/lib/i18n';
import type { ProgressReport } from './progress-report';
import type { CardBlock } from './report-card-text';

// What a progress report says, as blocks of words (C230-AJ part 5): the one text both the printable PDF (drawn in the
// browser by src/components/exams/report-card-pdf.ts, as the report cards are) and the report shown on the staff screen are
// made from, so the two never differ and a test can read every word the PDF prints. For each exam type the school uses, a
// table with a row for each subject and a column for each of the child's exams of that type, oldest first, and an overall
// row. Pure: no database, no browser. It names no other child, and says there is no rank.

const locale = (lang: Lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');
const num = (n: number, lang: Lang) => n.toLocaleString(locale(lang), { maximumFractionDigits: 1 });
const dash = '—';
// The columns one table holds; a type with more exams is split into more tables, so a page never gets too narrow to read.
export const EXAMS_PER_TABLE = 5;

export const progressCell = (lang: Lang, s: { percent: number | null; grade: string | null }): string =>
  s.percent === null ? dash : s.grade ? `${t(lang, 'ex.result.percent', { percent: num(s.percent, lang) })} · ${s.grade}` : t(lang, 'ex.result.percent', { percent: num(s.percent, lang) });

// A calendar day (yyyy-mm-dd) as the school says it.
export const dayIn = (ymd: string, lang: Lang) => new Intl.DateTimeFormat(locale(lang), { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${ymd}T00:00:00Z`));

// A group's tables: subjects down, exams across.
export function groupTables(group: ProgressGroup, lang: Lang): Extract<CardBlock, { kind: 'table' }>[] {
  const subjects: string[] = [];
  for (const e of group.exams) for (const s of e.subjects) if (!subjects.includes(s.name)) subjects.push(s.name);
  const heading = (e: ProgressExam) => [e.name, e.term, e.day ? dayIn(e.day, lang) : null].filter(Boolean).join(' · ');
  const tables: Extract<CardBlock, { kind: 'table' }>[] = [];
  for (let i = 0; i < group.exams.length; i += EXAMS_PER_TABLE) {
    const exams = group.exams.slice(i, i + EXAMS_PER_TABLE);
    tables.push({
      kind: 'table',
      columns: [t(lang, 'rc.col.subject'), ...exams.map(heading)],
      numeric: [false, ...exams.map(() => true)],
      rows: [
        ...subjects.map((name) => [name, ...exams.map((e) => { const s = e.subjects.find((x) => x.name === name); return s ? progressCell(lang, s) : dash; })]),
        [t(lang, 'ex.result.overall'), ...exams.map((e) => progressCell(lang, e.overall))],
      ],
      totalRow: true,
    });
  }
  return tables;
}

export function progressBlocks(report: ProgressReport, lang: Lang): CardBlock[] {
  const blocks: CardBlock[] = [];
  blocks.push({ kind: 'title', text: report.schoolName || t(lang, 'pr.card.heading') });
  blocks.push({ kind: 'subtitle', text: t(lang, 'pr.card.heading') });
  if (report.session.label) blocks.push({ kind: 'line', text: t(lang, 'rc.card.session', { session: report.session.label }) });
  blocks.push({ kind: 'line', strong: true, text: report.student.name });
  const about = [
    report.student.className ? t(lang, 'rc.card.class', { className: report.student.className }) : null,
    report.student.rollNo ? t(lang, 'rc.card.roll', { roll: report.student.rollNo }) : null,
    report.student.admissionNo ? t(lang, 'rc.card.admission', { no: report.student.admissionNo }) : null,
  ].filter(Boolean) as string[];
  if (about.length) blocks.push({ kind: 'line', text: about.join(' · ') });
  if (!report.groups.length) blocks.push({ kind: 'line', text: t(lang, 'pr.empty') });
  for (const g of report.groups) {
    blocks.push({ kind: 'heading', text: lang === 'hi' ? g.name.hi : g.name.en });
    blocks.push(...groupTables(g, lang));
  }
  blocks.push({ kind: 'note', text: t(lang, 'pr.noRank') });
  return blocks;
}
