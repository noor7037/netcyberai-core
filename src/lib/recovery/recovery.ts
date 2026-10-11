import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';
import { SETTINGS_SCHEMAS } from '@/lib/frameworks/settings-schemas';
import { readSettings } from '@/lib/frameworks/settings-store';

// Homework Recovery v1 (docs/20 5g, C152). Finds the students who were
// marked "not done" for several homeworks in the last school days (both
// numbers are school settings), suggests a catch-up plan, and records the
// teacher's decision. An approved plan waits for the parent message that
// starts with WhatsApp; nothing is sent in P2.
//
// The list is in the order of the students' names. It is not a ranking, and
// it is never shown to a student or a parent.

export const DEFAULT_THRESHOLD = 3;
export const DEFAULT_WINDOW_DAYS = 10;
const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DEFAULT_WORKING_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const STAFF: readonly string[] = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const isWorking = (d: Date, working: readonly string[]) => working.includes(WEEKDAY[d.getUTCDay()]);

// The first day of a window of `schoolDays` working days that ends today.
export function windowStart(today: string, schoolDays: number, working: readonly string[] = DEFAULT_WORKING_DAYS): string {
  const days = working.length ? working : DEFAULT_WORKING_DAYS;
  const d = day(today);
  let counted = isWorking(d, days) ? 1 : 0;
  // Bounded: a week always holds a working day.
  for (let i = 0; counted < schoolDays && i < 400; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (isWorking(d, days)) counted += 1;
  }
  return iso(d);
}

// The next `count` working days after today, one per homework to catch up.
export function catchUpDates(today: string, count: number, working: readonly string[] = DEFAULT_WORKING_DAYS): string[] {
  const days = working.length ? working : DEFAULT_WORKING_DAYS;
  const out: string[] = [];
  const d = day(today);
  for (let i = 0; out.length < count && i < 400; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorking(d, days)) out.push(iso(d));
  }
  return out;
}

export type RecoverySettings = { threshold: number; windowDays: number; working: string[] };
export async function recoverySettings(db: PoolClient, schoolId: string): Promise<RecoverySettings> {
  const read = async (moduleId: string) => {
    const schema = SETTINGS_SCHEMAS.find((s) => s.moduleId === moduleId);
    return schema ? (await readSettings(db, schoolId, schema)).effective : {};
  };
  const own = await read('recovery');
  const setup = await read('setup');
  const num = (v: unknown, fallback: number, min: number, max: number) => (typeof v === 'number' && Math.floor(v) >= min && Math.floor(v) <= max ? Math.floor(v) : fallback);
  const working = Array.isArray(setup.working_days) ? (setup.working_days as unknown[]).filter((w): w is string => typeof w === 'string' && WEEKDAY.includes(w)) : [];
  return { threshold: num(own.missed_threshold, DEFAULT_THRESHOLD, 1, 10), windowDays: num(own.window_school_days, DEFAULT_WINDOW_DAYS, 3, 30), working: working.length ? working : DEFAULT_WORKING_DAYS };
}

export type Missed = { targetId: string; title: string; subject: string; dueDate: string };
export type Candidate = { student_id: string; student_name: string; class_id: string; class_name: string; missed: Missed[]; plan: (Missed & { catchUpBy: string })[] };

// The students over the threshold, each with the homeworks they missed
// (oldest first) and the suggested catch-up: one a school day, oldest first.
// A student already decided for these homeworks is not listed again until
// they miss a newer one.
export async function findCandidates(db: PoolClient, schoolId: string, today: string): Promise<{ settings: RecoverySettings; from: string; candidates: Candidate[] }> {
  const settings = await recoverySettings(db, schoolId);
  const from = windowStart(today, settings.windowDays, settings.working);
  const { rows } = await db.query(
    `select st.student_id, st.name as student_name, c.class_id, c.name as class_name,
            jsonb_agg(jsonb_build_object('targetId', t.target_id, 'title', t.title, 'subject', s.name, 'dueDate', t.due_date::text) order by t.due_date, t.assigned_at) as missed,
            max(t.due_date)::text as latest
       from homework_status hs
       join homework_targets t on t.school_id = hs.school_id and t.target_id = hs.target_id
       join homework h on h.school_id = t.school_id and h.homework_id = t.homework_id
       join subjects s on s.school_id = h.school_id and s.subject_id = h.subject_id
       join students st on st.school_id = hs.school_id and st.student_id = hs.student_id and st.status in ('active', 'pending_consent') and st.class_id = t.class_id
       join classes c on c.school_id = t.school_id and c.class_id = t.class_id
      where hs.school_id = $1 and hs.done = false and t.due_date between $2::date and $3::date
      group by st.student_id, st.name, c.class_id, c.name
     having count(*) >= $4
        and not exists (select 1 from recovery_plans p where p.school_id = $1 and p.student_id = st.student_id and p.window_to >= max(t.due_date))
      order by st.name, st.student_id`,
    [schoolId, from, today, settings.threshold]
  );
  const candidates = (rows as (Omit<Candidate, 'plan'> & { latest: string })[]).map((r) => {
    const dates = catchUpDates(today, r.missed.length, settings.working);
    return { student_id: r.student_id, student_name: r.student_name, class_id: r.class_id, class_name: r.class_name, missed: r.missed, plan: r.missed.map((m, i) => ({ ...m, catchUpBy: dates[i] })) };
  });
  return { settings, from, candidates };
}

export type Plan = { plan_id: string; student_name: string; class_name: string; status: 'approved' | 'dismissed'; note: string | null; items: (Missed & { catchUpBy: string })[]; decided_at: string };
export async function decidedPlans(db: PoolClient, schoolId: string): Promise<Plan[]> {
  return (await db.query(
    `select p.plan_id, st.name as student_name, c.name as class_name, p.status, p.note, p.items, p.decided_at
       from recovery_plans p
       join students st on st.school_id = p.school_id and st.student_id = p.student_id
       join classes c on c.school_id = p.school_id and c.class_id = p.class_id
      where p.school_id = $1 order by p.decided_at desc limit 30`,
    [schoolId]
  )).rows;
}

type Actor = { schoolId: string; userId: string; role: StaffRole };
export type DecideResult = { ok: true; planId: string } | { ok: false; reason: 'not_allowed' | 'not_a_candidate' };

// Approve or dismiss the plan suggested for one student. The student must be
// on the list now: the plan stored is the one worked out by the server, not
// one sent by the screen.
export async function decidePlan(db: PoolClient, actor: Actor, input: { studentId: string; status: 'approved' | 'dismissed'; note: string | null; today: string }): Promise<DecideResult> {
  if (!STAFF.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`recovery:${actor.schoolId}:${input.studentId}`]);
  const { from, candidates } = await findCandidates(db, actor.schoolId, input.today);
  const candidate = candidates.find((c) => c.student_id === input.studentId);
  if (!candidate) return { ok: false, reason: 'not_a_candidate' };
  const to = candidate.missed[candidate.missed.length - 1].dueDate;
  const made = await db.query(
    `insert into recovery_plans (school_id, student_id, class_id, window_from, window_to, items, status, note, decided_by) values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9) returning plan_id`,
    [actor.schoolId, candidate.student_id, candidate.class_id, from, to, JSON.stringify(candidate.plan), input.status, input.note, actor.userId]
  );
  const planId = made.rows[0].plan_id as string;
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction: `recovery.${input.status}`, targetType: 'recovery_plans', targetId: planId, beforeState: undefined, afterState: { studentId: candidate.student_id, homeworks: candidate.missed.length, windowFrom: from, windowTo: to } });
  return { ok: true, planId };
}
