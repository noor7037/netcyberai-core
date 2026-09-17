import { getServerSession } from '@/lib/auth/server-session';

// Prompt B2 scope: the auth gate in front of /control, not its content.
// Platform-admin surface content is a later prompt.
export default async function ControlHomePage() {
  const session = await getServerSession();
  return (
    <main style={{ padding: '2rem' }}>
      <h1>Control Center</h1>
      <p>Authenticated as super_admin (user {session?.sub}).</p>
    </main>
  );
}
