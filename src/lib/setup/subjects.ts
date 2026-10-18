import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';

// The school's subjects, kept by the office in Setup (docs/28 slice 10g, C244). Subjects belong to the school, not to
// a class: a class is given a subject by giving it to a teacher there (who teaches what, on Staff).
//
// A SUBJECT IS RETIRED, NEVER DELETED. Marks, homework, timetable periods, syllabus rows and who-teaches-what all name
// a subject, so a subject the school no longer teaches keeps its row and its history: `retired_at` is set. Retiring
// changes nothing that already refers to the subject; it only leaves the pickers of the screens that follow (those
// ask for `retired_at is null`). Bringing a subject back clears the date. Adding a subject is the existing route
// (POST /api/app/subjects); this file has the rest.
//
// Who may: the principal and the school admin. The route says so (canWriteMasterData) and the database does too (the
// office-only policies of migration 20261018130000). Audit rows hold ids only (C56): the subject's id.

type Sql = Pick<PoolClient, 'query'>;
export type SetupActor = { schoolId: string; userId: string; role: StaffRole };

// What still refers to a subject, so the office sees what retiring leaves as it is.
export type SubjectUses = { periods: number; papers: number; homework: number; teaching: number };
export type SetupSubject = { subjectId: string; name: string; retired: boolean; retiredAt: string | null; uses: SubjectUses };

// Every subject of the school, in use first and then the retired ones, each by name.
export async function listSetupSubjects(db: Sql, schoolId: string): Promise<SetupSubject[]> {
  const { rows } = await db.query(
    `select s.subject_id, s.name, s.retired_at,
            (select count(*) from timetable_entries e where e.school_id = s.school_id and e.subject_id = s.subject_id)::int as periods,
            (select count(*) from exam_papers p where p.school_id = s.school_id and p.subject_id = s.subject_id)::int as papers,
            (select count(*) from homework h where h.school_id = s.school_id and h.subject_id = s.subject_id)::int as homework,
            (select count(*) from teacher_subjects ts where ts.school_id = s.school_id and ts.subject_id = s.subject_id)::int as teaching
       from subjects s
      where s.school_id = $1
      order by (s.retired_at is not null), lower(s.name), s.subject_id`,
    [schoolId]
  );
  return rows.map((r) => ({
    subjectId: r.subject_id as string,
    name: r.name as string,
    retired: r.retired_at != null,
    retiredAt: r.retired_at == null ? null : new Date(r.retired_at as string).toISOString(),
    uses: { periods: Number(r.periods), papers: Number(r.papers), homework: Number(r.homework), teaching: Number(r.teaching) },
  }));
}

async function audit(db: Sql, actor: SetupActor, eventAction: string, subjectId: string): Promise<void> {
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction,
    targetType: 'subjects',
    targetId: subjectId,
    afterState: { subject_id: subjectId },
  });
}

// A new name for a subject. The same name again changes nothing and is not audited. Two subjects cannot share a name
// to the letter or in another case (the unique index of migration 20260927110000); a retired subject keeps its name,
// so the name stays taken until the subject is renamed.
export async function renameSubject(db: Sql, actor: SetupActor, subjectId: string, name: string): Promise<{ ok: true; changed: boolean } | { ok: false; reason: 'not_found' | 'name_taken' }> {
  const found = await db.query(`select name from subjects where school_id = $1 and subject_id = $2 for update`, [actor.schoolId, subjectId]);
  if (!found.rows[0]) return { ok: false, reason: 'not_found' };
  if (found.rows[0].name === name) return { ok: true, changed: false };
  const clash = await db.query(`select 1 from subjects where school_id = $1 and subject_id <> $2 and lower(btrim(name)) = lower($3)`, [actor.schoolId, subjectId, name]);
  if (clash.rows[0]) return { ok: false, reason: 'name_taken' };
  await db.query(`update subjects set name = $3 where school_id = $1 and subject_id = $2`, [actor.schoolId, subjectId, name]);
  await audit(db, actor, 'setup.subject_renamed', subjectId);
  return { ok: true, changed: true };
}

// Retire a subject, or bring it back. Doing it twice changes nothing the second time and is audited once.
export async function setSubjectRetired(db: Sql, actor: SetupActor, subjectId: string, retired: boolean): Promise<{ ok: true; changed: boolean } | { ok: false; reason: 'not_found' }> {
  const found = await db.query(`select retired_at is not null as retired from subjects where school_id = $1 and subject_id = $2 for update`, [actor.schoolId, subjectId]);
  if (!found.rows[0]) return { ok: false, reason: 'not_found' };
  if ((found.rows[0].retired === true) === retired) return { ok: true, changed: false };
  await db.query(`update subjects set retired_at = ${retired ? 'now()' : 'null'} where school_id = $1 and subject_id = $2`, [actor.schoolId, subjectId]);
  await audit(db, actor, retired ? 'setup.subject_retired' : 'setup.subject_restored', subjectId);
  return { ok: true, changed: true };
}

// The existing subject a new name would clash with, for the add route to say so plainly: whether it is retired
// (then it is brought back, not added again).
export async function subjectWithName(db: Sql, schoolId: string, name: string): Promise<{ subjectId: string; retired: boolean } | null> {
  const { rows } = await db.query(`select subject_id, retired_at is not null as retired from subjects where school_id = $1 and lower(btrim(name)) = lower($2)`, [schoolId, name]);
  return rows[0] ? { subjectId: rows[0].subject_id as string, retired: rows[0].retired === true } : null;
}
