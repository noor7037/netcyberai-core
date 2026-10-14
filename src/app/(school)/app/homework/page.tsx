import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { HomeworkShown } from '@/components/homework/HomeworkShown';
import { HomeworkView } from '@/components/homework/HomeworkView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { readRange } from '@/lib/insights/screens';
import { isHomeworkShow } from '@/lib/homework/homework';

// Homework (docs/20 5e, C150): set it once, copy it to the sections it is
// for, and check who has done it.
// ?show=<filter>&from=&to= comes from a dashboard number and lists the assignments behind it (C203). The screen
// below is told that a list is drawn above it, so a change made there has that list read again (C210).
export default async function HomeworkPage({ searchParams = {} }: { searchParams?: { show?: string; from?: string; to?: string } }) {
  const off = await moduleOffReason('homework');
  if (off) return <ModuleOffPage moduleId="homework" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const range = readRange(searchParams);
  const shown = isHomeworkShow(searchParams.show) && range ? { show: searchParams.show, range } : null;
  return (
    <ModulePage moduleId="homework" help="set-homework" tour="homework" title={t(lang, 'hw.title')} purpose={t(lang, 'hw.purpose')}>
      {shown && <HomeworkShown show={shown.show} range={shown.range} />}
      <HomeworkView shownAbove={shown !== null} />
    </ModulePage>
  );
}
