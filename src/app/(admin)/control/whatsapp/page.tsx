import { ModulePage } from '@/components/app-ui/ModulePage';
import { WhatsAppAccountPanel } from '@/components/control/WhatsAppAccountPanel';
import { getServerSession } from '@/lib/auth/server-session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// The platform's WhatsApp account (docs/25 slice 7e, C186). The layout has already refused anyone but the founder.
export const dynamic = 'force-dynamic';

export default async function WhatsAppAccountPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage title={t(lang, 'wa.title')} purpose={t(lang, 'wa.purpose')} icon="chat" tone="cyan" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      <WhatsAppAccountPanel />
    </ModulePage>
  );
}
