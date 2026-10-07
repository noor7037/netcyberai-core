import { getServerSession } from '@/lib/auth/server-session';
import { AttendanceView } from '@/components/attendance/AttendanceView';
import { ModulePage } from '@/components/app-ui/ModulePage';

export default async function AttendancePage() {
  const session = await getServerSession();
  const canManage =
    session?.role === 'school_admin' ||
    session?.role === 'principal' ||
    session?.role === 'teacher' ||
    session?.role === 'academic_coordinator';

  return (
    <ModulePage moduleId="attendance" title="Attendance" purpose="Choose a class. Everyone starts as present: tap only who is absent or late, then submit.">
      <AttendanceView canManage={canManage} />
    </ModulePage>
  );
}
