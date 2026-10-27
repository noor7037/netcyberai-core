import { NextRequest, NextResponse } from 'next/server';
import { SOURCE_MODES, setSourceMode, type SourceMode } from '@/lib/family/chapter-requests';
import { checkSyllabusRequest, isUuid, PROBLEM_STATUS } from '@/lib/family/child-syllabus';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';

// Which source a child's subject reads in Study (S3, C376), in parent mode only: the board's catalog, the school's own
// syllabus, or the parent's own upload.
//   POST { childId, subject, mode: 'catalog' | 'school' | 'parent' | null }   null returns to showing every source
// Own account only (the family row level security holds it too). A choice changes what Study lists, never what exists.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const p = await requireParent(req);
  if (p.error) return p.error;
  const mode = body.mode === null ? null : (SOURCE_MODES as readonly unknown[]).includes(body.mode) ? (body.mode as SourceMode) : undefined;
  if (!isUuid(body.childId) || typeof body.subject !== 'string' || mode === undefined) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const childId = body.childId;
  const subject = body.subject;
  const accountId = p.session.accountId;
  return familyRun(p.session, async (db) => {
    const checked = await checkSyllabusRequest(db, accountId, { childId, subject });
    if (!checked.ok) return NextResponse.json({ error: checked.reason }, { status: PROBLEM_STATUS[checked.reason] });
    return (await setSourceMode(db, accountId, childId, subject, mode)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_ready' }, { status: 503 });
  });
}
