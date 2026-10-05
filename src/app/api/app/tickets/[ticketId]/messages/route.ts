import { NextRequest } from 'next/server';
import { jsonError, readJson } from '@/lib/frameworks/route';
import { respond, schoolTickets } from '@/lib/support/ticket-routes';
import { addTicketMessage } from '@/lib/support/tickets';

// POST { body }: the school's reply. A ticket waiting on the school goes
// back to in progress.
export async function POST(req: NextRequest, { params }: { params: { ticketId: string } }) {
  const body = await readJson(req);
  if (!body) return jsonError(400, 'a JSON body is required');
  return schoolTickets(req, async ({ db, actor }) => respond(await addTicketMessage(db, params.ticketId, body, actor), 'reply', 201));
}
