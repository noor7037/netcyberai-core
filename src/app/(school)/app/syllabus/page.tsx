import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { getServerSession } from '@/lib/auth/server-session';
import { SyllabusView } from '@/components/academics/SyllabusView';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

export default async function SyllabusPage() {
  const off = await moduleOffReason('academics');
  if (off) return <ModuleOffPage moduleId="academics" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="academics" help="taught-today" tour="taught-today" title={t(lang, 'taught.page.title')} purpose={t(lang, 'taught.page.purpose')} about={t(lang, 'taught.page.about')}>
      <SyllabusView isTeacher={session?.role === 'teacher'} />
    </ModulePage>
  );
}
