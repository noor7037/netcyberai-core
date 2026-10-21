import { NextRequest, NextResponse } from 'next/server';
import { asLiveStaff } from '@/lib/control/billing-route';
import {
  approveEnglishVersion,
  previewEnglishVersion,
  rejectEnglishVersion,
  releaseEnglishVersion,
  rollBackEnglishVersion,
} from '@/lib/content/english-library';
import type { ReviewResult } from '@/lib/content/library';
import { isVersionId, NO_STORE, requireContentStaff } from '@/lib/content/route';

// One English course version in Control → Content (docs/family-app/12 §11, C274), as for syllabus versions:
//   GET   the staff preview: every unit and every lesson as the file holds it
//   POST  { action: 'approve' | 'reject' (with note) | 'release' | 'rollback' }
export const dynamic = 'force-dynamic';

const STATUS: Record<string, number> = { not_found: 404, note_needed: 400, own_import: 403 };

export async function GET(req: NextRequest, { params }: { params: { versionId: string } }) {
  const guard = await requireContentStaff(req);
  if ('error' in guard) return guard.error;
  if (!isVersionId(params.versionId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const run = await asLiveStaff(guard.claims, (db) => previewEnglishVersion(db, params.versionId));
  if ('refused' in run) return run.refused;
  if (!run.value) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ units: run.value }, { headers: NO_STORE });
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
    if (action === 'approve') return approveEnglishVersion(db, actor, id);
    if (action === 'reject') return rejectEnglishVersion(db, actor, id, typeof b.note === 'string' ? b.note : '');
    if (action === 'release') return releaseEnglishVersion(db, actor, id);
    return rollBackEnglishVersion(db, actor, id);
  });
  if ('refused' in run) return run.refused;
  const r = run.value;
  if (r.ok) return NextResponse.json(r, { headers: NO_STORE });
  return NextResponse.json({ error: 'not done', code: r.reason }, { status: STATUS[r.reason] ?? 409, headers: NO_STORE });
}
