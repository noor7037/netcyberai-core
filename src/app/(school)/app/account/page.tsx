import { ChangePasswordForm } from '@/components/account/ChangePasswordForm';

// Every staff role changes its own password here (C89).
export default function AccountPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-bold text-slate">Change password</h1>
      <ChangePasswordForm />
    </div>
  );
}
