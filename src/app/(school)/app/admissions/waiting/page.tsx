import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { StudentsView } from '@/components/students/StudentsView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Every student waiting for a guardian's consent, with "+ Add student" and "Import CSV" (C221): the screen that
// was /app/admissions before the pipeline took that address, unchanged. Opened from the list under the pipeline.
// The Students module's own screen: it stays with every plan that has Students, whether or not it has Admissions.
export default async function AdmissionsWaitingPage() {
  const off = await moduleOffReason('students');
  if (off) return <ModuleOffPage moduleId="students" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return <StudentsView title={t(lang, 'adm.waitingPage.title')} description={t(lang, 'adm.waitingPage.purpose')} statusFilter="pending_consent" />;
}
