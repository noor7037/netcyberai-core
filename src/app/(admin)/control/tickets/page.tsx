import { PageHeader } from '@/components/app-ui/PageHeader';
import { ControlTicketQueue } from '@/components/tickets/TicketScreens';

// The founder's ticket queue (C126): every school's tickets, newest
// activity first. The /api/control/tickets routes check the platform
// admin's session; the layout above already keeps everyone else out.
export default function ControlTicketsPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader eyebrow="Support" tone="sapphire" title="Support tickets" description="Tickets from every school. You get an email when one is raised." />
      <ControlTicketQueue />
    </div>
  );
}
