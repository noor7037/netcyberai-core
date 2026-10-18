import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { AuditorView } from '@/components/auditor/AuditorView';
import { AUDITOR_ROLES } from '@/lib/auditor/rules';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// School Health Auditor v1 (docs/26 slice 8i, C208): the principal and the school admin run a check-up of the
// school's own records by fixed rules and see what passes, what needs attention and where to fix it. Anyone else
// is shown the same "not for your role" page as for any module outside their work, and the API refuses in the
// same way.
export default async function SchoolAuditorPage() {
  const off = await moduleOffReason('school-auditor');
  if (off) return <ModuleOffPage moduleId="school-auditor" reason={off} />;
  const session = await getServerSession();
  if (!session || !AUDITOR_ROLES.includes(session.role)) return <ModuleComingPage moduleId="school-auditor" />;
  const { lang } = getLang(session.sub);
  return (
    <ModulePage moduleId="school-auditor" help="school-check-up" tour="school-auditor" title={t(lang, 'aud.page.title')} purpose={t(lang, 'aud.page.purpose')} about={t(lang, 'aud.page.about')}>
      <AuditorView />
    </ModulePage>
  );
}
