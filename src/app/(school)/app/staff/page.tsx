import { getServerSession } from '@/lib/auth/server-session';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { StaffAccounts } from '@/components/account/StaffAccounts';
import { StaffInvitations } from '@/components/account/StaffInvitations';
import { ModulePage } from '@/components/app-ui/ModulePage';

// Principals and school admins invite staff (C98) and manage the school's
// staff accounts here (C89). Staff records and teacher allocation are still to come.
export default async function StaffPage() {
  const session = await getServerSession();
  if (session?.role !== 'principal' && session?.role !== 'school_admin') {
    return <ModuleComingPage moduleId="staff" />;
  }
  return (
    <ModulePage moduleId="staff" title="Staff accounts" purpose="Invite staff, and email a reset code to anyone who cannot sign in.">
      <StaffInvitations />
      <StaffAccounts endpoint="/api/app/users" />
    </ModulePage>
  );
}
