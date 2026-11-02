import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { NO_PERSON } from '@/lib/auth/db';
import { colors } from '@/lib/design-tokens';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { t, type Lang } from '@/lib/i18n';
import { PermanentJobError, type JobHandler, type Sql } from '@/lib/jobs/types';
import { pdfFileName } from '@/lib/marking/checked-pdf-shape';
import { textPdf } from '@/lib/pdf/text-pdf';
import { needsUnicode, unicodePdf } from '@/lib/pdf/unicode-pdf';
import type { FileStorage } from '@/lib/storage/file-storage';
import type { Actor } from './exams';
import { roundPercent } from './grading';
import { ON_ROLL, ROLL_ORDER } from './papers';
import { publicationInForce, REPORT_CARD_OFFICE } from './publish';
import { reportCards, totalOf } from './report-card';
import { queueReportCards, REPORT_CARD_JOB, type EnqueueLike } from './report-card-queue';
import { reportCardBlocks, type CardBlock } from './report-card-text';
import { classResult, type ClassResult, type Shown } from './results';

// Report cards as files (W14-F). When a class is published, a job a child (./report-card-queue.ts) makes the child's
// report card, from the same words the card on the screen is made of (report-card-text.ts), as a PDF kept in the
// school's own folder of the store with a result_pdfs row of kind 'report_card' (migration w14_f_report_cards). Then:
//
//   - the publish page and the class's result page say how far it got ("12 of 26 ready", "all 26 ready", "3 failed:
//     try again"), from the jobs (report_card_jobs()) and the rows; "try again" runs the failed ones again and queues
//     any child not queued (a class published before this, or a child added since);
//   - "Get every report card" is one zip of the class's kept files, in roll order; "Class report" is one page with
//     the class summary from results.ts (each subject's average, highest, lowest and how many passed, and every
//     child's total and grade, in roll order);
//   - the family gets their own child's card in the Family app (src/lib/school-link/marking.ts).
//
// Who: the office (the principal, the school admin, the academic coordinator) and the class's class teacher see and
// get them, as they download report cards today; the office makes them again. The job runs in the school's own
// session as its office sees it, with no person (the 'exams.report_cards' school job), and the row is made in the
// name of whoever published. A file made for a publication that was reopened since is kept until the retention date,
// like the checked papers' pictures, and never reaches a family. The server's PDF has the PDF's own Latin font: its
// words are English (the browser's "Download PDF" keeps every language).

export const REPORT_CARD_SCHOOL_JOB = 'exams.report_cards' as const;
// The school's own job session (src/lib/jobs/school-context.ts's asSchool, passed in by the job runner's handlers).
type AsSchool = <T>(schoolId: string, job: typeof REPORT_CARD_SCHOOL_JOB, fn: (db: PoolClient) => Promise<T>) => Promise<T>;
export const FILE_LANG: Lang = 'en';
const MAX_BYTES = 4_000_000;

export type FilesProblem = 'not_allowed' | 'not_found' | 'not_published';
type Pub = { publicationId: string; version: number };

const reportCardKey = (schoolId: string, publicationId: string, pdfId: string) => `${schoolId}/result-pdfs/${publicationId}/${pdfId}.pdf`;
// "report-card_<exam>_<class>_roll-<n>.pdf", within the table's check (80 letters, digits, - and _).
export const reportCardFileName = (exam: string, className: string, rollNo: string | null) => `${`report-card_${pdfFileName(exam, className, rollNo).replace(/\.pdf$/, '')}`.slice(0, 80)}.pdf`;

async function mayGet(db: Sql, actor: Actor, classId: string): Promise<boolean> {
  if (REPORT_CARD_OFFICE.includes(actor.role)) return true;
  return (await db.query(`select public.is_class_teacher_of($1) as yes`, [classId])).rows[0]?.yes === true;
}

async function inForce(db: Sql, actor: Actor, examId: string, classId: string): Promise<Pub | FilesProblem> {
  if (!isUuid(examId) || !isUuid(classId)) return 'not_found';
  if (!(await mayGet(db, actor, classId))) return 'not_allowed';
  const pub = await publicationInForce(db, actor.schoolId, examId, classId);
  return pub ? { publicationId: pub.publicationId, version: pub.version } : 'not_published';
}

// ---- the job ---------------------------------------------------------------------------------------------------------

export type MadeFile = 'made' | 'kept' | 'superseded';

// One child's card of one publication, made once. Superseded (nothing made, the job succeeds): the class was reopened
// or published again since, or the child is no longer on its roll.
export async function makeReportCardFile(db: Sql, storage: Pick<FileStorage, 'put' | 'remove'>, schoolId: string, p: { examId: string; classId: string; studentId: string; publicationId: string }): Promise<MadeFile> {
  const pub = await publicationInForce(db, schoolId, p.examId, p.classId);
  if (!pub || pub.publicationId !== p.publicationId) return 'superseded';
  const kept = async () =>
    (await db.query(`select 1 from result_pdfs where school_id = $1 and publication_id = $2 and student_id = $3 and kind = 'report_card' and deleted_at is null`, [schoolId, p.publicationId, p.studentId])).rows.length > 0;
  if (await kept()) return 'kept';
  const r = await reportCards(db, { schoolId, userId: NO_PERSON, role: 'principal' }, p.examId, p.classId, p.studentId);
  if (!r.ok || !r.set.cards[0]) return 'superseded';
  const card = r.set.cards[0];
  // A card with a Hindi name, subject or remark is drawn with a shaping engine and an embedded font; a Latin one keeps the small writer.
  const docs = [reportCardBlocks(r.set, card, FILE_LANG)];
  const title = `${r.set.exam.name} ${r.set.className}`;
  const bytes = needsUnicode(docs) ? await unicodePdf(docs, { title }) : textPdf(docs, { title });
  if (bytes.length > MAX_BYTES) throw new PermanentJobError(`${REPORT_CARD_JOB}: the card is too large`);
  const madeBy = (await db.query(`select published_by from exam_publications where school_id = $1 and publication_id = $2`, [schoolId, p.publicationId])).rows[0]?.published_by as string | undefined;
  if (!madeBy) return 'superseded';
  const pdfId = randomUUID();
  const key = reportCardKey(schoolId, p.publicationId, pdfId);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await storage.put(key, bytes, 'application/pdf');
  await db.query('savepoint report_card_file');
  try {
    await db.query(
      `insert into result_pdfs (pdf_id, school_id, exam_id, class_id, student_id, publication_id, storage_key, file_name, sha256, bytes, made_by, kind)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'report_card')`,
      [pdfId, schoolId, p.examId, p.classId, p.studentId, p.publicationId, key, reportCardFileName(r.set.exam.name, r.set.className, card.rollNo), sha256, bytes.length, madeBy]
    );
    await db.query('release savepoint report_card_file');
  } catch (err) {
    await db.query('rollback to savepoint report_card_file');
    await storage.remove(key).catch(() => undefined);
    // Made by another run a moment ago: that copy is the answer.
    if (await kept()) return 'kept';
    throw err;
  }
  return 'made';
}

export function reportCardJobHandler(deps: { asSchool: AsSchool; storage: Pick<FileStorage, 'put' | 'remove'> }): JobHandler {
  return async (job) => {
    const p = job.payload as Record<string, unknown>;
    const schoolId = job.schoolId;
    if (!schoolId || ![p.examId, p.classId, p.studentId, p.publicationId].every((v) => typeof v === 'string' && isUuid(v))) throw new PermanentJobError(`${REPORT_CARD_JOB}: bad payload`);
    await deps.asSchool(schoolId, REPORT_CARD_SCHOOL_JOB, (db) =>
      makeReportCardFile(db, deps.storage, schoolId, { examId: p.examId as string, classId: p.classId as string, studentId: p.studentId as string, publicationId: p.publicationId as string })
    );
  };
}

// ---- how far it got --------------------------------------------------------------------------------------------------

export type ReportCardFiles = { version: number; total: number; ready: number; waiting: number; failed: number; missing: number; mayMake: boolean };

export async function reportCardFiles(db: Sql, actor: Actor, examId: string, classId: string): Promise<ReportCardFiles | FilesProblem> {
  const pub = await inForce(db, actor, examId, classId);
  if (typeof pub === 'string') return pub;
  const roll = (await db.query(`select s.student_id from students s where s.school_id = $1 and s.class_id = $2 and ${ON_ROLL}`, [actor.schoolId, classId])).rows.map((r) => r.student_id as string);
  const ready = new Set(
    (await db.query(`select student_id from result_pdfs where school_id = $1 and publication_id = $2 and kind = 'report_card' and deleted_at is null`, [actor.schoolId, pub.publicationId])).rows.map((r) => r.student_id as string)
  );
  const jobs = new Map((await db.query(`select student_id, status from public.report_card_jobs($1)`, [pub.publicationId])).rows.map((r) => [r.student_id as string, r.status as string]));
  const out: ReportCardFiles = { version: pub.version, total: roll.length, ready: 0, waiting: 0, failed: 0, missing: 0, mayMake: REPORT_CARD_OFFICE.includes(actor.role) };
  for (const id of roll) {
    const status = jobs.get(id);
    if (ready.has(id)) out.ready += 1;
    else if (status === 'dead') out.failed += 1;
    else if (status === 'pending' || status === 'running') out.waiting += 1;
    else out.missing += 1;
  }
  return out;
}

// "Try again" / "Make them now": queues every child not queued for this version, and runs the failed ones again. The
// keys, to run them at once after the request commits.
export async function makeReportCardFiles(db: Sql, queue: EnqueueLike, actor: Actor, examId: string, classId: string): Promise<{ ok: true; jobKeys: string[]; retried: number } | { ok: false; reason: FilesProblem }> {
  const pub = await inForce(db, actor, examId, classId);
  if (typeof pub === 'string') return { ok: false, reason: pub };
  if (!REPORT_CARD_OFFICE.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const jobKeys = await queueReportCards(db, queue, actor.schoolId, examId, classId, pub);
  const retried = Number((await db.query(`select public.report_card_jobs_retry($1) as n`, [pub.publicationId])).rows[0]?.n ?? 0);
  return { ok: true, jobKeys, retried };
}

// ---- every card in one zip -------------------------------------------------------------------------------------------

export type BundleFiles = { name: string; files: { name: string; key: string }[] };

// The kept files of the publication in force, in roll order, each under its own name (a repeated name gets "-2").
export async function reportCardBundle(db: Sql, actor: Actor, examId: string, classId: string): Promise<BundleFiles | FilesProblem> {
  const pub = await inForce(db, actor, examId, classId);
  if (typeof pub === 'string') return pub;
  const rows = (
    await db.query(
      `select p.storage_key, p.file_name from result_pdfs p join students s on s.school_id = p.school_id and s.student_id = p.student_id
        where p.school_id = $1 and p.publication_id = $2 and p.kind = 'report_card' and p.deleted_at is null and s.class_id = $3 and ${ON_ROLL}
        order by ${ROLL_ORDER}`,
      [actor.schoolId, pub.publicationId, classId]
    )
  ).rows as { storage_key: string; file_name: string }[];
  const used = new Map<string, number>();
  const files = rows
    .filter((r) => r.storage_key.startsWith(`${actor.schoolId}/result-pdfs/`))
    .map((r) => {
      const n = (used.get(r.file_name) ?? 0) + 1;
      used.set(r.file_name, n);
      return { name: n === 1 ? r.file_name : r.file_name.replace(/\.pdf$/, `-${n}.pdf`), key: r.storage_key };
    });
  const head = (await db.query(`select e.name as exam, c.name as class from exams e, classes c where e.school_id = $1 and e.exam_id = $2 and c.school_id = $1 and c.class_id = $3`, [actor.schoolId, examId, classId])).rows[0] as
    | { exam: string; class: string }
    | undefined;
  return { name: `${reportCardFileName(head?.exam ?? '', head?.class ?? '', null).replace(/\.pdf$/, '')}.zip`, files };
}

// ---- the class report --------------------------------------------------------------------------------------------------

export type SummaryRow = { name: string; average: number | null; highest: number | null; lowest: number | null; counted: number; passed: number | null };
export type ClassSummary = {
  exam: string;
  term: string | null;
  className: string;
  version: number;
  decimals: 0 | 1;
  passMark: number | null;
  subjects: SummaryRow[];
  overall: SummaryRow;
  children: { name: string; rollNo: string | null; total: { score: number; max: number } | null; percent: number | null; grade: string | null }[];
};

const gradeOf = (s: Shown) => (s.grade.kind === 'grade' ? s.grade.grade : null);

function row(name: string, results: readonly Shown[], decimals: 0 | 1, passMark: number | null, passes: readonly (boolean | null)[]): SummaryRow {
  const known = results.filter((r) => r.percent !== null && r.rounded !== null);
  const rounded = known.map((r) => r.rounded as number);
  return {
    name,
    average: known.length ? roundPercent(known.reduce((s, r) => s + (r.percent as number), 0) / known.length, decimals) : null,
    highest: rounded.length ? Math.max(...rounded) : null,
    lowest: rounded.length ? Math.min(...rounded) : null,
    counted: known.length,
    passed: passMark === null ? null : passes.filter((p) => p === true).length,
  };
}

// The class summary from the class's result (results.ts classResult: each child's percent and grade by the kept
// scheme). Pure. A subject is passed at the scheme's pass mark (a percent of the subject); the whole exam when every
// subject is. Without a pass mark, no pass count. Children stay in roll order: nothing here ranks them.
export function classSummary(result: ClassResult, passMark: number | null): ClassSummary {
  const decimals = result.scheme?.decimals ?? 0;
  const passes = (s: Shown) => (passMark === null || s.rounded === null ? null : s.rounded >= passMark);
  const subjects = result.papers.map((p, i) => {
    const each = result.children.map((c) => c.papers[i]);
    return row(p.subjectName, each, decimals, passMark, each.map(passes));
  });
  const everySubject = result.children.map((c) => (passMark === null || c.papers.some((p) => p.rounded === null) ? null : c.papers.every((p) => (p.rounded as number) >= passMark)));
  return {
    exam: result.exam.name,
    term: result.exam.term,
    className: result.className,
    version: result.publication?.version ?? 0,
    decimals,
    passMark,
    subjects,
    overall: row('', result.children.map((c) => c.overall), decimals, passMark, everySubject),
    children: result.children.map((c) => {
      const totals = result.papers.map((p, i) => totalOf(p.components, c.papers[i].marks));
      // As the card's overall total (report-card.ts): the papers' totals that are known, once the overall percent is.
      const total =
        c.overall.percent !== null && totals.some((x) => x !== null)
          ? { score: Math.round(totals.reduce((s, x) => s + (x?.score ?? 0), 0) * 10) / 10, max: Math.round(totals.reduce((s, x) => s + (x?.max ?? 0), 0) * 10) / 10 }
          : null;
      return { name: c.name, rollNo: c.rollNo, total, percent: c.overall.rounded, grade: gradeOf(c.overall) };
    }),
  };
}

export async function classReport(db: Sql, actor: Actor, examId: string, classId: string): Promise<{ summary: ClassSummary; school: string } | FilesProblem> {
  const pub = await inForce(db, actor, examId, classId);
  if (typeof pub === 'string') return pub;
  const kept = await publicationInForce(db, actor.schoolId, examId, classId);
  const result = await classResult(db, actor, examId, classId);
  if (!result || !kept) return 'not_found';
  const school = ((await db.query(`select name from schools where school_id = $1`, [actor.schoolId])).rows[0]?.name as string | undefined) ?? '';
  return { summary: classSummary(result, kept.scheme.passMark ?? null), school };
}

const locale = (lang: Lang) => (lang === 'hi' ? 'hi-IN' : 'en-IN');
const num = (n: number, lang: Lang) => n.toLocaleString(locale(lang), { maximumFractionDigits: 1 });

export function classReportBlocks(s: ClassSummary, school: string, lang: Lang): CardBlock[] {
  const pct = (v: number | null) => (v === null ? t(lang, 'rc.cell.notEntered') : t(lang, 'ex.result.percent', { percent: num(v, lang) }));
  const passCell = (r: SummaryRow) => (r.passed === null ? t(lang, 'rcf.cr.noPassMark') : t(lang, 'rcf.cr.passed', { passed: num(r.passed, lang), counted: num(r.counted, lang) }));
  const line = (r: SummaryRow, name: string) => [name, pct(r.average), pct(r.highest), pct(r.lowest), passCell(r)];
  return [
    { kind: 'title', text: school || t(lang, 'rcf.classReport') },
    { kind: 'subtitle', text: t(lang, 'rcf.cr.heading', { exam: s.term ? `${s.exam} · ${s.term}` : s.exam, className: s.className }) },
    { kind: 'heading', text: t(lang, 'rcf.cr.subjects') },
    {
      kind: 'table',
      columns: [t(lang, 'rc.col.subject'), t(lang, 'rcf.cr.average'), t(lang, 'rcf.cr.highest'), t(lang, 'rcf.cr.lowest'), t(lang, 'rcf.cr.passRate')],
      numeric: [false, true, true, true, true],
      rows: [...s.subjects.map((r) => line(r, r.name)), line(s.overall, t(lang, 'ex.result.overall'))],
      totalRow: true,
    },
    { kind: 'heading', text: t(lang, 'rcf.cr.children') },
    {
      kind: 'table',
      columns: [t(lang, 'rcf.cr.roll'), t(lang, 'rcf.cr.name'), t(lang, 'rc.col.total'), t(lang, 'rc.col.percent'), t(lang, 'rc.col.grade')],
      numeric: [false, false, true, true, false],
      rows: s.children.map((c) => [
        c.rollNo ?? '',
        c.name,
        c.total ? t(lang, 'rc.cell.score', { score: num(c.total.score, lang), max: num(c.total.max, lang) }) : t(lang, 'rc.cell.noTotal'),
        pct(c.percent),
        c.grade ?? '',
      ]),
      totalRow: false,
    },
    { kind: 'note', text: s.passMark === null ? t(lang, 'rcf.cr.howNoPass') : t(lang, 'rcf.cr.how', { passMark: num(s.passMark, lang) }) },
    { kind: 'note', text: t(lang, 'rcf.cr.version', { version: s.version }) },
  ];
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The class report as one page to read or print, in the reader's language (the device's fonts carry Hindi).
export function blocksHtml(blocks: readonly CardBlock[], lang: Lang, title: string): string {
  const body = blocks
    .map((b) => {
      if (b.kind === 'title') return `<h1>${esc(b.text)}</h1>`;
      if (b.kind === 'subtitle') return `<p class="sub">${esc(b.text)}</p>`;
      if (b.kind === 'heading') return `<h2>${esc(b.text)}</h2>`;
      if (b.kind === 'note') return `<p class="note">${esc(b.text)}</p>`;
      if (b.kind === 'line') return `<p${b.strong ? ' class="strong"' : ''}>${esc(b.text)}</p>`;
      const cell = (tag: 'th' | 'td', v: string, i: number) => `<${tag}${b.numeric[i] ? ' class="num"' : ''}>${esc(v)}</${tag}>`;
      const rows = b.rows.map((r, i) => `<tr${b.totalRow && i === b.rows.length - 1 ? ' class="total"' : ''}>${r.map((v, k) => cell('td', v, k)).join('')}</tr>`).join('');
      return `<div class="wrap"><table><thead><tr>${b.columns.map((c, i) => cell('th', c, i)).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
    })
    .join('\n');
  const css = [
    `body{font-family:system-ui,"Noto Sans","Noto Sans Devanagari",sans-serif;color:${colors.slate};background:${colors.offWhite};margin:0;padding:16px;max-width:1100px}`,
    `h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:20px 0 6px}.sub{font-weight:700;margin:0}.note{font-size:13px;opacity:.85}.strong{font-weight:700}`,
    `.wrap{overflow-x:auto}table{border-collapse:collapse;min-width:min(60rem,calc(100vw - 2rem));font-size:14px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid ${colors.slate}}`,
    `th{background:${colors.offWhite}}.num{text-align:right}.total td{font-weight:700}@media print{body{padding:0}}`,
  ].join('');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${css}</style></head><body>${body}</body></html>`;
}
