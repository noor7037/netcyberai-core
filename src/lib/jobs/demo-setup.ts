import { writeAuditLog } from '@/lib/audit/log';
import { normalizeEmail } from '@/lib/auth/account';
import { DEMO_CLASS, DEMO_PARENT, DEMO_SCHOOL, DEMO_STUDENT, DEMO_SUBJECTS, DEMO_TEACHER } from '@/demo-fixture/demo-school';
import { applyDefaultPlan, applyPlan } from '@/lib/frameworks/plans';
import { InvitationExistsError, createInvitation } from '@/lib/onboarding/invitations';
import { activeStaff } from './ai-jobs';
import { PermanentJobError, type JobHandler, type JobQueue, type Sql } from './types';

// The internal demo pilot's school (W2 item 1, C324), built on the test database by NetCyberAI staff, through the
// same functions a real school goes through: the school (a test fixture, in pilot with outbound sending not approved),
// its plan, Class 6-A and its subjects, one synthetic child with a parent, and the teacher's invitation, which the
// invite.send job then sends from Supabase Auth. A follow-up run, which the first queues, waits until the invitation
// has made the teacher's account, then gives the teacher Science and Mathematics in 6-A and the class. Fixed ids
// (src/demo-fixture/demo-school.ts): running it again changes nothing. Never a migration, so the production replay
// never carries it. A school's own session cannot queue it (the jobs_enqueue policy lists the types a school may).
//
// Payload: by (an active super admin), teacherEmail and parentEmail (inboxes the founder chose), origin (the site
// the invitation returns to), plan (optional; the plan for new schools when not given).
export const DEMO_SETUP_JOB = 'demo.setup';

type Platform = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;
type Payload = { by: unknown; teacherEmail: string; parentEmail: string; origin: string; plan: string | null; phase: 'school' | 'assign' };

// The teacher's account appears when invite.send has run; the assigning run waits for it.
const ASSIGN_AFTER_MS = 90_000;
const ASSIGN_ATTEMPTS = 8;

function readPayload(raw: Record<string, unknown>): Payload {
  const teacherEmail = normalizeEmail(raw.teacherEmail);
  const parentEmail = normalizeEmail(raw.parentEmail);
  let origin: string | null = null;
  try {
    const url = new URL(String(raw.origin));
    if (url.protocol === 'https:') origin = url.origin;
  } catch {
    origin = null;
  }
  const plan = raw.plan === undefined || raw.plan === null ? null : typeof raw.plan === 'string' && /^[a-z0-9_-]{1,40}$/.test(raw.plan) ? raw.plan : undefined;
  if (!teacherEmail || !parentEmail || !origin || plan === undefined) throw new PermanentJobError('bad demo.setup payload');
  return { by: raw.by, teacherEmail, parentEmail, origin, plan, phase: raw.phase === 'assign' ? 'assign' : 'school' };
}

async function buildSchool(db: Sql, queue: JobQueue, by: string, p: Payload): Promise<{ created: boolean; invited: boolean }> {
  const actor = { userId: by, role: 'super_admin' as const };
  const s = DEMO_SCHOOL;
  const made = await db.query(
    `insert into schools (school_id, name, board, tenant_type, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound)
     values ($1, $2, $3::board_type, 'school', $4, true, true, false)
     on conflict (school_id) do nothing returning school_id`,
    [s.schoolId, s.name, s.board, s.jurisdiction]
  );
  const created = made.rows.length === 1;
  if (created) {
    await writeAuditLog(db, {
      schoolId: s.schoolId, actorUserId: by, actorRole: 'super_admin', eventAction: 'school.create', targetType: 'schools', targetId: s.schoolId,
      afterState: { demo: true },
    });
    if (p.plan) {
      const applied = await applyPlan(db, s.schoolId, p.plan, actor, 'demo school');
      if (!applied.ok) throw new PermanentJobError(`plan: ${applied.error}`);
    } else {
      await applyDefaultPlan(db, s.schoolId, actor, 'demo school');
    }
  }

  await db.query(`insert into classes (class_id, school_id, name, grade, section) values ($1, $2, $3, $4, $5) on conflict (class_id) do nothing`, [
    DEMO_CLASS.classId, s.schoolId, DEMO_CLASS.name, DEMO_CLASS.grade, DEMO_CLASS.section,
  ]);
  for (const subject of DEMO_SUBJECTS)
    await db.query(`insert into subjects (subject_id, school_id, name) values ($1, $2, $3) on conflict (subject_id) do nothing`, [subject.subjectId, s.schoolId, subject.name]);

  // The child starts as a new student does, waiting for consent. The school's office then records the two consents a
  // student needs, as it attests them for a real child (here the school and the child are both synthetic, and the
  // notice version says so), and the child becomes active by the database's own rule.
  const st = DEMO_STUDENT;
  const pupil = await db.query(
    `insert into students (student_id, school_id, admission_no, name, class_id, roll_no, dob, status) values ($1, $2, $3, $4, $5, $6, $7, 'pending_consent')
     on conflict (student_id) do nothing returning student_id`,
    [st.studentId, s.schoolId, st.admissionNo, st.name, DEMO_CLASS.classId, st.rollNo, st.dob]
  );
  if (pupil.rows.length === 1) {
    await db.query(
      `insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version)
       select $1, $2, purpose::consent_purpose, true, 'school_attested', 'demo-fixture' from unnest(array['core_records', 'operational_communication']) purpose`,
      [s.schoolId, st.studentId]
    );
    await db.query(`update students set status = 'active' where school_id = $1 and student_id = $2 and student_required_consents_granted($1, $2)`, [s.schoolId, st.studentId]);
  }
  const pa = DEMO_PARENT;
  await db.query(
    `insert into parents (parent_id, school_id, name, phone, email, relation, preferred_language) values ($1, $2, $3, $4, $5, $6, 'en')
     on conflict (parent_id) do nothing`,
    [pa.parentId, s.schoolId, pa.name, pa.phone, p.parentEmail, pa.relation]
  );
  await db.query(`insert into parent_student_map (school_id, parent_id, student_id) values ($1, $2, $3) on conflict do nothing`, [s.schoolId, pa.parentId, st.studentId]);

  let invited = false;
  try {
    await createInvitation(db, queue, {
      schoolId: s.schoolId, email: p.teacherEmail, displayName: DEMO_TEACHER.displayName, role: 'teacher', source: 'staff', invitedBy: actor,
      redirectTo: `${p.origin}/login`,
    });
    invited = true;
  } catch (err) {
    if (!(err instanceof InvitationExistsError)) throw err;
  }
  return { created, invited };
}

// The teacher's subjects and class, once invite.send has made the account. Not yet: a retry, a minute or more later.
async function assignTeacher(db: Sql, by: string, p: Payload): Promise<{ teacherUserId: string; subjectIds: string[] }> {
  const schoolId = DEMO_SCHOOL.schoolId;
  const { rows } = await db.query(
    `select u.user_id from staff_invitations i join users u on u.user_id = i.auth_user_id and u.school_id = i.school_id
      where i.school_id = $1 and i.email_key = lower($2) and i.status <> 'revoked' and u.role = 'teacher' and u.is_active`,
    [schoolId, p.teacherEmail]
  );
  const teacherUserId = rows[0]?.user_id as string | undefined;
  if (!teacherUserId) {
    const stopped = await db.query(`select 1 from staff_invitations where school_id = $1 and email_key = lower($2) and status = 'needs_founder'`, [schoolId, p.teacherEmail]);
    if (stopped.rows.length) throw new PermanentJobError('the teacher inbox already has a sign-in account: the invitation waits for NetCyberAI');
    throw new Error('the teacher invitation is not sent yet');
  }
  // The rows and audit the office's Staff screen writes (src/lib/academics/teacher-subjects.ts assign()): its function
  // runs in a school session, and the demo school has no teacher's proposal to confirm, so they are written here.
  await db.query(
    `insert into teachers (school_id, user_id, name) select school_id, user_id, display_name from users where school_id = $1 and user_id = $2
     on conflict (school_id, user_id) do nothing`,
    [schoolId, teacherUserId]
  );
  const teacherId = (await db.query(`select teacher_id from teachers where school_id = $1 and user_id = $2`, [schoolId, teacherUserId])).rows[0].teacher_id as string;
  const subjectIds: string[] = [];
  for (const subject of DEMO_SUBJECTS.filter((x) => x.taught)) {
    const made = await db.query(
      `insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ($1, $2, $3, $4) on conflict do nothing returning teacher_id`,
      [schoolId, teacherId, subject.subjectId, DEMO_CLASS.classId]
    );
    if (!made.rows[0]) continue;
    subjectIds.push(subject.subjectId);
    await writeAuditLog(db, {
      schoolId, actorUserId: by, actorRole: 'super_admin', eventAction: 'teacher_subject.assign', targetType: 'teacher_subjects', targetId: teacherId,
      afterState: { teacherId, teacherUserId, subjectId: subject.subjectId, classId: DEMO_CLASS.classId },
    });
  }
  await db.query(`update classes set class_teacher_id = $3 where school_id = $1 and class_id = $2 and class_teacher_id is null`, [schoolId, DEMO_CLASS.classId, teacherUserId]);
  return { teacherUserId, subjectIds };
}

export function demoSetupHandler({ platform, queue }: { platform: Platform; queue: JobQueue }): JobHandler {
  return async (job) => {
    const p = readPayload(job.payload);
    const by = await activeStaff(platform, p.by);
    if (p.phase === 'assign') {
      const done = await platform((db) => assignTeacher(db, by, p));
      await platform((db) =>
        writeAuditLog(db, {
          schoolId: DEMO_SCHOOL.schoolId, actorUserId: by, actorRole: 'super_admin', eventAction: 'demo.setup', targetType: 'schools', targetId: DEMO_SCHOOL.schoolId,
          afterState: { phase: 'assign', teacherUserId: done.teacherUserId, subjectIds: done.subjectIds },
        })
      );
      return;
    }
    await platform(async (db) => {
      const built = await buildSchool(db, queue, by, p);
      await queue.enqueue(db, {
        type: DEMO_SETUP_JOB,
        payload: { ...job.payload, phase: 'assign' },
        idempotencyKey: `${job.idempotencyKey}:assign`,
        schoolId: DEMO_SCHOOL.schoolId,
        maxAttempts: ASSIGN_ATTEMPTS,
        runAt: new Date(Date.now() + ASSIGN_AFTER_MS),
      });
      await writeAuditLog(db, {
        schoolId: DEMO_SCHOOL.schoolId, actorUserId: by, actorRole: 'super_admin', eventAction: 'demo.setup', targetType: 'schools', targetId: DEMO_SCHOOL.schoolId,
        afterState: { phase: 'school', created: built.created, invited: built.invited },
      });
    });
  };
}
