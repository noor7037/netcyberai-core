import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';
import { MessagesView } from '@/components/communication/MessagesView';
import { getServerSession } from '@/lib/auth/server-session';
import { moduleOffReason } from '@/lib/frameworks/page-access';
import { t } from '@/lib/i18n';
import { getLang } from '@/lib/i18n/server';

// Communication (docs/25, P4). Live so far: every WhatsApp message of the school and where it got to (slice 7b,
// C183). Notices written by staff, replies and the rest follow in their slices; the page says what is not there yet.
export default async function CommunicationPage() {
  const off = await moduleOffReason('communication');
  if (off) return <ModuleOffPage moduleId="communication" reason={off} />;
  const session = await getServerSession();
  const { lang } = getLang(session?.sub ?? '');
  return (
    <ModulePage moduleId="communication" help="message-states" tour="communication" title={t(lang, 'msg.page.title')} purpose={t(lang, 'msg.page.purpose')}>
      <div className="flex flex-col gap-6">
        <MessagesView mayRead={session?.role === 'principal' || session?.role === 'school_admin'} />
        <p className="text-sm text-slate/70">{t(lang, 'msg.page.notYet')}</p>
      </div>
    </ModulePage>
  );
}
