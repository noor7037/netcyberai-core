import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { TimetableView } from '@/components/timetable/TimetableView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// The timetable (docs/20 5c, C145): the office fills each class's week; a
// teacher sees their own.
export default async function TimetablePage() {
  const off = await moduleOffReason('timetable');
  if (off) return <ModuleOffPage moduleId="timetable" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  // The office and the academic coordinator fill it (C146).
  const office = session?.role === 'school_admin' || session?.role === 'principal' || session?.role === 'academic_coordinator';
  return (
    <ModulePage moduleId="timetable" help="timetable" tour="timetable" title={t(lang, 'tt.title')} purpose={t(lang, office ? 'tt.purpose.office' : 'tt.purpose.teacher')}>
      <TimetableView office={office} teacher={session?.role === 'teacher'} />
    </ModulePage>
  );
}
