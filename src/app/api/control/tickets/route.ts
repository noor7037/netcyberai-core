import { NextRequest } from 'next/server';
import { platformTickets, respond } from '@/lib/support/ticket-routes';
import { listTickets } from '@/lib/support/tickets';

// The founder's ticket queue (C126): every school's tickets, newest
// activity first. ?status= and ?schoolId= narrow it; a value that is not one is refused.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  return platformTickets(req, async ({ db }) => respond(await listTickets(db, { status: q.get('status'), schoolId: q.get('schoolId'), allSchools: true }), 'tickets'));
}
