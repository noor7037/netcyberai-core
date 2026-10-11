import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { HomeworkView } from '@/components/homework/HomeworkView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Homework (docs/20 5e, C150): set it once, copy it to the sections it is
// for, and check who has done it.
export default async function HomeworkPage() {
  const off = await moduleOffReason('homework');
  if (off) return <ModuleOffPage moduleId="homework" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="homework" help="set-homework" tour="homework" title={t(lang, 'hw.title')} purpose={t(lang, 'hw.purpose')}>
      <HomeworkView />
    </ModulePage>
  );
}
