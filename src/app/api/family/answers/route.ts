import { NextRequest, NextResponse } from 'next/server';
import { deleteAllAnswers, deleteAnswer, listAnswers } from '@/lib/family/account';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';

// See and delete a child's answers (feature P2): the parent's, in parent mode. Progress made of a deleted answer goes
// with it.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
  const childId = req.nextUrl.searchParams.get('childId') ?? '';
  if (!UUID.test(childId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const g = await requireParent(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => NextResponse.json({ answers: await listAnswers(db, g.session.accountId, childId) }));
}

export async function DELETE(req: NextRequest) {
  const body = await jsonBody(req);
  const g = await requireParent(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => {
    if (typeof body.attemptId === 'string' && UUID.test(body.attemptId)) {
      return (await deleteAnswer(db, g.session.accountId, body.attemptId)) ? NextResponse.json({ deleted: 1 }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    if (body.all === true && typeof body.childId === 'string' && UUID.test(body.childId)) {
      return NextResponse.json({ deleted: await deleteAllAnswers(db, g.session.accountId, body.childId) });
    }
    return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  });
}
