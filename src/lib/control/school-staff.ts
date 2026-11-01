import type { PoolClient } from 'pg';

// The staff of one school, read-only, for the founder's school page (W13-B). Members of staff are the school's
// memberships that are not a parent's; a teacher is a teaching member of staff, every other role is not. Only what
// the platform role may read is used: the name, the role, the subjects a teacher is given, the status and the day
// they joined. Nothing of the private profile (contact, address, pay, documents) is read here, and the platform role
// holds no right on it.

export type StaffRow = { userId: string; name: string; role: string; subjects: string[]; status: 'active' | 'inactive'; joined: string | null };
export type StaffCounts = { total: number; teaching: number; nonTeaching: number; active: number; inactive: number };
export type SchoolStaff = { counts: StaffCounts; staff: StaffRow[] };

export const TEACHING_ROLES: readonly string[] = ['teacher'];

export async function listSchoolStaff(db: Pick<PoolClient, 'query'>, schoolId: string): Promise<SchoolStaff> {
  const { rows } = await db.query(
    `select m.user_id, u.display_name, m.role::text as role, (m.is_active and u.is_active) as active,
            coalesce(t.joined, m.created_at::date)::text as joined,
            coalesce(s.subjects, '{}'::text[]) as subjects
       from memberships m
       join users u on u.user_id = m.user_id
       left join lateral (select min(t.joining_date) as joined, array_agg(t.teacher_id) as ids from teachers t where t.school_id = m.school_id and t.user_id = m.user_id) t on true
       left join lateral (select array_agg(distinct sj.name order by sj.name) as subjects
                            from teacher_subjects ts join subjects sj on sj.subject_id = ts.subject_id and sj.school_id = ts.school_id
                           where ts.school_id = m.school_id and ts.teacher_id = any(t.ids)) s on true
      where m.school_id = $1 and m.role::text <> 'parent'
      order by (m.is_active and u.is_active) desc, (m.role::text = 'teacher') desc, lower(u.display_name)`,
    [schoolId]
  );
  const staff: StaffRow[] = rows.map((r) => ({
    userId: r.user_id as string,
    name: r.display_name as string,
    role: r.role as string,
    subjects: (r.subjects as string[]) ?? [],
    status: r.active ? 'active' : 'inactive',
    joined: (r.joined as string | null) ?? null,
  }));
  const teaching = staff.filter((s) => TEACHING_ROLES.includes(s.role)).length;
  const active = staff.filter((s) => s.status === 'active').length;
  return { counts: { total: staff.length, teaching, nonTeaching: staff.length - teaching, active, inactive: staff.length - active }, staff };
}
