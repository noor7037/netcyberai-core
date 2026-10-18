import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { parseSessionInput, type SessionInput, type SessionRefusal, type SessionRow } from './session-input';

// Academic sessions, kept by the office in Setup (docs/28 slice 10g, C244): the school's years, and which one is
// current. Every function runs in the caller's own tenant transaction, as the app's role. Who may change a session
// is the principal and the school admin: the route says so (canWriteMasterData) and so does the database (the
// office-only policies of migration 20261018130000); a session is never deleted, since classes, exams, fee structures
// and RTE claims refer to it.
//
// "Current" is one session at a time, held by the partial unique index idx_academic_sessions_one_current. Making one
// current is a single step in one transaction: every other session stops being current, then this one is. Two people
// pressing it together take turns (an advisory lock on the school), so the school is never left with none current.
//
// Audit rows hold ids only (C56): `setup.session_added` names the session; `setup.session_made_current` names the
// session and the one it replaced.

type Sql = Pick<PoolClient, 'query'>;
export type SetupActor = { schoolId: string; userId: string; role: StaffRole };

export { parseSessionInput };
export type { SessionInput, SessionRefusal, SessionRow };

const row = (r: Record<string, unknown>): SessionRow => ({
  sessionId: r.session_id as string,
  label: r.label as string,
  startDate: r.start_date as string,
  endDate: r.end_date as string,
  isCurrent: r.is_current === true,
});
const COLUMNS = `session_id, label, start_date::text as start_date, end_date::text as end_date, is_current`;

// The school's sessions, the latest first.
export async function listSessions(db: Sql, schoolId: string): Promise<SessionRow[]> {
  const { rows } = await db.query(`select ${COLUMNS} from academic_sessions where school_id = $1 order by start_date desc, session_id`, [schoolId]);
  return rows.map(row);
}

// Two writers of one school's sessions take turns.
const lockSessions = (db: Sql, schoolId: string) => db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`sessions:${schoolId}`]);

// A new session is not current: making it current is its own step, which says what follows it.
export async function addSession(db: Sql, actor: SetupActor, input: SessionInput): Promise<{ ok: true; session: SessionRow } | { ok: false; reason: 'label_taken' }> {
  await lockSessions(db, actor.schoolId);
  // The label is unique to the letter in the database; here "2026-27" and " 2026-27 " are the same one too.
  const taken = await db.query(`select 1 from academic_sessions where school_id = $1 and lower(btrim(label)) = lower($2)`, [actor.schoolId, input.label]);
  if (taken.rows[0]) return { ok: false, reason: 'label_taken' };
  const { rows } = await db.query(
    `insert into academic_sessions (school_id, label, start_date, end_date) values ($1, $2, $3::date, $4::date) returning ${COLUMNS}`,
    [actor.schoolId, input.label, input.startDate, input.endDate]
  );
  const session = row(rows[0]);
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'setup.session_added',
    targetType: 'academic_sessions',
    targetId: session.sessionId,
    afterState: { session_id: session.sessionId },
  });
  return { ok: true, session };
}

// Make one session the current one. The session is read first and nothing changes when it is not the school's. When it
// is already current nothing changes and nothing is audited.
export async function makeSessionCurrent(db: Sql, actor: SetupActor, sessionId: string): Promise<{ ok: true; changed: boolean; previousSessionId: string | null } | { ok: false; reason: 'not_found' }> {
  await lockSessions(db, actor.schoolId);
  const found = await db.query(`select is_current from academic_sessions where school_id = $1 and session_id = $2 for update`, [actor.schoolId, sessionId]);
  if (!found.rows[0]) return { ok: false, reason: 'not_found' };
  if (found.rows[0].is_current === true) return { ok: true, changed: false, previousSessionId: null };
  const before = await db.query(`select session_id from academic_sessions where school_id = $1 and is_current`, [actor.schoolId]);
  const previousSessionId = (before.rows[0]?.session_id as string | undefined) ?? null;
  await db.query(`update academic_sessions set is_current = false where school_id = $1 and is_current`, [actor.schoolId]);
  await db.query(`update academic_sessions set is_current = true where school_id = $1 and session_id = $2`, [actor.schoolId, sessionId]);
  await writeAuditLog(db, {
    schoolId: actor.schoolId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    eventAction: 'setup.session_made_current',
    targetType: 'academic_sessions',
    targetId: sessionId,
    beforeState: previousSessionId ? { session_id: previousSessionId } : undefined,
    afterState: { session_id: sessionId },
  });
  return { ok: true, changed: true, previousSessionId };
}
