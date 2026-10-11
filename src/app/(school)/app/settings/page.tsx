import { getServerSession } from '@/lib/auth/server-session';
import { WhatsAppConfigPanel } from '@/components/settings/WhatsAppConfigPanel';
import { ModulePage } from '@/components/app-ui/ModulePage';

export default async function SettingsPage() {
  const session = await getServerSession();
  const canManage = session?.role === 'school_admin' || session?.role === 'principal';

  return (
    <ModulePage moduleId="setup" tour="settings" title="Settings" purpose="How your school’s WhatsApp messages are set up.">
      <WhatsAppConfigPanel canManage={canManage} />
    </ModulePage>
  );
}
