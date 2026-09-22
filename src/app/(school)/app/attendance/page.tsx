import { getServerSession } from '@/lib/auth/server-session';
import { AttendanceView } from '@/components/attendance/AttendanceView';

export default async function AttendancePage() {
  const session = await getServerSession();
  const canManage =
    session?.role === 'school_admin' ||
    session?.role === 'principal' ||
    session?.role === 'teacher' ||
    session?.role === 'academic_coordinator';

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-xl font-bold text-slate">Attendance</h1>
      <AttendanceView canManage={canManage} />
    </div>
  );
}
