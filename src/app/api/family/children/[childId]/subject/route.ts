import { NextRequest, NextResponse } from 'next/server';
import { changeFreeSubject } from '@/lib/family/learning';
import { SUBJECTS, type Subject } from '@/lib/family/modules';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';

// The parent changes a child's free subject (M1-6, C252), once the change window (a Control setting) has passed.
export async function POST(req: NextRequest, { params }: { params: { childId: string } }) {
  const subject = (await jsonBody(req)).subject;
  if (!SUBJECTS.includes(subject as Subject) || !/^[0-9a-f-]{36}$/i.test(params.childId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const g = await requireParent(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => {
    const r = await changeFreeSubject(db, g.session.accountId, params.childId, subject as Subject);
    return r === 'changed' ? NextResponse.json({ status: r }) : NextResponse.json({ error: r }, { status: r === 'not_found' ? 404 : 409 });
  });
}
