import { NextRequest } from 'next/server';
import { jsonError, readJson } from '@/lib/frameworks/route';
import { platformTickets, respond } from '@/lib/support/ticket-routes';
import { addTicketMessage } from '@/lib/support/tickets';

// POST { body, thenStatus? }: NetCyberAI's reply, optionally setting the
// status with it (for example 'waiting_on_school' with a question).
export async function POST(req: NextRequest, { params }: { params: { ticketId: string } }) {
  const body = await readJson(req);
  if (!body) return jsonError(400, 'a JSON body is required');
  return platformTickets(req, async ({ db, actor }) => respond(await addTicketMessage(db, params.ticketId, body, actor), 'reply', 201));
}
