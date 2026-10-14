import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { CurriculumGapView } from '@/components/curriculum-gap/CurriculumGapView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// The Curriculum Gap Detector (docs/27 row 9d, C216): for a class and a subject, each unit of the syllabus map with
// whether it was taught, assessed, assessed before it was taught, or skipped.
export default async function CurriculumGapPage() {
  const off = await moduleOffReason('curriculum-gap');
  if (off) return <ModuleOffPage moduleId="curriculum-gap" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="curriculum-gap" help="find-curriculum-gaps" tour="curriculum-gap" title={t(lang, 'cg.page.title')} purpose={t(lang, 'cg.page.purpose')}>
      <CurriculumGapView />
    </ModulePage>
  );
}
