import Link from 'next/link';
import { ModulePage, PRIMARY_ACTION } from '@/components/app-ui/ModulePage';
import { SchoolTicketList } from '@/components/tickets/TicketScreens';

// Raise Ticket (C126): this person's tickets (the office sees the whole
// school's), with a button to raise a new one. Always on for every school
// and in every access mode (C112); the API decides who sees which ticket.
export default function TicketsPage() {
  return (
    <ModulePage
      moduleId="raise-ticket"
      help="raise-a-ticket"
      tour="tickets"
      title="Support tickets"
      purpose="Ask NetCyberAI for help and follow the answers here."
      primary={
        <Link href="/app/help/ticket/new" className={PRIMARY_ACTION}>
          Raise a ticket
        </Link>
      }
    >
      <SchoolTicketList />
    </ModulePage>
  );
}
