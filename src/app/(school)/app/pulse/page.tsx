import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { NeedsHelpView } from '@/components/pulse/NeedsHelpView';
import { PulseDraftsView } from '@/components/pulse/PulseDraftsView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Daily Pulse (docs/20 5f). What is live in P2: today's messages, prepared
// from "taught today" and the day's homework in three languages (C151), and
// the "needs help" queue (D6, C148). Sending starts with WhatsApp in P4, and
// the page says so.
export default async function PulsePage() {
  const off = await moduleOffReason('pulse');
  if (off) return <ModuleOffPage moduleId="pulse" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="pulse" help="needs-help-queue" tour="pulse" title={t(lang, 'help2.title')} purpose={t(lang, 'help2.purpose')}>
      <div className="flex flex-col gap-8">
        <PulseDraftsView />
        <NeedsHelpView />
      </div>
    </ModulePage>
  );
}
