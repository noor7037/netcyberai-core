import Link from 'next/link';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { HubEntriesView } from '@/components/control/content/HubEntriesView';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { listHubEntriesForControl } from '@/lib/content/hub-entries';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// Control → Content → Hubs (W4-3, C387): the entries the Career Hub, the Exam Portal and Schemes & Scholarships show.
// NetCyberAI staff only (the layout refuses anyone else); the list is read as the platform role.
export const dynamic = 'force-dynamic';

export default async function HubsPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const entries = session ? await withTenantContext(session, (db) => listHubEntriesForControl(db)) : null;
  return (
    <ModulePage title={t(lang, 'control.hubs.title')} purpose={t(lang, 'control.hubs.purpose')} about={t(lang, 'control.hubs.about')} icon="academics" tone="royal" eyebrow={t(lang, 'control.content.title')} headerLang={lang}
      more={
        <Link href="/control/content" className="inline-flex min-h-[44px] items-center text-sm font-semibold text-sapphire underline">
          {t(lang, 'control.content.title')}
        </Link>
      }
    >
      <WordsProvider words={pageWords(lang, '/control/content/hubs')}>
      {entries && <HubEntriesView initial={entries} />}
      </WordsProvider>
    </ModulePage>
  );
}
