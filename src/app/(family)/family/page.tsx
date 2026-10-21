import { getServerSession } from '@/lib/auth/server-session';
import { canAccessFamily } from '@/lib/auth/guards';
import { withTenantContext } from '@/lib/auth/db';
import { loadFamilyHome, rupeesFromMinor, type DayMark, type FamilyChild } from '@/lib/family/home';
import { FamilySignOut } from '@/components/family/FamilySignOut';
import { SchoolLogo } from '@/components/app-shell/SchoolLogo';
import { t, tCount, type Lang, type MessageKey } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { loadSchoolBrand } from '@/lib/school/branding';
import { logoAddress } from '@/lib/school/logo-file';
import { indiaDate } from '@/lib/time/india';

// The family app's home (C230-D): one card per child, phone first. Today's attendance, the last school days, and
// what is owed, read in the parent's own session (own children only; see src/lib/family/home.ts). Read only.
// At the top, the school's logo and name, as on every staff screen (C235-B).

const MARK_STYLE: Record<DayMark, string> = {
  present: 'bg-emerald-text',
  late: 'bg-tangerine',
  absent: 'bg-red-700',
  leave: 'bg-slate/40',
};
const TODAY_CHIP: Record<DayMark | 'none', string> = {
  present: 'bg-emerald/15 text-emerald-text',
  late: 'bg-tangerine/15 text-slate',
  absent: 'bg-red-100 text-red-800',
  leave: 'bg-slate/10 text-slate',
  none: 'bg-slate/10 text-slate',
};
const shortDate = (lang: Lang, iso: string) => new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

function ChildCard({ child, lang }: { child: FamilyChild; lang: Lang }) {
  const today = child.today ?? 'none';
  const percent = child.markedDays > 0 ? Math.round((child.presentDays / child.markedDays) * 100) : null;
  return (
    <li data-family-child className="flex flex-col gap-4 rounded-2xl border border-slate/10 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-royal text-lg font-extrabold text-white">
          {child.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-extrabold text-slate">{child.name}</h2>
          {child.className && <p className="text-sm text-slate/70">{t(lang, 'family.class', { name: child.className })}</p>}
        </div>
        <span data-family-today={today} className={`shrink-0 rounded-full px-3 py-1 text-sm font-bold ${TODAY_CHIP[today]}`}>
          {t(lang, `family.today.${today}` as MessageKey)}
        </span>
      </div>

      <section aria-label={t(lang, 'family.attendance')} className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold text-slate">{t(lang, 'family.attendance')}</h3>
          {percent !== null && <span className="text-2xl font-extrabold tabular-nums text-slate">{percent}%</span>}
        </div>
        {child.days.length > 0 ? (
          <>
            <ol className="flex gap-1" aria-label={t(lang, 'family.days')}>
              {child.days.map((d) => (
                <li key={d.date} title={`${shortDate(lang, d.date)}: ${t(lang, `family.mark.${d.mark}` as MessageKey)}`} className={`h-6 flex-1 rounded ${MARK_STYLE[d.mark]}`}>
                  <span className="sr-only">{`${shortDate(lang, d.date)}: ${t(lang, `family.mark.${d.mark}` as MessageKey)}`}</span>
                </li>
              ))}
            </ol>
            <p className="text-sm text-slate/70">{t(lang, 'family.attendance.detail', { present: child.presentDays, marked: child.markedDays })}</p>
          </>
        ) : (
          <p className="text-sm text-slate/70">{t(lang, 'family.attendance.none')}</p>
        )}
      </section>

      <section aria-label={t(lang, 'family.fees')} className="flex flex-col gap-1 rounded-xl bg-off-white p-3">
        <h3 className="text-sm font-bold text-slate">{t(lang, 'family.fees')}</h3>
        {child.dueMinor > 0 ? (
          <>
            <p className="text-2xl font-extrabold tabular-nums text-slate">{rupeesFromMinor(child.dueMinor)}</p>
            {child.overdueMinor > 0 && <p className="text-sm font-bold text-red-800">{t(lang, 'family.fees.overdue', { amount: rupeesFromMinor(child.overdueMinor) })}</p>}
            {child.nextDue && <p className="text-sm text-slate/70">{t(lang, 'family.fees.next', { date: shortDate(lang, child.nextDue) })}</p>}
            <p className="text-sm text-slate/70">{t(lang, 'family.fees.pay')}</p>
          </>
        ) : (
          <p className="text-base font-bold text-emerald-text">{t(lang, 'family.fees.none')}</p>
        )}
      </section>
    </li>
  );
}

export default async function FamilyHomePage() {
  const session = await getServerSession();
  if (!canAccessFamily(session)) return null;
  const { lang } = getLang(session.sub);
  const { home, brand } = await withTenantContext(session, async (db) => ({
    home: await loadFamilyHome(db, { parentId: session.sub, schoolId: session.schoolId }, indiaDate()),
    brand: await loadSchoolBrand(db, session.schoolId),
  }));
  const schoolName = brand?.name ?? home.schoolName;
  return (
    <div lang={lang} className="mx-auto flex w-full max-w-xl flex-col">
      <header className="flex items-start justify-between gap-3 bg-gradient-to-br from-royal-deep to-royal px-4 pb-6 pt-5 text-white">
        <div className="min-w-0">
          <div data-family-school className="mb-2 flex items-center gap-2">
            <SchoolLogo src={logoAddress(brand?.logoVersion ?? null, session.schoolId)} name={schoolName} size="sm" className="ring-1 ring-white/40" />
            <p className="truncate text-sm font-bold text-white">{schoolName}</p>
          </div>
          <h1 className="text-2xl font-extrabold">{t(lang, 'family.hello', { name: home.guardianName.split(' ')[0] || home.guardianName })}</h1>
          <p className="text-sm text-white/80">{tCount(lang, 'family.children', home.children.length)}</p>
        </div>
        <FamilySignOut label={t(lang, 'family.signOut')} />
      </header>
      <main className="-mt-3 flex flex-col gap-3 px-4 pb-8">
        {home.awaitingConsent > 0 && (
          <p role="status" data-family-consent className="rounded-xl border border-tangerine/40 bg-white px-3 py-2 text-sm text-slate">
            {tCount(lang, 'family.consent', home.awaitingConsent)}
          </p>
        )}
        {home.children.length === 0 ? (
          <p data-family-empty className="rounded-2xl border border-dashed border-slate/20 bg-white p-5 text-sm text-slate">{t(lang, 'family.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {home.children.map((c) => (
              <ChildCard key={c.studentId} child={c} lang={lang} />
            ))}
          </ul>
        )}
        <p className="px-1 text-sm text-slate/70">{t(lang, 'family.whatsapp')}</p>
      </main>
    </div>
  );
}
