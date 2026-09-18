import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { schoolDetailTabs } from '@/lib/nav/nav-items';

// All 21 sub-tabs the PRD's §7.2 list actually contains (it labels the
// section "19 sub-tabs" but lists 21 -- a real discrepancy in the
// source doc, flagged in this prompt's report, not silently resolved
// by dropping two items to make the number match). No business logic:
// every tab is an honest EmptyState.
export default function SchoolDetailPage({ params }: { params: { schoolId: string } }) {
  const items: TabItem[] = schoolDetailTabs.map((tab) => ({
    id: tab.id,
    label: tab.label,
    content: (
      <EmptyState
        title="Not built yet"
        description={`${tab.label} data for this school will appear here once real data is wired in.`}
      />
    ),
  }));

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-1 text-xl font-bold text-slate">School detail</h1>
      <p className="mb-4 text-sm text-slate/70">
        {params.schoolId === 'shell-preview'
          ? 'Shell preview -- no real school exists behind this id yet.'
          : `School id: ${params.schoolId}`}
      </p>
      <Tabs items={items} />
    </div>
  );
}
