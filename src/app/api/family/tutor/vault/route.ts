import { NextRequest, NextResponse } from 'next/server';
import { familyRun, jsonBody, requireParent } from '@/lib/family/request';
import { TutorStorageError, clearConversation, tutorStorage } from '@/lib/family/tutor';

// The Learning Vault's "clear" (S2, C375): DELETE { conversationId } in parent mode (behind the PIN, never on a child's
// own phone). The conversation's questions, answers and files go; the files are removed from the private bucket in the
// same transaction, and if the bucket cannot be reached nothing is cleared (503), so the parent can try again.
export const dynamic = 'force-dynamic';

export async function DELETE(req: NextRequest) {
  const g = await requireParent(req);
  if (g.error) return g.error;
  const body = await jsonBody(req);
  try {
    return await familyRun(g.session, async (db) =>
      (await clearConversation(db, tutorStorage, g.session.accountId, body.conversationId)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'not_found' }, { status: 404 })
    );
  } catch (err) {
    if (err instanceof TutorStorageError) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
    throw err;
  }
}
