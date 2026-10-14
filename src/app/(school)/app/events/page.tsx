import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { EventsShown } from '@/components/events/EventsShown';
import { EventsView } from '@/components/events/EventsView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { EVENTS_SHOW } from '@/lib/insights/screens';

// School events (docs/25 slice 7l, C194).
// ?show=coming comes from the dashboard's "Events coming" and lists those events first (C203). The screen below is
// told that a list is drawn above it, so a change made there has that list read again (C210).
export default async function EventsPage({ searchParams = {} }: { searchParams?: { show?: string } }) {
  const off = await moduleOffReason('events');
  if (off) return <ModuleOffPage moduleId="events" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const shown = searchParams.show === EVENTS_SHOW;
  return (
    <ModulePage moduleId="events" help="invite-to-an-event" tour="events" title={t(lang, 'evt.page.title')} purpose={t(lang, 'evt.page.purpose')}>
      {shown && <EventsShown />}
      <EventsView shownAbove={shown} />
    </ModulePage>
  );
}
