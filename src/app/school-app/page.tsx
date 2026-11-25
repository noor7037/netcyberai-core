import { InstallPage } from '@/components/install/InstallPage';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

// Install the School app (the principal's and the office's dashboard) from the phone's browser (founder, C550). It
// opens /app: signed-out visitors are sent to /login by the middleware, signed-in staff land on their home screen.
export const metadata = { ...buildMetadata(pageMeta.schoolInstall), manifest: '/school.webmanifest' };

export default function SchoolInstallPage() {
  return (
    <>
      <InstallPage app="school" startUrl="/app" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.schoolInstall)) }} />
    </>
  );
}
