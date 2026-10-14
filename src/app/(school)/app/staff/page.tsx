import { getServerSession } from '@/lib/auth/server-session';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { StaffAccounts } from '@/components/account/StaffAccounts';
import { StaffInvitations } from '@/components/account/StaffInvitations';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { StaffLeaveOffice } from '@/components/staff/StaffLeaveOffice';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Staff, for the principal and the school admin: leave (the requests waiting, who is away, recording leave for
// someone who phoned in; C201), inviting staff (C98) and the school's staff accounts (C89).
//
// Leave is the Staff module's own part: it is left out when the school has Staff switched off or its account is
// paused, and its API refuses in the same way. Inviting colleagues and sending a reset code is running the
// account itself (the access guard, C137), so those two parts are always here.
export default async function StaffPage() {
  const session = await getServerSession();
  if (session?.role !== 'principal' && session?.role !== 'school_admin') {
    return <ModuleComingPage moduleId="staff" />;
  }
  const leaveOff = await moduleOffReason('staff');
  const { lang } = getLang(session.sub);
  return (
    <ModulePage moduleId="staff" help="send-staff-reset-code" tour="staff" title={t(lang, 'staff.page.title')} purpose={t(lang, 'staff.page.purpose')}>
      {!leaveOff && <StaffLeaveOffice />}
      <StaffInvitations />
      <StaffAccounts endpoint="/api/app/users" />
    </ModulePage>
  );
}
