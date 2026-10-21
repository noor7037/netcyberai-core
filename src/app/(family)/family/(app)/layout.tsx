import { redirect } from 'next/navigation';
import { requireFamilyPage } from '@/lib/family/server';

// Every Family app page that needs a session renders through this layout (M1-2, C248): no family session, no page.
// The middleware checks the cookie's signature first; this reads the account, so a deleted or signed-out-everywhere
// session ends here too. A staff session is never read.
export const dynamic = 'force-dynamic';

export default async function FamilyAppLayout({ children }: { children: React.ReactNode }) {
  const page = await requireFamilyPage();
  if (!page) redirect('/family/sign-in');
  return <>{children}</>;
}
