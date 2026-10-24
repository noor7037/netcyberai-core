import { NextRequest, NextResponse } from 'next/server';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';
import { NOTIFY_KINDS, setNotify, type NotifyKind } from '@/lib/family/school';

// What the app tells the parent about (C338): each kind on or off. Body: { kind, on }. An off kind is not counted as
// new, and never pushed.
export async function POST(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  if (!(NOTIFY_KINDS as readonly unknown[]).includes(body.kind) || typeof body.on !== 'boolean') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const kind = body.kind as NotifyKind;
  const on = body.on;
  return familyRun(g.session, async (db) => {
    await setNotify(db, g.session.accountId, kind, on);
    return NextResponse.json({ ok: true });
  });
}
