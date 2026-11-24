import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession } from '@/lib/auth/require-app-session';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { listRequests } from '@/lib/agent/requests';

// The school's change requests this person may see (C546): their own, or every one for the principal and the office.
export async function GET(req: NextRequest) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  try {
    return NextResponse.json({ requests: await listRequests(guard.claims) });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
