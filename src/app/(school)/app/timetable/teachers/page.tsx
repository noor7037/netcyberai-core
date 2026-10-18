import { redirect } from 'next/navigation';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { TeacherSubjects } from '@/components/staff/TeacherSubjects';
import { ASSIGNERS } from '@/lib/academics/teacher-subjects';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Who teaches what, in the Timetable module (C243): the subjects each teacher teaches, class by class, and the
// teachers' own proposals. For the principal, the school admin and the academic coordinator (ASSIGNERS, C230-C): the
// coordinator keeps it here, beside the timetable it decides; the office has the same panel on Staff too. Anyone else
// is sent to the timetable itself, as the generator's page does. The panel and its API
// (/api/app/subjects/assignments) are the same ones Staff uses; row level security says who writes.
export default async function TimetableTeachersPage() {
  const off = await moduleOffReason('timetable');
  if (off) return <ModuleOffPage moduleId="timetable" reason={off} />;
  const session = await getServerSession();
  if (!session || !ASSIGNERS.includes(session.role)) redirect('/app/timetable');
  const { lang } = getLang(session.sub);
  return (
    <ModulePage moduleId="timetable" help="timetable" title={t(lang, 'ts.title')} purpose={t(lang, 'ts.page.purpose')} about={t(lang, 'ts.how')}>
      <TeacherSubjects standalone />
    </ModulePage>
  );
}
