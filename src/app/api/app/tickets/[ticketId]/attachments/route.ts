import { NextRequest } from 'next/server';
import { jsonError } from '@/lib/frameworks/route';
import { readScreenshot, respond, schoolTickets, storageError, ticketStorage } from '@/lib/support/ticket-routes';
import { addTicketScreenshot } from '@/lib/support/tickets';

// POST multipart { file }: a screenshot (PNG, JPEG or WebP, at most 5 MB)
// on a ticket this person can see.
export async function POST(req: NextRequest, { params }: { params: { ticketId: string } }) {
  const file = await readScreenshot(req);
  if (!file) return jsonError(400, 'a screenshot must be an image of at most 5 MB');
  try {
    return await schoolTickets(req, async ({ db, actor }) => respond(await addTicketScreenshot(db, ticketStorage(), params.ticketId, file, actor), 'attachment', 201));
  } catch (err) {
    const resp = storageError(err);
    if (resp) return resp;
    throw err;
  }
}
