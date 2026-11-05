import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { RegisterReview } from '@/components/students/RegisterReview';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// A paper admission register read into the student import (W21-M5, docs/42 Medium: Students OCR). Part of Students:
// switched off with it. The office only (the import's roles); the API decides again.
export default async function ReadRegisterPage() {
  const off = await moduleOffReason('students', { roles: ['principal', 'school_admin'] });
  if (off) return <ModuleOffPage moduleId="students" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage
      moduleId="students"
      title={t(lang, 'w21m5.page.title')}
      purpose={t(lang, 'w21m5.page.purpose')}
      about={t(lang, 'w21m5.page.about')}
      crumbs={[{ label: t(lang, 'w21m5.page.title') }]}
    >
      <RegisterReview />
    </ModulePage>
  );
}
