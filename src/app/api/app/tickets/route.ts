import { NextRequest } from 'next/server';
import { jsonError, readJson } from '@/lib/frameworks/route';
import { respond, schoolTickets } from '@/lib/support/ticket-routes';
import { createTicket, listTickets } from '@/lib/support/tickets';

// Raise Ticket (C126). GET: the tickets this person can see (the office:
// every ticket of the school; anyone else: their own). POST { subject,
// body, category, moduleId? } raises one.
export async function GET(req: NextRequest) {
  return schoolTickets(req, async ({ db }) => respond(await listTickets(db, { status: req.nextUrl.searchParams.get('status') }), 'tickets'));
}

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return jsonError(400, 'a JSON body is required');
  return schoolTickets(req, async ({ db, actor, schoolId }) => respond(await createTicket(db, { ...actor, schoolId }, body), 'ticket', 201));
}
