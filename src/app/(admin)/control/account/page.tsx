import { AuthenticatorPanel } from '@/components/account/AuthenticatorPanel';
import { ChangePasswordForm } from '@/components/account/ChangePasswordForm';
import { DEVICE_WORD_KEYS, SecurityPanel } from '@/components/account/SecurityPanel';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { getServerSession } from '@/lib/auth/server-session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// The platform admin changes their own password, authenticator, mobile
// number and devices here (C89, C90, C95).
export default async function AccountPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage title="Account and security" purpose="Password, authenticator, sign-in number and devices." icon="lock" tone="sapphire" eyebrow="My account">
      <AuthenticatorPanel />
      <ChangePasswordForm />
      <SecurityPanel w={{ lang, ...(Object.fromEntries(DEVICE_WORD_KEYS.map((k) => [k, t(lang, k)])) as Record<(typeof DEVICE_WORD_KEYS)[number], string>) }} />
    </ModulePage>
  );
}
