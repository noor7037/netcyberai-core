import { ModulePage } from '@/components/app-ui/ModulePage';
import { AuditLogsPanel } from '@/components/control/AuditLogsPanel';
import { getServerSession } from '@/lib/auth/server-session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// The platform-wide audit trail, read only (W13-E). The layout has already refused anyone but the founder.
export const dynamic = 'force-dynamic';

export default async function AuditLogsPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage title={t(lang, 'control.audit.title')} purpose={t(lang, 'control.audit.purpose')} about={t(lang, 'control.audit.about')} icon="shield" tone="emerald" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      <WordsProvider words={pageWords(lang, '/control/audit-logs')}>
        <AuditLogsPanel />
      </WordsProvider>
    </ModulePage>
  );
}
