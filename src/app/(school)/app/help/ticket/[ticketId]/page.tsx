import { PageHeader } from '@/components/app-ui/PageHeader';
import { SchoolTicketDetail } from '@/components/tickets/TicketScreens';

export default function TicketPage({ params }: { params: { ticketId: string } }) {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader eyebrow="Help" tone="sapphire" title="Support ticket" />
      <SchoolTicketDetail ticketId={params.ticketId} />
    </div>
  );
}
