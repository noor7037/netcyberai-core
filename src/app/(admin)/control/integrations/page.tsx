import { ModulePage } from '@/components/app-ui/ModulePage';
import { IntegrationsPanel } from '@/components/control/IntegrationsPanel';
import { getServerSession } from '@/lib/auth/server-session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// Control → Integrations (W21-M6): every outside service's state in one table, with its test where one exists. The
// layout has already refused anyone but the founder.
export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage title={t(lang, 'control.m6.int.title')} purpose={t(lang, 'control.m6.int.purpose')} about={t(lang, 'control.m6.int.about')} icon="operations" tone="royal" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      <WordsProvider words={pageWords(lang, '/control/integrations')}>
        <IntegrationsPanel />
      </WordsProvider>
    </ModulePage>
  );
}
