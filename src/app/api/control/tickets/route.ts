import { NextRequest, NextResponse } from 'next/server';
import { platformTickets } from '@/lib/support/ticket-routes';
import { listTickets } from '@/lib/support/tickets';

// The founder's ticket queue (C126): every school's tickets, newest
// activity first. ?status= and ?schoolId= narrow it.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  return platformTickets(req, async ({ db }) => NextResponse.json({ tickets: await listTickets(db, { status: q.get('status'), schoolId: q.get('schoolId'), allSchools: true }) }));
}
