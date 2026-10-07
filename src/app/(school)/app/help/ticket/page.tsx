import { PageHeader } from '@/components/app-ui/PageHeader';
import { SchoolTicketList } from '@/components/tickets/TicketScreens';

// Raise Ticket (C126): this person's tickets (the office sees the whole
// school's), with a button to raise a new one. Always on for every school
// and in every access mode (C112); the API decides who sees which ticket.
export default function TicketsPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader eyebrow="Help" tone="sapphire" title="Support tickets" description="Ask NetCyberAI for help and follow the answers here." />
      <SchoolTicketList />
    </div>
  );
}
