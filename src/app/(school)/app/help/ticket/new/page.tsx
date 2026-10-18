import { ModulePage } from '@/components/app-ui/ModulePage';
import { SchoolRaiseTicket } from '@/components/tickets/TicketScreens';

export default function RaiseTicketPage() {
  return (
    <ModulePage moduleId="raise-ticket" help="raise-a-ticket" title="Raise a ticket" purpose="Tell NetCyberAI what you need.">
      <SchoolRaiseTicket />
    </ModulePage>
  );
}
