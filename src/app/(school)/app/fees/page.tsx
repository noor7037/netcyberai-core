import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { FeesBankView } from '@/components/fees/FeesBankView';
import { FeesCollectView } from '@/components/fees/FeesCollectView';
import { FeesDuesView } from '@/components/fees/FeesDuesView';
import { FeesFirstLoad } from '@/components/fees/FeesFirstLoad';
import { FeesVerifyView } from '@/components/fees/FeesVerifyView';
import { FeesRecoveryView } from '@/components/fees/FeesRecoveryView';
import { FeesSetupView } from '@/components/fees/FeesSetupView';
import { FeesShown } from '@/components/fees/FeesShown';
import { Form6Panel } from '@/components/compliance/Form6Panel';
import { withTenantContext } from '@/lib/auth/db';
import { computeForm6Advisory, type Form6Advisory } from '@/lib/compliance/form6';
import { isFeesShow, readRange } from '@/lib/insights/screens';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Fees (docs/23, P3). Live so far: fee heads and each class's versioned fee
// structure (6a, C157); raising a month's dues, concessions and RTE marks
// (6b, C159). Payments and receipts follow; the page says what is not there yet.
// ?show=<filter> (with ?from=&to= for receipts) comes from a dashboard number and lists the rows behind it (C203).
// The parts below are told that a list is drawn above them, so a change made there has that list read again (C210).
export default async function FeesPage({ searchParams = {} }: { searchParams?: { show?: string; from?: string; to?: string } }) {
  const off = await moduleOffReason('fees');
  if (off) return <ModuleOffPage moduleId="fees" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const shown = isFeesShow(searchParams.show) ? searchParams.show : null;
  // The accountant reads Haryana's Form 6 advisory here, read-only (C230-A, C232 part B): the same advisory the
  // compliance desk shows, worked out from the fee structures, with no qualification data. Worked out on the server, so
  // the page still opens with one data call (C180). Nothing when Form 6 does not apply to the school.
  const schoolId = session?.schoolId ?? null;
  const form6: Form6Advisory | null =
    session && schoolId && session.role === 'accountant'
      ? await withTenantContext(session, async (client) => {
          const { rows } = await client.query(`select jurisdiction from schools where school_id = $1`, [schoolId]);
          return computeForm6Advisory(client, schoolId, String(rows[0]?.jurisdiction ?? ''));
        }).catch(() => null)
      : null;
  return (
    <ModulePage moduleId="fees" help="fee-structures" tour="fees" title={t(lang, 'fee.title')} purpose={t(lang, 'fee.purpose')} about={<>{t(lang, 'fee.about')} {t(lang, 'fee.notYet')}</>}>
      <FeesFirstLoad shownAbove={shown !== null}>
      <div className="flex flex-col gap-6">
        {shown && <FeesShown show={shown} range={readRange(searchParams)} />}
        <FeesVerifyView />
        <FeesCollectView />
        <FeesBankView />
        <FeesRecoveryView />
        <FeesDuesView />
        <FeesSetupView />
        {form6?.jurisdictionApplies && <Form6Panel initial={form6} place="fees" />}
      </div>
      </FeesFirstLoad>
    </ModulePage>
  );
}
