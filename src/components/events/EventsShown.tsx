import { SHOWN_ROW, ShownRows, shownDay } from '@/components/dashboards/ShownRows';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { EVENT_ROLES, EVENT_ROWS_MAX, listEvents, type EventRow } from '@/lib/events/events';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { indiaDate } from '@/lib/time/india';

// /app/events?show=coming (docs/26 slice 8d, C203): the events dated today or later that are not cancelled,
// exactly as the dashboard counted them: both read listEvents(…, today), in the reader's own session (a teacher:
// their own classes' and the whole school's). The nearest first; never ordered by how many said yes.
export async function EventsShown() {
  const session = await getServerSession();
  if (!session?.schoolId || !EVENT_ROLES.includes(session.role)) return null;
  const schoolId = session.schoolId;
  const { lang } = getLang(session.sub);
  let coming: EventRow[];
  try {
    coming = await withTenantContext(session, (db) => listEvents(db, schoolId, indiaDate()));
  } catch {
    return null;
  }
  return (
    <ShownRows id="events-coming" lang={lang} title={t(lang, 'shown.events.title', { count: coming.length })} note={coming.length >= EVENT_ROWS_MAX ? t(lang, 'shown.capped', { count: EVENT_ROWS_MAX }) : undefined} backHref="/app/events" empty={coming.length === 0}>
      {coming.map((e) => (
        <li key={e.event_id} data-shown-row className={SHOWN_ROW}>
          <span className="font-bold">
            {e.title} · {shownDay(lang, e.held_on)}
          </span>
          <span>{e.classes ?? t(lang, 'ntc.allClasses')}</span>
          <span>{e.status === 'draft' ? t(lang, 'evt.draftWhy') : t(lang, 'shown.events.row', { invited: e.invited, yes: e.yes, no: e.no })}</span>
        </li>
      ))}
    </ShownRows>
  );
}
