import { SHOWN_ROW, ShownRows, shownDay } from '@/components/dashboards/ShownRows';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { canAccessApp } from '@/lib/auth/guards';
import { t, tCount, type Lang, type MessageKey } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import type { StaffShow } from '@/lib/insights/screens';
import { LEAVE_OFFICE, LEAVE_WAITING_MAX, leaveCalendar, leaveWaiting, onLeave, type LeaveRow } from '@/lib/staff/leave';
import { indiaDate } from '@/lib/time/india';

// /app/staff?show=leave-waiting | on-leave-today (docs/26 slice 8d, C203): the leave requests waiting for the
// office, or the people whose approved leave covers today, exactly as the dashboard counted them:
//   leave-waiting    leaveWaiting(…), the Staff screen's own "waiting" list, in the order the requests came in;
//   on-leave-today   onLeave(…, today), which asks the database's one rule for "on leave on a day"; by name.
// In the reader's own session: only the principal and the school admin read other people's leave, and the
// database gives nobody else a row. Deciding and cancelling stay in the lists below. A request's reason is not
// repeated here.
//
// This is a list for running the day. It counts nobody's leave, and it is never ordered by how much leave a
// person has taken (docs/26 section 3 rule 4).
const days = (lang: Lang, r: Pick<LeaveRow, 'from_date' | 'to_date'>) => (r.from_date === r.to_date ? shownDay(lang, r.from_date) : t(lang, 'leave.range', { from: shownDay(lang, r.from_date), to: shownDay(lang, r.to_date) }));

export async function StaffLeaveShown({ show }: { show: StaffShow }) {
  const session = await getServerSession();
  if (!canAccessApp(session) || !LEAVE_OFFICE.includes(session.role)) return null;
  const schoolId = session.schoolId;
  const actor = { schoolId, userId: session.sub, role: session.role };
  const { lang } = getLang(session.sub);
  const today = indiaDate();
  let waiting: LeaveRow[] = [];
  let away: { user_id: string; name: string }[] = [];
  // The approved request behind each person away today, for the days it says: the list itself is onLeave's.
  let approved: LeaveRow[] = [];
  try {
    await withTenantContext(session, async (db) => {
      if (show === 'leave-waiting') waiting = await leaveWaiting(db, actor, today);
      else {
        away = await onLeave(db, schoolId, today);
        approved = await leaveCalendar(db, actor, today, today, today);
      }
    });
  } catch {
    return null;
  }
  const count = show === 'leave-waiting' ? waiting.length : away.length;
  const note = [show === 'leave-waiting' && waiting.length >= LEAVE_WAITING_MAX ? t(lang, 'shown.capped', { count: LEAVE_WAITING_MAX }) : '', count > 0 ? t(lang, `shown.leave.below.${show}` as MessageKey) : ''].filter(Boolean).join(' ');
  return (
    <ShownRows id={`staff-${show}`} lang={lang} title={t(lang, `shown.leave.title.${show}` as MessageKey, { count })} note={note || undefined} backHref="/app/staff" empty={count === 0}>
      {waiting.map((r) => (
        <li key={r.leave_id} data-shown-row className={SHOWN_ROW}>
          <span className="font-bold">
            {r.name} · {t(lang, `role.${r.role}` as MessageKey)}
          </span>
          <span>{t(lang, 'shown.leave.row', { dates: days(lang, r), days: tCount(lang, 'leave.days', r.days), kind: t(lang, `leave.kind.${r.kind}` as MessageKey) })}</span>
        </li>
      ))}
      {away.map((p) => {
        const leave = approved.find((r) => r.user_id === p.user_id);
        return (
          <li key={p.user_id} data-shown-row className={SHOWN_ROW}>
            <span className="font-bold">{leave ? `${p.name} · ${t(lang, `role.${leave.role}` as MessageKey)}` : p.name}</span>
            {leave && <span>{t(lang, 'shown.leave.row', { dates: days(lang, leave), days: tCount(lang, 'leave.days', leave.days), kind: t(lang, `leave.kind.${leave.kind}` as MessageKey) })}</span>}
          </li>
        );
      })}
    </ShownRows>
  );
}
