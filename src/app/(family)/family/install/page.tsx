import { FAMILY_INSTALL_META } from '@/lib/install/install-words';
import { InstallPage } from '@/components/install/InstallPage';
import { familyLangBeforeSignIn } from '@/lib/family/server';

// Install the Family app from the phone's browser (founder, C230). Public: it needs no session, so it sits outside
// (app) and is listed in scripts/check_route_guards.py with the other open pages. The layout supplies the manifest.
export const metadata = FAMILY_INSTALL_META;

export default function FamilyInstallPage() {
  return <InstallPage app="family" startUrl="/family" lang={familyLangBeforeSignIn() === 'hi' ? 'hi' : 'en'} />;
}
