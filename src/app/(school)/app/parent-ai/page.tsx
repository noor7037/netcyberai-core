import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ParentAiShown } from '@/components/parent-ai/ParentAiShown';
import { ParentAiView } from '@/components/parent-ai/ParentAiView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { ANSWERS_SHOW } from '@/lib/insights/screens';

// Parent AI v1 (docs/25 slice 7n, C196).
// ?show=drafts comes from the dashboard's "Answers waiting for approval" and lists those drafts first (C203). The
// screen below is told that a list is drawn above it, so a change made there has that list read again (C210).
export default async function ParentAiPage({ searchParams = {} }: { searchParams?: { show?: string } }) {
  const off = await moduleOffReason('parent-ai');
  if (off) return <ModuleOffPage moduleId="parent-ai" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  const shown = searchParams.show === ANSWERS_SHOW;
  return (
    <ModulePage moduleId="parent-ai" help="what-to-do-at-home" tour="parent-ai" title={t(lang, 'pai.page.title')} purpose={t(lang, 'pai.page.purpose')}>
      {shown && <ParentAiShown />}
      <ParentAiView shownAbove={shown} />
    </ModulePage>
  );
}
