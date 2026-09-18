import { EmptyState } from '@/components/ui/EmptyState';

type Props = {
  title: string;
  description: string;
};

// Prompt D scope: nav + layout shells only, no business logic, no
// fetched data. Every route that doesn't have a backend yet (all of
// them, in this prompt) shows this -- real copy describing what will
// live here, never a fabricated preview of data that doesn't exist.
export function StubPage({ title, description }: Props) {
  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-4 text-xl font-bold text-slate">{title}</h1>
      <EmptyState title="Not built yet" description={description} />
    </div>
  );
}
