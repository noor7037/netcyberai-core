import { NextRequest, NextResponse } from 'next/server';
import { familyRead, familyRun, requireFamily } from '@/lib/family/request';
import { FAMILY_CHILD_COOKIE, FAMILY_PARENT_COOKIE, verifyParentMode } from '@/lib/family/session';
import { finishTutorUpload, isUuid, pendingUpload, readTutorArrival, removeUnsentFile, signedTutorFile, TutorStorageError, tutorChild, tutorStorage } from '@/lib/family/tutor';

// One tutor file (S2, C375).
//   POST    confirm it once sent: the server reads what arrived (size, first bytes, the Aadhaar check) and keeps it, or
//           takes it away (step 3 of src/lib/family/tutor.ts).
//   GET     the file, as a redirect to a signed link that works for one minute: for the child this phone chose, or, in
//           parent mode, for any child of this account (the Learning Vault). Never a public address.
//   DELETE  take back a file not sent yet.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Params = { params: { attachmentId: string } };
const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });

export async function POST(req: NextRequest, { params }: Params) {
  if (!isUuid(params.attachmentId)) return notFound();
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  // 1. This child's own pending row, in a short transaction.
  const found = await familyRead(g.session, async (db) => {
    const who = await tutorChild(db, g.session.accountId, chosen, true);
    if (!who.ok) return { who, row: null };
    return { who, row: await pendingUpload(db, { accountId: g.session.accountId, childId: who.child.childId }, params.attachmentId) };
  });
  if (!found) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 });
  if (!found.who.ok) return NextResponse.json({ error: found.who.error }, { status: found.who.status });
  if (!found.row) return notFound();
  if (found.row.status === 'ready') return NextResponse.json({ ok: true });
  const childId = found.who.child.childId;
  // 2. What arrived, read and checked with no transaction held.
  const arrival = await readTutorArrival(tutorStorage, found.row);
  // 3. Kept or taken away, in a second one.
  try {
    return await familyRun(g.session, async (db) => {
      const done = await finishTutorUpload(db, tutorStorage, { accountId: g.session.accountId, childId }, params.attachmentId, arrival);
      if (done.ok) return NextResponse.json({ ok: true });
      return NextResponse.json({ error: done.reason }, { status: done.reason === 'storage_unavailable' ? 503 : done.reason === 'not_found' ? 404 : 400 });
    });
  } catch (e) {
    if (e instanceof TutorStorageError) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
    throw e;
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  if (!isUuid(params.attachmentId)) return notFound();
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  // Parent mode (behind the PIN, never on a child's own phone) may open any child's file of this account.
  const parent = !g.session.device && (await verifyParentMode(req.cookies.get(FAMILY_PARENT_COOKIE)?.value, g.session));
  return familyRun(g.session, async (db) => {
    let childId: string | null = null;
    if (!parent) {
      const who = await tutorChild(db, g.session.accountId, chosen);
      if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status });
      childId = who.child.childId;
    }
    let url: string | null;
    try {
      url = await signedTutorFile(db, tutorStorage, g.session.accountId, childId, params.attachmentId);
    } catch {
      return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
    }
    if (!url) return notFound();
    const res = NextResponse.redirect(url, 302);
    res.headers.set('Cache-Control', 'no-store');
    res.headers.set('Referrer-Policy', 'no-referrer');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  if (!isUuid(params.attachmentId)) return notFound();
  const g = await requireFamily(req);
  if (g.error) return g.error;
  const chosen = req.cookies.get(FAMILY_CHILD_COOKIE)?.value;
  // A store that fails throws out of the transaction, so the row's removal rolls back with it: the row stays and
  // the file is still found by a later take-back, the Vault's clear or the account's removal (security review, S2).
  try {
    return await familyRun(g.session, async (db) => {
      const who = await tutorChild(db, g.session.accountId, chosen);
      if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status });
      return (await removeUnsentFile(db, tutorStorage, { accountId: g.session.accountId, childId: who.child.childId }, params.attachmentId)) ? NextResponse.json({ ok: true }) : notFound();
    });
  } catch (e) {
    if (e instanceof TutorStorageError) return NextResponse.json({ error: 'storage_unavailable' }, { status: 503 });
    throw e;
  }
}
