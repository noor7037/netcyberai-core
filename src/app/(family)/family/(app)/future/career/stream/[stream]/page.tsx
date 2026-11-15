import { notFound } from 'next/navigation';
import { CareerHome } from '@/components/family/careers/CareerHome';
import { STREAMS, type StreamSlug } from '@/lib/family/careers/types';

export const dynamic = 'force-dynamic';

export default function Page({ params, searchParams }: { params: { stream: string }; searchParams: { q?: string | string[]; s?: string | string[]; level?: string | string[] } }) {
  if (!STREAMS.includes(params.stream as StreamSlug)) notFound();
  return <CareerHome search={searchParams} stream={params.stream as StreamSlug} />;
}
