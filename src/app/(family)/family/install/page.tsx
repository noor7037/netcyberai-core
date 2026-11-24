import { InstallPage } from '@/components/install/InstallPage';
import { familyLangBeforeSignIn } from '@/lib/family/server';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

// Install the Family app from the phone's browser (founder, C230). Public: it needs no session, so it sits outside
// (app) and is listed in scripts/check_route_guards.py with the other open pages. The layout supplies the manifest,
// and it is named here too because this page sets its own metadata.
export const metadata = { ...buildMetadata(pageMeta.familyInstall), manifest: '/family.webmanifest' };

export default function FamilyInstallPage() {
  return (
    <>
      <InstallPage app="family" startUrl="/family" lang={familyLangBeforeSignIn() === 'hi' ? 'hi' : 'en'} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.familyInstall)) }} />
    </>
  );
}
