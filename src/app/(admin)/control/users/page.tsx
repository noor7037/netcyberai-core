import { StaffAccounts } from '@/components/account/StaffAccounts';
import { SignInSetupPanel } from '@/components/account/SignInSetupPanel';
import { getServerSession } from '@/lib/auth/server-session';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// Every account on the platform: email reset codes, and the founder's own
// account tools that work without email (C89, C91).
export default async function UsersPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage title="Users" purpose="Every account: send a reset code or help someone sign in." icon="users" tone="azure" eyebrow="Control">
      <WordsProvider words={pageWords(lang, '/control/users')}>
      <SignInSetupPanel />
      <StaffAccounts endpoint="/api/control/users" showSchools founderTools currentUserId={session?.sub} />
      </WordsProvider>
    </ModulePage>
  );
}
