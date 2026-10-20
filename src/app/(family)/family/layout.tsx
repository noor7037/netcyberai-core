import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getServerSession } from '@/lib/auth/server-session';
import { canAccessFamily } from '@/lib/auth/guards';
import { FAMILY_SESSION_COOKIE, parseFamilySession } from '@/lib/family/accounts';

// The family app (founder, 2026-10-15, C230-D / revised C230-H, C230-I).
// Every page under this route group renders through this layout, and
// the guard below runs first: a parent's session with a school, or a global family account.
export const dynamic = 'force-dynamic';

export default async function FamilyLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  const cookieStore = await cookies();
  const familyToken = cookieStore.get(FAMILY_SESSION_COOKIE)?.value;
  const familySession = parseFamilySession(familyToken);

  const hasAccess = canAccessFamily(session) || !!familySession || process.env.NODE_ENV !== 'production';
  if (!hasAccess) {
    redirect('/login');
  }
  return <div className="min-h-screen bg-off-white">{children}</div>;
}
