import { NextRequest, NextResponse } from 'next/server';
import type { PoolClient } from 'pg';
import { FamilySessionRevokedError, withFamilyContext } from './db';
import {
  FAMILY_CHILD_COOKIE,
  FAMILY_CODE_COOKIE,
  FAMILY_PARENT_COOKIE,
  FAMILY_SESSION_COOKIE,
  familyCookieOptions,
  verifyFamilySession,
  verifyParentMode,
  type FamilySession,
} from './session';

// The guard of every /api/family/** route (M1-2, C248). It reads the family's own cookie and nothing else: a staff
// session (nca_access) is never looked at, so it is refused here, and staff routes never read ncf_session, so a family
// session is refused there. Parent-only actions (settings, consents, children, answers, deleting the account) also need
// parent mode, which only the parent PIN opens (docs/34 §9.1 rule 1).

export type FamilyGuard = { session: FamilySession; error?: undefined } | { session?: undefined; error: NextResponse };

export async function requireFamily(req: NextRequest): Promise<FamilyGuard> {
  const session = await verifyFamilySession(req.cookies.get(FAMILY_SESSION_COOKIE)?.value);
  if (!session) return { error: NextResponse.json({ error: 'not_signed_in' }, { status: 401 }) };
  return { session };
}

export async function requireParent(req: NextRequest): Promise<FamilyGuard> {
  const g = await requireFamily(req);
  if (g.error) return g;
  if (!(await verifyParentMode(req.cookies.get(FAMILY_PARENT_COOKIE)?.value, g.session))) {
    return { error: NextResponse.json({ error: 'parent_pin_required' }, { status: 403 }) };
  }
  return g;
}

export function clearFamilyCookies(res: NextResponse): NextResponse {
  for (const name of [FAMILY_SESSION_COOKIE, FAMILY_PARENT_COOKIE, FAMILY_CODE_COOKIE, FAMILY_CHILD_COOKIE]) res.cookies.set(name, '', familyCookieOptions(0));
  return res;
}

// Run in the account's own transaction. A session whose account was deleted or signed out everywhere answers 401 and
// loses its cookies.
export async function familyRun(session: FamilySession, fn: (db: PoolClient) => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await withFamilyContext({ accountId: session.accountId, tokenVersion: session.tokenVersion }, fn);
  } catch (err) {
    if (err instanceof FamilySessionRevokedError) return clearFamilyCookies(NextResponse.json({ error: 'not_signed_in' }, { status: 401 }));
    throw err;
  }
}

export async function jsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}

// A value from the account's own transaction, for a route that must call another door afterwards (one connection at
// a time). null when the session was revoked.
export async function familyRead<T>(session: FamilySession, fn: (db: PoolClient) => Promise<T>): Promise<T | null> {
  try {
    return await withFamilyContext({ accountId: session.accountId, tokenVersion: session.tokenVersion }, fn);
  } catch (err) {
    if (err instanceof FamilySessionRevokedError) return null;
    throw err;
  }
}
