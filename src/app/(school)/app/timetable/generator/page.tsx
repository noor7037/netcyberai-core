import { redirect } from 'next/navigation';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { GeneratorView } from '@/components/timetable/GeneratorView';
import { getServerSession } from '@/lib/auth/server-session';
import { featureOff, moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { GENERATOR_FEATURE, PLANNERS } from '@/lib/timetable/generator-store';

// The timetable generator (docs/28 slice 10f, C229): the office keeps the constraints (each class's periods a week per
// subject and its teacher, the periods a teacher cannot teach), the generator proposes a week, a person reviews it
// beside the timetable in force, swaps periods if they wish, and publishes it; each publish is kept and can be read
// back. For the principal, the school admin and the academic coordinator. A part of the plan (C226): a school whose
// plan does not have it is told so plainly, and its routes refuse in the same way.
export default async function TimetableGeneratorPage() {
  const off = await moduleOffReason('timetable');
  if (off) return <ModuleOffPage moduleId="timetable" reason={off} />;
  const session = await getServerSession();
  // A teacher, an accountant or a parent has the timetable itself, not its planning.
  if (!session || !PLANNERS.includes(session.role)) redirect('/app/timetable');
  const { lang } = getLang(session.sub);
  const notInPlan = await featureOff(GENERATOR_FEATURE);
  return (
    <ModulePage moduleId="timetable" help="make-a-timetable" tour="timetable-generator" title={t(lang, 'ttg.page.title')} purpose={t(lang, 'ttg.page.purpose')}>
      {notInPlan ? (
        <div data-ttg-not-in-plan className="flex flex-col items-start gap-2 rounded-md bg-off-white px-3 py-2 text-sm text-slate">
          <p className="font-semibold">{t(lang, 'ttg.notInPlan')}</p>
          <p>{t(lang, 'ttg.notInPlanHand')}</p>
          <a href="/app/timetable" className="inline-flex min-h-[44px] items-center rounded-md border border-slate/20 bg-white px-4 font-semibold text-slate">{t(lang, 'ttg.openTimetable')}</a>
        </div>
      ) : (
        <GeneratorView />
      )}
    </ModulePage>
  );
}
