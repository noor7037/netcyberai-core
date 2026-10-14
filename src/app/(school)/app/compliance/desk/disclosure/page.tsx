import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { PrintButton } from '@/components/fees/PrintButton';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { loadDisclosure, type DisclosureItem } from '@/lib/compliance/disclosure';
import { COMPLIANCE_DESK_FEATURE, deskInPlan } from '@/lib/compliance/qualifications';
import { featureOff, moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { indiaDate } from '@/lib/time/india';

// The mandatory public disclosure as one page the school prints (docs/28 row 10d, C227): every item in force, exactly
// as it is kept, with where it comes from, under the school's name and the day it was printed. Nothing is published:
// the school puts the printed page (or the CSV) where its board asks. The office only, of a school whose plan has the
// desk; anyone else is told it is not theirs.
export default async function DisclosurePrintPage() {
  const off = await moduleOffReason('compliance');
  if (off) return <ModuleOffPage moduleId="compliance" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const notInPlan = await featureOff(COMPLIANCE_DESK_FEATURE);
  const read =
    session?.schoolId && !notInPlan
      ? await withTenantContext(session, async (db) => {
          if (!(await deskInPlan(db, session.schoolId as string))) return null;
          const items = await loadDisclosure(db, { schoolId: session.schoolId as string, userId: session.sub, role: session.role });
          const school = (await db.query(`select name from schools where school_id = $1`, [session.schoolId])).rows[0]?.name as string | undefined;
          return items ? { items, school: school ?? '' } : null;
        })
      : null;
  const items: DisclosureItem[] = read?.items ?? [];
  const day = new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${indiaDate()}T12:00:00+05:30`));
  return (
    <ModulePage moduleId="compliance" help="keep-the-compliance-desk" tour="compliance-disclosure" hideHeaderInPrint title={t(lang, 'cdk.print.title')} purpose={t(lang, 'cdk.print.purpose')} primary={read ? <PrintButton label={t(lang, 'cdk.print.button')} /> : undefined}>
      {!read ? (
        <p data-cdk-print-refused className="rounded-md bg-off-white px-3 py-2 text-sm text-slate">{t(lang, notInPlan ? 'cdk.notInPlan' : 'cdk.notYours')}</p>
      ) : (
        <article lang={lang} data-cdk-print-page className="flex flex-col gap-4 text-sm text-slate">
          <header className="flex flex-col gap-1">
            <p className="text-lg font-bold">{read.school}</p>
            <p className="text-base font-semibold">{t(lang, 'cdk.print.heading')}</p>
            <p className="text-slate/70">{t(lang, 'cdk.print.asOf', { date: day })}</p>
          </header>
          {items.length === 0 ? (
            <p data-cdk-print-empty className="rounded-md bg-off-white px-3 py-2">{t(lang, 'cdk.dis.none')}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {items.map((i, n) => (
                <li key={i.item_id} data-cdk-print-item className="flex flex-col gap-1 border-b border-slate/10 pb-3">
                  <p className="break-words font-bold">{n + 1}. {i.heading}</p>
                  <p className="whitespace-pre-wrap break-words">{i.value}</p>
                  <p className="break-words text-slate/70">{t(lang, 'cdk.dis.from', { source: i.source })}</p>
                </li>
              ))}
            </ol>
          )}
          <a href="/app/compliance/desk" className="inline-flex min-h-[44px] items-center self-start text-sapphire underline print:hidden">{t(lang, 'cdk.print.back')}</a>
        </article>
      )}
    </ModulePage>
  );
}
