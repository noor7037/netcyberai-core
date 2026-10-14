import { SHOWN_ROW, ShownRows, shownDay } from '@/components/dashboards/ShownRows';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { NOTICE_ROWS_MAX, listNotices, type Notice } from '@/lib/communication/notices';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { indiaDate } from '@/lib/time/india';

// /app/communication?show=notices (docs/26 slice 8d, C203): the notices that wait for the principal, exactly as
// the dashboard counted them: both read listNotices(…, 'waiting'), in the reader's own session, so a teacher gets
// the notices of their own classes and the office all. The oldest first. Approving and rejecting stay in the
// notices list below; this list only shows which ones are waiting.
const READERS = ['principal', 'school_admin', 'teacher'];

export async function NoticesShown() {
  const session = await getServerSession();
  if (!session?.schoolId || !READERS.includes(session.role)) return null;
  const schoolId = session.schoolId;
  const { lang } = getLang(session.sub);
  let waiting: Notice[];
  try {
    waiting = await withTenantContext(session, (db) => listNotices(db, schoolId, 'waiting'));
  } catch {
    return null;
  }
  const note = [waiting.length >= NOTICE_ROWS_MAX ? t(lang, 'shown.capped', { count: NOTICE_ROWS_MAX }) : '', waiting.length > 0 ? t(lang, 'shown.notices.below') : ''].filter(Boolean).join(' ');
  return (
    <ShownRows id="notices-waiting" lang={lang} title={t(lang, 'shown.notices.title', { count: waiting.length })} note={note || undefined} backHref="/app/communication" empty={waiting.length === 0}>
      {waiting.map((n) => (
        <li key={n.notice_id} data-shown-row className={SHOWN_ROW}>
          <span className="font-bold">{n.class_name ?? t(lang, 'ntc.allClasses')}</span>
          <span>{n.body}</span>
          <span>{t(lang, 'shown.notices.row', { by: n.written_by_name ?? '', date: shownDay(lang, indiaDate(new Date(n.written_at))) })}</span>
        </li>
      ))}
    </ShownRows>
  );
}
