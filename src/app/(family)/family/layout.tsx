import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { canAccessFamily } from '@/lib/auth/guards';

// The family app (founder, 2026-10-15, C230-D). Every page under this route group renders through this layout, and
// the guard below runs first: a parent's session with a school, and nothing else. Staff sessions are sent to their
// own app by the middleware; this guard is the second line, and scripts/check_route_guards.py checks it is here.
export const dynamic = 'force-dynamic';

export default async function FamilyLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canAccessFamily(session)) {
    redirect('/login');
  }
  return <div className="min-h-screen bg-off-white">{children}</div>;
}
