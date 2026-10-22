import { NextRequest, NextResponse } from 'next/server';
import { classSubjects } from '@/lib/family/catalog';
import { listChildren, syllabusBoardOf } from '@/lib/family/children';
import { changeFreeSubject } from '@/lib/family/learning';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';
import { isSubject } from '@/lib/family/subjects';

// The parent changes a child's free subject (M1-6, C252), once the change window (a Control setting) has passed. Only a
// subject of the child's class (C264).
export async function POST(req: NextRequest, { params }: { params: { childId: string } }) {
  const subject = (await jsonBody(req)).subject;
  if (!isSubject(subject) || !/^[0-9a-f-]{36}$/i.test(params.childId)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const g = await requireParent(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => {
    const child = (await listChildren(db, g.session.accountId)).find((c) => c.childId === params.childId);
    if (!child) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!(await classSubjects(db, { board: syllabusBoardOf(child), classLevel: child.classLevel })).includes(subject)) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
    const r = await changeFreeSubject(db, g.session.accountId, params.childId, subject);
    return r === 'changed' ? NextResponse.json({ status: r }) : NextResponse.json({ error: r }, { status: r === 'not_found' ? 404 : 409 });
  });
}
