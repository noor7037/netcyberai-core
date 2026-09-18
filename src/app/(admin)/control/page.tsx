import { StubPage } from '@/components/shell/StubPage';

// Prompt D scope: the Dashboard nav entry and its shell, not real KPI
// data (total/active schools, MRR, message volume, etc. -- PRD §7.2)
// or Supabase queries, which need app_backend's connection.
export default function ControlDashboardPage() {
  return (
    <StubPage
      title="Dashboard"
      description="Platform-wide KPIs -- schools, users, MRR, message volume and failure rate, consent completion, open tickets, messaging spend vs budget -- will appear here once real data is wired in."
    />
  );
}
