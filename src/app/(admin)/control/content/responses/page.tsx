import { ModulePage } from '@/components/app-ui/ModulePage';
import { PrepareExplanationsView, type PreparableVersion } from '@/components/control/content/PrepareExplanationsView';
import { ResponseQueueView } from '@/components/control/content/ResponseQueueView';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { listResponses, oldestQueueAgeDays } from '@/lib/content/response-queue';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { WordsProvider } from '@/components/app-shell/Words';
import { pageWords } from '@/components/app-shell/page-words';

// Control → Content → Responses to review (M2-12, C286; docs/family-app/11 L1): the explanations made by AI that
// families asked for, most asked first; mark checked or withdraw. Above it (C300): prepare a syllabus version's
// explanations before children ask, so they can be checked first.

export const dynamic = 'force-dynamic';

export default async function ResponsesPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  // The layout has already refused anyone but NetCyberAI staff; this runs as the platform role.
  const data = session
    ? await withTenantContext(session, async (db) => ({
        responses: await listResponses(db, { userId: session.sub }, 'ai_made'),
        age: await oldestQueueAgeDays(db),
        versions: (
          await db.query(
            `select version_id, board_id, class_level, subject, academic_year, version_no, status from content.syllabus_versions
              where status in ('in_review', 'published') order by board_id, class_level, subject, version_no desc`
          )
        ).rows.map((r): PreparableVersion => ({ versionId: String(r.version_id), boardId: String(r.board_id), classLevel: Number(r.class_level), subject: String(r.subject), year: String(r.academic_year), versionNo: Number(r.version_no), status: String(r.status) })),
      }))
    : null;
  return (
    <ModulePage title={t(lang, 'control.queue.title')} purpose={t(lang, 'control.queue.purpose')} about={t(lang, 'control.queue.about')} icon="academics" tone="royal" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      <WordsProvider words={pageWords(lang, '/control/content/responses')}>
      {data && <PrepareExplanationsView versions={data.versions} />}
      {data && <ResponseQueueView initial={data.responses} age={data.age} />}
      </WordsProvider>
    </ModulePage>
  );
}
