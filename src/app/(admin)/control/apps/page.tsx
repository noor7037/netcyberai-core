import { ModulePage } from '@/components/app-ui/ModulePage';
import { AppsView } from '@/components/control/apps/AppsView';
import { HealthView } from '@/components/control/apps/HealthView';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { liveBuild, loadControlApps } from '@/lib/control/apps';
import { loadHealth } from '@/lib/control/health';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { pageWords } from '@/components/app-shell/page-words';
import { WordsProvider } from '@/components/app-shell/Words';

// Control → Apps (docs/family-app/10 §2, M1-7): the version, the modules and who sees them, the kill switch and the
// banner of each app, the staff-preview accounts, and the recent changes with Undo. The layout has already refused
// anyone but the founder; this runs as nca_super, in one transaction. Changes go through /api/control/apps/**. Health
// and usage with today's alerts come first (M2-11, C285).

export const dynamic = 'force-dynamic';

export default async function ControlAppsPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const data = session ? await withTenantContext(session, async (db) => ({ apps: await loadControlApps(db), health: await loadHealth(db) })) : null;
  return (
    <ModulePage title={t(lang, 'control.apps.title')} purpose={t(lang, 'control.apps.purpose')} about={t(lang, 'control.apps.about')} icon="operations" tone="royal" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      {data && (
        <div className="flex flex-col gap-6">
          <section aria-labelledby="control-health">
            <h2 id="control-health" className="mb-3 text-lg font-extrabold text-slate">
              {t(lang, 'control.health.title')}
            </h2>
            <HealthView health={data.health} lang={lang} />
          </section>
          {/* The change forms' shared parts take picked words (ChangeForm, C401). */}
          <WordsProvider words={pageWords(lang, '/control/apps')}>
            <AppsView data={data.apps} build={liveBuild()} lang={lang} now={new Date()} />
          </WordsProvider>
        </div>
      )}
    </ModulePage>
  );
}
