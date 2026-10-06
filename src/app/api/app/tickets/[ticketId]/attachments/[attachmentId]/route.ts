import { NextRequest, NextResponse } from 'next/server';
import { jsonError } from '@/lib/frameworks/route';
import { schoolTickets, storageError, ticketStorage } from '@/lib/support/ticket-routes';
import { ticketScreenshotUrl } from '@/lib/support/tickets';

// GET: a link to one screenshot, valid for five minutes, only if this person can see the ticket.
export async function GET(req: NextRequest, { params }: { params: { ticketId: string; attachmentId: string } }) {
  try {
    return await schoolTickets(req, async ({ db }) => {
      const url = await ticketScreenshotUrl(db, ticketStorage(), params.ticketId, params.attachmentId);
      return url ? NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } }) : jsonError(404, 'screenshot not found');
    });
  } catch (err) {
    const resp = storageError(err);
    if (resp) return resp;
    throw err;
  }
}
