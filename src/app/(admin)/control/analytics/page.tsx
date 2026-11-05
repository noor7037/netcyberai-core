import { ModulePage } from '@/components/app-ui/ModulePage';
import { AnalyticsPanel } from '@/components/control/AnalyticsPanel';
import { getServerSession } from '@/lib/auth/server-session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// Control → Analytics (W21-M6): the platform's numbers from their own tables, each with its range. The layout has
// already refused anyone but the founder.
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage title={t(lang, 'control.m6.an.title')} purpose={t(lang, 'control.m6.an.purpose')} about={t(lang, 'control.m6.an.about')} icon="pulse" tone="azure" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      <WordsProvider words={pageWords(lang, '/control/analytics')}>
        <AnalyticsPanel />
      </WordsProvider>
    </ModulePage>
  );
}
