import { NextRequest } from 'next/server';
import { jsonError, readJson } from '@/lib/frameworks/route';
import { respond, schoolTickets } from '@/lib/support/ticket-routes';
import { changeTicketStatus } from '@/lib/support/tickets';

// POST { to }: the school confirms a resolved ticket closed ('closed'), or
// reopens a resolved or closed one ('open'). A ticket waiting on the school
// is answered with a reply, not here.
export async function POST(req: NextRequest, { params }: { params: { ticketId: string } }) {
  const body = await readJson(req);
  if (!body) return jsonError(400, 'a JSON body is required');
  return schoolTickets(req, async ({ db, actor }) => respond(await changeTicketStatus(db, params.ticketId, body.to, actor), 'ticket'));
}
