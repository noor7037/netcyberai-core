import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/frameworks/route';
import { schoolTickets } from '@/lib/support/ticket-routes';
import { getTicket } from '@/lib/support/tickets';

// One ticket with its replies and screenshots, if this person can see it.
export async function GET(req: NextRequest, { params }: { params: { ticketId: string } }) {
  return schoolTickets(req, async ({ db }) => {
    const ticket = await getTicket(db, params.ticketId);
    return ticket ? NextResponse.json({ ticket }) : jsonError(404, 'ticket not found');
  });
}
