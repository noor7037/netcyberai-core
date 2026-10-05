import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/frameworks/route';
import { platformTickets } from '@/lib/support/ticket-routes';
import { getTicket } from '@/lib/support/tickets';

export async function GET(req: NextRequest, { params }: { params: { ticketId: string } }) {
  return platformTickets(req, async ({ db }) => {
    const ticket = await getTicket(db, params.ticketId, { allSchools: true });
    return ticket ? NextResponse.json({ ticket }) : jsonError(404, 'ticket not found');
  });
}
