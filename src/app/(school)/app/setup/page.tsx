import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { SetupChecklist } from '@/components/setup/SetupChecklist';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Setup (docs/28 slice 10g, C244), for the principal and the school admin: the checklist of what the school still has
// to set up, counted from the rows that exist, with the two lists kept here (academic sessions and subjects). Any other
// role is shown the reason it cannot open it, as for Staff.
export default async function SetupPage() {
  const session = await getServerSession();
  if (session?.role !== 'principal' && session?.role !== 'school_admin') {
    return <ModuleComingPage moduleId="setup" />;
  }
  const off = await moduleOffReason('setup');
  if (off) return <ModuleOffPage moduleId="setup" reason={off} />;
  const { lang } = getLang(session.sub);
  return (
    <ModulePage moduleId="setup" help="set-up-your-school" tour="setup" title={t(lang, 'setup.page.title')} purpose={t(lang, 'setup.page.purpose')} about={t(lang, 'setup.page.about')}>
      <SetupChecklist />
    </ModulePage>
  );
}
