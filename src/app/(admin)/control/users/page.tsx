import { StaffAccounts } from '@/components/account/StaffAccounts';
import { SignInSetupPanel } from '@/components/account/SignInSetupPanel';
import { getServerSession } from '@/lib/auth/server-session';

// Every account on the platform: email reset codes, and the founder's own
// account tools that work without email (C89, C91).
export default async function UsersPage() {
  const session = await getServerSession();
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <h1 className="text-xl font-bold text-slate">Users</h1>
      <SignInSetupPanel />
      <StaffAccounts endpoint="/api/control/users" showSchools founderTools currentUserId={session?.sub} />
    </div>
  );
}
