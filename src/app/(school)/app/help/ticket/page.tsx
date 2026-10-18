import Link from 'next/link';
import { ModulePage, PRIMARY_ACTION } from '@/components/app-ui/ModulePage';
import { SchoolTicketList } from '@/components/tickets/TicketScreens';
import { TicketsShown } from '@/components/tickets/TicketsShown';
import { isTicketShow } from '@/lib/contracts/tickets';

// Raise Ticket (C126): this person's tickets (the office sees the whole
// school's), with a button to raise a new one. Always on for every school
// and in every access mode (C112); the API decides who sees which ticket.
// ?show=open | waiting comes from a dashboard number and lists the tickets behind it first (C203).
export default function TicketsPage({ searchParams = {} }: { searchParams?: { show?: string } }) {
  return (
    <ModulePage
      moduleId="raise-ticket"
      help="raise-a-ticket"
      tour="tickets"
      title="Support tickets"
      purpose="Ask for help and follow the answers."
      primary={
        <Link href="/app/help/ticket/new" className={PRIMARY_ACTION}>
          Raise a ticket
        </Link>
      }
    >
      {isTicketShow(searchParams.show) && <TicketsShown show={searchParams.show} />}
      <SchoolTicketList />
    </ModulePage>
  );
}
