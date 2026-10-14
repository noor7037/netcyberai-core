import Link from 'next/link';
import { SHOWN_ROW, ShownRows, shownDay } from '@/components/dashboards/ShownRows';
import { STUDENT_ROWS_MAX, classesOnDay, marksByDay, marksTotal, presentRate, studentsOnDay, type AttendanceShow, type ClassDay, type RateDay, type StudentDay } from '@/lib/attendance/day';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { t, type MessageKey } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { sayNumber } from '@/lib/insights/dashboard';
import { screenFor } from '@/lib/insights/screens';
import type { FactRange } from '@/lib/insights/types';
import { indiaDate } from '@/lib/time/india';

// /app/attendance?show=… (docs/26 slice 8d, C203): today's attendance across the school, as rows. The classes
// that are marked or not, or the students holding a mark, exactly as the dashboard counted them: both read
// src/lib/attendance/day.ts, in the reader's own session, so a teacher gets their own classes and the office all.
// Classes come in the order of their names, students by class and name: never by a rate.
const READERS = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];
const LINK = 'inline-flex min-h-[44px] items-center font-semibold text-sapphire underline';

export async function AttendanceShown({ show }: { show: AttendanceShow }) {
  const session = await getServerSession();
  if (!session?.schoolId || !READERS.includes(session.role)) return null;
  const schoolId = session.schoolId;
  const { lang } = getLang(session.sub);
  const today = indiaDate();
  const byClass = show === 'marked' || show === 'unmarked';
  let classes: ClassDay[] = [];
  let students: StudentDay[] = [];
  try {
    await withTenantContext(session, async (db) => {
      if (show === 'marked' || show === 'unmarked') classes = (await classesOnDay(db, schoolId, today)).filter((c) => (show === 'marked' ? c.marked > 0 : c.marked === 0));
      else students = await studentsOnDay(db, schoolId, today, show);
    });
  } catch {
    return null;
  }
  const count = byClass ? classes.length : students.length;
  const other = show === 'marked' ? 'unmarked' : 'marked';
  return (
    <ShownRows
      id={`attendance-${show}`}
      lang={lang}
      title={t(lang, `shown.att.title.${show}` as MessageKey, { count })}
      note={students.length >= STUDENT_ROWS_MAX ? t(lang, 'shown.capped', { count: STUDENT_ROWS_MAX }) : undefined}
      backHref="/app/attendance"
      empty={count === 0}
      more={
        byClass && (
          <Link href={screenFor.attendance(other)} className={LINK}>
            {t(lang, `shown.att.switch.${other}` as MessageKey)}
          </Link>
        )
      }
    >
      {classes.map((c) => (
        <li key={c.class_id} data-shown-row className={SHOWN_ROW}>
          <span className="font-bold">{c.class_name}</span>
          <span>{t(lang, 'shown.att.class', { marked: c.marked, students: c.students })}</span>
          <Link href={`/app/attendance?class=${c.class_id}`} className={LINK}>
            {t(lang, 'shown.att.open')}
          </Link>
        </li>
      ))}
      {students.map((s) => (
        <li key={s.student_id} data-shown-row className={SHOWN_ROW}>
          <span className="font-bold">{s.name}</span>
          <span>
            {s.class_name}
            {s.roll_no ? ` · ${s.roll_no}` : ''}
            {s.mark ? ` · ${t(lang, `att.status.${s.mark}` as MessageKey)}` : ''}
          </span>
        </li>
      ))}
    </ShownRows>
  );
}

// /app/attendance?show=days&from=…&to=… (docs/26 slice 8d, C203): the marks saved on each day of the range, and
// above them the present rate over all of them. The dashboard's "In school, of those marked" opens this list:
// the rate in its title line is the number on the tile (both are marksTotal over marksByDay, in the reader's own
// session), and the rows are the days it is worked out from. A day with no mark saved has no row. Days come in
// the order of the calendar: never by their rate.
export async function AttendanceDays({ range }: { range: FactRange }) {
  const session = await getServerSession();
  if (!session?.schoolId || !READERS.includes(session.role)) return null;
  const schoolId = session.schoolId;
  const { lang } = getLang(session.sub);
  let days: RateDay[];
  try {
    days = await withTenantContext(session, (db) => marksByDay(db, schoolId, range.from, range.to));
  } catch {
    return null;
  }
  const sum = marksTotal(days);
  const rate = (r: number | null) => (r === null ? '' : sayNumber(r, 'percent'));
  return (
    <ShownRows
      id="attendance-days"
      lang={lang}
      title={t(lang, 'shown.att.title.days', { count: sum.days })}
      days={{ from: shownDay(lang, range.from), to: shownDay(lang, range.to) }}
      note={sum.rate === null ? undefined : t(lang, 'shown.att.days.rate', { rate: rate(sum.rate), marks: sum.marks })}
      backHref="/app/attendance"
      empty={days.length === 0}
    >
      {days.map((d) => (
        <li key={d.date} data-shown-row className={SHOWN_ROW}>
          <span className="font-bold">{shownDay(lang, d.date)}</span>
          <span>{t(lang, 'shown.att.day', { present: d.present, late: d.late, absent: d.absent, leave: d.leave, rate: rate(presentRate(d)) })}</span>
        </li>
      ))}
    </ShownRows>
  );
}
