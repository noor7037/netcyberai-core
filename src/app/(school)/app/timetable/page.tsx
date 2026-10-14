import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { TimetableView } from '@/components/timetable/TimetableView';
import { getServerSession } from '@/lib/auth/server-session';
import { featureOff, moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { GENERATOR_FEATURE } from '@/lib/timetable/generator-store';

// The timetable (docs/20 5c, C145): the office fills each class's week; a
// teacher sees their own.
export default async function TimetablePage() {
  const off = await moduleOffReason('timetable');
  if (off) return <ModuleOffPage moduleId="timetable" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  // The office and the academic coordinator fill it (C146).
  const office = session?.role === 'school_admin' || session?.role === 'principal' || session?.role === 'academic_coordinator';
  // A teacher's covers for today sit above their week, when the school has Proxy Auto on (C202).
  const covers = session?.role === 'teacher' && !(await moduleOffReason('proxy'));
  // The office is shown the way to the timetable generator when the school's plan has it (C229).
  const generator = office && !(await featureOff(GENERATOR_FEATURE));
  return (
    <ModulePage moduleId="timetable" help="timetable" tour="timetable" title={t(lang, 'tt.title')} purpose={t(lang, office ? 'tt.purpose.office' : 'tt.purpose.teacher')}>
      <TimetableView office={office} teacher={session?.role === 'teacher'} covers={covers} generator={generator} />
    </ModulePage>
  );
}
