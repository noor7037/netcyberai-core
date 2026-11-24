import { InstallPage } from '@/components/install/InstallPage';
import { breadcrumbListJsonLd, buildMetadata, pageMeta, serializeJsonLd } from '@/lib/seo';

// Install the Teacher app from the phone's browser (founder, C230). It opens /app: signed-out visitors are sent to
// /login by the middleware, signed-in teachers land on My Day.
export const metadata = { ...buildMetadata(pageMeta.teacherInstall), manifest: '/teacher.webmanifest' };

export default function TeacherInstallPage() {
  return (
    <>
      <InstallPage app="teacher" startUrl="/app" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbListJsonLd(pageMeta.teacherInstall)) }} />
    </>
  );
}
