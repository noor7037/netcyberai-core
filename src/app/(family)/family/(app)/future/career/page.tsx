import { CareerHome } from '@/components/family/careers/CareerHome';

// Career Hub: the explorer, then Step 1's entrance listings (FutureHub) on the same page.
export const dynamic = 'force-dynamic';

export default function Page({ searchParams }: { searchParams: { q?: string | string[]; s?: string | string[]; field?: string | string[]; level?: string | string[] } }) {
  return <CareerHome search={searchParams} />;
}
