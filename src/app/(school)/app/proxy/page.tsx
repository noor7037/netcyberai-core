import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { ProxyView } from '@/components/proxy/ProxyView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';
import { PROXY_SHOW } from '@/lib/insights/screens';
import { PROXY_ARRANGERS, PROXY_ROLES } from '@/lib/proxy/rules';

// Proxy Auto (docs/26 slice 8c, C202): the principal, the school admin and the academic coordinator arrange cover
// for the periods of a teacher on leave; a teacher sees the covers they hold. Nobody else has a part in it: an
// accountant is shown the same "not for your role" page as for any module outside their work, and the API
// refuses in the same way.
// ?show=needs-cover comes from the dashboard's "Periods without cover today" and lists those periods alone
// (C203). It is a filter for the people who arrange cover; anything else in ?show= is no filter.
export default async function ProxyPage({ searchParams = {} }: { searchParams?: { show?: string } }) {
  const off = await moduleOffReason('proxy');
  if (off) return <ModuleOffPage moduleId="proxy" reason={off} />;
  const session = await getServerSession();
  if (!session || !PROXY_ROLES.includes(session.role)) return <ModuleComingPage moduleId="proxy" />;
  const { lang } = getLang(session.sub);
  if (!PROXY_ARRANGERS.includes(session.role)) {
    return (
      <ModulePage moduleId="proxy" help="cover-a-class" tour="proxy-covers" title={t(lang, 'px.page.title')} purpose={t(lang, 'px.page.purpose.teacher')}>
        <ProxyView />
      </ModulePage>
    );
  }
  return (
    <ModulePage moduleId="proxy" help="cover-a-class" tour="proxy" title={t(lang, 'px.page.title')} purpose={t(lang, 'px.page.purpose.arranger')}>
      <ProxyView show={searchParams.show === PROXY_SHOW ? PROXY_SHOW : undefined} />
    </ModulePage>
  );
}
