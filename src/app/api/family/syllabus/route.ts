import { NextRequest, NextResponse } from 'next/server';
import { checkChapters, checkSyllabusRequest, confirmSyllabus, deleteSyllabus, isUuid, PROBLEM_STATUS } from '@/lib/family/child-syllabus';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';

// A parent's own syllabus for a child (C230-AB), in parent mode only.
//   POST   { childId, subject, syllabusId?, chapters: [{ title, topics: [{ title }] }] } saves the parent's checked list:
//          the draft (or the saved syllabus being edited) named by syllabusId, or a typed one without it. It replaces
//          any other syllabus of that child and subject, and only now does the child see it in Study.
//   DELETE { syllabusId } removes a draft or a saved syllabus. Allowed without study_core, so a parent who withdrew it
//          can still remove what they gave.
// Every query names the session's account; the family row level security holds it too. No AI here.
export const dynamic = 'force-dynamic';

const refuse = (reason: keyof typeof PROBLEM_STATUS) => NextResponse.json({ error: reason }, { status: PROBLEM_STATUS[reason] });

export async function POST(req: NextRequest) {
  const body = await jsonBody(req);
  const p = await requireParent(req);
  if (p.error) return p.error;
  const syllabusId = body.syllabusId ?? null;
  if (!isUuid(body.childId) || typeof body.subject !== 'string' || (syllabusId !== null && !isUuid(syllabusId))) return refuse('bad_request');
  const childId = body.childId;
  const subject = body.subject;
  const list = checkChapters(body.chapters);
  if (!list.ok) return refuse(list.reason);
  const accountId = p.session.accountId;
  return familyRun(p.session, async (db) => {
    const checked = await checkSyllabusRequest(db, accountId, { childId, subject });
    if (!checked.ok) return refuse(checked.reason);
    const saved = await confirmSyllabus(db, accountId, { childId, subject, syllabusId, chapters: list.chapters });
    if (saved === 'not_found') return refuse('not_found');
    return NextResponse.json({ syllabus: saved });
  });
}

export async function DELETE(req: NextRequest) {
  const body = await jsonBody(req);
  const p = await requireParent(req);
  if (p.error) return p.error;
  const syllabusId = body.syllabusId;
  if (!isUuid(syllabusId)) return refuse('bad_request');
  return familyRun(p.session, async (db) => ((await deleteSyllabus(db, p.session.accountId, syllabusId)) ? NextResponse.json({ ok: true }) : refuse('not_found')));
}
