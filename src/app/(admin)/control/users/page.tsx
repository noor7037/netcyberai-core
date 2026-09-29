import { StaffAccounts } from '@/components/account/StaffAccounts';

// Every account on the platform, with "send reset code" (C89).
export default function UsersPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-bold text-slate">Users</h1>
      <StaffAccounts endpoint="/api/control/users" showSchools />
    </div>
  );
}
