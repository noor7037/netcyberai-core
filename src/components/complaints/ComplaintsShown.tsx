import Link from 'next/link';
import { SHOWN_ROW, ShownRows } from '@/components/dashboards/ShownRows';
import { Badge } from '@/components/ui/Badge';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { COMPLAINT_ROLES, COMPLAINT_ROWS_MAX, complaintsShown, type ComplaintShow, type ComplaintShown as Row } from '@/lib/complaints/complaints';
import { t, type MessageKey } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { screenFor } from '@/lib/insights/screens';
import { complaintFrom } from './complaint-words';

// /app/complaints?show=open | overdue (docs/26 slice 8d, C203): the complaints not yet closed, or those of them
// past their due time, exactly as the dashboard counted them: both read complaintsShown(…), in the reader's own
// session (row level security: a teacher gets their own, and nobody but the principal one about themself that
// the principal has not seen yet). The one due soonest first.
//
// Every complaint listed here is in the list below too (listComplaints joins the names as loosely as this list
// does), and both write who it is from with the same words (complaintFrom): a complaint a teacher owns about a
// child of another class says "a guardian from another class", never an empty name.
//
// The rows are drawn on the server. After a change made in the list below, that list asks for the page to be
// read again (useShownRefresh), so the count and the rows here are what is true after the change.
//
// THIS LIST READS AND MARKS NOTHING. "Seen by the principal" is written by the Complaints screen's own list
// below, when the principal's browser loads it: that is the principal really looking. A page that is only
// fetched ahead of a tap must not mark a complaint as seen, and this list is drawn on the server.
// A complaint's words are not repeated here: reading, noting and closing stay in the list below.
export async function ComplaintsShown({ show }: { show: ComplaintShow }) {
  const session = await getServerSession();
  if (!session?.schoolId || !COMPLAINT_ROLES.includes(session.role)) return null;
  const schoolId = session.schoolId;
  const { lang } = getLang(session.sub);
  let rows: Row[];
  try {
    rows = await withTenantContext(session, (db) => complaintsShown(db, schoolId, show));
  } catch {
    return null;
  }
  const when = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const note = [rows.length >= COMPLAINT_ROWS_MAX ? t(lang, 'shown.capped', { count: COMPLAINT_ROWS_MAX }) : '', rows.length > 0 ? t(lang, 'shown.complaints.below') : ''].filter(Boolean).join(' ');
  const other: ComplaintShow = show === 'open' ? 'overdue' : 'open';
  return (
    <ShownRows
      id={`complaints-${show}`}
      lang={lang}
      title={t(lang, `shown.complaints.title.${show}` as MessageKey, { count: rows.length })}
      note={note || undefined}
      backHref="/app/complaints"
      empty={rows.length === 0}
      more={
        <Link href={screenFor.complaints(other)} className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
          {t(lang, `shown.complaints.switch.${other}` as MessageKey)}
        </Link>
      }
    >
      {rows.map((c) => (
        <li key={c.complaint_id} data-shown-row data-overdue={c.overdue ? 'yes' : 'no'} className={SHOWN_ROW}>
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={c.overdue ? 'danger' : 'warning'}>{t(lang, c.overdue ? 'cmp.status.overdue' : 'cmp.status.open')}</Badge>
            <span className="font-bold">{complaintFrom((key, params) => t(lang, key, params), c)}</span>
            <span>{t(lang, 'cmp.ref', { ref: c.ref })}</span>
          </span>
          <span>{c.owner ? t(lang, 'cmp.ownerDue', { owner: c.owner, due: when.format(new Date(c.due_at)) }) : t(lang, 'shown.complaints.due', { due: when.format(new Date(c.due_at)) })}</span>
          {c.escalated && <span>{t(lang, 'cmp.escalated')}</span>}
        </li>
      ))}
    </ShownRows>
  );
}
