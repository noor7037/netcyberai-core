import { ModulePage } from '@/components/app-ui/ModulePage';
import { SystemSettingsPanel } from '@/components/control/SystemSettingsPanel';
import { getServerSession } from '@/lib/auth/server-session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// The platform's own settings, read only (W13-E): each with the Control screen that changes it. The layout has
// already refused anyone but the founder.
export const dynamic = 'force-dynamic';

export default async function SystemSettingsPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage title={t(lang, 'control.sys.title')} purpose={t(lang, 'control.sys.purpose')} about={t(lang, 'control.sys.about')} icon="operations" tone="royal" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      <WordsProvider words={pageWords(lang, '/control/system-settings')}>
        <SystemSettingsPanel />
      </WordsProvider>
    </ModulePage>
  );
}
