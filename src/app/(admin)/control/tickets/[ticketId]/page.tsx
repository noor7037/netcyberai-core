import { PageHeader } from '@/components/app-ui/PageHeader';
import { ControlTicketDetail } from '@/components/tickets/TicketScreens';

export default function ControlTicketPage({ params }: { params: { ticketId: string } }) {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader eyebrow="Support" tone="sapphire" title="Support ticket" />
      <ControlTicketDetail ticketId={params.ticketId} />
    </div>
  );
}
