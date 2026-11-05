import { ModulePage } from '@/components/app-ui/ModulePage';
import { ComplianceDeskPanel } from '@/components/control/ComplianceDeskPanel';
import { getServerSession } from '@/lib/auth/server-session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// Control → Compliance (W21-M6): the data-request desk across schools, the consent counts and the retention jobs.
// The layout has already refused anyone but the founder.
export const dynamic = 'force-dynamic';

export default async function CompliancePage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage title={t(lang, 'control.m6.cmp.title')} purpose={t(lang, 'control.m6.cmp.purpose')} about={t(lang, 'control.m6.cmp.about')} icon="shield" tone="emerald" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      <WordsProvider words={pageWords(lang, '/control/compliance')}>
        <ComplianceDeskPanel />
      </WordsProvider>
    </ModulePage>
  );
}
