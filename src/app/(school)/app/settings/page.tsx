import { getServerSession } from '@/lib/auth/server-session';
import { canAccessApp } from '@/lib/auth/guards';
import { withTenantContext } from '@/lib/auth/db';
import { WhatsAppConfigPanel } from '@/components/settings/WhatsAppConfigPanel';
import { HolidaysCard } from '@/components/settings/HolidaysCard';
import { ModuleSwitchList } from '@/components/settings/ModuleSwitchList';
import { PaymentRailsPanel } from '@/components/payments/PaymentRailsPanel';
import { SchoolSettingsPanel } from '@/components/settings/SchoolSettingsPanel';
import { SchoolBrandingCard } from '@/components/settings/SchoolBrandingCard';
import { ModulePage } from '@/components/app-ui/ModulePage';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { readAllSettings, type ModuleSettingsForScreen } from '@/lib/frameworks/settings-store';
import { loadSchoolBrand, type SchoolBrand } from '@/lib/school/branding';
import { getLang } from '@/lib/i18n/server';

// The school's settings: what is switched on for the school, with one plain
// sentence on what each module being off changes (docs/19 rule 7, C139),
// each module's own settings generated from its schema (17 §1a, C166), and
// the WhatsApp settings. The module list is for the office; if a part
// cannot be loaded the rest of the page still works. First, for the
// principal and the school admin only: the school's official name and logo
// (C235-B), shown at the top of every screen.
export default async function SettingsPage() {
  const session = await getServerSession();
  const canManage = session?.role === 'school_admin' || session?.role === 'principal';
  const { lang } = getLang(session?.sub ?? '');

  let entitlements: SchoolEntitlements | null = null;
  let brand: SchoolBrand | null = null;
  if (session?.schoolId && canManage) {
    const schoolId = session.schoolId;
    entitlements = await withTenantContext(session, (db) => loadEntitlements(db, schoolId)).catch((err) => {
      console.error('[settings] the module list could not be loaded', err instanceof Error ? err.name : 'error');
      return null;
    });
    brand = await withTenantContext(session, (db) => loadSchoolBrand(db, schoolId)).catch((err) => {
      console.error('[settings] the school profile could not be loaded', err instanceof Error ? err.name : 'error');
      return null;
    });
  }

  // Every module's settings this person may open; who may change a field is decided per field, and again by the API.
  let settings: ModuleSettingsForScreen[] = [];
  if (canAccessApp(session)) {
    const claims = { schoolId: session.schoolId, role: session.role };
    settings = await withTenantContext(session, (db) => readAllSettings(db, claims)).catch((err) => {
      console.error('[settings] the module settings could not be loaded', err instanceof Error ? err.name : 'error');
      return [];
    });
  }

  return (
    <ModulePage moduleId="setup" help="whatsapp-settings" tour="settings" title="Settings" purpose="What is switched on for your school, how each part is set up, and its WhatsApp messages.">
      {canManage && brand && session?.schoolId && <SchoolBrandingCard scope="school" schoolId={session.schoolId} initial={brand} />}
      {entitlements && <ModuleSwitchList entitlements={entitlements} lang={lang} />}
      <SchoolSettingsPanel modules={settings} />
      {settings.some((m) => m.moduleId === 'setup') && <HolidaysCard />}
      {(canManage || session?.role === 'accountant') && settings.some((m) => m.moduleId === 'fees') && <PaymentRailsPanel scope="school" />}
      <WhatsAppConfigPanel canManage={canManage} />
    </ModulePage>
  );
}
