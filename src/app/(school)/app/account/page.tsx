import { AuthenticatorPanel } from '@/components/account/AuthenticatorPanel';
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm';
import { SecurityPanel } from '@/components/account/SecurityPanel';

// Every staff role changes its own password, mobile number and devices here
// (C89, C90). Principals and school admins may also add an authenticator app
// (C95); the panel shows only for them.
export default function AccountPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-bold text-slate">Account and security</h1>
      <ChangePasswordForm />
      <AuthenticatorPanel />
      <SecurityPanel />
    </div>
  );
}
