import { classLabel } from '@/lib/frameworks/class-label';
import { classOrderSql } from '@/lib/classes/class-order';

// One day's attendance across the school (docs/26 slice 8d, C203): which
// classes have been marked, and which students hold which mark. The
// Attendance screen shows these rows when it is opened on a filter
// (/app/attendance?show=…), and the school facts (src/lib/insights) count
// the same rows, so the dashboard's number and the list it opens cannot
// differ.
//
// A student counts where the class roster counts them (getAttendanceRoster):
// on the roll now (active, or waiting for consent) in a class. A class is
// "marked" once any of its students has a mark that day, the rule My Day's
// card uses. A student on leave IS marked. Row level security decides whose
// classes come back: a teacher's own, the office's all.

type Sql = { query: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export const DAY_MARKS = ['present', 'absent', 'late', 'leave'] as const;
export type DayMark = (typeof DAY_MARKS)[number];
// What /app/attendance?show= accepts: classes by whether they are marked, students by their mark.
export const ATTENDANCE_SHOWS = ['marked', 'unmarked', 'with-mark', 'not-marked', 'present', 'absent', 'late', 'leave'] as const;
export type AttendanceShow = (typeof ATTENDANCE_SHOWS)[number];
export const isAttendanceShow = (v: unknown): v is AttendanceShow => typeof v === 'string' && (ATTENDANCE_SHOWS as readonly string[]).includes(v);
// The most student rows one list shows. A school larger than this sees the first rows and is told so.
export const STUDENT_ROWS_MAX = 3000;

export type ClassDay = { class_id: string; class_name: string; students: number; marked: number; present: number; absent: number; late: number; leave: number };

const n = (v: unknown) => Number(v ?? 0);
const ON_ROLL = `s.status in ('active', 'pending_consent')`;

// Every class with a student on its roll, in the order of its name. Never sorted by a rate. Answered only to the roles
// that read a whole class's day of attendance, by the database's own rule (reads_attendance_days(), C219): an
// accountant reads the classes and the roll for fees, and no mark, so every class would look "not marked"; they get
// no class here instead.
export async function classesOnDay(db: Sql, schoolId: string, date: string): Promise<ClassDay[]> {
  const { rows } = await db.query(
    `select c.class_id, c.name, c.section, count(*)::int as students, count(a.attendance_id)::int as marked,
            (count(*) filter (where a.status = 'present'))::int as present, (count(*) filter (where a.status = 'absent'))::int as absent,
            (count(*) filter (where a.status = 'late'))::int as late, (count(*) filter (where a.status = 'leave'))::int as leave
       from classes c
       join students s on s.school_id = c.school_id and s.class_id = c.class_id and ${ON_ROLL}
       left join attendance a on a.school_id = s.school_id and a.student_id = s.student_id and a.date = $2::date
      where c.school_id = $1 and public.reads_attendance_days()
      group by c.class_id, c.name, c.section
      order by ${classOrderSql('c')}, c.class_id`,
    [schoolId, date]
  );
  return rows.map((r) => ({ class_id: r.class_id as string, class_name: classLabel(r.name as string | null, r.section as string | null) ?? '', students: n(r.students), marked: n(r.marked), present: n(r.present), absent: n(r.absent), late: n(r.late), leave: n(r.leave) }));
}

export type StudentDay = { student_id: string; name: string; roll_no: string | null; class_id: string; class_name: string; mark: DayMark | null; leave_code: string | null };

// The students on the roll with that mark on that day ('with-mark': any of the four; 'not-marked': none yet),
// by class and then name.
export type StudentShow = DayMark | 'with-mark' | 'not-marked';
export async function studentsOnDay(db: Sql, schoolId: string, date: string, which: StudentShow, limit: number = STUDENT_ROWS_MAX): Promise<StudentDay[]> {
  const { rows } = await db.query(
    `select s.student_id, s.name, s.roll_no, c.class_id, c.name as class_name, c.section, a.status as mark, a.leave_code
       from students s
       join classes c on c.school_id = s.school_id and c.class_id = s.class_id
       left join attendance a on a.school_id = s.school_id and a.student_id = s.student_id and a.date = $2::date
      where s.school_id = $1 and ${ON_ROLL}
        and (($3 = 'not-marked' and a.attendance_id is null) or ($3 = 'with-mark' and a.attendance_id is not null) or a.status = $3)
      order by ${classOrderSql('c')}, c.class_id, s.name, s.student_id
      limit $4`,
    [schoolId, date, which, limit]
  );
  return rows.map((r) => ({ student_id: r.student_id as string, name: r.name as string, roll_no: (r.roll_no as string | null) ?? null, class_id: r.class_id as string, class_name: classLabel(r.class_name as string | null, r.section as string | null) ?? '', mark: (r.mark as DayMark | null) ?? null, leave_code: (r.leave_code as string | null) ?? null }));
}

export type DayTotals = { classes: number; classesMarked: number; students: number; marked: number; present: number; absent: number; late: number; leave: number };

export function dayTotals(classes: readonly ClassDay[]): DayTotals {
  const sum = (key: keyof Omit<ClassDay, 'class_id' | 'class_name'>) => classes.reduce((a, c) => a + c[key], 0);
  return { classes: classes.length, classesMarked: classes.filter((c) => c.marked > 0).length, students: sum('students'), marked: sum('marked'), present: sum('present'), absent: sum('absent'), late: sum('late'), leave: sum('leave') };
}

export type RateDay = { date: string; present: number; absent: number; late: number; leave: number };

// The marks saved on each day from..to, by kind: every mark of the school the reader may see, whoever the
// student is now. A day with no mark saved has no row.
export async function marksByDay(db: Sql, schoolId: string, from: string, to: string): Promise<RateDay[]> {
  const { rows } = await db.query(
    `select a.date::text as date,
            (count(*) filter (where a.status = 'present'))::int as present, (count(*) filter (where a.status = 'absent'))::int as absent,
            (count(*) filter (where a.status = 'late'))::int as late, (count(*) filter (where a.status = 'leave'))::int as leave
       from attendance a
      where a.school_id = $1 and a.date between $2::date and $3::date
      group by a.date order by a.date`,
    [schoolId, from, to]
  );
  return rows.map((r) => ({ date: r.date as string, present: n(r.present), absent: n(r.absent), late: n(r.late), leave: n(r.leave) }));
}

// The present rate, rule version 1: in school (present or late) out of every mark saved (present, late, absent,
// on leave). A day on leave is a marked day and is not an absence. One decimal; null when nothing is marked.
export const PRESENT_RATE_RULE_VERSION = 1;
export function presentRate(d: { present: number; absent: number; late: number; leave: number }): number | null {
  const marked = d.present + d.absent + d.late + d.leave;
  return marked === 0 ? null : Math.round(((d.present + d.late) / marked) * 1000) / 10;
}

// In school out of the days not on leave (Early Warning, docs/26 slice 8j, C209): present or late, out of
// present, late and absent. A day on recorded leave is left out of both sides, so a child on leave is never
// counted as away. One decimal; null when no such day is marked. This is not the present rate above, which keeps
// a leave day among the marked days: that one says how a school's day went, this one whether a child is missing school.
export function inSchoolRate(d: { present: number; absent: number; late: number }): number | null {
  const counted = d.present + d.absent + d.late;
  return counted === 0 ? null : Math.round(((d.present + d.late) / counted) * 1000) / 10;
}

// The days of a range added up: the marks by kind, how many there are, and the present rate over all of them.
// The dashboard's number and the list /app/attendance?show=days&from=…&to=… both say this one total, over the
// same days' rows (marksByDay), so the rate on the tile is the rate in that list's title.
export type MarksTotal = { present: number; absent: number; late: number; leave: number; marks: number; days: number; rate: number | null };
export function marksTotal(days: readonly RateDay[]): MarksTotal {
  const sum = { present: 0, absent: 0, late: 0, leave: 0 };
  for (const d of days) for (const k of DAY_MARKS) sum[k] += d[k];
  return { ...sum, marks: sum.present + sum.absent + sum.late + sum.leave, days: days.length, rate: presentRate(sum) };
}
