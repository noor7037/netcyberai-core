import { ModulePage } from '@/components/app-ui/ModulePage';
import { ContentView } from '@/components/control/content/ContentView';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { listVersions } from '@/lib/content/library';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Control → Content (M1-4, docs/family-app/10 §4): the syllabus library. Import a catalog CSV, review and approve it
// (two people), look at it as a family will in staff preview, release it to everyone, compare versions and roll back.

export const dynamic = 'force-dynamic';

export default async function ContentPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  // The layout has already refused anyone but NetCyberAI staff; this runs as the platform role.
  const versions = session ? await withTenantContext(session, (db) => listVersions(db, { userId: session.sub })) : null;
  return (
    <ModulePage title={t(lang, 'control.content.title')} purpose={t(lang, 'control.content.purpose')} about={t(lang, 'control.content.about')} icon="academics" tone="royal" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      {versions && <ContentView initial={versions} />}
    </ModulePage>
  );
}
