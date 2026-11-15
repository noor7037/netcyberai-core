import { HubShell } from '@/components/family/HubShell';

// A hub of the Future tab: the child's class and state decide what shows (src/components/family/FutureHub.tsx). `?q=` is the search.
export const dynamic = 'force-dynamic';
export default function Page({ searchParams }: { searchParams: { q?: string | string[] } }) {
  const { q } = searchParams;
  return <HubShell module="opportunities" q={(Array.isArray(q) ? q[0] : q ?? '').slice(0, 80)} />;
}
