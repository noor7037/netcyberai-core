import { ModulePage } from '@/components/app-ui/ModulePage';
import { TemplatesPanel } from '@/components/control/TemplatesPanel';
import { getServerSession } from '@/lib/auth/server-session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// WhatsApp templates (docs/25 slice 7c, C184): every version's words and its two approvals. The layout has
// already refused anyone but the founder.
export const dynamic = 'force-dynamic';

export default async function TemplatesPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage title={t(lang, 'tpl.title')} purpose={t(lang, 'tpl.purpose')} icon="chat" tone="cyan" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      <TemplatesPanel />
    </ModulePage>
  );
}
