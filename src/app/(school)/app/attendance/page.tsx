import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { getServerSession } from '@/lib/auth/server-session';
import { AttendanceView } from '@/components/attendance/AttendanceView';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { AttendanceDays, AttendanceShown } from '@/components/attendance/AttendanceShown';
import { isAttendanceShow } from '@/lib/attendance/day';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { ATTENDANCE_DAYS_SHOW, readRange } from '@/lib/insights/screens';

// ?class=<id> comes from a My Day card and opens that class directly.
// ?show=<filter> comes from a dashboard number and lists the rows behind it (C203): the classes marked or not
// marked today, or the students with a mark; ?show=days&from=&to= lists the marks of each day of those days,
// with the present rate over them. The screen below is told that a list is drawn above it, so a change made there
// has that list read again (C210).
export default async function AttendancePage({ searchParams }: { searchParams: { class?: string; show?: string; from?: string; to?: string } }) {
  const off = await moduleOffReason('attendance');
  if (off) return <ModuleOffPage moduleId="attendance" reason={off} />;
  const session = await getServerSession();
  const canManage =
    session?.role === 'school_admin' ||
    session?.role === 'principal' ||
    session?.role === 'teacher' ||
    session?.role === 'academic_coordinator';
  const range = readRange(searchParams);
  const shown = isAttendanceShow(searchParams.show) ? searchParams.show : null;
  const days = searchParams.show === ATTENDANCE_DAYS_SHOW ? range : null;

  return (
    <ModulePage moduleId="attendance" help="mark-attendance" tour="attendance" title="Attendance" purpose="Choose a class. Everyone starts as present: tap only who is absent or late, then submit.">
      {shown && <AttendanceShown show={shown} />}
      {days && <AttendanceDays range={days} />}
      <AttendanceView canManage={canManage} office={session?.role === 'school_admin' || session?.role === 'principal'} initialClassId={isUuid(searchParams.class) ? searchParams.class : undefined} shownAbove={shown !== null || days !== null} />
    </ModulePage>
  );
}
