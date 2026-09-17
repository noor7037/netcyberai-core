import { getServerSession } from '@/lib/auth/server-session';
import { shellForRole } from '@/lib/auth/guards';

// Prompt B2 scope: which shell would be selected, decided server-side on
// every request -- not the shell's actual content (Office/Finance/
// Academic/Teacher UIs are Prompt D+, explicitly out of scope here).
export default async function AppHomePage() {
  const session = await getServerSession();
  const shell = session ? shellForRole(session.role) : null;
  return (
    <main style={{ padding: '2rem' }}>
      <h1>School workspace</h1>
      <p>
        Role: {session?.role} · School: {session?.schoolId} · Shell: {shell ?? 'none'}
      </p>
    </main>
  );
}
