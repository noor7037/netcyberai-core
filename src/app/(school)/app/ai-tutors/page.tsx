import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { AiTutorsView } from '@/components/ai-tutors/AiTutorsView';
import { AI_TUTOR_ROLES } from '@/lib/ai-tutors';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// AI Tutors (W16-A3; Programme W16, decision 5): the principal and the school admin see NetCyberAI's tutors, switch each on
// or off for the school, and add the school's own tutors. Families linked to the school see them in the Family app's Tutor
// Hall. Anyone else is shown the same "not for your role" page as for any module outside their work.
export default async function AiTutorsPage() {
  const off = await moduleOffReason('ai-tutors');
  if (off) return <ModuleOffPage moduleId="ai-tutors" reason={off} />;
  const session = await getServerSession();
  if (!session || !AI_TUTOR_ROLES.includes(session.role)) return <ModuleComingPage moduleId="ai-tutors" />;
  const { lang } = getLang(session.sub);
  return (
    <ModulePage moduleId="ai-tutors" help="add-a-school-tutor" tour="ai-tutors" title={t(lang, 'aitutors.page.title')} purpose={t(lang, 'aitutors.page.purpose')} about={t(lang, 'aitutors.page.about')}>
      <AiTutorsView />
    </ModulePage>
  );
}
