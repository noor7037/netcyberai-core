import { NextRequest, NextResponse } from 'next/server';
import { deleteAccount } from '@/lib/family/account';
import { clearFamilyCookies, familyRun, jsonBody, requireParent } from '@/lib/family/request';
import { RequestFileError, removeRequestFilesOf } from '@/lib/family/chapter-requests';
import { TutorStorageError, removeTutorFilesOf, tutorStorage } from '@/lib/family/tutor';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// Delete the family's account (DPDP erasure): every family row of it goes, in one transaction. The parent confirms by
// typing the word the screen asks for, in parent mode. The tutor's files (S2, C375) are removed from the private bucket
// first, in the same transaction: if the bucket cannot be reached, nothing is deleted (503) and the parent tries again.
export async function DELETE(req: NextRequest) {
  if ((await jsonBody(req)).confirm !== 'DELETE') return NextResponse.json({ error: 'confirm' }, { status: 400 });
  const g = await requireParent(req);
  if (g.error) return g.error;
  let res: NextResponse;
  try {
    res = await familyRun(g.session, async (db) => {
      await removeTutorFilesOf(db, tutorStorage, g.session.accountId, null);
      // S3 (C376): the parent's chapter request PDFs too.
      await removeRequestFilesOf(db, supabaseFileStorage, g.session.accountId, null);
      return (await deleteAccount(db, g.session.accountId)) ? NextResponse.json({ status: 'deleted' }) : NextResponse.json({ error: 'not_found' }, { status: 404 });
    });
  } catch (err) {
    if (err instanceof TutorStorageError || err instanceof RequestFileError) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
    throw err;
  }
  return res.status === 200 ? clearFamilyCookies(res) : res;
}
