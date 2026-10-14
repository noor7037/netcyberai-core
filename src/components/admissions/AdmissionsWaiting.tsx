import Link from 'next/link';
import { ADMISSIONS_OFFICE, WAITING_ROWS_MAX, waitingForConsent, type WaitingStudent } from '@/lib/admissions/admissions';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// The children admitted and waiting for a guardian's consent (C221), under the pipeline on /app/admissions: where
// "Admit" leaves a child, and the rows behind the dashboard's number 'students.waiting_consent' and the School
// Health Auditor's consent check, which open this address. Read in the reader's own session, the way the number is
// counted (row level security: a teacher sees the children of their own classes). Drawn on the server; the screen
// above asks for the page to be read again after an admission.
export async function AdmissionsWaiting() {
  const session = await getServerSession();
  if (!session?.schoolId) return null;
  const schoolId = session.schoolId;
  const { lang } = getLang(session.sub);
  let got: { total: number; rows: WaitingStudent[] };
  try {
    got = await withTenantContext(session, (db) => waitingForConsent(db, schoolId));
  } catch {
    return null;
  }
  const office = ADMISSIONS_OFFICE.includes(session.role);
  return (
    <section lang={lang} data-adm-waiting data-students-count={got.total} className="flex flex-col gap-3 rounded-lg border border-slate/10 bg-white p-4 text-sm text-slate">
      <div>
        <h2 data-shown-title className="text-base font-bold text-slate">
          {t(lang, 'adm.waiting.title', { count: got.total })}
        </h2>
        <p className="text-slate/70">{t(lang, 'adm.waiting.how')}</p>
        {got.total > got.rows.length && <p className="text-slate/70">{t(lang, 'shown.capped', { count: WAITING_ROWS_MAX })}</p>}
      </div>
      {got.rows.length === 0 ? (
        <p data-shown-none className="rounded-md bg-off-white px-3 py-2">{t(lang, 'adm.waiting.none')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {got.rows.map((s) => (
            <li key={s.student_id} data-shown-row className="flex flex-col gap-0.5 rounded-md border border-slate/10 p-3">
              <Link href={`/app/students/${s.student_id}`} className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
                {s.name}
              </Link>
              <span>{[s.class_name ?? t(lang, 'adm.waiting.noClass'), s.admission_no ? t(lang, 'adm.waiting.no', { no: s.admission_no }) : ''].filter(Boolean).join(' · ')}</span>
            </li>
          ))}
        </ul>
      )}
      {office && (
        <Link href="/app/admissions/waiting" data-adm-waiting-all className="inline-flex min-h-[44px] items-center font-semibold text-sapphire underline">
          {t(lang, 'adm.waiting.all')}
        </Link>
      )}
    </section>
  );
}
