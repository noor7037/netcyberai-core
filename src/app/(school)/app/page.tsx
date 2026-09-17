import { redirect } from 'next/navigation';
import { getServerSession } from '@/lib/auth/server-session';
import { shellForRole } from '@/lib/auth/guards';

// The bare /app index redirects to the resolved role's actual default
// screen -- Prompt D scope is real nav destinations, not a landing
// page nobody's nav links to. AppLayout has already confirmed a
// resolved membership exists by the time this runs.
export default async function AppHomePage() {
  const session = await getServerSession();
  const shell = session ? shellForRole(session.role) : null;
  redirect(shell === 'teacher' ? '/app/my-day' : '/app/dashboard');
}
