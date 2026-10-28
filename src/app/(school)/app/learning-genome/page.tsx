import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { GenomeView } from '@/components/genome/GenomeView';
import { getServerSession } from '@/lib/auth/server-session';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// Learning Genome v1 (docs/27 row 9e, C217): pick a class, then a child, and see that child's own percent in each
// exam, homework done and the Daily Pulse replies to each chapter, with strengths and gaps by the school's settings.
// Staff only: the office and the academic coordinator for every class, a teacher for their own. Nothing is sent to
// parents. ?class= and ?child= open a class and a child straight away.
export default async function LearningGenomePage({ searchParams = {} }: { searchParams?: { class?: string; child?: string } }) {
  const off = await moduleOffReason('learning-genome');
  if (off) return <ModuleOffPage moduleId="learning-genome" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const classId = isUuid(searchParams.class) ? searchParams.class : null;
  const childId = classId && isUuid(searchParams.child) ? searchParams.child : null;
  return (
    <ModulePage moduleId="learning-genome" help="read-a-learning-genome" tour="learning-genome" title={t(lang, 'gn.page.title')} purpose={t(lang, 'gn.page.purpose')}>
      <WordsProvider words={pageWords(lang, '/app/learning-genome')}>
      <GenomeView initialClass={classId} initialChild={childId} />
      </WordsProvider>
    </ModulePage>
  );
}
