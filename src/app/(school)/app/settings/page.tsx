import { getServerSession } from '@/lib/auth/server-session';
import { withTenantContext } from '@/lib/auth/db';
import { WhatsAppConfigPanel } from '@/components/settings/WhatsAppConfigPanel';
import { ModuleSwitchList } from '@/components/settings/ModuleSwitchList';
import { ModulePage } from '@/components/app-ui/ModulePage';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { getLang } from '@/lib/i18n/server';

// The school's settings: what is switched on for the school, with one plain
// sentence on what each module being off changes (docs/19 rule 7, C139),
// and the WhatsApp settings. The module list is for the office; if it
// cannot be loaded the rest of the page still works.
export default async function SettingsPage() {
  const session = await getServerSession();
  const canManage = session?.role === 'school_admin' || session?.role === 'principal';
  const { lang } = getLang(session?.sub ?? '');

  let entitlements: SchoolEntitlements | null = null;
  if (session?.schoolId && canManage) {
    const schoolId = session.schoolId;
    entitlements = await withTenantContext(session, (db) => loadEntitlements(db, schoolId)).catch((err) => {
      console.error('[settings] the module list could not be loaded', err instanceof Error ? err.name : 'error');
      return null;
    });
  }

  return (
    <ModulePage moduleId="setup" help="whatsapp-settings" tour="settings" title="Settings" purpose="What is switched on for your school, and how its WhatsApp messages are set up.">
      {entitlements && <ModuleSwitchList entitlements={entitlements} lang={lang} />}
      <WhatsAppConfigPanel canManage={canManage} />
    </ModulePage>
  );
}
