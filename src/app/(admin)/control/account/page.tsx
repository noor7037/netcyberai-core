import { AuthenticatorPanel } from '@/components/account/AuthenticatorPanel';
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm';
import { SecurityPanel } from '@/components/account/SecurityPanel';

// The platform admin changes their own password, authenticator, mobile
// number and devices here (C89, C90, C95).
export default function AccountPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-bold text-slate">Account and security</h1>
      <p className="text-sm text-slate/70">Your authenticator code is needed too.</p>
      <AuthenticatorPanel />
      <ChangePasswordForm />
      <SecurityPanel />
    </div>
  );
}
