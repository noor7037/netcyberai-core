import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ParentsView } from '@/components/parents/ParentsView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Parents (docs/25 slice 7j, C192): one screen a guardian. The office sees every guardian; a teacher, the guardians
// of children in their own classes (the database's rule, not this page's).
export default async function ParentsPage() {
  const off = await moduleOffReason('parents');
  if (off) return <ModuleOffPage moduleId="parents" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="parents" help="see-a-guardian" tour="parents" title={t(lang, 'par.page.title')} purpose={t(lang, session?.role === 'teacher' ? 'par.page.purposeTeacher' : 'par.page.purpose')}>
      <ParentsView />
    </ModulePage>
  );
}
