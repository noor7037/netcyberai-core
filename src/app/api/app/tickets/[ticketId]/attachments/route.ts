import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { jsonError, type AppClaims } from '@/lib/frameworks/route';
import { readScreenshot, respond, storageError, ticketStorage, tooLarge } from '@/lib/support/ticket-routes';
import { addTicketScreenshot } from '@/lib/support/tickets';

// POST multipart { file }: a screenshot (PNG, JPEG or WebP, at most 4 MB)
// on a ticket this person can see. The session is checked before any of
// the body is read, and the file is stored between two short transactions,
// never inside one.
export async function POST(req: NextRequest, { params }: { params: { ticketId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  const claims = guard.claims as AppClaims;
  if (tooLarge(req)) return jsonError(413, 'a screenshot must be an image of at most 4 MB');
  const file = await readScreenshot(req);
  if (!file) return jsonError(400, 'a screenshot must be an image of at most 4 MB');
  try {
    const access = await withTenantContext(claims, (db) => checkModuleAccess(db, claims, 'raise-ticket', { write: true }));
    if (!access.ok) return jsonError(access.status, access.error);
    const result = await addTicketScreenshot((fn) => withTenantContext(claims, fn), ticketStorage(), params.ticketId, file, { userId: claims.sub, role: claims.role, side: 'school' });
    return respond(result, 'attachment', 201);
  } catch (err) {
    return storageError(err) ?? sessionErrorResponse(err) ?? Promise.reject(err);
  }
}
