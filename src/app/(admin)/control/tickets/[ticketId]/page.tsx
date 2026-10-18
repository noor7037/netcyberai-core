import { ModulePage } from '@/components/app-ui/ModulePage';
import { ControlTicketDetail } from '@/components/tickets/TicketScreens';

export default function ControlTicketPage({ params }: { params: { ticketId: string } }) {
  return (
    <ModulePage title="Support ticket" purpose="The question, your replies and the status." icon="ticket" tone="gold" eyebrow="Support">
      <ControlTicketDetail ticketId={params.ticketId} />
    </ModulePage>
  );
}
