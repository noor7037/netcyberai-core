import { t, type Lang } from '@/lib/i18n';
import type { CardBlock } from './report-card-text';

// The words of a Holistic Progress Card (W21-M4), as blocks: what the screen shows and the PDF prints, in one language.
// Pure, so the browser's preview and the server's file are made of the same words. The data is read by hpc.ts.

export const HPC_FIELDS = ['teacherRemark', 'healthNote', 'selfAssessment', 'parentFeedback'] as const;
export type HpcField = (typeof HPC_FIELDS)[number];
export type HpcEntry = Record<HpcField, string | null>;

// One subject's result in one exam; null when the child had no paper of it in that exam.
export type HpcCell = { percent: number | null; grade: string | null } | null;
export type HpcCard = {
  schoolName: string;
  title: string | null; // the school's own name for the card; null: the standard words
  session: string;
  className: string;
  student: { studentId: string; name: string; rollNo: string | null; admissionNo: string | null };
  exams: { examId: string; name: string; term: string | null }[]; // the session's published exams, in time order
  scholastic: { subject: string; cells: HpcCell[] }[];
  overall: HpcCell[];
  coScholastic: { area: string; grades: (string | null)[] }[]; // a grade a published exam (term)
  attendance: { present: number; days: number } | null; // null: no day is marked in the session yet
  examRemarks: { exam: string; remark: string }[];
  entry: HpcEntry;
};

const locale = (lang: Lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');
const num = (n: number, lang: Lang) => n.toLocaleString(locale(lang), { maximumFractionDigits: 1 });
const cellWords = (lang: Lang, c: HpcCell) => {
  if (c === null) return t(lang, 'w21m4.hpc.cell.none');
  if (c.percent === null) return t(lang, 'w21m4.hpc.cell.notComplete');
  const p = t(lang, 'ex.result.percent', { percent: num(c.percent, lang) });
  return c.grade ? `${p} · ${c.grade}` : p;
};
export const hpcTitle = (card: Pick<HpcCard, 'title'>, lang: Lang) => card.title ?? t(lang, 'w21m4.hpc.title');

// What a card says, as blocks of words: what the screen shows and the PDF prints, in one language.
export function hpcBlocks(card: HpcCard, lang: Lang): CardBlock[] {
  const s = card.student;
  const examLabel = (e: { name: string; term: string | null }) => (e.term ? `${e.name} · ${e.term}` : e.name);
  const blocks: CardBlock[] = [
    { kind: 'title', text: hpcTitle(card, lang) },
    { kind: 'subtitle', text: card.schoolName },
    { kind: 'line', text: t(lang, 'w21m4.hpc.sessionClass', { session: card.session, className: card.className }) },
    { kind: 'line', strong: true, text: [t(lang, 'w21m4.hpc.name', { name: s.name }), s.rollNo ? t(lang, 'w21m4.hpc.roll', { roll: s.rollNo }) : null, s.admissionNo ? t(lang, 'w21m4.hpc.admission', { no: s.admissionNo }) : null].filter(Boolean).join(' · ') },
  ];
  const notFilled = t(lang, 'w21m4.hpc.notFilled');

  blocks.push({ kind: 'heading', text: t(lang, 'w21m4.hpc.scholastic') });
  if (!card.exams.length) blocks.push({ kind: 'note', text: t(lang, 'w21m4.hpc.noResults') });
  else
    blocks.push({
      kind: 'table',
      columns: [t(lang, 'rc.col.subject'), ...card.exams.map(examLabel)],
      numeric: [false, ...card.exams.map(() => false)],
      rows: [...card.scholastic.map((r) => [r.subject, ...r.cells.map((c) => cellWords(lang, c))]), [t(lang, 'ex.result.overall'), ...card.overall.map((c) => cellWords(lang, c))]],
      totalRow: true,
    });

  blocks.push({ kind: 'heading', text: t(lang, 'w21m4.hpc.coScholastic') });
  if (!card.coScholastic.length) blocks.push({ kind: 'note', text: t(lang, 'w21m4.hpc.noCo') });
  else
    blocks.push({
      kind: 'table',
      columns: [t(lang, 'rc.col.area'), ...card.exams.map(examLabel)],
      numeric: [false, ...card.exams.map(() => false)],
      rows: card.coScholastic.map((r) => [r.area, ...r.grades.map((g) => g ?? t(lang, 'w21m4.hpc.cell.none'))]),
      totalRow: false,
    });

  blocks.push({ kind: 'heading', text: t(lang, 'w21m4.hpc.health') });
  blocks.push(card.entry.healthNote ? { kind: 'line', text: card.entry.healthNote } : { kind: 'note', text: notFilled });

  blocks.push({ kind: 'heading', text: t(lang, 'w21m4.hpc.attendance') });
  if (!card.attendance) blocks.push({ kind: 'note', text: t(lang, 'w21m4.hpc.noAttendance') });
  else {
    const pct = Math.round((card.attendance.present / card.attendance.days) * 1000) / 10;
    blocks.push({ kind: 'line', text: t(lang, 'w21m4.hpc.attendanceLine', { present: num(card.attendance.present, lang), days: num(card.attendance.days, lang), percent: num(pct, lang) }) });
  }

  blocks.push({ kind: 'heading', text: t(lang, 'w21m4.hpc.remarks') });
  for (const r of card.examRemarks) blocks.push({ kind: 'line', text: t(lang, 'w21m4.hpc.examRemark', { exam: r.exam, remark: r.remark }) });
  blocks.push(card.entry.teacherRemark ? { kind: 'line', text: t(lang, 'w21m4.hpc.sessionRemark', { remark: card.entry.teacherRemark }) } : { kind: 'note', text: notFilled });

  blocks.push({ kind: 'heading', text: t(lang, 'w21m4.hpc.self') });
  blocks.push(card.entry.selfAssessment ? { kind: 'line', text: card.entry.selfAssessment } : { kind: 'note', text: notFilled });

  blocks.push({ kind: 'heading', text: t(lang, 'w21m4.hpc.parent') });
  blocks.push(card.entry.parentFeedback ? { kind: 'line', text: card.entry.parentFeedback } : { kind: 'note', text: notFilled });

  blocks.push({ kind: 'note', text: t(lang, 'w21m4.hpc.how') });
  return blocks;
}
