import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { CopilotView } from '@/components/copilot/CopilotView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Teacher Copilot v1 (docs/20 5h, C154). Off for every school until the
// founder switches it on with a key and a monthly limit.
export default async function TeacherCopilotPage() {
  const off = await moduleOffReason('teacher-copilot');
  if (off) return <ModuleOffPage moduleId="teacher-copilot" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="teacher-copilot" help="teacher-copilot" tour="copilot" title={t(lang, 'cp.title')} purpose={t(lang, 'cp.purpose')}>
      <CopilotView />
    </ModulePage>
  );
}
