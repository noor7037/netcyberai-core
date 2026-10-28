import { AuthenticatorPanel } from '@/components/account/AuthenticatorPanel';
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm';
import { deviceWords } from '@/components/account/device-words';
import { SecurityPanel } from '@/components/account/SecurityPanel';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { getServerSession } from '@/lib/auth/server-session';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// The platform admin changes their own password, authenticator, mobile
// number and devices here (C89, C90, C95).
export default async function AccountPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage title="Account and security" purpose="Password, authenticator, sign-in number and devices." icon="lock" tone="sapphire" eyebrow="My account">
      <WordsProvider words={pageWords(lang, '/control/account')}>
      <AuthenticatorPanel />
      <ChangePasswordForm />
      <SecurityPanel w={deviceWords(lang)} />
      </WordsProvider>
    </ModulePage>
  );
}
