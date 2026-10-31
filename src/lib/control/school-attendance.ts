import type { PoolClient } from 'pg';
import { classOrderSql } from '@/lib/classes/class-order';
import { presentRate } from '@/lib/attendance/day';
import { indiaDate } from '@/lib/time/india';

// Control → a school → Attendance (W13-C): a read-only look at one school's attendance for the platform super admin.
// Today's marking (India's day), the last 14 days, and how many correction requests wait. No student is named.
// Runs as the platform role (rows of every school), so every query filters by the school's id itself.
//
// A student counts where the class roster counts them (src/lib/attendance/day.ts): on the roll now (active or waiting
// for consent). A class is "marked" once any of its students has a mark that day. The present rate is rule version 1
// (presentRate): present or late, out of every mark saved; a day with no mark has no rate, never a rate of 0.

export const ATTENDANCE_DAYS = 14;

export type ClassToday = { classId: string; name: string; section: string | null; marked: boolean; present: number; absent: number };
export type AttendanceDay = { date: string; presentRate: number | null; classesMarked: number; marks: number };
export type SchoolAttendance = {
  today: string;
  classesTotal: number;
  classesMarked: number;
  // Students with a mark today. 0 means nothing was marked, which is not the same as nobody being present.
  studentsMarked: number;
  present: number;
  absent: number;
  late: number;
  classes: ClassToday[];
  days: AttendanceDay[];
  waitingCorrections: number;
  // True once any mark was ever saved for the school.
  everMarked: boolean;
};

const n = (v: unknown) => Number(v ?? 0);

// The ISO dates of the `count` days ending on `end`, oldest first.
export function lastIsoDays(end: string, count: number): string[] {
  const base = Date.parse(`${end}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => new Date(base - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10));
}

export async function schoolAttendance(client: PoolClient, schoolId: string, today: string = indiaDate()): Promise<SchoolAttendance> {
  const dates = lastIsoDays(today, ATTENDANCE_DAYS);
  const classRows = await client.query(
    `select c.class_id, c.name, c.section, count(a.attendance_id)::int as marked,
            (count(*) filter (where a.status = 'present'))::int as present, (count(*) filter (where a.status = 'absent'))::int as absent,
            (count(*) filter (where a.status = 'late'))::int as late
       from classes c
       join students s on s.school_id = c.school_id and s.class_id = c.class_id and s.status in ('active', 'pending_consent')
       left join attendance a on a.school_id = s.school_id and a.student_id = s.student_id and a.date = $2::date
      where c.school_id = $1
      group by c.class_id, c.name, c.section
      order by ${classOrderSql('c')}, c.class_id`,
    [schoolId, today]
  );
  const dayRows = await client.query(
    `select a.date::text as date, count(distinct a.class_id)::int as classes_marked,
            (count(*) filter (where a.status = 'present'))::int as present, (count(*) filter (where a.status = 'absent'))::int as absent,
            (count(*) filter (where a.status = 'late'))::int as late, (count(*) filter (where a.status = 'leave'))::int as leave
       from attendance a
      where a.school_id = $1 and a.date between $2::date and $3::date
      group by a.date`,
    [schoolId, dates[0], today]
  );
  const waiting = await client.query(`select count(*)::int as n from attendance_correction_requests where school_id = $1 and status = 'waiting'`, [schoolId]);
  const ever = await client.query(`select exists (select 1 from attendance where school_id = $1) as ever`, [schoolId]);

  const classes: ClassToday[] = classRows.rows.map((r) => ({ classId: r.class_id as string, name: (r.name as string | null) ?? '', section: (r.section as string | null) ?? null, marked: n(r.marked) > 0, present: n(r.present), absent: n(r.absent) }));
  const byDate = new Map(dayRows.rows.map((r) => [r.date as string, r]));
  const days: AttendanceDay[] = dates.map((date) => {
    const r = byDate.get(date);
    if (!r) return { date, presentRate: null, classesMarked: 0, marks: 0 };
    const counts = { present: n(r.present), absent: n(r.absent), late: n(r.late), leave: n(r.leave) };
    return { date, presentRate: presentRate(counts), classesMarked: n(r.classes_marked), marks: counts.present + counts.absent + counts.late + counts.leave };
  });
  const sum = (key: 'marked' | 'present' | 'absent' | 'late') => classRows.rows.reduce((a, r) => a + n(r[key]), 0);
  return {
    today,
    classesTotal: classes.length,
    classesMarked: classes.filter((c) => c.marked).length,
    studentsMarked: sum('marked'),
    present: sum('present'),
    absent: sum('absent'),
    late: sum('late'),
    classes,
    days,
    waitingCorrections: n(waiting.rows[0]?.n),
    everMarked: ever.rows[0]?.ever === true,
  };
}
