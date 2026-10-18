import Link from 'next/link';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage, QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { SubjectsView } from '@/components/setup/SubjectsView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Setup -> Subjects (docs/28 slice 10g, C244): add, rename and retire the subjects the school teaches. A subject is
// retired, never deleted. The principal and the school admin; the API and the database say the same.
export default async function SetupSubjectsPage() {
  const session = await getServerSession();
  if (session?.role !== 'principal' && session?.role !== 'school_admin') {
    return <ModuleComingPage moduleId="setup" />;
  }
  const off = await moduleOffReason('setup');
  if (off) return <ModuleOffPage moduleId="setup" reason={off} />;
  const { lang } = getLang(session.sub);
  return (
    <ModulePage
      moduleId="setup"
      help="set-up-your-school"
      tour="setup-subjects"
      title={t(lang, 'setup.subjects.title')}
      purpose={t(lang, 'setup.subjects.purpose')}
      about={t(lang, 'setup.subjects.about')}
      more={
        <Link href="/app/setup" className={QUIET_ACTION}>
          {t(lang, 'setup.back')}
        </Link>
      }
    >
      <SubjectsView />
    </ModulePage>
  );
}
