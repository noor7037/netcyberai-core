import { NextRequest } from 'next/server';
import { jsonError, readJson } from '@/lib/frameworks/route';
import { kickJobs } from '@/lib/jobs/handlers';
import { jobQueue } from '@/lib/jobs/pg-queue';
import { respond, schoolTickets } from '@/lib/support/ticket-routes';
import { createTicket, listTickets } from '@/lib/support/tickets';

// Raise Ticket (C126). GET: the tickets this person can see (the office:
// every ticket of the school; anyone else: their own). POST { subject,
// body, category, moduleId? } raises one and tells NetCyberAI by email
// (school name, category and a link; never the ticket's words).
export async function GET(req: NextRequest) {
  return schoolTickets(req, async ({ db }) => respond(await listTickets(db, { status: req.nextUrl.searchParams.get('status') }), 'tickets'));
}

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return jsonError(400, 'a JSON body is required');
  let jobKey: string | undefined;
  const res = await schoolTickets(req, async ({ db, actor, schoolId }) => {
    const r = await createTicket(db, { ...actor, schoolId }, body, jobQueue);
    if (!r.ok) return respond(r, 'ticket');
    const { jobKey: key, ...ticket } = r.value;
    jobKey = key;
    return respond({ ok: true, value: ticket }, 'ticket', 201);
  });
  // After the commit: tell NetCyberAI now; the sweeper retries if this fails.
  if (jobKey) await kickJobs([jobKey]);
  return res;
}
