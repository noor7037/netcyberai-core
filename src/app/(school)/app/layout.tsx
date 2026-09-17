import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { canAccessApp } from '@/lib/auth/guards';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canAccessApp(session)) {
    redirect('/login');
  }
  return <>{children}</>;
}
