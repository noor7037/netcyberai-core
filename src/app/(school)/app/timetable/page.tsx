import Link from 'next/link';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { TimetableView } from '@/components/timetable/TimetableView';
import { getServerSession } from '@/lib/auth/server-session';
import { featureOff, moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { GENERATOR_FEATURE } from '@/lib/timetable/generator-store';

// The timetable (docs/20 5c, C145): the office fills each class's week; a
// teacher sees their own. One short line in the banner, the rest behind its ⓘ (design system v5, C243).
export default async function TimetablePage() {
  const off = await moduleOffReason('timetable');
  if (off) return <ModuleOffPage moduleId="timetable" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  // The office and the academic coordinator fill it (C146).
  const office = session?.role === 'school_admin' || session?.role === 'principal' || session?.role === 'academic_coordinator';
  // A teacher's covers for today sit above their week, when the school has Proxy Auto on (C202).
  const covers = session?.role === 'teacher' && !(await moduleOffReason('proxy'));
  // The office is shown the way to the timetable generator when the school's plan has it (C229), and to who teaches
  // what (C243: the office and the coordinator keep it; the coordinator has no Staff page).
  const generator = office && !(await featureOff(GENERATOR_FEATURE));
  return (
    <ModulePage
      moduleId="timetable"
      help="timetable"
      tour="timetable"
      title={t(lang, 'tt.title')}
      purpose={t(lang, office ? 'tt.purpose.office' : 'tt.purpose.teacher')}
      about={t(lang, office ? 'tt.about.office' : 'tt.about.teacher')}
      more={
        office ? (
          <Link href="/app/timetable/teachers" data-timetable-teachers className="inline-flex min-h-[44px] items-center rounded-md border border-slate/20 bg-white px-4 text-sm font-semibold text-slate">
            {t(lang, 'ts.title')}
          </Link>
        ) : undefined
      }
    >
      <TimetableView office={office} teacher={session?.role === 'teacher'} covers={covers} generator={generator} />
    </ModulePage>
  );
}
