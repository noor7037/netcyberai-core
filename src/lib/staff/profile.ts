import type { PoolClient } from 'pg';
import type { SchoolRole } from '@/lib/contracts/modules';

// A member of staff's profile (C235-D): what the school's record already holds about them, read in the caller's own
// tenant transaction (row level security decides every part). No new field is invented here: no staff code and no
// photo are recorded today, so none is shown.
//
//   - the account: name, role, email, mobile, whether it is switched on, since when they are in this school;
//   - a teacher's joining date (teachers), the classes they are class teacher of and what they teach (who teaches
//     what, C231);
//   - their qualifications from the compliance desk (C227), which the office alone reads: for anyone else the
//     database returns none, and the profile says nothing about them.
// Who opens a profile: the principal and the school admin (the staff list's own rule), and a member of staff their own.

export type StaffProfile = {
  userId: string;
  name: string;
  role: SchoolRole;
  email: string | null;
  phone: string | null;
  active: boolean;
  since: string;
  joiningDate: string | null;
  classTeacherOf: string[];
  teaches: { subject: string; className: string }[];
  qualification: { degree: string | null; postgraduate: string | null; professional: string | null; tet: string | null } | null;
};

export const mayOpenStaffProfile = (viewer: { role: string; sub: string }, staffId: string): boolean =>
  viewer.role === 'principal' || viewer.role === 'school_admin' || viewer.sub === staffId;

const day = (v: Date | string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(v));

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
    joiningDate: joining.rows[0]?.d ?? null,
    classTeacherOf: classTeacher.rows.map((r) => r.name),
    teaches: teaches.rows.map((r) => ({ subject: r.subject, className: r.class_name })),
    qualification: q
      ? { degree: q.degree ?? null, postgraduate: q.postgraduate_degree ?? null, professional: q.professional_qualification ?? null, tet: q.tet_type ? `${q.tet_type}${q.tet_paper ? ` (${q.tet_paper})` : ''}` : null }
      : null,
  };
}
