import type { PoolClient } from 'pg';
import type { SchoolRole } from '@/lib/contracts/modules';
import { schoolWeek } from '@/lib/timetable/generator-store';
import { teacherWorkload } from '@/lib/timetable/timetable';
import type { EmploymentType } from './profile-rules';
import type { LeaveKind, LeaveStatus } from './leave-rules';

// A member of staff's profile (C235-D, C238): what the school's record holds about them, read in the caller's own
// tenant transaction (row level security decides every part).
//
//   - the account: name, role, email, mobile (users.phone), whether it is switched on, since when they are here;
//   - what the office keeps on the profile (staff_profiles, C238): staff code, designation, employment, joining date,
//     date of birth, address, emergency contact, photo. A teacher's joining date from the teachers list is shown
//     while the profile has none;
//   - leave (staff_leave, C201): what is waiting and what was approved, and the approved days that have come in the
//     current school year (all on record when no year is current). For the person and the office only, never a
//     ranking (docs/26 section 3 rule 4). The school keeps no daily attendance for staff, and none is shown;
//   - teaching: who teaches what (C231), the classes they are class teacher of, and their periods a week from the
//     published timetable (C232), or nothing when no timetable is published;
//   - their qualifications from the compliance desk (C227, C232: the office, or the person their own row);
//   - how many papers are on their record (C235-D).
// Who opens a profile: the principal and the school admin (the staff list's own rule), and a member of staff their own.

export type StaffLeaveLine = { leaveId: string; from: string; to: string; days: number; kind: LeaveKind; status: LeaveStatus };
export type StaffProfile = {
  userId: string;
  name: string;
  role: SchoolRole;
  email: string | null;
  phone: string | null;
  active: boolean;
  since: string;
  joiningDate: string | null;
  staffCode: string | null;
  designation: string | null;
  employmentType: EmploymentType | null;
  dateOfBirth: string | null;
  address: string | null;
  emergencyContact: string | null;
  // The profile row's own joining date, as the edit form starts from it (joiningDate may be the teachers list's).
  profileJoiningDate: string | null;
  photoVersion: string | null;
  classTeacherOf: string[];
  teaches: { subject: string; className: string }[];
  periodsAWeek: number | null;
  leave: { daysTaken: number; waiting: number; session: string | null; lines: StaffLeaveLine[] };
  documents: number;
  qualification: { degree: string | null; postgraduate: string | null; professional: string | null; tet: string | null } | null;
};

export const mayOpenStaffProfile = (viewer: { role: string; sub: string }, staffId: string): boolean =>
  viewer.role === 'principal' || viewer.role === 'school_admin' || viewer.sub === staffId;

const day = (v: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(v));
export const LEAVE_LINES_SHOWN = 20;

export async function loadStaffProfile(db: PoolClient, schoolId: string, userId: string): Promise<StaffProfile | null> {
  const person = (
    await db.query(
      `select u.user_id, u.display_name, u.email, u.phone, m.role, (m.is_active and u.is_active) as active, m.created_at
         from memberships m join users u on u.user_id = m.user_id
        where m.school_id = $1 and m.user_id = $2 and u.role <> 'super_admin' and m.role::text <> 'parent'`,
      [schoolId, userId]
    )
  ).rows[0];
  if (!person) return null;
  // One after another: one connection runs one query at a time.
  const record = (
    await db.query(
      `select staff_code, designation, employment_type, joining_date::text as joining_date, date_of_birth::text as date_of_birth, address,
              emergency_contact, photo_path is not null as has_photo, updated_at
         from staff_profiles where school_id = $1 and user_id = $2`,
      [schoolId, userId]
    )
  ).rows[0];
  const joining = await db.query(`select joining_date::text as d from teachers where school_id = $1 and user_id = $2 and joining_date is not null order by joining_date limit 1`, [schoolId, userId]);
  const classTeacher = await db.query(`select name from classes where school_id = $1 and class_teacher_id = $2 order by name`, [schoolId, userId]);
  const teaches = await db.query(
    `select s.name as subject, c.name as class_name
       from teacher_subjects ts
       join teachers t on t.school_id = ts.school_id and t.teacher_id = ts.teacher_id
       join subjects s on s.school_id = ts.school_id and s.subject_id = ts.subject_id
       join classes c on c.school_id = ts.school_id and c.class_id = ts.class_id
      where ts.school_id = $1 and t.user_id = $2
      order by c.name, s.name`,
    [schoolId, userId]
  );
  let periodsAWeek: number | null = null;
  // Anyone with periods in the published timetable (a principal or coordinator may teach too), not only teachers.
  if ((await db.query(`select 1 from timetable_entries where school_id = $1 limit 1`, [schoolId])).rows[0]) {
    const week = await schoolWeek(db, schoolId);
    const periods = (await teacherWorkload(db, schoolId, { ...week, teacherUserId: userId }))[0]?.periods ?? 0;
    periodsAWeek = person.role === 'teacher' || periods > 0 ? periods : null;
  }
  // Approved days that have come, from the start of the current school year (or all on record), and what waits.
  const leaveTotals = (
    await db.query(
      `with t as (select (now() at time zone 'Asia/Kolkata')::date as today),
            s as (select start_date, label from academic_sessions where school_id = $1 and is_current order by start_date desc limit 1)
       select (select label from s) as session,
              coalesce(sum(least(l.to_date, t.today) - greatest(l.from_date, coalesce((select start_date from s), l.from_date)) + 1)
                filter (where l.status = 'approved' and greatest(l.from_date, coalesce((select start_date from s), l.from_date)) <= least(l.to_date, t.today)), 0)::int as taken,
              count(l.leave_id) filter (where l.status = 'waiting')::int as waiting
         from t left join staff_leave l on l.school_id = $1 and l.user_id = $2
        group by t.today`,
      [schoolId, userId]
    )
  ).rows[0];
  const leaveLines = await db.query(
    `select leave_id, from_date::text as from_date, to_date::text as to_date, to_date - from_date + 1 as days, kind, status
       from staff_leave where school_id = $1 and user_id = $2 and status in ('waiting', 'approved')
      order by from_date desc limit ${LEAVE_LINES_SHOWN}`,
    [schoolId, userId]
  );
  const documents = await db.query(`select count(*)::int as n from record_documents where school_id = $1 and staff_user_id = $2`, [schoolId, userId]);
  const qualification = await db.query(
    `select degree, postgraduate_degree, professional_qualification, tet_type, tet_paper
       from staff_qualifications where school_id = $1 and user_id = $2`,
    [schoolId, userId]
  );
  const q = qualification.rows[0];
  return {
    userId: person.user_id,
    name: person.display_name,
    role: person.role,
    email: person.email ?? null,
    phone: person.phone ?? null,
    active: person.active === true,
    since: day(person.created_at),
    joiningDate: record?.joining_date ?? joining.rows[0]?.d ?? null,
    staffCode: record?.staff_code ?? null,
    designation: record?.designation ?? null,
    employmentType: record?.employment_type ?? null,
    dateOfBirth: record?.date_of_birth ?? null,
    address: record?.address ?? null,
    emergencyContact: record?.emergency_contact ?? null,
    profileJoiningDate: record?.joining_date ?? null,
    photoVersion: record?.has_photo ? String(new Date(record.updated_at).getTime()) : null,
    classTeacherOf: classTeacher.rows.map((r) => r.name),
    teaches: teaches.rows.map((r) => ({ subject: r.subject, className: r.class_name })),
    periodsAWeek,
    leave: {
      daysTaken: leaveTotals?.taken ?? 0,
      waiting: leaveTotals?.waiting ?? 0,
      session: leaveTotals?.session ?? null,
      lines: leaveLines.rows.map((r) => ({ leaveId: r.leave_id, from: r.from_date, to: r.to_date, days: Number(r.days), kind: r.kind, status: r.status })),
    },
    documents: documents.rows[0]?.n ?? 0,
    qualification: q
      ? { degree: q.degree ?? null, postgraduate: q.postgraduate_degree ?? null, professional: q.professional_qualification ?? null, tet: q.tet_type ? `${q.tet_type}${q.tet_paper ? ` (${q.tet_paper})` : ''}` : null }
      : null,
  };
}
