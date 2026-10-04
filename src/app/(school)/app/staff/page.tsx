import { getServerSession } from '@/lib/auth/server-session';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { StaffAccounts } from '@/components/account/StaffAccounts';
import { StaffInvitations } from '@/components/account/StaffInvitations';

// Principals and school admins invite staff (C98) and manage the school's
// staff accounts here (C89). Staff records and teacher allocation are still to come.
export default async function StaffPage() {
  const session = await getServerSession();
  if (session?.role !== 'principal' && session?.role !== 'school_admin') {
    return <ModuleComingPage moduleId="staff" />;
  }
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-bold text-slate">Staff accounts</h1>
      <StaffInvitations />
      <StaffAccounts endpoint="/api/app/users" />
    </div>
  );
}
