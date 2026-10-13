import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { EventsView } from '@/components/events/EventsView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// School events (docs/25 slice 7l, C194).
export default async function EventsPage() {
  const off = await moduleOffReason('events');
  if (off) return <ModuleOffPage moduleId="events" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="events" help="invite-to-an-event" tour="events" title={t(lang, 'evt.page.title')} purpose={t(lang, 'evt.page.purpose')}>
      <EventsView />
    </ModulePage>
  );
}
