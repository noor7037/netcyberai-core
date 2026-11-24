import { InstallPage } from '@/components/install/InstallPage';

// Install the Teacher app from the phone's browser (founder, C230). It opens /app: signed-out visitors are sent to
// /login by the middleware, signed-in teachers land on My Day.
export const metadata = {
  title: 'Install NetCyberAI Teacher',
  description: 'Put the NetCyberAI Teacher app on your phone.',
  manifest: '/teacher.webmanifest',
  alternates: { canonical: '/teacher-app' },
};

export default function TeacherInstallPage() {
  return <InstallPage app="teacher" startUrl="/app" />;
}
