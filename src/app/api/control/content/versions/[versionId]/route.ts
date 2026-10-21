import { NextRequest, NextResponse } from 'next/server';
import { asLiveStaff } from '@/lib/control/billing-route';
import { approveVersion, previewVersion, rejectVersion, releaseVersion, rollBackVersion, type ReviewResult } from '@/lib/content/library';
import { isVersionId, NO_STORE, requireContentStaff } from '@/lib/content/route';

// One syllabus version in Control → Content (M1-4, docs/family-app/10 §4.2, §7; docs/34 §10).
//   GET   the staff preview: units, chapters and topics as a family will see them, both titles
//   POST  { action: 'approve' }                 by a super_admin who did not import it; to staff preview
//         { action: 'reject', note }            with a note
//         { action: 'release' }                 staff preview → everyone
//         { action: 'rollback' }                the version everyone has → withdrawn; the one before → everyone
export const dynamic = 'force-dynamic';

const STATUS: Record<string, number> = { not_found: 404, note_needed: 400, own_import: 403 };

export async function GET(req: NextRequest, { params }: { params: { versionId: string } }) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  if (!isVersionId(params.versionId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const run = await asLiveStaff(guard.claims, (db) => previewVersion(db, { userId: guard.claims.sub }, params.versionId));
  if ('refused' in run) return run.refused;
  if (!run.value) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(run.value, { headers: NO_STORE });
}

export async function POST(req: NextRequest, { params }: { params: { versionId: string } }) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  const action = typeof b === 'object' && b !== null ? b.action : undefined;
  if (!isVersionId(params.versionId) || !['approve', 'reject', 'release', 'rollback'].includes(action)) {
    return NextResponse.json({ error: 'not sent properly' }, { status: 400 });
  }
  const actor = { userId: guard.claims.sub };
  const id = params.versionId;
  const run = await asLiveStaff(guard.claims, (db): Promise<ReviewResult> => {
    if (action === 'approve') return approveVersion(db, actor, id);
    if (action === 'reject') return rejectVersion(db, actor, id, typeof b.note === 'string' ? b.note : '');
    if (action === 'release') return releaseVersion(db, actor, id);
    return rollBackVersion(db, actor, id);
  });
  if ('refused' in run) return run.refused;
  const r = run.value;
  if (r.ok) return NextResponse.json(r, { headers: NO_STORE });
  return NextResponse.json({ error: 'not done', code: r.reason }, { status: STATUS[r.reason] ?? 409, headers: NO_STORE });
}
