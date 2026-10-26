import type { PoolClient } from 'pg';
import { withGuardianContext, withPlatformService } from '@/lib/auth/db';
import type { SchoolCheckedPaper, SchoolExamPaper } from '@/lib/contracts/school-link';
import type { PaperComponent } from '@/lib/exams/papers';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { markingSettings } from '@/lib/marking/context';
import { checkedPaper, impliedChoiceCounts, type ViewQuestion } from '@/lib/marking/family-view';
import type { DirectUploadStorage } from '@/lib/storage/file-storage';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// School Link's part of AI answer-sheet marking (C351): a linked family's checked papers, their page pictures and the
// child's exam timetable, all read AS the guardian (withGuardianContext), so the school's row rules decide every row:
// guardian_marking_sheets() lets through only the guardian's own consented child's approved scripts of a publication in
// force (never one changed after approval and not approved again), and only while the school's "families see the
// checked answer sheets" is on. Every read names its columns: never the answer key, the marking steps, the AI's
// reasons for the teacher, what it read on a page, or the provider and model. The child's own view (child mode)
// is read only while the school's "children see their own results" is on as well. The Family app reaches this through
// src/lib/family/school.ts only (check_family_boundary.py's door).

type Sql = Pick<PoolClient, 'query'>;
type Claims = { accountId: string; tokenVersion: number };
export type ReadAs = { childView: boolean };

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// Whether the school lets a child see their own published results in the Family app (Exams settings). A guardian's
// session reads no school setting (C230-D refuses a parent every table but its own few), so this one row is read by
// the platform role, for the school of the family's own verified link only, in its own transaction after the
// guardian's (never inside it: one connection at a time).
export async function childrenSeeResults(schoolId: string): Promise<boolean> {
  if (!isUuid(schoolId)) return false;
  return withPlatformService((db) => markingSettings(db, schoolId)).then((s) => s.childrenSeeResults);
}

// The child's coming papers: public.guardian_exam_schedule() answers only for the session's guardian's own consented
// children; this keeps one child's.
export async function examSchedule(db: Sql, studentId: string): Promise<SchoolExamPaper[]> {
  const { rows } = await db.query(
    `select exam_name, subject_name, paper_date::text as paper_date, seat_no from public.guardian_exam_schedule() where student_id = $1 order by paper_date, subject_name, exam_name`,
    [studentId]
  );
  return (rows as { exam_name: string; subject_name: string; paper_date: string; seat_no: string | null }[]).map((r) => ({ exam: r.exam_name, subject: r.subject_name, date: r.paper_date, seatNo: r.seat_no ?? null }));
}

// Of these papers, those with the child's approved script the family may open (the row rules decide).
export async function checkedPaperIds(db: Sql, studentId: string, paperIds: readonly string[]): Promise<Set<string>> {
  if (!paperIds.length) return new Set();
  const { rows } = await db.query(`select paper_id from marking_sheets where student_id = $1 and paper_id = any ($2::uuid[]) and state = 'approved' and not ('changed' = any (flags))`, [studentId, paperIds]);
  return new Set((rows as { paper_id: string }[]).map((r) => r.paper_id));
}

// One checked paper of one student, in the guardian's own session. null when the paper is not one the family may open.
export async function checkedPaperOf(db: Sql, schoolId: string, studentId: string, paperId: string): Promise<SchoolCheckedPaper | null> {
  if (!isUuid(paperId) || !isUuid(studentId)) return null;
  const sheet = (
    await db.query(`select sheet_id, strengths, improve, practice from marking_sheets where student_id = $1 and paper_id = $2 and state = 'approved' and not ('changed' = any (flags)) limit 1`, [studentId, paperId])
  ).rows[0] as { sheet_id: string; strengths: string | null; improve: string | null; practice: { unitId: string | null; text: string }[] } | undefined;
  if (!sheet) return null;
  const paper = (
    await db.query(
      `select p.paper_id, p.components, e.name as exam, e.term, sub.name as subject, (g.published_at at time zone 'Asia/Kolkata')::date::text as published_on
         from exam_papers p
         join exams e on e.school_id = p.school_id and e.exam_id = p.exam_id
         join public.guardian_publications() g on g.exam_id = p.exam_id and g.class_id = p.class_id
         left join subjects sub on sub.school_id = p.school_id and sub.subject_id = p.subject_id
        where p.paper_id = $1 and p.school_id = $2`,
      [paperId, schoolId]
    )
  ).rows[0] as { components: PaperComponent[]; exam: string; term: string | null; subject: string | null; published_on: string } | undefined;
  if (!paper) return null;
  // The questions the script has a mark for, as marking_report_marks gives the report link: the two doors agree.
  const questions = (
    await db.query(
      `select q.question_id, q.label, q.prompt, q.component, q.max_marks, q.choice_group, u.chapter, u.topic,
              coalesce(m.marks, m.ai_marks) as marks, coalesce(m.note, m.ai_note) as note, m.error_type, m.page_id, m.y_from, m.y_to
         from marking_questions q
         join marking_marks m on m.school_id = q.school_id and m.question_id = q.question_id and m.sheet_id = $2
         left join syllabus_units u on u.school_id = q.school_id and u.unit_id = q.unit_id
        where q.paper_id = $1
        order by q.position, q.label`,
      [paperId, sheet.sheet_id]
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
    await db.query(`select page_id, width, height from marking_pages where sheet_id = $1 order by sheet_position`, [sheet.sheet_id])
  ).rows.map((g) => ({ pageId: g.page_id as string, width: Number(g.width), height: Number(g.height) }));
  const units = (sheet.practice ?? []).map((p) => p.unitId).filter((u): u is string => !!u && isUuid(u));
  const unitRows = units.length
    ? ((await db.query(`select unit_id, chapter, topic from syllabus_units where unit_id = any ($1::uuid[])`, [units])).rows as { unit_id: string; chapter: string; topic: string }[])
    : [];
  const parts = (paper.components ?? []).map((c) => ({ key: c.key, name: c.name, max: Number(c.max) }));
  // The paper's internal-choice counts, as the guardian may read them (guardian_choice_counts(): the counts only, never
  // the teacher's guidance); a paper with no setup row falls back to what the questions imply (impliedChoiceCounts),
  // with the child's published part scores to settle a tie.
  const setup = (await db.query(`select choice_counts from public.guardian_choice_counts() where paper_id = $1`, [paperId])).rows[0] as { choice_counts: Record<string, number> } | undefined;
  let counts = setup?.choice_counts ?? null;
  if (!counts) {
    const published = Object.fromEntries(
      ((await db.query(`select component, kind, score from marks where student_id = $1 and paper_id = $2`, [studentId, paperId])).rows as { component: string; kind: string; score: unknown }[]).map((m) => [
        m.component,
        m.kind === 'score' ? num(m.score) : null,
      ])
    );
    counts = impliedChoiceCounts(parts, questions, published);
  }
  return checkedPaper({
    paperId,
    exam: paper.exam,
    term: paper.term ?? null,
    subject: paper.subject ?? '',
    publishedOn: paper.published_on,
    parts,
    choiceCounts: counts,
    questions,
    strengths: sheet.strengths,
    improve: sheet.improve,
    practice: (sheet.practice ?? []).map((p) => {
      const u = unitRows.find((x) => x.unit_id === p.unitId);
      return { text: String(p.text ?? ''), chapter: u?.chapter ?? null, topic: u?.topic ?? null };
    }),
    pages,
  });
}

// One checked paper for a family: as the guardian of `linkId`, for one of that link's matched students. In the child's
// own view, nothing unless the school lets children see their results.
export async function readSchoolPaper(claims: Claims, linkId: string, studentId: string, paperId: string, as: ReadAs): Promise<SchoolCheckedPaper | null> {
  const read = await withGuardianContext(claims, linkId, async (db, link) => ({ schoolId: link.schoolId, paper: await checkedPaperOf(db, link.schoolId, studentId, paperId) }));
  if (!read.paper) return null;
  if (as.childView && !(await childrenSeeResults(read.schoolId))) return null;
  return read.paper;
}

// A page picture of a checked script, for one of the given students of the link: the page's row is read as the guardian
// (the row rules decide), then its picture is read from the store outside the transaction. null when the page is not
// one this family may see, or the store has no such file.
export class PictureUnavailableError extends Error {}
export async function readSchoolPagePicture(
  claims: Claims,
  linkId: string,
  studentIds: readonly string[],
  pageId: string,
  as: ReadAs,
  storage: Pick<DirectUploadStorage, 'get'> = supabaseFileStorage
): Promise<Uint8Array | null> {
  if (!isUuid(pageId) || !studentIds.length || studentIds.some((s) => !isUuid(s))) return null;
  const read = await withGuardianContext(claims, linkId, async (db, link) => {
    const row = (
      await db.query(
        `select g.storage_key from marking_pages g join marking_sheets s on s.school_id = g.school_id and s.sheet_id = g.sheet_id
          where g.page_id = $1 and s.student_id = any ($2::uuid[]) and s.state = 'approved' and not ('changed' = any (s.flags))`,
        [pageId, studentIds]
      )
    ).rows[0] as { storage_key: string } | undefined;
    // The key is the database's own (<school>/marking/<paper>/<page>.jpg, held by a check); never another school's.
    return { schoolId: link.schoolId, key: row && row.storage_key.startsWith(`${link.schoolId}/marking/`) ? row.storage_key : null };
  });
  const key = read.key;
  if (!key) return null;
  if (as.childView && !(await childrenSeeResults(read.schoolId))) return null;
  try {
    return await storage.get(key);
  } catch {
    throw new PictureUnavailableError('the file store could not be read');
  }
}
