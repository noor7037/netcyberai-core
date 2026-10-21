import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { canAccessFamily } from '@/lib/auth/guards';

// The school parent home (founder, 2026-10-15, C230-D), at /parent since M1-2 (C248) made /family the Family app;
// School Link replaces it in M3. Every page under this route group renders through this layout, and the guard below
// runs first: a parent's school session, and nothing else. Staff sessions are sent to their
// own app by the middleware; this guard is the second line, and scripts/check_route_guards.py checks it is here.
export const dynamic = 'force-dynamic';

export default async function ParentHomeLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canAccessFamily(session)) {
    redirect('/login');
  }
  return <div className="min-h-screen bg-off-white">{children}</div>;
}
