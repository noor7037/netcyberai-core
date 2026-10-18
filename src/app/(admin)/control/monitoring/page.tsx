import { ModulePage } from '@/components/app-ui/ModulePage';
import { MonitoringView } from '@/components/control/MonitoringView';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { invitationsWaiting, loadMonitoring } from '@/lib/control/monitoring';
import { storageHealth } from '@/lib/observability/storage-health';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { applicationCounts } from '@/lib/onboarding/applications';

// Control → Monitoring (docs/26 slice 8g, C206; the job Pipeline of C97 is its second section). One page for what
// can stop without anyone noticing: the health check, dead and stuck jobs with a Retry button, refused delivery
// notices, messages that were uncertain, failed or held back, replies held for "which school?", a school whose
// nightly fee run did not happen, the billing check, and templates not approved. Counts and ages only
// (src/lib/control/monitoring.ts). Below them, the two onboarding lists the page has always had.

export const dynamic = 'force-dynamic';

export default async function MonitoringPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  // The layout has already refused anyone but the founder; this runs as nca_super, in one transaction.
  // File storage's answer first (C236): a slow store must not hold the transaction open.
  const storage = session ? await storageHealth() : 'ok';
  const read = session
    ? await withTenantContext(session, async (db) => ({ data: await loadMonitoring(db, storage), invitations: await invitationsWaiting(db), applications: await applicationCounts(db) }))
    : null;
  return (
    <ModulePage title={t(lang, 'monitoring.title')} purpose={t(lang, 'monitoring.purpose')} about={t(lang, 'monitoring.about')} icon="pulse" tone="emerald" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      {read && <MonitoringView data={read.data} invitations={read.invitations} applications={read.applications} lang={lang} />}
    </ModulePage>
  );
}
