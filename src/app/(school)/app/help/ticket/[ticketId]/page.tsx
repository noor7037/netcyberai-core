import { ModulePage } from '@/components/app-ui/ModulePage';
import { SchoolTicketDetail } from '@/components/tickets/TicketScreens';

export default function TicketPage({ params }: { params: { ticketId: string } }) {
  return (
    <ModulePage moduleId="raise-ticket" title="Support ticket" purpose="What you asked, the replies, and what happens next.">
      <SchoolTicketDetail ticketId={params.ticketId} />
    </ModulePage>
  );
}
