import { InstallPage } from '@/components/install/InstallPage';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

// Teachers install the School app here (C552): the same app as /school-app (one app per phone; on one phone the apps share
// one sign-in). It opens /app: signed-out visitors are sent to /login, signed-in teachers land on My Day.
export const metadata = { ...buildMetadata(pageMeta.teacherInstall), manifest: '/school.webmanifest' };

export default function TeacherInstallPage() {
  return (
    <>
      <InstallPage app="teacher" startUrl="/app" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.teacherInstall)) }} />
    </>
  );
}
