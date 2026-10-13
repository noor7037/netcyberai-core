import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ParentAiView } from '@/components/parent-ai/ParentAiView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Parent AI v1 (docs/25 slice 7n, C196).
export default async function ParentAiPage() {
  const off = await moduleOffReason('parent-ai');
  if (off) return <ModuleOffPage moduleId="parent-ai" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="parent-ai" help="what-to-do-at-home" tour="parent-ai" title={t(lang, 'pai.page.title')} purpose={t(lang, 'pai.page.purpose')}>
      <ParentAiView />
    </ModulePage>
  );
}
