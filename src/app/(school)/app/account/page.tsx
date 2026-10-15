import { AuthenticatorPanel } from '@/components/account/AuthenticatorPanel';
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm';
import { MyLeavePanel } from '@/components/account/MyLeavePanel';
import { MyQualificationsPanel } from '@/components/account/MyQualificationsPanel';
import { SecurityPanel } from '@/components/account/SecurityPanel';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { getServerSession } from '@/lib/auth/server-session';
import { REGISTER_ROLES } from '@/lib/compliance/register-rules';
import { featureOff, moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Every staff role changes its own password, mobile number and devices here
// (C89, C90). Principals and school admins may also add an authenticator app
// (C95); the panel shows only for them.
//
// "My leave" (C201) is here because every role has this page: a person puts
// in a request for leave and reads the answer. It belongs to the Staff
// module, so it is left out when the school has Staff switched off.
//
// "My qualifications" (C230-A, C232 part B): a member of the teaching staff reads their own qualification row as the
// office keeps it on the compliance desk, read-only.
export default async function AccountPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const leaveOff = (await moduleOffReason('staff')) ?? ((await featureOff('staff-leave')) ? 'not_in_plan' : null);
  return (
    <ModulePage help="set-up-authenticator" title={t(lang, 'account.page.title')} purpose={t(lang, leaveOff ? 'account.page.purpose' : 'account.page.purposeLeave')} icon="lock" tone="sapphire" eyebrow={t(lang, 'shell.account')}>
      {!leaveOff && <MyLeavePanel />}
      {session && REGISTER_ROLES.includes(session.role) && <MyQualificationsPanel />}
      <ChangePasswordForm />
      <AuthenticatorPanel />
      <SecurityPanel />
    </ModulePage>
  );
}
