import { createHash, randomUUID } from 'node:crypto';
import { writeAuditLog } from '@/lib/audit/log';
import type { SchoolCheckedPaper } from '@/lib/contracts/school-link';
import { ON_ROLL, type PaperComponent } from '@/lib/exams/papers';
import { publicationInForce } from '@/lib/exams/publish';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { JobHandler, Sql } from '@/lib/jobs/types';
import { log } from '@/lib/observability/log';
import type { FileStorage } from '@/lib/storage/file-storage';
import { documentsGone } from '@/lib/whatsapp/documents';
import { languageFor } from '@/lib/whatsapp/gate';
import { templateToSend } from '@/lib/whatsapp/templates';
import { looksLikePdf, PDF_MAX_BYTES, pdfFileName, type CheckedPdfInput } from './checked-pdf-shape';
import { markingSettings, type Actor } from './context';
import { checkedPaper, impliedChoiceCounts, type ViewQuestion } from './family-view';
import { linksOf, recordsConsented } from './report-links';

// The checked paper as a PDF, the server's side (C366, migration aq_5_pdf). The office's browser draws a child's PDF
// (./checked-pdf.ts) from what this reads, and hands it back to be kept until it is sent: result_pdfs, the file in the
// school's own folder of the store. The send-gate gives it to WhatsApp only once a message with it passes every rule
// (src/lib/whatsapp/gate.ts, documents.ts); then the file is deleted, and the hourly sweep here deletes whatever is left
// (sent, or made more than seven days ago).
//
//   - Who: the principal and the school admin, the two who press Send (TELL_ROLES of ./result-send.ts; the database
//     says the same). A teacher, the coordinator, a parent and another school reach nothing.
//   - Which child: one on the class's roll, with the school's consent for the records, whose class's result is
//     published, while the school lets families see the checked answer sheets, with at least one checked page still
//     kept (a child whose pictures are deleted gets the link-only message, as before), and not yet sent for this
//     publication. One kept copy per child and publication: a second press finds the first.
//   - What: a PDF by its own bytes, at most PDF_MAX_BYTES. The audit row has ids and the size only.
// Rules only: nothing here calls a model or a provider.

export const PDF_TEMPLATE = 'exam_result_pdf';
// TELL_ROLES of ./result-send.ts (test/marking/result-pdf.test.ts holds them equal); not imported, so the two files
// do not import each other.
export const PDF_ROLES: readonly Actor['role'][] = ['principal', 'school_admin'];
export const RESULT_PDFS_SWEEP_JOB = 'marking.result_pdfs_sweep';
const SWEEP_BATCH = 200;
const SWEEP_ROUNDS = 5;

// Whether the PDF message may go for this school now: families see the checked answer sheets (Exams settings), and its
// words are approved: by us, and by Meta too unless the school is a test school, which only ever sends to the stand-in.
// Until Meta approves it, families get the link-only message (docs/36 §6).
export type PdfSchoolState = { on: boolean; why: 'not_shown' | 'not_approved' | null };
export async function pdfSchoolState(db: Sql, schoolId: string): Promise<PdfSchoolState> {
  if (!(await markingSettings(db, schoolId)).familiesSeeScripts) return { on: false, why: 'not_shown' };
  const test = (await db.query(`select is_test_fixture from schools where school_id = $1`, [schoolId])).rows[0]?.is_test_fixture === true;
  const words = await templateToSend(db, schoolId, PDF_TEMPLATE, 'en', !test);
  return words ? { on: true, why: null } : { on: false, why: 'not_approved' };
}

// The children of the class with at least one checked page still kept on an approved script of the exam.
export async function childrenWithPages(db: Sql, schoolId: string, examId: string, classId: string): Promise<Set<string>> {
  const { rows } = await db.query(
    `select distinct s.student_id
       from marking_sheets s
       join exam_papers p on p.school_id = s.school_id and p.paper_id = s.paper_id
       join marking_pages g on g.school_id = s.school_id and g.sheet_id = s.sheet_id and g.picture_gone_at is null and g.state <> 'removed'
      where s.school_id = $1 and p.exam_id = $2 and p.class_id = $3 and s.state = 'approved' and not ('changed' = any (s.flags)) and s.student_id is not null`,
    [schoolId, examId, classId]
  );
  return new Set((rows as { student_id: string }[]).map((r) => r.student_id));
}

// The copies kept for a publication, by child.
export async function keptPdfs(db: Sql, schoolId: string, publicationId: string): Promise<Map<string, string>> {
  const { rows } = await db.query(`select student_id, pdf_id from result_pdfs where school_id = $1 and publication_id = $2 and deleted_at is null`, [schoolId, publicationId]);
  return new Map((rows as { student_id: string; pdf_id: string }[]).map((r) => [r.student_id, r.pdf_id]));
}

export type PdfProblem = 'not_allowed' | 'not_found' | 'not_published' | 'not_shown' | 'no_pages' | 'already_sent';
type Checked = { publicationId: string; version: number; publishedAt: string; exam: string; child: { name: string; rollNo: string | null; className: string } };

// Everything a child's PDF needs to be true before it is read or kept.
async function checkChild(db: Sql, actor: Actor, examId: string, classId: string, studentId: string): Promise<Checked | PdfProblem> {
  if (!PDF_ROLES.includes(actor.role)) return 'not_allowed';
  if (![examId, classId, studentId].every(isUuid)) return 'not_found';
  const exam = (await db.query(`select name from exams where school_id = $1 and exam_id = $2`, [actor.schoolId, examId])).rows[0] as { name: string } | undefined;
  const child = (
    await db.query(
      `select s.name, s.roll_no, c.name as class_name from students s join classes c on c.school_id = s.school_id and c.class_id = s.class_id
        where s.school_id = $1 and s.student_id = $2 and s.class_id = $3 and ${ON_ROLL}`,
      [actor.schoolId, studentId, classId]
    )
  ).rows[0] as { name: string; roll_no: string | null; class_name: string } | undefined;
  if (!exam || !child || !(await recordsConsented(db, actor.schoolId, studentId))) return 'not_found';
  const pub = await publicationInForce(db, actor.schoolId, examId, classId);
  if (!pub) return 'not_published';
  if (!(await markingSettings(db, actor.schoolId)).familiesSeeScripts) return 'not_shown';
  if (!(await childrenWithPages(db, actor.schoolId, examId, classId)).has(studentId)) return 'no_pages';
  if ((await linksOf(db, actor.schoolId, examId, classId, pub.version)).get(studentId)?.live) return 'already_sent';
  return { publicationId: pub.publicationId, version: pub.version, publishedAt: pub.publishedAt, exam: exam.name, child: { name: child.name, rollNo: child.roll_no ?? null, className: child.class_name } };
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const dayOf = (v: unknown): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(v instanceof Date ? v : new Date(String(v)));

// The child's checked papers of the publication, as the family is shown them (the same builder, family-view.ts), in
// subject order: each approved script's parts, questions, the teacher's words and the pages still kept.
async function papersOf(db: Sql, schoolId: string, examId: string, classId: string, studentId: string, exam: string, publishedOn: string): Promise<SchoolCheckedPaper[]> {
  const sheets = (
    await db.query(
      `select p.paper_id, p.components, sb.name as subject, s.sheet_id, s.strengths, s.improve, s.practice, ms.choice_counts
         from exam_papers p
         join subjects sb on sb.school_id = p.school_id and sb.subject_id = p.subject_id
         join marking_sheets s on s.school_id = p.school_id and s.paper_id = p.paper_id and s.student_id = $4 and s.state = 'approved' and not ('changed' = any (s.flags))
         left join marking_setups ms on ms.school_id = p.school_id and ms.paper_id = p.paper_id
        where p.school_id = $1 and p.exam_id = $2 and p.class_id = $3
        order by sb.name, p.paper_id`,
      [schoolId, examId, classId, studentId]
    )
  ).rows as { paper_id: string; components: PaperComponent[]; subject: string; sheet_id: string; strengths: string | null; improve: string | null; practice: { unitId: string | null; text: string }[] | null; choice_counts: Record<string, number> | null }[];
  const out: SchoolCheckedPaper[] = [];
  for (const sh of sheets) {
    const questions = (
      await db.query(
        `select q.question_id, q.label, q.prompt, q.component, q.max_marks, q.choice_group, u.chapter, u.topic,
                coalesce(m.marks, m.ai_marks) as marks, coalesce(m.note, m.ai_note) as note, m.error_type, m.page_id, m.y_from, m.y_to
           from marking_questions q
           join marking_marks m on m.school_id = q.school_id and m.question_id = q.question_id and m.sheet_id = $3
           left join syllabus_units u on u.school_id = q.school_id and u.unit_id = q.unit_id
          where q.school_id = $1 and q.paper_id = $2
          order by q.position, q.label`,
        [schoolId, sh.paper_id, sh.sheet_id]
      )
    ).rows.map(
      (r): ViewQuestion => ({
        questionId: r.question_id,
        label: r.label,
        prompt: r.prompt ?? null,
        component: r.component,
        maxMarks: Number(r.max_marks),
        choiceGroup: r.choice_group ?? null,
        chapter: r.chapter ?? null,
        topic: r.topic ?? null,
        marks: num(r.marks),
        note: r.note ?? null,
        errorType: r.error_type ?? null,
        pageId: r.page_id ?? null,
        yFrom: num(r.y_from),
        yTo: num(r.y_to),
      })
    );
    const pages = (
      await db.query(`select page_id, width, height from marking_pages where school_id = $1 and sheet_id = $2 and picture_gone_at is null and state <> 'removed' order by sheet_position`, [schoolId, sh.sheet_id])
    ).rows.map((g) => ({ pageId: g.page_id as string, width: Number(g.width), height: Number(g.height) }));
    const unitIds = (sh.practice ?? []).map((p) => p.unitId).filter((u): u is string => !!u && isUuid(u));
    const units = unitIds.length ? ((await db.query(`select unit_id, chapter, topic from syllabus_units where school_id = $1 and unit_id = any ($2::uuid[])`, [schoolId, unitIds])).rows as { unit_id: string; chapter: string; topic: string }[]) : [];
    const parts = (sh.components ?? []).map((c) => ({ key: c.key, name: c.name, max: Number(c.max) }));
    out.push(
      checkedPaper({
        paperId: sh.paper_id,
        exam,
        term: null,
        subject: sh.subject ?? '',
        publishedOn,
        parts,
        choiceCounts: sh.choice_counts && Object.keys(sh.choice_counts).length ? sh.choice_counts : impliedChoiceCounts(parts, questions),
        questions,
        strengths: sh.strengths,
        improve: sh.improve,
        practice: (sh.practice ?? []).map((p) => {
          const u = units.find((x) => x.unit_id === p.unitId);
          return { text: String(p.text ?? ''), chapter: u?.chapter ?? null, topic: u?.topic ?? null };
        }),
        pages,
      })
    );
  }
  return out;
}

// What the office's browser draws a child's PDF from, in the language the child's family is written to (the first
// guardian with a number, else the school's).
export async function checkedPdfData(db: Sql, actor: Actor, examId: string, classId: string, studentId: string): Promise<CheckedPdfInput | PdfProblem> {
  const c = await checkChild(db, actor, examId, classId, studentId);
  if (typeof c === 'string') return c;
  const school = (await db.query(`select name from schools where school_id = $1`, [actor.schoolId])).rows[0] as { name: string } | undefined;
  const guardian = (
    await db.query(
      `select p.parent_id from parent_student_map m join parents p on p.school_id = m.school_id and p.parent_id = m.parent_id
        where m.school_id = $1 and m.student_id = $2 and p.merged_into is null and coalesce(p.phone, '') <> ''
          and m.verification_status::text not in ('tombstoned', 'withdrawn', 'expired')
        order by p.name, p.parent_id limit 1`,
      [actor.schoolId, studentId]
    )
  ).rows[0] as { parent_id: string } | undefined;
  const publishedOn = dayOf(c.publishedAt);
  return {
    school: school?.name ?? '',
    child: c.child.name,
    className: c.child.className,
    rollNo: c.child.rollNo,
    exam: c.exam,
    publishedOn,
    lang: await languageFor(db, actor.schoolId, guardian?.parent_id ?? null),
    papers: await papersOf(db, actor.schoolId, examId, classId, studentId, c.exam, publishedOn),
  };
}

export type StoreResult = { ok: true; pdfId: string; existing: boolean } | { ok: false; reason: PdfProblem | 'not_a_pdf' | 'too_large' | 'storage' };
export const resultPdfKey = (schoolId: string, publicationId: string, pdfId: string) => `${schoolId}/result-pdfs/${publicationId}/${pdfId}.pdf`;

// Keeps a child's PDF until it is sent. A copy already kept for the child and publication is the answer as it is.
export async function storeResultPdf(db: Sql, storage: Pick<FileStorage, 'put' | 'remove'>, actor: Actor, examId: string, classId: string, studentId: string, bytes: Uint8Array): Promise<StoreResult> {
  if (bytes.length > PDF_MAX_BYTES) return { ok: false, reason: 'too_large' };
  if (!looksLikePdf(bytes)) return { ok: false, reason: 'not_a_pdf' };
  const c = await checkChild(db, actor, examId, classId, studentId);
  if (typeof c === 'string') return { ok: false, reason: c };
  const kept = (await keptPdfs(db, actor.schoolId, c.publicationId)).get(studentId);
  if (kept) return { ok: true, pdfId: kept, existing: true };
  const pdfId = randomUUID();
  const key = resultPdfKey(actor.schoolId, c.publicationId, pdfId);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  try {
    await storage.put(key, bytes, 'application/pdf');
  } catch {
    return { ok: false, reason: 'storage' };
  }
  await db.query('savepoint result_pdf');
  try {
    await db.query(
      `insert into result_pdfs (pdf_id, school_id, exam_id, class_id, student_id, publication_id, storage_key, file_name, sha256, bytes, made_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [pdfId, actor.schoolId, examId, classId, studentId, c.publicationId, key, pdfFileName(c.exam, c.child.className, c.child.rollNo), sha256, bytes.length, actor.userId]
    );
    await db.query('release savepoint result_pdf');
  } catch (err) {
    await db.query('rollback to savepoint result_pdf');
    await storage.remove(key).catch(() => undefined);
    // Kept by another press a moment ago: that copy is the answer.
    const other = (await keptPdfs(db, actor.schoolId, c.publicationId)).get(studentId);
    if (other) return { ok: true, pdfId: other, existing: true };
    throw err;
  }
  // Ids and the size only: never the child's name, a mark or the file's place in the store.
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'marking.result_pdf_made', targetType: 'students', targetId: studentId, beforeState: undefined, afterState: { examId, classId, version: c.version, pdfId, bytes: bytes.length } });
  return { ok: true, pdfId, existing: false };
}

// ---- the hourly sweep --------------------------------------------------------------------------------------------------

type Platform = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
type Due = { school_id: string; pdf_id: string; storage_key: string };

// Deletes every copy that was sent, or made more than seven days ago (result_pdfs_due), through the one storage module,
// and records each one deleted (result_pdfs_gone): the store first, then the row, so a copy is never recorded gone
// while it is still stored. One audit row a school, with the count only. While the store does not work it does nothing
// and succeeds, as the pictures' sweep (./retention.ts); the next run catches up.
export function resultPdfsSweepHandler(deps: { platform: Platform; storage: Pick<FileStorage, 'remove'>; storageWorks?: () => Promise<boolean> }): JobHandler {
  return async () => {
    if (deps.storageWorks && !(await deps.storageWorks())) return;
    const bySchool = new Map<string, number>();
    let notDeleted = 0;
    for (let round = 0; round < SWEEP_ROUNDS; round++) {
      const due = await deps.platform(async (db) => (await db.query(`select school_id, pdf_id, storage_key from public.result_pdfs_due($1)`, [SWEEP_BATCH])).rows as Due[]);
      if (!due.length) break;
      const deleted: Due[] = [];
      for (const d of due) {
        // The key is the database's own (<school>/result-pdfs/..., held by a check); never another area's.
        if (!d.storage_key.startsWith(`${d.school_id}/result-pdfs/`)) {
          notDeleted += 1;
          continue;
        }
        try {
          await deps.storage.remove(d.storage_key);
          deleted.push(d);
        } catch {
          notDeleted += 1;
        }
      }
      if (deleted.length) {
        await deps.platform((db) => documentsGone(db, deleted.map((d) => d.pdf_id)));
        for (const d of deleted) bySchool.set(d.school_id, (bySchool.get(d.school_id) ?? 0) + 1);
      }
      if (deleted.length < due.length || due.length < SWEEP_BATCH) break;
    }
    for (const [schoolId, deleted] of bySchool) {
      try {
        await deps.platform((db) =>
          writeAuditLog(db, { schoolId, actorUserId: null, actorRole: null, eventAction: 'marking.result_pdfs_deleted', targetType: 'result_pdfs', targetId: undefined, beforeState: undefined, afterState: { deleted, by: RESULT_PDFS_SWEEP_JOB } })
        );
      } catch {
        log('error', 'marking.result_pdfs_sweep.not_audited', { schoolId, deleted });
      }
    }
    if (notDeleted > 0) throw new Error(`${RESULT_PDFS_SWEEP_JOB}: ${notDeleted} PDF(s) not deleted`);
  };
}
