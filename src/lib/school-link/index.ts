import { createHash, randomInt } from 'crypto';
import type { PoolClient } from 'pg';
import { withGuardianContext, SchoolLinkGoneError } from '@/lib/auth/db';
import { writeAuditLog } from '@/lib/audit/log';
import { loadFamilyHome } from '@/lib/parent-home/home';
import { CONNECT_CODE_ALPHABET, CONNECT_CODE_DAYS, type LinkedSchool, type SchoolDayMark, type SchoolEvent, type SchoolHomework, type SchoolNotice, type SchoolSyllabus } from '@/lib/contracts/school-link';
import { indiaDate } from '@/lib/time/india';

// School Link (C230-AA; docs/family-app/03 §4): the only path from a Family app account to a school's records.
//   1. Issue: the principal or a school admin makes a single-use, 7-day connect code for one guardian. Only its SHA-256
//      is stored; the office reads the code once and gives it to the parent. Audited, never with the code.
//   2. Redeem: the parent enters it in the parent area; public.family_redeem_connect_code spends it and makes the
//      account's link in one call; the family role can never make a link itself, and a closed link stays closed.
//   3. Read: as that guardian (withGuardianContext), so the school's parent rules decide every row.
//   4. Unlink: by the family (its parent area) or the school (the guardian screen); either ends access at once.
// The Family app reaches this module only through src/lib/family/school.ts (check_family_boundary.py's door).

type Sql = Pick<PoolClient, 'query'>;
export { SchoolLinkGoneError };

// ---- the code ----------------------------------------------------------------------------------------------------------

export function makeConnectCode(): string {
  let s = '';
  for (let i = 0; i < 8; i++) s += CONNECT_CODE_ALPHABET[randomInt(CONNECT_CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

// What a parent typed, made comparable: case, spaces and dashes do not matter; anything else is not a code.
export function normalizeConnectCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.length !== 8) return null;
  for (const ch of s) if (!CONNECT_CODE_ALPHABET.includes(ch)) return null;
  return s;
}

export const hashConnectCode = (normalized: string) => createHash('sha256').update(`ncf-connect:${normalized}`).digest('hex');

// ---- the school's side (a staff session: principal or school admin, in its own school) ----------------------------------

export type Staff = { userId: string; role: string; schoolId: string };
export const CONNECT_CODE_ROLES: readonly string[] = ['principal', 'school_admin'];

// A new code for one guardian of this school; any earlier unused code for the guardian stops working.
export async function issueConnectCode(db: Sql, staff: Staff, parentId: string): Promise<{ code: string; expiresAt: string } | 'not_found'> {
  const guardian = (await db.query(`select 1 from parents where parent_id = $1 and merged_into is null`, [parentId])).rows[0];
  if (!guardian) return 'not_found';
  await db.query(`update family_connect_codes set expires_at = now() where parent_id = $1 and used_at is null and expires_at > now()`, [parentId]);
  const code = makeConnectCode();
  const row = (
    await db.query(
      `insert into family_connect_codes (school_id, parent_id, code_hash, expires_at, created_by)
       values ($1, $2, $3, now() + make_interval(days => $4), $5) returning expires_at`,
      [staff.schoolId, parentId, hashConnectCode(normalizeConnectCode(code) as string), CONNECT_CODE_DAYS, staff.userId]
    )
  ).rows[0] as { expires_at: Date };
  const expiresAt = new Date(row.expires_at).toISOString();
  await writeAuditLog(db as PoolClient, {
    schoolId: staff.schoolId,
    actorUserId: staff.userId,
    actorRole: staff.role as never,
    eventAction: 'family.connect_code_issued',
    targetType: 'parents',
    targetId: parentId,
    afterState: { expires_at: expiresAt },
  });
  return { code, expiresAt };
}

// The school disconnects a guardian's Family app: their links close and any unused code stops working.
export async function disconnectGuardian(db: Sql, staff: Staff, parentId: string): Promise<{ closed: number }> {
  await db.query(`update family_connect_codes set expires_at = now() where parent_id = $1 and used_at is null and expires_at > now()`, [parentId]);
  const closed = Number((await db.query(`select family.revoke_school_links_for_guardian($1) as n`, [parentId])).rows[0]?.n ?? 0);
  await writeAuditLog(db as PoolClient, {
    schoolId: staff.schoolId,
    actorUserId: staff.userId,
    actorRole: staff.role as never,
    eventAction: 'family.school_link_revoked',
    targetType: 'parents',
    targetId: parentId,
    afterState: { closed, by: 'school' },
  });
  return { closed };
}

// ---- the family's side ------------------------------------------------------------------------------------------------

// Spends a code in the family's own transaction (the family role, its own account) and makes the account's link to
// that guardian, or keeps the open one; null when the code is unknown, used or expired.
export async function redeemConnectCode(db: Sql, accountId: string, typed: unknown): Promise<{ linkId: string; schoolName: string } | null> {
  const normalized = normalizeConnectCode(typed);
  if (!normalized) return null;
  const row = (await db.query(`select link_id, school_name from public.family_redeem_connect_code($1, $2)`, [hashConnectCode(normalized), accountId])).rows[0] as
    | { link_id: string; school_name: string }
    | undefined;
  return row ? { linkId: row.link_id, schoolName: row.school_name } : null;
}

type Claims = { accountId: string; tokenVersion: number };

// The guardian's children at the school, as the school shows them to that guardian today. `matched`: the students this
// app has matched to one of its children; only they get their class's homework (C329), notices and events (C331).
export async function readLinkedSchool(claims: Claims, linkId: string, opts: { matched?: readonly string[]; today?: string } = {}): Promise<LinkedSchool> {
  const today = opts.today ?? indiaDate();
  return withGuardianContext(claims, linkId, async (db, link) => {
    const home = await loadFamilyHome(db, link, today);
    const sent = new Map<string, { homework: SchoolHomework[]; notices: SchoolNotice[]; events: SchoolEvent[] }>();
    for (const c of home.children)
      if (opts.matched?.includes(c.studentId))
        sent.set(c.studentId, { homework: await classHomework(db, c.studentId, today), notices: await classNotices(db, c.studentId, today), events: await classEvents(db, c.studentId, today) });
    return {
      schoolName: home.schoolName,
      awaitingConsent: home.awaitingConsent,
      children: home.children.map((c) => ({
        studentId: c.studentId,
        name: c.name,
        className: c.className ?? '',
        today: c.today,
        presentDays: c.presentDays,
        markedDays: c.markedDays,
        dueMinor: c.dueMinor,
        overdueMinor: c.overdueMinor,
        nextDue: c.nextDue,
        homework: sent.get(c.studentId)?.homework ?? null,
        notices: sent.get(c.studentId)?.notices ?? null,
        events: sent.get(c.studentId)?.events ?? null,
      })),
    };
  });
}

// The homework set for one student's class and section, due in the last week or later (or set in the last month with
// no due day), soonest first, and the teacher's done mark for this student. In the guardian's session the school's rules
// (school_link_homework.sql) let through only the guardian's own children's classes and done marks.
async function classHomework(db: Sql, studentId: string, today: string): Promise<SchoolHomework[]> {
  const { rows } = await db.query(
    `select sub.name as subject, coalesce(t.title, h.title) as title, coalesce(t.details, h.details) as details,
            coalesce(t.due_date, h.due_date)::text as due, st.done
       from students s
       join homework_targets t on t.school_id = s.school_id and t.class_id = s.class_id
       join homework h on h.school_id = t.school_id and h.homework_id = t.homework_id
       left join subjects sub on sub.school_id = h.school_id and sub.subject_id = h.subject_id
       left join homework_status st on st.school_id = t.school_id and st.target_id = t.target_id and st.student_id = s.student_id
      where s.student_id = $1
        and (coalesce(t.due_date, h.due_date) >= $2::date - 7 or (coalesce(t.due_date, h.due_date) is null and t.assigned_at >= $2::date - 30))
      order by coalesce(t.due_date, h.due_date) nulls last, t.assigned_at desc
      limit 10`,
    [studentId, today]
  );
  return (rows as { subject: string | null; title: string; details: string | null; due: string | null; done: boolean | null }[]).map((r) => ({
    subject: r.subject,
    title: r.title,
    details: r.details,
    due: r.due,
    done: r.done,
  }));
}

// The notices the principal approved in the last 30 days for one student's class or the whole school, newest first. In
// the guardian's session the school's rules (school_link_notices_events.sql) let through only sent notices of the
// guardian's own children's classes and the whole school; the class filter here keeps each child to their own class.
async function classNotices(db: Sql, studentId: string, today: string): Promise<SchoolNotice[]> {
  const { rows } = await db.query(
    `select n.body, (n.decided_at at time zone 'Asia/Kolkata')::date::text as sent_on, n.class_id is null as whole_school
       from class_notices n
      where n.status = 'sent'
        and n.school_id = (select s.school_id from students s where s.student_id = $1)
        and (n.class_id is null or n.class_id = (select s.class_id from students s where s.student_id = $1))
        and n.decided_at >= $2::date - 30
      order by n.decided_at desc
      limit 5`,
    [studentId, today]
  );
  return (rows as { body: string; sent_on: string; whole_school: boolean }[]).map((r) => ({ body: r.body, sentOn: r.sent_on, wholeSchool: r.whole_school }));
}

// The events the office invited one student's class or the whole school to, from today on, soonest first (a cancelled
// one stays, marked cancelled, so the family knows). Drafts are never read.
async function classEvents(db: Sql, studentId: string, today: string): Promise<SchoolEvent[]> {
  const { rows } = await db.query(
    `select e.title, e.details, e.held_on::text as held_on, to_char(e.starts_at, 'HH24:MI') as starts_at,
            e.status = 'cancelled' as cancelled, cardinality(e.class_ids) = 0 as whole_school
       from school_events e
      where e.invited_at is not null and e.held_on >= $2::date
        and e.school_id = (select s.school_id from students s where s.student_id = $1)
        and (cardinality(e.class_ids) = 0 or (select s.class_id from students s where s.student_id = $1) = any (e.class_ids))
      order by e.held_on, e.starts_at nulls first
      limit 5`,
    [studentId, today]
  );
  return (rows as { title: string; details: string; held_on: string; starts_at: string | null; cancelled: boolean; whole_school: boolean }[]).map((r) => ({
    title: r.title,
    details: r.details,
    heldOn: r.held_on,
    startsAt: r.starts_at,
    cancelled: r.cancelled,
    wholeSchool: r.whole_school,
  }));
}

// The school's consent for this student's core records, as loadFamilyHome applies it: the latest decision granted, or a
// test school's fictional children (docs/31 §3 rule 3). Without it, nothing of the student is shown.
async function consented(db: Sql, schoolId: string, studentId: string): Promise<boolean> {
  const fixture = (await db.query(`select is_test_fixture from schools where school_id = $1`, [schoolId])).rows[0] as { is_test_fixture: boolean } | undefined;
  if (fixture?.is_test_fixture) return true;
  const last = (
    await db.query(`select granted from consent_ledger where purpose = 'core_records' and student_id = $1 order by created_at desc limit 1`, [studentId])
  ).rows[0] as { granted: boolean } | undefined;
  return last?.granted === true;
}

// Today's mark for one linked student, and the school's name: what the child's home shows (narrow, one small read).
export async function readSchoolToday(claims: Claims, linkId: string, studentId: string, today = indiaDate()): Promise<{ schoolName: string; today: SchoolDayMark | null } | null> {
  return withGuardianContext(claims, linkId, async (db, link) => {
    if (!(await consented(db, link.schoolId, studentId))) return null;
    const student = (await db.query(`select 1 from students where student_id = $1 and status = 'active'`, [studentId])).rows[0];
    if (!student) return null;
    const school = (await db.query(`select name from schools where school_id = $1`, [link.schoolId])).rows[0] as { name: string } | undefined;
    const mark = (await db.query(`select status::text as status from attendance where student_id = $1 and date = $2::date limit 1`, [studentId, today])).rows[0] as { status: string } | undefined;
    const m = mark?.status === 'on_leave' ? 'leave' : mark?.status;
    return { schoolName: school?.name ?? '', today: m === 'present' || m === 'absent' || m === 'late' || m === 'leave' ? m : null };
  });
}

// One linked student's class syllabus, as the school published it (syllabus_units), subject by subject; nothing without
// the school's consent for the student.
export async function readSchoolSyllabus(claims: Claims, linkId: string, studentId: string): Promise<SchoolSyllabus> {
  return withGuardianContext(claims, linkId, async (db, link) => {
    if (!(await consented(db, link.schoolId, studentId))) return { subjects: [] };
    const rows = (
      await db.query(
        `select sub.name as subject, u.chapter, u.topic
           from students s
           join syllabus_units u on u.class_id = s.class_id and u.school_id = s.school_id
           join subjects sub on sub.subject_id = u.subject_id
          where s.student_id = $1
          order by sub.name, u.position`,
        [studentId]
      )
    ).rows as { subject: string; chapter: string; topic: string }[];
    const subjects: SchoolSyllabus['subjects'] = [];
    for (const r of rows) {
      let s = subjects.find((x) => x.name === r.subject);
      if (!s) subjects.push((s = { name: r.subject, chapters: [] }));
      let c = s.chapters.find((x) => x.title === r.chapter);
      if (!c) s.chapters.push((c = { title: r.chapter, topics: [] }));
      c.topics.push(r.topic);
    }
    return { subjects };
  });
}
