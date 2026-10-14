import { SHOWN_ROW, ShownRows, shownDay } from '@/components/dashboards/ShownRows';
import { Badge } from '@/components/ui/Badge';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { t, type MessageKey } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { PTM_ROLES, PTM_ROWS_MAX, listPtms, type PtmRow } from '@/lib/ptm/ptm';
import { indiaDate } from '@/lib/time/india';

// /app/ptm?show=coming (docs/26 slice 8d, C203): the meetings dated today or later that are not cancelled,
// exactly as the dashboard counted them: both read listPtms(…, today), in the reader's own session (a teacher:
// the meetings of their own classes). The nearest first; never ordered by how many times are booked. Opening a
// meeting, inviting and booking stay in the list below.
export async function PtmShown() {
  const session = await getServerSession();
  if (!session?.schoolId || !PTM_ROLES.includes(session.role)) return null;
  const schoolId = session.schoolId;
  const { lang } = getLang(session.sub);
  let coming: PtmRow[];
  try {
    coming = await withTenantContext(session, (db) => listPtms(db, schoolId, indiaDate()));
  } catch {
    return null;
  }
  const note = [coming.length >= PTM_ROWS_MAX ? t(lang, 'shown.capped', { count: PTM_ROWS_MAX }) : '', coming.length > 0 ? t(lang, 'shown.ptm.below') : ''].filter(Boolean).join(' ');
  return (
    <ShownRows id="ptm-coming" lang={lang} title={t(lang, 'shown.ptm.title', { count: coming.length })} note={note || undefined} backHref="/app/ptm" empty={coming.length === 0}>
      {coming.map((m) => (
        <li key={m.ptm_id} data-shown-row className={SHOWN_ROW}>
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={m.status === 'invited' ? 'success' : 'neutral'}>{t(lang, `ptm.status.${m.status}` as MessageKey)}</Badge>
            <span className="font-bold">
              {m.title} · {shownDay(lang, m.held_on)}
            </span>
          </span>
          <span>{m.classes}</span>
          <span>{t(lang, 'ptm.list.counts', { booked: m.booked, slots: m.slots })}</span>
        </li>
      ))}
    </ShownRows>
  );
}
