import { StaffAccounts } from '@/components/account/StaffAccounts';
import { SignInSetupPanel } from '@/components/account/SignInSetupPanel';
import { getServerSession } from '@/lib/auth/server-session';
import { ModulePage } from '@/components/app-ui/ModulePage';

// Every account on the platform: email reset codes, and the founder's own
// account tools that work without email (C89, C91).
export default async function UsersPage() {
  const session = await getServerSession();
  return (
    <ModulePage title="Users" purpose="Every account on the platform: send a reset code, or help someone who cannot receive email." icon="users" tone="azure" eyebrow="Control">
      <SignInSetupPanel />
      <StaffAccounts endpoint="/api/control/users" showSchools founderTools currentUserId={session?.sub} />
    </ModulePage>
  );
}
