import { SHOWN_ROW, ShownRows, shownDay } from '@/components/dashboards/ShownRows';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { ASSIGNMENT_ROWS_MAX, countAssignmentsIn, listAssignmentsIn, type Assignment, type HomeworkShow } from '@/lib/homework/homework';
import { t, type MessageKey } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import type { FactRange } from '@/lib/insights/types';

// /app/homework?show=…&from=…&to=… (docs/26 slice 8d, C203): the assignments behind a dashboard number, read by
// the Homework library's own list in the reader's session (a teacher: their own classes). Nearest due date first.
const READERS = ['principal', 'school_admin', 'academic_coordinator', 'teacher'];

export async function HomeworkShown({ show, range }: { show: HomeworkShow; range: FactRange }) {
  const session = await getServerSession();
  if (!session?.schoolId || !READERS.includes(session.role)) return null;
  const schoolId = session.schoolId;
  const { lang } = getLang(session.sub);
  let list: Assignment[];
  let count: number;
  try {
    [list, count] = await withTenantContext(session, async (db) => [await listAssignmentsIn(db, schoolId, show, range.from, range.to), (await countAssignmentsIn(db, schoolId, range.from, range.to))[show]] as const);
  } catch {
    return null;
  }
  return (
    <ShownRows id={`homework-${show}`} lang={lang} title={t(lang, `shown.hw.title.${show}` as MessageKey, { count })} days={{ from: shownDay(lang, range.from), to: shownDay(lang, range.to) }} note={count > list.length ? t(lang, 'shown.capped', { count: ASSIGNMENT_ROWS_MAX }) : undefined} backHref="/app/homework" empty={list.length === 0}>
      {list.map((a) => (
        <li key={a.target_id} data-shown-row className={SHOWN_ROW}>
          <span className="font-bold">
            {a.class_name} · {a.subject_name} · {a.title}
          </span>
          <span>{t(lang, 'shown.hw.row', { date: shownDay(lang, a.due_date), checked: a.checked, students: a.students, notDone: a.checked - a.done })}</span>
        </li>
      ))}
    </ShownRows>
  );
}
