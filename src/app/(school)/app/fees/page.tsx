import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { FeesCollectView } from '@/components/fees/FeesCollectView';
import { FeesDuesView } from '@/components/fees/FeesDuesView';
import { FeesVerifyView } from '@/components/fees/FeesVerifyView';
import { FeesSetupView } from '@/components/fees/FeesSetupView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Fees (docs/23, P3). Live so far: fee heads and each class's versioned fee
// structure (6a, C157); raising a month's dues, concessions and RTE marks
// (6b, C159). Payments and receipts follow; the page says what is not there yet.
export default async function FeesPage() {
  const off = await moduleOffReason('fees');
  if (off) return <ModuleOffPage moduleId="fees" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="fees" help="fee-structures" tour="fees" title={t(lang, 'fee.title')} purpose={t(lang, 'fee.purpose')}>
      <div className="flex flex-col gap-6">
        <FeesVerifyView />
        <FeesCollectView />
        <FeesDuesView />
        <FeesSetupView />
      </div>
    </ModulePage>
  );
}
