import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { canAccessControl } from '@/lib/auth/guards';

// Redundant with middleware.ts's edge gate on purpose -- defense in
// depth, same principle as RLS remaining the backstop under the app
// layer (see the B2 report). If middleware's matcher config were ever
// wrong, this layout still refuses to render for anyone but super_admin.
export default async function ControlLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canAccessControl(session)) {
    redirect('/login');
  }
  return <>{children}</>;
}
