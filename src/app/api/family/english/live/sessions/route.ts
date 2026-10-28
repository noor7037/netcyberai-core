import { NextRequest, NextResponse } from 'next/server';
import { listChildren } from '@/lib/family/children';
import { clearSession, parentSessions } from '@/lib/family/english/live';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';

// The parent's view of a child's live English practice (E1, C382), in parent mode only: GET ?childId= lists the last
// twenty sessions with the child's corrected words and the tutor's replies; DELETE { sessionId } clears one (its turns
// go with it). Open even when the course or a consent is switched off, so a parent can always see and clear what was
// kept. Own account only (the tables' policies, and the child must be the account's own).
export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const session = g.session;
  const childId = req.nextUrl.searchParams.get('childId');
  try {
    return await familyRun(session, async (db) => {
      const child = (await listChildren(db, session.accountId)).find((c) => c.childId === childId);
      if (!child) return fail('no_child', 404);
      return NextResponse.json({ sessions: await parentSessions(db, session.accountId, child.childId) });
    });
  } catch {
    return fail('failed', 503);
  }
}

export async function DELETE(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const session = g.session;
  const body = await jsonBody(req);
  try {
    return await familyRun(session, async (db) => ((await clearSession(db, session.accountId, body.sessionId)) ? NextResponse.json({ ok: true }) : fail('not_found', 404)));
  } catch {
    return fail('failed', 503);
  }
}
