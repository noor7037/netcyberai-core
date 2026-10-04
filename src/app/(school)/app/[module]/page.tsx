import { notFound } from 'next/navigation';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { moduleForSegment } from '@/components/app-shell/coming';

// Every module route is reserved (C110): a module with no page of its own
// yet shows its Coming page here; built modules have their own routes,
// which Next.js matches first. Anything that is not a module is a 404.
export default function ModuleRoutePage({ params }: { params: { module: string } }) {
  const m = moduleForSegment(params.module);
  if (!m) notFound();
  return <ModuleComingPage moduleId={m.id} />;
}
