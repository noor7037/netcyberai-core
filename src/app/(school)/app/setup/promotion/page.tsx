import Link from 'next/link';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage, QUIET_ACTION } from '@/components/app-ui/ModulePage';
import { PromotionView } from '@/components/setup/PromotionView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Setup -> Promotion to the next session (W21-M2): the dry run for the principal and the school admin; the promotion,
// the per-student decisions and the undo for the principal only. The API and the database say the same.
export default async function SetupPromotionPage() {
  const session = await getServerSession();
  if (session?.role !== 'principal' && session?.role !== 'school_admin') {
    return <ModuleComingPage moduleId="setup" />;
  }
  const off = await moduleOffReason('setup');
  if (off) return <ModuleOffPage moduleId="setup" reason={off} />;
  const { lang } = getLang(session.sub);
  return (
    <ModulePage
      moduleId="setup"
      help="set-up-your-school"
      title={t(lang, 'promotion.title')}
      purpose={t(lang, 'promotion.purpose')}
      about={t(lang, 'promotion.about')}
      more={
        <Link href="/app/setup" className={QUIET_ACTION}>
          {t(lang, 'setup.back')}
        </Link>
      }
    >
      <PromotionView canAct={session.role === 'principal'} />
    </ModulePage>
  );
}
