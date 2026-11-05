import { createHash, randomUUID } from 'node:crypto';
import { writeAuditLog } from '@/lib/audit/log';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { pdfFileName } from '@/lib/marking/checked-pdf-shape';
import { unicodePdf } from '@/lib/pdf/unicode-pdf';
import type { FileStorage } from '@/lib/storage/file-storage';
import type { Actor } from './exams';
import { ON_ROLL, ROLL_ORDER } from './papers';
import { progressExams, sessionFor } from './progress-report';
import { REPORT_CARD_OFFICE } from './publish';
import { hpcTitleOf } from './hpc-title';
import { HPC_FIELDS, hpcBlocks, hpcTitle, type HpcCard, type HpcEntry, type HpcField } from './hpc-text';

export { HPC_DEFAULT_TITLE, hpcTitleOf } from './hpc-title';
export { HPC_FIELDS, hpcBlocks, hpcTitle, type HpcCard, type HpcCell, type HpcEntry, type HpcField } from './hpc-text';

// The Holistic Progress Card (W21-M4, docs/42 Medium: Exams), the CBSE card's shape as it is generally known: for one
// child and one session, the scholastic results by subject and exam (term), the co-scholastic grades, health and
// physical education, attendance, the teacher's remarks, the child's self-assessment and the parent's feedback.
//
//   - Every figure comes from its own table: the results of the session's PUBLISHED exams only, graded by the scheme
//     kept with each publication (progressExams, as the progress report reads them); the co-scholastic grades and the
//     per-exam remarks of those exams; the attendance marked in the session, up to today. Nothing is invented, and an
//     empty part says so instead of a figure.
//   - The words no other table holds (the session's remark, the health and physical education note, the
//     self-assessment, the parent's feedback) are typed in by the school (hpc_entries, migration w21_m4_hpc).
//   - It compares the child with nobody: no rank, no position, no class average, no other child.
//   - Who: the office (the principal, the school admin, the academic coordinator) and the class's class teacher see
//     the cards and write the words; only the office publishes. Publishing makes each child's card as one PDF (an
//     English page and a Hindi page, drawn with the Devanagari font) kept in the school's folder, which the family
//     gets in the Family app; publishing again replaces it.
//   - The card's name is the school's own when it set one (Exams settings, "hpc_title"); else "Holistic Progress
//     Card" in the reader's language.

export const HPC_OFFICE = REPORT_CARD_OFFICE;
export const HPC_TEXT_MAX = 600;
export const HPC_ENTRIES_MAX = 200;
const MAX_BYTES = 4_000_000;
const COLUMN: Record<HpcField, string> = { teacherRemark: 'teacher_remark', healthNote: 'health_note', selfAssessment: 'self_assessment', parentFeedback: 'parent_feedback' };
const EMPTY_ENTRY: HpcEntry = { teacherRemark: null, healthNote: null, selfAssessment: null, parentFeedback: null };

export type HpcProblem = 'not_allowed' | 'not_found' | 'no_session' | 'entries' | 'child' | 'text';
type Access = 'office' | 'class_teacher';

async function accessOf(db: Sql, actor: Actor, classId: string): Promise<Access | null> {
  if (HPC_OFFICE.includes(actor.role)) return 'office';
  if (actor.role !== 'teacher') return null;
  return (await db.query(`select public.is_class_teacher_of($1) as yes`, [classId])).rows[0]?.yes === true ? 'class_teacher' : null;
}

type Child = { student_id: string; name: string; roll_no: string | null; admission_no: string | null };
type Session = { sessionId: string; label: string; start: string; end: string };

async function classAndSession(db: Sql, actor: Actor, classId: string): Promise<{ className: string; session: Session | null } | null> {
  const cls = (await db.query(`select name from classes where school_id = $1 and class_id = $2`, [actor.schoolId, classId])).rows[0];
  if (!cls) return null;
  const s = await sessionFor(db, actor.schoolId, null);
  if (!s.sessionId) return { className: cls.name, session: null };
  const d = (await db.query(`select start_date::text as start, end_date::text as end from academic_sessions where school_id = $1 and session_id = $2`, [actor.schoolId, s.sessionId])).rows[0];
  return { className: cls.name, session: d ? { sessionId: s.sessionId, label: s.label ?? '', start: d.start, end: d.end } : null };
}

const roll = async (db: Sql, schoolId: string, classId: string, studentId: string | null) =>
  (await db.query(
    `select s.student_id, s.name, s.roll_no, s.admission_no from students s
      where s.school_id = $1 and s.class_id = $2 and ${ON_ROLL} and ($3::uuid is null or s.student_id = $3::uuid) order by ${ROLL_ORDER}`,
    [schoolId, classId, studentId]
  )).rows as Child[];

async function entriesOf(db: Sql, schoolId: string, sessionId: string, ids: readonly string[]): Promise<Map<string, HpcEntry>> {
  const rows = (await db.query(`select student_id, teacher_remark, health_note, self_assessment, parent_feedback from hpc_entries where school_id = $1 and session_id = $2 and student_id = any ($3::uuid[])`, [schoolId, sessionId, ids])).rows;
  return new Map(rows.map((r) => [r.student_id as string, { teacherRemark: r.teacher_remark ?? null, healthNote: r.health_note ?? null, selfAssessment: r.self_assessment ?? null, parentFeedback: r.parent_feedback ?? null }]));
}

// One child's card, every part read from its own table.
async function cardOf(db: Sql, schoolId: string, base: { schoolName: string; title: string | null; className: string; session: Session }, child: Child, entry: HpcEntry): Promise<HpcCard> {
  const { exams } = await progressExams(db, { schoolId, studentId: child.student_id, sessionId: base.session.sessionId, source: 'staff' });
  const subjects: string[] = [];
  for (const e of exams) for (const s of e.subjects) if (!subjects.includes(s.name)) subjects.push(s.name);
  const examIds = exams.map((e) => e.examId);
  const co = examIds.length
    ? ((await db.query(`select exam_id, area, grade from co_scholastic_grades where school_id = $1 and student_id = $2 and exam_id = any ($3::uuid[]) order by area`, [schoolId, child.student_id, examIds])).rows as { exam_id: string; area: string; grade: string }[])
    : [];
  const areas = [...new Set(co.map((r) => r.area))];
  const remarks = examIds.length
    ? ((await db.query(`select exam_id, remark from report_remarks where school_id = $1 and student_id = $2 and exam_id = any ($3::uuid[])`, [schoolId, child.student_id, examIds])).rows as { exam_id: string; remark: string }[])
    : [];
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const att = (await db.query(
    `select (count(*) filter (where status in ('present', 'late')))::int as present, count(*)::int as days
       from attendance where school_id = $1 and student_id = $2 and date >= $3::date and date <= least($4::date, $5::date)`,
    [schoolId, child.student_id, base.session.start, base.session.end, today]
  )).rows[0] as { present: number; days: number } | undefined;
  const label = (e: { name: string; term: string | null }) => (e.term ? `${e.name} · ${e.term}` : e.name);
  return {
    schoolName: base.schoolName,
    title: base.title,
    session: base.session.label,
    className: base.className,
    student: { studentId: child.student_id, name: child.name, rollNo: child.roll_no ?? null, admissionNo: child.admission_no ?? null },
    exams: exams.map((e) => ({ examId: e.examId, name: e.name, term: e.term })),
    scholastic: subjects.map((name) => ({ subject: name, cells: exams.map((e) => e.subjects.find((s) => s.name === name) ?? null).map((s) => (s ? { percent: s.percent, grade: s.grade } : null)) })),
    overall: exams.map((e) => ({ percent: e.overall.percent, grade: e.overall.grade })),
    coScholastic: areas.map((area) => ({ area, grades: examIds.map((id) => co.find((r) => r.exam_id === id && r.area === area)?.grade ?? null) })),
    attendance: att && att.days > 0 ? { present: Number(att.present), days: Number(att.days) } : null,
    examRemarks: exams.flatMap((e) => {
      const r = remarks.find((x) => x.exam_id === e.examId);
      return r ? [{ exam: label(e), remark: r.remark }] : [];
    }),
    entry,
  };
}

export type HpcCardsResult = { ok: true; cards: HpcCard[] } | { ok: false; reason: HpcProblem };

// The cards of a class (or one child of it) for the school's current session.
export async function hpcCards(db: Sql, actor: Actor, classId: string, studentId: string | null): Promise<HpcCardsResult> {
  if (!isUuid(classId) || (studentId !== null && !isUuid(studentId))) return { ok: false, reason: 'not_found' };
  if (!(await accessOf(db, actor, classId))) return { ok: false, reason: 'not_allowed' };
  const cs = await classAndSession(db, actor, classId);
  if (!cs) return { ok: false, reason: 'not_found' };
  if (!cs.session) return { ok: false, reason: 'no_session' };
  const children = await roll(db, actor.schoolId, classId, studentId);
  if (studentId !== null && !children.length) return { ok: false, reason: 'not_found' };
  const entries = await entriesOf(db, actor.schoolId, cs.session.sessionId, children.map((c) => c.student_id));
  const school = (await db.query(`select name from schools where school_id = $1`, [actor.schoolId])).rows[0];
  const base = { schoolName: school?.name ?? '', title: await hpcTitleOf(db, actor.schoolId), className: cs.className, session: cs.session };
  const cards: HpcCard[] = [];
  for (const c of children) cards.push(await cardOf(db, actor.schoolId, base, c, entries.get(c.student_id) ?? EMPTY_ENTRY));
  return { ok: true, cards };
}

// ---- the entry screen -------------------------------------------------------------------------------------------------

export type HpcScreen = {
  className: string;
  session: { sessionId: string; label: string } | null;
  title: string | null;
  mayWrite: boolean;
  mayPublish: boolean;
  children: { studentId: string; name: string; rollNo: string | null; entry: HpcEntry; card: { version: number; publishedAt: string } | null }[];
};

export async function hpcScreen(db: Sql, actor: Actor, classId: string): Promise<HpcScreen | HpcProblem> {
  if (!isUuid(classId)) return 'not_found';
  const access = await accessOf(db, actor, classId);
  if (!access) return 'not_allowed';
  const cs = await classAndSession(db, actor, classId);
  if (!cs) return 'not_found';
  const title = await hpcTitleOf(db, actor.schoolId);
  if (!cs.session) return { className: cs.className, session: null, title, mayWrite: false, mayPublish: false, children: [] };
  const children = await roll(db, actor.schoolId, classId, null);
  const ids = children.map((c) => c.student_id);
  const entries = await entriesOf(db, actor.schoolId, cs.session.sessionId, ids);
  const cards = new Map(
    (await db.query(`select student_id, version, published_at from hpc_cards where school_id = $1 and session_id = $2 and student_id = any ($3::uuid[])`, [actor.schoolId, cs.session.sessionId, ids])).rows.map((r) => [
      r.student_id as string,
      { version: Number(r.version), publishedAt: new Date(r.published_at).toISOString() },
    ])
  );
  return {
    className: cs.className,
    session: { sessionId: cs.session.sessionId, label: cs.session.label },
    title,
    mayWrite: true,
    mayPublish: access === 'office',
    children: children.map((c) => ({ studentId: c.student_id, name: c.name, rollNo: c.roll_no ?? null, entry: entries.get(c.student_id) ?? EMPTY_ENTRY, card: cards.get(c.student_id) ?? null })),
  };
}

export type HpcSaveResult = { ok: true; saved: number } | { ok: false; reason: HpcProblem; at?: number };

// Saves the words of the cards: [{ studentId, teacherRemark?, healthNote?, selfAssessment?, parentFeedback? }]. A field
// left out keeps what it holds; an empty one clears it. Each is at most 600 letters.
export async function saveHpcEntries(db: Sql, actor: Actor, classId: string, raw: unknown): Promise<HpcSaveResult> {
  if (!isUuid(classId)) return { ok: false, reason: 'not_found' };
  if (!(await accessOf(db, actor, classId))) return { ok: false, reason: 'not_allowed' };
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > HPC_ENTRIES_MAX) return { ok: false, reason: 'entries' };
  const cs = await classAndSession(db, actor, classId);
  if (!cs) return { ok: false, reason: 'not_found' };
  if (!cs.session) return { ok: false, reason: 'no_session' };
  const onRoll = new Set((await roll(db, actor.schoolId, classId, null)).map((c) => c.student_id));
  const rows: { studentId: string; values: Partial<HpcEntry> }[] = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i] as Record<string, unknown> | null;
    if (!r || typeof r !== 'object' || typeof r.studentId !== 'string' || !onRoll.has(r.studentId)) return { ok: false, reason: 'child', at: i };
    const values: Partial<HpcEntry> = {};
    for (const f of HPC_FIELDS) {
      if (r[f] === undefined) continue;
      if (r[f] !== null && typeof r[f] !== 'string') return { ok: false, reason: 'text', at: i };
      const v = typeof r[f] === 'string' ? (r[f] as string).trim() : '';
      if (v.length > HPC_TEXT_MAX) return { ok: false, reason: 'text', at: i };
      values[f] = v || null;
    }
    rows.push({ studentId: r.studentId, values });
  }
  for (const row of rows) {
    const set = HPC_FIELDS.filter((f) => f in row.values);
    const now = (await db.query(`select teacher_remark, health_note, self_assessment, parent_feedback from hpc_entries where school_id = $1 and session_id = $2 and student_id = $3`, [actor.schoolId, cs.session.sessionId, row.studentId])).rows[0];
    const merged = HPC_FIELDS.map((f) => (set.includes(f) ? (row.values[f] ?? null) : ((now?.[COLUMN[f]] as string | null | undefined) ?? null)));
    if (now) {
      await db.query(
        `update hpc_entries set teacher_remark = $4, health_note = $5, self_assessment = $6, parent_feedback = $7, written_by = $8 where school_id = $1 and session_id = $2 and student_id = $3`,
        [actor.schoolId, cs.session.sessionId, row.studentId, ...merged, actor.userId]
      );
    } else {
      await db.query(
        `insert into hpc_entries (school_id, session_id, class_id, student_id, teacher_remark, health_note, self_assessment, parent_feedback, written_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [actor.schoolId, cs.session.sessionId, classId, row.studentId, ...merged, actor.userId]
      );
    }
  }
  return { ok: true, saved: rows.length };
}

// One file a child: the English card, then the Hindi card, drawn with the Devanagari font.
export async function hpcPdf(card: HpcCard): Promise<Uint8Array> {
  return unicodePdf([hpcBlocks(card, 'en'), hpcBlocks(card, 'hi')], { title: `${hpcTitle(card, 'en')} ${card.className}` });
}
export const hpcFileName = (session: string, className: string, rollNo: string | null) => `${`hpc_${pdfFileName(session, className, rollNo).replace(/\.pdf$/, '')}`.slice(0, 80)}.pdf`;

// ---- publishing -------------------------------------------------------------------------------------------------------

export type HpcPublishResult = { ok: true; published: number; stale: string[] } | { ok: false; reason: HpcProblem };

// Makes and keeps every child's card of the class for the current session, in the school's folder; publishing again
// replaces each file and adds one to its version. The office only. `stale`: the replaced files' keys, for the caller to
// remove once the transaction is committed (a failed commit keeps the old rows and their files).
export async function publishHpc(db: Sql, storage: Pick<FileStorage, 'put' | 'remove'>, actor: Actor, classId: string): Promise<HpcPublishResult> {
  if (!isUuid(classId)) return { ok: false, reason: 'not_found' };
  const access = await accessOf(db, actor, classId);
  if (access !== 'office') return { ok: false, reason: 'not_allowed' };
  const r = await hpcCards(db, actor, classId, null);
  if (!r.ok) return r;
  const cs = await classAndSession(db, actor, classId);
  const sessionId = cs!.session!.sessionId;
  const stale: string[] = [];
  for (const card of r.cards) {
    const bytes = await hpcPdf(card);
    if (bytes.length > MAX_BYTES) throw new Error('hpc: the card is too large');
    const key = `${actor.schoolId}/hpc/${sessionId}/${randomUUID()}.pdf`;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const fileName = hpcFileName(card.session, card.className, card.student.rollNo);
    await storage.put(key, bytes, 'application/pdf');
    try {
      const old = (await db.query(`select storage_key from hpc_cards where school_id = $1 and session_id = $2 and student_id = $3`, [actor.schoolId, sessionId, card.student.studentId])).rows[0] as { storage_key: string } | undefined;
      if (old) {
        await db.query(
          `update hpc_cards set version = version + 1, class_id = $4, storage_key = $5, file_name = $6, sha256 = $7, bytes = $8, published_by = $9 where school_id = $1 and session_id = $2 and student_id = $3`,
          [actor.schoolId, sessionId, card.student.studentId, classId, key, fileName, sha256, bytes.length, actor.userId]
        );
        stale.push(old.storage_key);
      } else {
        await db.query(
          `insert into hpc_cards (school_id, session_id, class_id, student_id, storage_key, file_name, sha256, bytes, published_by) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [actor.schoolId, sessionId, classId, card.student.studentId, key, fileName, sha256, bytes.length, actor.userId]
        );
      }
    } catch (err) {
      await storage.remove(key).catch(() => undefined);
      throw err;
    }
  }
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'exam.hpc_published',
    targetType: 'hpc_cards',
    targetId: classId,
    afterState: { class_id: classId, session_id: sessionId, children: r.cards.length },
  });
  return { ok: true, published: r.cards.length, stale };
}
