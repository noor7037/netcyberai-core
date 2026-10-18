import { ModulePage } from '@/components/app-ui/ModulePage';
import { ControlTicketQueue } from '@/components/tickets/TicketScreens';

// The founder's ticket queue (C126): every school's tickets, newest
// activity first. The /api/control/tickets routes check the platform
// admin's session; the layout above already keeps everyone else out.
export default function ControlTicketsPage() {
  return (
    <ModulePage title="Support tickets" purpose="Tickets from every school." icon="ticket" tone="gold" eyebrow="Support">
      <ControlTicketQueue />
    </ModulePage>
  );
}
