import { SHOWN_ROW, ShownRows, shownDay } from '@/components/dashboards/ShownRows';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import type { FactRange } from '@/lib/insights/types';
import { SENT_ROWS_MAX, listSent, sentTotals, type Draft } from '@/lib/pulse/drafts';

// /app/pulse?show=sent&from=…&to=… (docs/26 slice 8d, C203): the Daily Pulse messages sent for the lessons of
// those days, each with how many went out and what parents answered. Read by the Pulse library's own list in the
// reader's session (a teacher: their own classes). No message's words are shown here, only its counts.
const READERS = ['principal', 'school_admin', 'teacher'];

export async function PulseShown({ range }: { range: FactRange }) {
  const session = await getServerSession();
  if (!session?.schoolId || !READERS.includes(session.role)) return null;
  const schoolId = session.schoolId;
  const { lang } = getLang(session.sub);
  let sent: Draft[];
  let count: number;
  try {
    [sent, count] = await withTenantContext(session, async (db) => [await listSent(db, schoolId, range.from, range.to), (await sentTotals(db, schoolId, range.from, range.to)).sent] as const);
  } catch {
    return null;
  }
  return (
    <ShownRows id="pulse-sent" lang={lang} title={t(lang, 'shown.pulse.title', { count })} days={{ from: shownDay(lang, range.from), to: shownDay(lang, range.to) }} note={count > sent.length ? t(lang, 'shown.capped', { count: SENT_ROWS_MAX }) : undefined} backHref="/app/pulse" empty={sent.length === 0}>
      {sent.map((m) => (
        <li key={m.pulse_id} data-shown-row className={SHOWN_ROW}>
          <span className="font-bold">
            {m.class_name}
            {m.subject_name ? ` · ${m.subject_name}` : ''} · {shownDay(lang, m.sent_on)}
          </span>
          <span>{t(lang, 'shown.pulse.row', { queued: m.queued, held: m.held, understood: m.understood, needsHelp: m.needs_help })}</span>
        </li>
      ))}
    </ShownRows>
  );
}
