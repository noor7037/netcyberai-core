import { AuthenticatorPanel } from '@/components/account/AuthenticatorPanel';
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm';
import { SecurityPanel } from '@/components/account/SecurityPanel';
import { ModulePage } from '@/components/app-ui/ModulePage';

// Every staff role changes its own password, mobile number and devices here
// (C89, C90). Principals and school admins may also add an authenticator app
// (C95); the panel shows only for them.
export default function AccountPage() {
  return (
    <ModulePage help="set-up-authenticator" title="Account and security" purpose="Change your password, your sign-in number and the devices that stay signed in." icon="lock" tone="sapphire" eyebrow="My account">
      <ChangePasswordForm />
      <AuthenticatorPanel />
      <SecurityPanel />
    </ModulePage>
  );
}
