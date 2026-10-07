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
  // A refusal carries its catalogue rule, so the screen can say it in the person's language.
  return r.ok ? NextResponse.json({ [key]: r.value }, { status: okStatus }) : jsonError(r.status, r.error, r.code ? { code: r.code, params: r.params ?? {} } : {});
}

export const ticketStorage = (): FileStorage => supabaseFileStorage;

export function storageError(err: unknown): NextResponse | null {
  return err instanceof FileStorageUnavailableError ? jsonError(503, 'screenshots cannot be stored yet; send the ticket without one') : null;
}

// A request body larger than a screenshot plus its form wrapping is refused
// from its declared length, before any of it is read.
export function tooLarge(req: NextRequest): boolean {
  const declared = Number(req.headers.get('content-length'));
  return !Number.isFinite(declared) || declared <= 0 || declared > TICKET_SCREENSHOT_MAX_BYTES + 64 * 1024;
}

// A body with no declared length, or none at all, carries no file.
export function noBody(req: NextRequest): boolean {
  const declared = Number(req.headers.get('content-length'));
  return !Number.isFinite(declared) || declared <= 0;
}

// The uploaded file of a multipart request. Call only after the session
// check and tooLarge().
// 'missing': no file, or an empty one. 'too_large': over the limit.
export async function readScreenshot(req: NextRequest): Promise<{ name: string; bytes: Uint8Array } | 'missing' | 'too_large'> {
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!file || typeof file === 'string' || file.size === 0) return 'missing';
  if (file.size > TICKET_SCREENSHOT_MAX_BYTES) return 'too_large';
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}
