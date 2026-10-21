import { NextResponse, type NextRequest } from 'next/server';
import { verifyStepUpToken } from './jwt';
import type { SessionClaims } from './types';

// Step-up for sensitive actions (F1-1b, C260): saving or replacing any credential (AI, payments, WhatsApp), viewing as
// a school, and the founder's actions on another person's sign-in ask for the authenticator again (the password and
// an emailed code for an account without one), and the proof lasts 15 minutes. Nothing else asks again. The proof is
// a short signed token in its own cookie, bound to the person and their token_version, so "sign out everywhere" or a
// password reset ends it. It is not bound to the session id, which rotates at every refresh.
export const STEP_UP_COOKIE = 'nca_step_up';
export const STEP_UP_TTL_SECONDS = 15 * 60;

export async function steppedUp(token: string | undefined, claims: Pick<SessionClaims, 'sub' | 'tokenVersion' | 'impersonation'>): Promise<boolean> {
  if (!token || claims.impersonation) return false;
  const proof = await verifyStepUpToken(token);
  return !!proof && proof.userId === claims.sub && proof.tokenVersion === claims.tokenVersion;
}

// What a sensitive route calls after its own guard: null when the person stepped up in the last 15 minutes, else the
// answer the screen turns into the step-up dialog ('authenticator', or 'email' for an account without one).
export async function requireStepUp(req: NextRequest, claims: SessionClaims): Promise<NextResponse | null> {
  if (await steppedUp(req.cookies.get(STEP_UP_COOKIE)?.value, claims)) return null;
  return NextResponse.json(
    { error: 'step_up_required', method: claims.aal === 'aal2' ? 'authenticator' : 'email' },
    { status: 403, headers: { 'Cache-Control': 'no-store' } }
  );
}
