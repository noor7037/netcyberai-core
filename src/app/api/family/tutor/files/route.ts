import { NextRequest, NextResponse } from 'next/server';
import { familyRun, jsonBody, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE } from '@/lib/family/session';
import { askTutorUpload, tutorChild, tutorStorage } from '@/lib/family/tutor';
import { TUTOR_READS_FILES } from '@/lib/family/tutor-shape';

// Attach a file to a tutor question (S2, C375), step 1: POST { subject, mime, size, name } → { attachmentId, uploadUrl,
// contentType, maxBytes }. The phone then sends the file to the link and confirms it (files/<attachmentId>, POST).
// A photo or PDF, at most 10 MB, with the parent's study and photo consents, for the child this phone chose.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const g = await requireFamily(req);
  if (g.error) return g.error;
  // C230-AR: no file is taken while the tutor cannot read it.
  if (!TUTOR_READS_FILES) return NextResponse.json({ error: 'files_not_read_yet' }, { status: 403 });
  const body = await jsonBody(req);
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  return familyRun(g.session, async (db) => {
    const who = await tutorChild(db, g.session.accountId, chosen, true);
    if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status });
    const asked = await askTutorUpload(db, tutorStorage, { accountId: g.session.accountId, childId: who.child.childId }, { subject: body.subject, mime: body.mime, size: body.size, name: body.name });
    if (!asked.ok) return NextResponse.json({ error: asked.reason }, { status: asked.reason === 'storage_unavailable' ? 503 : asked.reason === 'too_many_files' ? 429 : 400 });
    return NextResponse.json(asked);
  });
}
