import { AuthenticatorPanel } from '@/components/account/AuthenticatorPanel';
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm';
import { SecurityPanel } from '@/components/account/SecurityPanel';
import { ModulePage } from '@/components/app-ui/ModulePage';

// The platform admin changes their own password, authenticator, mobile
// number and devices here (C89, C90, C95).
export default function AccountPage() {
  return (
    <ModulePage title="Account and security" purpose="Password, authenticator, sign-in number and devices." icon="lock" tone="sapphire" eyebrow="My account">
      <AuthenticatorPanel />
      <ChangePasswordForm />
      <SecurityPanel />
    </ModulePage>
  );
}
