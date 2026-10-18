import type { PoolClient } from 'pg';

// The onboarding checklist (docs/28 slice 10g, C244): what a new school still has to set up, counted from the rows
// that exist when it is asked. Nothing is stored and nothing is ticked by hand, so the list can never say "done"
// about something that is not there, and a school that removes a row sees the step open again.
//
// One statement, run as the caller (the school's own principal or school admin through row-level security, or the
// platform role on the Control page, which passes the school's id): every count is of ONE school's rows. A school the
// caller cannot see has no checklist: the list is empty, not nine steps with nothing done.
//
// How each item flips (the first item that is not done is the one to do next):
//   session   a session is marked current (`count` is the sessions the school has)
//   classes   at least one class
//   subjects  at least one subject in use (not retired) AND, for each class, some subject in use taught in it
//             (a teacher_subjects row for a subject that is not retired). Subjects belong to the school, not to a
//             class, so a subject is "in use" by being kept, and it is taught in a class by being given to a teacher
//             there. No classes: not done.
//   staff     at least one account besides the principal: an active staff membership of the school whose role is
//             not principal (a school admin, a teacher, an accountant or an academic coordinator)
//   teachers  at least one teacher_subjects row (who teaches what)
//   students  at least one active student
//   fees      at least one fee structure
//   timetable at least one period in the published timetable
//   logo      the school has a logo
type Sql = Pick<PoolClient, 'query'>;

export const CHECKLIST_IDS = ['session', 'classes', 'subjects', 'staff', 'teachers', 'students', 'fees', 'timetable', 'logo'] as const;
export type ChecklistId = (typeof CHECKLIST_IDS)[number];

export type ChecklistItem = {
  id: ChecklistId;
  done: boolean;
  // The rows that exist for this step (sessions, classes, subjects in use, staff accounts, ...). The logo is 1 or 0.
  count: number;
  // Subjects only: the classes that have no subject taught in them yet (0 when the school has no classes).
  without: number;
  // The screen where the step is done.
  href: string;
};

export const CHECKLIST_HREFS: Record<ChecklistId, string> = {
  session: '/app/setup/sessions',
  classes: '/app/students?classes=1',
  subjects: '/app/setup/subjects',
  staff: '/app/staff',
  teachers: '/app/staff',
  students: '/app/students',
  fees: '/app/fees',
  timetable: '/app/timetable',
  logo: '/app/settings',
};

// The roles of the people who work at a school besides its principal.
const STAFF_ROLES = ['school_admin', 'teacher', 'accountant', 'academic_coordinator'];

export async function onboardingChecklist(db: Sql, schoolId: string): Promise<ChecklistItem[]> {
  const { rows } = await db.query(
    `select
       (select count(*) from schools where school_id = $1)::int as visible,
       (select count(*) from academic_sessions where school_id = $1)::int as sessions,
       (select count(*) from academic_sessions where school_id = $1 and is_current)::int as current_sessions,
       (select count(*) from classes where school_id = $1)::int as classes,
       (select count(*) from subjects where school_id = $1 and retired_at is null)::int as subjects,
       (select count(*) from classes c where c.school_id = $1
          and not exists (select 1 from teacher_subjects ts join subjects s on s.school_id = ts.school_id and s.subject_id = ts.subject_id and s.retired_at is null
                           where ts.school_id = c.school_id and ts.class_id = c.class_id))::int as classes_without_subject,
       (select count(*) from memberships m join users u on u.user_id = m.user_id
         where m.school_id = $1 and m.is_active and u.is_active and m.role::text = any ($2::text[]))::int as staff,
       (select count(*) from teacher_subjects where school_id = $1)::int as teaching,
       (select count(*) from students where school_id = $1 and status = 'active')::int as students,
       (select count(*) from fee_structures where school_id = $1)::int as structures,
       (select count(*) from timetable_entries where school_id = $1)::int as periods,
       (select count(*) from schools where school_id = $1 and logo_path is not null)::int as logo`,
    [schoolId, STAFF_ROLES]
  );
  const r = rows[0] ?? {};
  const n = (v: unknown) => Number(v ?? 0);
  if (n(r.visible) === 0) return [];
  const item = (id: ChecklistId, done: boolean, count: number, without = 0): ChecklistItem => ({ id, done, count, without, href: CHECKLIST_HREFS[id] });
  const classes = n(r.classes);
  const withoutSubject = classes > 0 ? n(r.classes_without_subject) : 0;
  return [
    item('session', n(r.current_sessions) > 0, n(r.sessions)),
    item('classes', classes > 0, classes),
    item('subjects', n(r.subjects) > 0 && classes > 0 && withoutSubject === 0, n(r.subjects), withoutSubject),
    item('staff', n(r.staff) > 0, n(r.staff)),
    item('teachers', n(r.teaching) > 0, n(r.teaching)),
    item('students', n(r.students) > 0, n(r.students)),
    item('fees', n(r.structures) > 0, n(r.structures)),
    item('timetable', n(r.periods) > 0, n(r.periods)),
    item('logo', n(r.logo) > 0, n(r.logo)),
  ];
}

// How many steps are done, out of how many. No steps at all is not "complete".
export function checklistProgress(items: readonly ChecklistItem[]): { done: number; total: number; complete: boolean } {
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, complete: items.length > 0 && done === items.length };
}
