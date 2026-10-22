import { ModulePage } from '@/components/app-ui/ModulePage';
import { ResponseQueueView } from '@/components/control/content/ResponseQueueView';
import { withTenantContext } from '@/lib/auth/db';
import { getServerSession } from '@/lib/auth/server-session';
import { listResponses, oldestQueueAgeDays } from '@/lib/content/response-queue';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Control → Content → Responses to review (M2-12, C286; docs/family-app/11 L1): the explanations made by AI that
// families asked for, most asked first; mark checked or withdraw.

export const dynamic = 'force-dynamic';

export default async function ResponsesPage() {
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  // The layout has already refused anyone but NetCyberAI staff; this runs as the platform role.
  const data = session
    ? await withTenantContext(session, async (db) => ({ responses: await listResponses(db, { userId: session.sub }, 'ai_made'), age: await oldestQueueAgeDays(db) }))
    : null;
  return (
    <ModulePage title={t(lang, 'control.queue.title')} purpose={t(lang, 'control.queue.purpose')} about={t(lang, 'control.queue.about')} icon="academics" tone="royal" eyebrow={t(lang, 'group.control')} headerLang={lang}>
      {data && <ResponseQueueView initial={data.responses} age={data.age} />}
    </ModulePage>
  );
}
