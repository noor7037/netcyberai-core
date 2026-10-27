import { NextRequest, NextResponse } from 'next/server';
import { boardIsOffered, checkChild, removeChild, updateChild } from '@/lib/family/children';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';
import { RequestFileError, removeRequestFilesOf } from '@/lib/family/chapter-requests';
import { TutorStorageError, removeTutorFilesOf, tutorStorage } from '@/lib/family/tutor';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// Change or remove a child: the parent's, in parent mode. Removing a child removes its answers and progress.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: { params: { childId: string } }) {
  if (!UUID.test(params.childId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const checked = checkChild(await jsonBody(req), 'shape');
  if (!checked.ok) return NextResponse.json({ error: 'invalid', problems: checked.problems }, { status: 400 });
  const g = await requireParent(req);
  if (g.error) return g.error;
  return familyRun(g.session, async (db) => {
    // The board must be one the database offers (content.boards), not only well formed (S4).
    if (!(await boardIsOffered(db, checked.child.board))) return NextResponse.json({ error: 'invalid', problems: ['board'] }, { status: 400 });
    const child = await updateChild(db, g.session.accountId, params.childId, checked.child);
    return child ? NextResponse.json({ child }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { childId: string } }) {
  if (!UUID.test(params.childId)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const g = await requireParent(req);
  if (g.error) return g.error;
  // The child's tutor files (S2, C375) leave the private bucket in the same transaction; if it cannot be reached,
  // nothing is removed (503).
  try {
    return await familyRun(g.session, async (db) => {
      await removeTutorFilesOf(db, tutorStorage, g.session.accountId, params.childId);
      // S3 (C376): the parent's chapter request PDFs too.
      await removeRequestFilesOf(db, supabaseFileStorage, g.session.accountId, params.childId);
      return (await removeChild(db, g.session.accountId, params.childId)) ? NextResponse.json({ status: 'removed' }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
    });
  } catch (err) {
    if (err instanceof TutorStorageError || err instanceof RequestFileError) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
    throw err;
  }
}
