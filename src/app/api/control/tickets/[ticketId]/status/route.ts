import { NextRequest } from 'next/server';
import { jsonError, readJson } from '@/lib/frameworks/route';
import { platformTickets, respond } from '@/lib/support/ticket-routes';
import { changeTicketStatus } from '@/lib/support/tickets';

// POST { to }: the founder moves a ticket along the status machine.
export async function POST(req: NextRequest, { params }: { params: { ticketId: string } }) {
  const body = await readJson(req);
  if (!body) return jsonError(400, 'a JSON body is required');
  return platformTickets(req, async ({ db, actor }) => respond(await changeTicketStatus(db, params.ticketId, body.to, actor), 'ticket'));
}
