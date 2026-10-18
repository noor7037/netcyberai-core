import { ModulePage } from '@/components/app-ui/ModulePage';
import { BoardsView } from '@/components/control/BoardsView';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { controlBoards } from '@/lib/exams/boards';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Control → Boards & grading (docs/27 row 9a, C213). The boards and their presets are rows: CBSE and CISCE copied
// from their official documents, a state board's from its circular when a school from it signs. A preset is never
// changed; a new one replaces it.

export const dynamic = 'force-dynamic';

export default async function BoardsPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  // The layout has already refused anyone but NetCyberAI staff; this runs as the platform role.
  const data = session ? await withTenantContext(session, (db) => controlBoards(db)) : null;
  return (
    <ModulePage title={t(lang, 'boards.title')} purpose={t(lang, 'boards.purpose')} about={t(lang, 'boards.about')} icon="exams" tone="royal" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      {data && <BoardsView initial={data} />}
    </ModulePage>
  );
}
