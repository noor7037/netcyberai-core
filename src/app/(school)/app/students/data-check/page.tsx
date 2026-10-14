import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { DataCheckView } from '@/components/students/DataCheckView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// The student data check (docs/28 row 10b, C222): each child's name, date of birth and gender against Aadhaar as
// printed, for UDISE+ and APAAR. Part of Students: switched off with it. The office types, asks and corrects; a class
// teacher reads their own class; the API and the database decide who sees what.
export default async function StudentDataCheckPage() {
  const off = await moduleOffReason('students');
  if (off) return <ModuleOffPage moduleId="students" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="students" help="student-data-check" tour="data-check" title={t(lang, 'sdc.page.title')} purpose={t(lang, 'sdc.page.purpose')}>
      <DataCheckView />
    </ModulePage>
  );
}
