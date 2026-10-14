import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';
import { EXAM_READERS, papersOf, type Actor, type PaperSummary } from './exams';
import { ON_ROLL, ROLL_ORDER, scoreOk, type Mark, type MarkKind } from './papers';

// Entering the marks of one paper (docs/27 row 9b, C214), on a phone: the class's roll in roll order, each
// component's score, or absent, or exempt. Saving keeps what was typed; the paper is "entered" when every child on
// the roll has a mark, absent or exempt for every component, and who finished it and when are recorded. Who may
// enter is the database's one rule (may_enter_marks): the office, the academic coordinator, the subject's teacher in
// that class, or the class teacher. The database refuses anyone else, and any mark outside 0 to its maximum.

export type EntryChild = { studentId: string; name: string; rollNo: string | null; marks: Record<string, Mark> };
export type PaperEntry = {
  paper: PaperSummary;
  exam: { examId: string; name: string; term: string | null; status: 'open' | 'published' };
  children: EntryChild[];
  // Children on the roll this person does not read (the coordinator does not read a child whose consent is waiting).
  notShown: number;
  // The class's syllabus map for this subject, for choosing the chapters (the office).
  map: { unitId: string; chapter: string; topic: string; position: number }[];
  mayEnter: boolean;
  mayChange: boolean;
};

export async function paperEntry(db: Sql, actor: Actor, paperId: string): Promise<PaperEntry | null> {
  if (!EXAM_READERS.includes(actor.role)) return null;
  const head = (await db.query(
    `select e.exam_id, e.name, e.term, e.status from exam_papers p join exams e on e.school_id = p.school_id and e.exam_id = p.exam_id
      where p.school_id = $1 and p.paper_id = $2`,
    [actor.schoolId, paperId]
  )).rows[0];
  if (!head) return null;
  const [paper] = (await papersOf(db, actor.schoolId, [head.exam_id])).filter((p) => p.paperId === paperId);
  if (!paper) return null;
  const roll = (await db.query(
    `select s.student_id, s.name, s.roll_no from students s where s.school_id = $1 and s.class_id = $2 and ${ON_ROLL} order by ${ROLL_ORDER}`,
    [actor.schoolId, paper.classId]
  )).rows;
  const marks = (await db.query(`select student_id, component, kind, score from marks where school_id = $1 and paper_id = $2`, [actor.schoolId, paperId])).rows;
  const children: EntryChild[] = roll.map((s) => ({ studentId: s.student_id, name: s.name, rollNo: s.roll_no ?? null, marks: {} }));
  const byChild = new Map(children.map((c) => [c.studentId, c]));
  for (const m of marks) {
    const child = byChild.get(m.student_id);
    if (child) child.marks[m.component] = { kind: m.kind as MarkKind, score: m.score === null ? null : Number(m.score) };
  }
  const map = (await db.query(
    `select unit_id, chapter, topic, position from syllabus_units where school_id = $1 and class_id = $2 and subject_id = $3 order by position, unit_id`,
    [actor.schoolId, paper.classId, paper.subjectId]
  )).rows.map((u) => ({ unitId: u.unit_id as string, chapter: u.chapter as string, topic: u.topic as string, position: Number(u.position) }));
  return {
    paper,
    exam: { examId: head.exam_id, name: head.name, term: head.term ?? null, status: head.status },
    children,
    notShown: Math.max(0, paper.roll - children.length),
    map,
    mayEnter: paper.mayEnter && head.status === 'open',
    mayChange: ['principal', 'school_admin', 'academic_coordinator'].includes(actor.role),
  };
}

export type MarkEntry = { studentId: string; component: string; kind: MarkKind | 'clear'; score: number | null };
export type SaveProblem = 'not_allowed' | 'not_found' | 'closed' | 'empty' | 'child' | 'component' | 'score' | 'twice' | 'too_many';
export type SaveResult = { ok: true; saved: number; cleared: number; roll: number; entered: number; complete: boolean } | { ok: false; reason: SaveProblem; at?: number };

export const MAX_ENTRIES = 2000;

// Checks what was sent before anything is written: every row names a child on the roll and a component of the
// paper, once, and a score is between 0 and that component's maximum, to one decimal place.
export function checkEntries(raw: unknown, components: readonly { key: string; max: number }[], roll: ReadonlySet<string>): { ok: true; entries: MarkEntry[] } | { ok: false; reason: SaveProblem; at?: number } {
  if (!Array.isArray(raw) || raw.length < 1) return { ok: false, reason: 'empty' };
  if (raw.length > MAX_ENTRIES) return { ok: false, reason: 'too_many' };
  const seen = new Set<string>();
  const entries: MarkEntry[] = [];
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i] as Record<string, unknown> | null;
    if (typeof e !== 'object' || e === null) return { ok: false, reason: 'child', at: i };
    if (typeof e.studentId !== 'string' || !roll.has(e.studentId)) return { ok: false, reason: 'child', at: i };
    const component = components.find((c) => c.key === e.component);
    if (!component) return { ok: false, reason: 'component', at: i };
    const key = `${e.studentId}|${component.key}`;
    if (seen.has(key)) return { ok: false, reason: 'twice', at: i };
    seen.add(key);
    if (e.kind === 'score') {
      if (!scoreOk(e.score, component.max)) return { ok: false, reason: 'score', at: i };
      entries.push({ studentId: e.studentId, component: component.key, kind: 'score', score: e.score });
    } else if (e.kind === 'absent' || e.kind === 'exempt' || e.kind === 'clear') {
      entries.push({ studentId: e.studentId, component: component.key, kind: e.kind, score: null });
    } else return { ok: false, reason: 'score', at: i };
  }
  return { ok: true, entries };
}

export async function saveMarks(db: Sql, actor: Actor, paperId: string, raw: unknown): Promise<SaveResult> {
  if (!EXAM_READERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  const paper = (await db.query(
    `select p.paper_id, p.exam_id, p.class_id, p.subject_id, p.components, p.entered_by, e.status, public.may_enter_marks(p.class_id, p.subject_id) as may_enter
       from exam_papers p join exams e on e.school_id = p.school_id and e.exam_id = p.exam_id
      where p.school_id = $1 and p.paper_id = $2`,
    [actor.schoolId, paperId]
  )).rows[0];
  if (!paper) return { ok: false, reason: 'not_found' };
  if (paper.may_enter !== true) return { ok: false, reason: 'not_allowed' };
  if (paper.status !== 'open') return { ok: false, reason: 'closed' };
  const components = paper.components as { key: string; max: number }[];
  const roll = new Set((await db.query(`select s.student_id from students s where s.school_id = $1 and s.class_id = $2 and ${ON_ROLL}`, [actor.schoolId, paper.class_id])).rows.map((r) => r.student_id as string));
  const checked = checkEntries(raw, components, roll);
  if (!checked.ok) return checked;
  const writes = checked.entries.filter((e) => e.kind !== 'clear');
  const clears = checked.entries.filter((e) => e.kind === 'clear');
  // A savepoint, so a rule the database holds (the trigger, a policy) leaves this transaction usable and is said
  // plainly.
  await db.query('savepoint marks_save');
  let saved = 0;
  let cleared = 0;
  try {
    if (writes.length) {
      // A mark that is already what was sent is left as it is: who entered it and when stay true.
      saved = (await db.query(
        `insert into marks (school_id, exam_id, subject_id, paper_id, component, student_id, kind, score, max_score, entered_by)
         select $1, $2, $3, $4, x.component, x.student_id, x.kind, x.score, 0, $5
           from unnest($6::text[], $7::uuid[], $8::text[], $9::numeric[]) as x(component, student_id, kind, score)
         on conflict (school_id, paper_id, component, student_id) do update set kind = excluded.kind, score = excluded.score, entered_by = excluded.entered_by
          where marks.kind is distinct from excluded.kind or marks.score is distinct from excluded.score`,
        [actor.schoolId, paper.exam_id, paper.subject_id, paperId, actor.userId, writes.map((w) => w.component), writes.map((w) => w.studentId), writes.map((w) => w.kind), writes.map((w) => w.score)]
      )).rowCount ?? 0;
    }
    if (clears.length) {
      cleared = (await db.query(
        `delete from marks m using unnest($3::text[], $4::uuid[]) as x(component, student_id)
          where m.school_id = $1 and m.paper_id = $2 and m.component = x.component and m.student_id = x.student_id`,
        [actor.schoolId, paperId, clears.map((c) => c.component), clears.map((c) => c.studentId)]
      )).rowCount ?? 0;
    }
    await db.query('release savepoint marks_save');
  } catch (err) {
    await db.query('rollback to savepoint marks_save');
    const code = (err as { code?: string }).code;
    if (code === '23514') return { ok: false, reason: 'score' };
    if (code === '42501') return { ok: false, reason: 'not_allowed' };
    throw err;
  }
  // Entered when every child on the roll has a mark, absent or exempt for every component: counted over the whole
  // roll by the database's one rule. Recorded in the name of the person whose save made it so, or who last changed
  // it while it was; taken back when it no longer is (a mark cleared, a child joined the class).
  const progress = (await db.query(`select roll, entered from public.exam_paper_progress($1)`, [paperId])).rows[0] ?? { roll: 0, entered: 0 };
  const complete = Number(progress.roll) > 0 && Number(progress.entered) >= Number(progress.roll);
  if (complete && paper.entered_by !== actor.userId && (paper.entered_by === null || saved + cleared > 0)) {
    await db.query(`update exam_papers set entered_by = $3 where school_id = $1 and paper_id = $2`, [actor.schoolId, paperId, actor.userId]);
  } else if (!complete && paper.entered_by !== null) {
    await db.query(`update exam_papers set entered_by = null where school_id = $1 and paper_id = $2`, [actor.schoolId, paperId]);
  }
  if (saved + cleared > 0) {
    // How many were saved and cleared; never the marks themselves.
    await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'exam_paper.marks_saved', targetType: 'exam_papers', targetId: paperId, afterState: { exam_id: paper.exam_id, saved, cleared, complete } });
  }
  return { ok: true, saved, cleared, roll: Number(progress.roll), entered: Number(progress.entered), complete };
}
