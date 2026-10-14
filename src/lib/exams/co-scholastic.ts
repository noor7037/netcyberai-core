import { writeAuditLog } from '@/lib/audit/log';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { EXAM_READERS, type Actor } from './exams';
import { ON_ROLL } from './papers';
import type { CoScholastic } from './scheme';
import { schemeInForce } from './schemes';

// Co-scholastic grades (docs/27 row 9c; the grading scheme's co-scholastic areas and grades of 9a; C219). For an exam
// and a class, each child gets at most one grade in each of the scheme's areas, one of the scheme's grades. Entered by
// the class teacher or the office (the principal, the school admin, the academic coordinator), in their own name, while
// the class is not published; frozen with the class's publication like its marks and remarks, and printed on the
// report card where the kept scheme's layout says so. The database holds the same rules (the migration ending
// _c219_p6_closeout.sql: co_scholastic_grades, its trigger and policies). Saving is audited with how many, never the
// grades themselves.

export const CO_SCHOLASTIC_OFFICE: readonly Actor['role'][] = ['principal', 'school_admin', 'academic_coordinator'];
// One save holds at most a class's roll times the scheme's areas.
export const CO_ENTRIES_MAX = 200 * 12;

// Each child's grades in an exam and class, by area: child -> area -> grade.
export async function coScholasticOf(db: Sql, schoolId: string, examId: string, classId: string, studentIds?: readonly string[]): Promise<Map<string, Record<string, string>>> {
  const { rows } = await db.query(
    `select student_id, area, grade from co_scholastic_grades
      where school_id = $1 and exam_id = $2 and class_id = $3 and ($4::uuid[] is null or student_id = any ($4::uuid[]))`,
    [schoolId, examId, classId, studentIds ? [...studentIds] : null]
  );
  const out = new Map<string, Record<string, string>>();
  for (const r of rows) {
    const own = out.get(r.student_id) ?? {};
    own[r.area as string] = r.grade as string;
    out.set(r.student_id, own);
  }
  return out;
}

// The scheme's areas and grades, when it has any.
export const coAreasOf = (co: CoScholastic | null | undefined): CoScholastic | null => (co && co.areas.length && co.grades.length ? co : null);

export type CoProblem = 'not_allowed' | 'not_found' | 'published' | 'no_co_scholastic' | 'co_entries' | 'child' | 'co_grade';
export type CoResult = { ok: true; saved: number; cleared: number } | { ok: false; reason: CoProblem; at?: number };

// Saves co-scholastic grades: [{ studentId, area, grade }], an empty grade clears it. The class teacher or the office,
// while the class is not published.
export async function saveCoScholastic(db: Sql, actor: Actor, examId: string, classId: string, raw: unknown): Promise<CoResult> {
  if (!EXAM_READERS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (!isUuid(examId) || !isUuid(classId)) return { ok: false, reason: 'not_found' };
  if (!(await db.query(`select 1 from exam_papers where school_id = $1 and exam_id = $2 and class_id = $3 limit 1`, [actor.schoolId, examId, classId])).rows[0]) return { ok: false, reason: 'not_found' };
  const office = CO_SCHOLASTIC_OFFICE.includes(actor.role);
  if (!office && (await db.query(`select public.is_class_teacher_of($1) as yes`, [classId])).rows[0]?.yes !== true) return { ok: false, reason: 'not_allowed' };
  if ((await db.query(`select public.exam_class_published($1, $2) as yes`, [examId, classId])).rows[0]?.yes === true) return { ok: false, reason: 'published' };
  const co = coAreasOf((await schemeInForce(db, actor.schoolId))?.scheme.coScholastic);
  if (!co) return { ok: false, reason: 'no_co_scholastic' };
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > CO_ENTRIES_MAX) return { ok: false, reason: 'co_entries' };
  const roll = new Set((await db.query(`select s.student_id from students s where s.school_id = $1 and s.class_id = $2 and ${ON_ROLL}`, [actor.schoolId, classId])).rows.map((r) => r.student_id as string));
  const writes: { studentId: string; area: string; grade: string }[] = [];
  const clears: { studentId: string; area: string }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i] as Record<string, unknown> | null;
    if (typeof e !== 'object' || e === null || typeof e.studentId !== 'string' || !roll.has(e.studentId)) return { ok: false, reason: 'child', at: i };
    const area = typeof e.area === 'string' ? e.area.trim() : '';
    const grade = e.grade === null || e.grade === undefined ? '' : typeof e.grade === 'string' ? e.grade.trim() : null;
    if (!co.areas.includes(area) || grade === null || (grade !== '' && !co.grades.some((g) => g.grade === grade))) return { ok: false, reason: 'co_grade', at: i };
    const key = `${e.studentId}|${area}`;
    if (seen.has(key)) return { ok: false, reason: 'co_entries', at: i };
    seen.add(key);
    if (grade) writes.push({ studentId: e.studentId, area, grade });
    else clears.push({ studentId: e.studentId, area });
  }
  // A savepoint, so a rule the database holds (published in the same moment, a grade the scheme no longer has) leaves
  // this transaction usable and is said plainly.
  await db.query('savepoint exam_co_scholastic');
  let saved = 0;
  let cleared = 0;
  try {
    if (writes.length) {
      saved = (await db.query(
        `insert into co_scholastic_grades (school_id, exam_id, class_id, student_id, area, grade, written_by)
         select $1, $2, $3, x.student_id, x.area, x.grade, $4 from unnest($5::uuid[], $6::text[], $7::text[]) as x(student_id, area, grade)
         on conflict (school_id, exam_id, class_id, student_id, area) do update set grade = excluded.grade, written_by = excluded.written_by
          where co_scholastic_grades.grade is distinct from excluded.grade`,
        [actor.schoolId, examId, classId, actor.userId, writes.map((w) => w.studentId), writes.map((w) => w.area), writes.map((w) => w.grade)]
      )).rowCount ?? 0;
    }
    if (clears.length) {
      cleared = (await db.query(
        `delete from co_scholastic_grades g using unnest($4::uuid[], $5::text[]) as x(student_id, area)
          where g.school_id = $1 and g.exam_id = $2 and g.class_id = $3 and g.student_id = x.student_id and g.area = x.area`,
        [actor.schoolId, examId, classId, clears.map((c) => c.studentId), clears.map((c) => c.area)]
      )).rowCount ?? 0;
    }
    await db.query('release savepoint exam_co_scholastic');
  } catch (err) {
    await db.query('rollback to savepoint exam_co_scholastic');
    const code = (err as { code?: string }).code;
    if (code === '55000') return { ok: false, reason: 'published' };
    if (code === '42501') return { ok: false, reason: 'not_allowed' };
    if (code === '23514') return { ok: false, reason: 'co_grade' };
    throw err;
  }
  if (saved + cleared > 0) {
    // Which exam and class, and how many; never the grades.
    await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: 'exam.co_scholastic_saved', targetType: 'co_scholastic_grades', targetId: examId, afterState: { exam_id: examId, class_id: classId, saved, cleared } });
  }
  return { ok: true, saved, cleared };
}
