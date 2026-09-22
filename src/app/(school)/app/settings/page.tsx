import { getServerSession } from '@/lib/auth/server-session';
import { WhatsAppConfigPanel } from '@/components/settings/WhatsAppConfigPanel';

export default async function SettingsPage() {
  const session = await getServerSession();
  const canManage = session?.role === 'school_admin' || session?.role === 'principal';

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <h1 className="text-xl font-bold text-slate">Settings</h1>
      <WhatsAppConfigPanel canManage={canManage} />
    </div>
  );
}
