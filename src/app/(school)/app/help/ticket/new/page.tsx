import { ModulePage } from '@/components/app-ui/ModulePage';
import { SchoolRaiseTicket } from '@/components/tickets/TicketScreens';

export default function RaiseTicketPage() {
  return (
    <ModulePage moduleId="raise-ticket" title="Raise a ticket" purpose="Tell NetCyberAI what you need. Replies appear on the ticket.">
      <SchoolRaiseTicket />
    </ModulePage>
  );
}
