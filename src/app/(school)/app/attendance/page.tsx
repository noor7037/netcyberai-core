import { getServerSession } from '@/lib/auth/server-session';
import { AttendanceView } from '@/components/attendance/AttendanceView';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { isUuid } from '@/lib/frameworks/custom-fields';

// ?class=<id> comes from a My Day card and opens that class directly.
export default async function AttendancePage({ searchParams }: { searchParams: { class?: string } }) {
  const session = await getServerSession();
  const canManage =
    session?.role === 'school_admin' ||
    session?.role === 'principal' ||
    session?.role === 'teacher' ||
    session?.role === 'academic_coordinator';

  return (
    <ModulePage moduleId="attendance" help="mark-attendance" tour="attendance" title="Attendance" purpose="Choose a class. Everyone starts as present: tap only who is absent or late, then submit.">
      <AttendanceView canManage={canManage} office={session?.role === 'school_admin' || session?.role === 'principal'} initialClassId={isUuid(searchParams.class) ? searchParams.class : undefined} />
    </ModulePage>
  );
}
