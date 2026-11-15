import { CareerHome } from '@/components/family/careers/CareerHome';

export const dynamic = 'force-dynamic';

export default function Page({ params, searchParams }: { params: { field: string }; searchParams: { q?: string | string[]; s?: string | string[]; level?: string | string[] } }) {
  return <CareerHome search={{ ...searchParams, field: params.field }} />;
}
