import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import type { SessionClaims } from '@/lib/auth/types';
import { TICKET_SCREENSHOT_MAX_BYTES } from '@/lib/contracts/tickets';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { appRoute, controlRoute, jsonError, type AppClaims } from '@/lib/frameworks/route';
import { FileStorageUnavailableError, type FileStorage } from '@/lib/storage/file-storage';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';
import type { TicketActor, TicketResult } from './tickets';

// What the school routes (/api/app/tickets/**) and the founder's
// (/api/control/tickets/**) share: the session, the actor's side, and how a
// result becomes a response.

export type TicketCtx = { db: PoolClient; actor: TicketActor; schoolId: string | null; allSchools: boolean };

// A school session. Raise Ticket is always on (17 §2), in every access
// mode, so a read-only or suspended school can still ask for help; the role
// check is the registry's (every school role).
export function schoolTickets(req: NextRequest, handler: (ctx: TicketCtx & { claims: AppClaims; schoolId: string }) => Promise<NextResponse>) {
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, 'raise-ticket', { write: true });
    if (!access.ok) return jsonError(access.status, access.error);
    return handler({ db, claims, actor: { userId: claims.sub, role: claims.role, side: 'school' }, schoolId: claims.schoolId, allSchools: false });
  });
}

export function platformTickets(req: NextRequest, handler: (ctx: TicketCtx & { claims: SessionClaims }) => Promise<NextResponse>) {
  return controlRoute(req, ({ claims, db }) => handler({ db, claims, actor: { userId: claims.sub, role: claims.role, side: 'platform' }, schoolId: null, allSchools: true }));
}

export function respond<T>(r: TicketResult<T>, key: string, okStatus = 200): NextResponse {
  return r.ok ? NextResponse.json({ [key]: r.value }, { status: okStatus }) : jsonError(r.status, r.error);
}

let storage: FileStorage = supabaseFileStorage;
export const ticketStorage = () => storage;
// Tests swap the store; nothing else calls this.
export function setTicketStorage(s: FileStorage) {
  storage = s;
}

export function storageError(err: unknown): NextResponse | null {
  return err instanceof FileStorageUnavailableError ? jsonError(503, 'screenshots cannot be stored yet; send the ticket without one') : null;
}

// The uploaded file of a multipart request, bounded before it is read.
export async function readScreenshot(req: NextRequest): Promise<{ name: string; bytes: Uint8Array } | null> {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string' || file.size === 0 || file.size > TICKET_SCREENSHOT_MAX_BYTES) return null;
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}
