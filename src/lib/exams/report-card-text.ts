import { t, type Lang, type MessageKey } from '@/lib/i18n';
import type { Mark, PaperComponent } from './papers';
import type { ReportCard, ReportCardSet } from './report-card';
import type { Shown } from './results';

// What a report card says, as blocks of words (docs/27 row 9c, C215): the one text both the PDF (drawn in the
// browser by src/components/exams/report-card-pdf.ts with src/lib/pdf) and the card shown on the screen are made
// from, so the two never differ and a test can read every word the PDF prints. Laid out as the kept grading scheme's
// layout says. Pure: no database, no browser.

export type CardBlock =
  | { kind: 'title'; text: string }
  | { kind: 'subtitle'; text: string }
  | { kind: 'line'; text: string; strong?: boolean }
  | { kind: 'heading'; text: string }
  | { kind: 'table'; columns: string[]; rows: string[][]; numeric: boolean[]; totalRow: boolean }
  | { kind: 'note'; text: string };

const locale = (lang: Lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');
const num = (n: number, lang: Lang) => n.toLocaleString(locale(lang), { maximumFractionDigits: 1 });
const day = (iso: string, lang: Lang) => new Intl.DateTimeFormat(locale(lang), { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));

function markCell(lang: Lang, c: PaperComponent | undefined, m: Mark | undefined): string {
  if (!c) return t(lang, 'rc.cell.notOnPaper');
  if (!m) return t(lang, 'rc.cell.notEntered');
  if (m.kind === 'absent') return t(lang, 'rc.cell.absent');
  if (m.kind === 'exempt') return t(lang, 'rc.cell.exempt');
  return t(lang, 'rc.cell.score', { score: num(m.score ?? 0, lang), max: num(c.max, lang) });
}
const totalCell = (lang: Lang, total: { score: number; max: number } | null) => (total ? t(lang, 'rc.cell.score', { score: num(total.score, lang), max: num(total.max, lang) }) : t(lang, 'rc.cell.noTotal'));
const percentCell = (lang: Lang, s: Shown) => (s.rounded === null ? t(lang, 'ex.result.noPercent') : t(lang, 'ex.result.percent', { percent: num(s.rounded, lang) }));
function gradeCell(lang: Lang, s: Shown): string {
  if (s.grade.kind === 'grade') return s.grade.meaning ? t(lang, 'rc.cell.gradeMeaning', { grade: s.grade.grade, meaning: s.grade.meaning }) : s.grade.grade;
  return t(lang, `ex.noGrade.${s.grade.reason}` as MessageKey);
}

export function reportCardBlocks(set: ReportCardSet, card: ReportCard, lang: Lang): CardBlock[] {
  const l = set.layout;
  const blocks: CardBlock[] = [];
  blocks.push({ kind: 'title', text: set.schoolName || t(lang, 'rc.card.title') });
  blocks.push({ kind: 'subtitle', text: t(lang, 'rc.card.heading', { exam: set.exam.name }) });
  const about = [set.exam.term ? t(lang, 'rc.card.term', { term: set.exam.term }) : null, set.exam.session ? t(lang, 'rc.card.session', { session: set.exam.session }) : null].filter(Boolean) as string[];
  if (about.length) blocks.push({ kind: 'line', text: about.join(' · ') });
  blocks.push({ kind: 'line', strong: true, text: card.name });
  blocks.push({
    kind: 'line',
    text: [t(lang, 'rc.card.class', { className: set.className }), card.rollNo ? t(lang, 'rc.card.roll', { roll: card.rollNo }) : null, card.admissionNo ? t(lang, 'rc.card.admission', { no: card.admissionNo }) : null].filter(Boolean).join(' · '),
  });

  // Subjects: the columns the layout keeps.
  const head: [string, boolean][] = [[t(lang, 'rc.col.subject'), false]];
  if (l.components) for (const c of set.columns) head.push([c.name, true]);
  if (l.total) head.push([t(lang, 'rc.col.total'), true]);
  if (l.percent) head.push([t(lang, 'rc.col.percent'), true]);
  if (l.grade) head.push([t(lang, 'rc.col.grade'), false]);
  const columns = head.map(([name]) => name);
  const numeric = head.map(([, n]) => n);
  const rows = card.subjects.map((s) => {
    const row = [s.subjectName];
    if (l.components) for (const c of set.columns) row.push(markCell(lang, s.components.find((x) => x.key === c.key), s.marks[c.key]));
    if (l.total) row.push(totalCell(lang, s.total));
    if (l.percent) row.push(percentCell(lang, s.result));
    if (l.grade) row.push(gradeCell(lang, s.result));
    return row;
  });
  const overall = [t(lang, 'ex.result.overall')];
  if (l.components) for (let i = 0; i < set.columns.length; i++) overall.push('');
  if (l.total) overall.push(totalCell(lang, card.overall.total));
  if (l.percent) overall.push(percentCell(lang, card.overall));
  if (l.grade) overall.push(gradeCell(lang, card.overall));
  const showOverall = l.total || l.percent || l.grade;
  blocks.push({ kind: 'table', columns, numeric, rows: showOverall ? [...rows, overall] : rows, totalRow: showOverall });

  if (l.attendance) {
    if (!set.hasSession) blocks.push({ kind: 'line', text: t(lang, 'rc.card.noSession') });
    else if (!card.attendance || card.attendance.days === 0) blocks.push({ kind: 'line', text: t(lang, 'rc.card.noAttendance') });
    else blocks.push({ kind: 'line', text: t(lang, 'rc.card.attendance', { present: num(card.attendance.present, lang), days: num(card.attendance.days, lang) }) });
  }
  if (l.remarks) {
    blocks.push({ kind: 'heading', text: t(lang, 'rc.card.remarkTitle') });
    blocks.push({ kind: 'line', text: card.remark ?? t(lang, 'rc.card.noRemark') });
  }

  // Their own progress: only where the plan has it, and only against their own earlier published exams.
  if (set.recognitionOn && card.recognition) {
    const r = card.recognition;
    if (r.kind === 'first') {
      blocks.push({ kind: 'heading', text: t(lang, 'rc.card.ownTitle') });
      blocks.push({ kind: 'line', text: t(lang, 'rc.card.first', { name: card.name }) });
    } else if (r.personalBest.length || r.mostImproved) {
      blocks.push({ kind: 'heading', text: t(lang, 'rc.card.ownTitle') });
      for (const b of r.personalBest) blocks.push({ kind: 'line', strong: true, text: t(lang, 'rc.card.personalBest', { subject: b.subject, now: num(b.now, lang), best: num(b.best, lang) }) });
      if (r.mostImproved) blocks.push({ kind: 'line', strong: true, text: t(lang, 'rc.card.mostImproved', { subject: r.mostImproved.subject, before: num(r.mostImproved.before, lang), now: num(r.mostImproved.now, lang), exam: r.mostImproved.exam }) });
      blocks.push({ kind: 'note', text: t(lang, 'rc.card.ownOnly', { name: card.name }) });
    }
  }

  blocks.push({ kind: 'note', text: t(lang, 'rc.card.rules') });
  blocks.push({
    kind: 'note',
    text: t(lang, set.publication.publishedBy ? 'rc.card.publication' : 'rc.card.publicationNoName', { version: set.publication.version, date: day(set.publication.publishedAt, lang), name: set.publication.publishedBy ?? '' }),
  });
  blocks.push({ kind: 'note', text: t(lang, 'rc.card.scheme', { version: set.publication.schemeVersion }) });
  return blocks;
}

// Every word of a card, in order: what the PDF prints.
export function blocksText(blocks: readonly CardBlock[]): string {
  return blocks.map((b) => (b.kind === 'table' ? [b.columns.join(' | '), ...b.rows.map((r) => r.join(' | '))].join('\n') : b.text)).join('\n');
}
