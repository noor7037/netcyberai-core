import Link from 'next/link';
import { SHOWN_ROW, ShownRows, shownDay } from '@/components/dashboards/ShownRows';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { SCHOOL_ROLES } from '@/lib/contracts/modules';
import type { TicketShow, TicketSummary } from '@/lib/contracts/tickets';
import { t, type MessageKey } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { TICKET_ROWS_MAX, listTickets } from '@/lib/support/tickets';
import { indiaDate } from '@/lib/time/india';

// /app/help/ticket?show=open | waiting (docs/26 slice 8d, C203): the support tickets not yet resolved or closed,
// or the ones that wait for the school's reply, exactly as the dashboard counted them: both read
// listTickets(…, { show }), in the reader's own session (the office: the school's tickets; anyone else: their
// own). Newest activity first, as the tickets list below.
export async function TicketsShown({ show }: { show: TicketShow }) {
  const session = await getServerSession();
  if (!session?.schoolId || !(SCHOOL_ROLES as readonly string[]).includes(session.role)) return null;
  const schoolId = session.schoolId;
  const { lang } = getLang(session.sub);
  let tickets: TicketSummary[];
  try {
    const listed = await withTenantContext(session, (db) => listTickets(db, { schoolId, show, limit: TICKET_ROWS_MAX }));
    if (!listed.ok) return null;
    tickets = listed.value;
  } catch {
    return null;
  }
  return (
    <ShownRows id={`tickets-${show}`} lang={lang} title={t(lang, `shown.tickets.title.${show}` as MessageKey, { count: tickets.length })} note={tickets.length >= TICKET_ROWS_MAX ? t(lang, 'shown.capped', { count: TICKET_ROWS_MAX }) : undefined} backHref="/app/help/ticket" empty={tickets.length === 0}>
      {tickets.map((k) => (
        <li key={k.ticketId} data-shown-row className={SHOWN_ROW}>
          <span className="font-bold">
            {k.subject} · {k.ref}
          </span>
          <span>{t(lang, 'shown.tickets.row', { status: t(lang, `shown.tickets.status.${k.status}` as MessageKey), by: k.raisedByName ?? '', date: shownDay(lang, indiaDate(new Date(k.lastActivityAt))) })}</span>
          <Link href={`/app/help/ticket/${k.ticketId}`} className="inline-flex min-h-[44px] items-center self-start font-semibold text-sapphire underline">
            {t(lang, 'shown.tickets.openOne')}
          </Link>
        </li>
      ))}
    </ShownRows>
  );
}
