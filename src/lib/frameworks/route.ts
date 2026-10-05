import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { withTenantContext } from '@/lib/auth/db';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import type { SessionClaims } from '@/lib/auth/types';
import type { SchoolRole } from '@/lib/contracts/modules';

// The shape every P1-b /api/app/** route shares (C112): a school session,
// one tenant-context transaction, and the session errors mapped to 401.
// A thrown error rolls the transaction back, so a handler that fails part
// way leaves nothing behind.

export type AppClaims = SessionClaims & { schoolId: string; role: SchoolRole };

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}): NextResponse {
  return NextResponse.json({ error, ...extra }, { status });
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

export async function appRoute(
  req: NextRequest,
  handler: (ctx: { claims: AppClaims; db: PoolClient }) => Promise<NextResponse>
): Promise<NextResponse> {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  const claims = guard.claims as AppClaims;
  try {
    return await withTenantContext(claims, (db) => handler({ claims, db }));
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

// The same for /api/control/**: a platform admin's session, one transaction
// as nca_super.
export async function controlRoute(
  req: NextRequest,
  handler: (ctx: { claims: SessionClaims; db: PoolClient }) => Promise<NextResponse>
): Promise<NextResponse> {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  try {
    return await withTenantContext(guard.claims, (db) => handler({ claims: guard.claims, db }));
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
