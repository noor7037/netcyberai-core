import { PageHeader } from '@/components/app-ui/PageHeader';
import { SchoolRaiseTicket } from '@/components/tickets/TicketScreens';

export default function RaiseTicketPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeader eyebrow="Help" tone="sapphire" title="Raise a ticket" />
      <SchoolRaiseTicket />
    </div>
  );
}
