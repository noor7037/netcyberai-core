import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { loadFamilyCounts } from '@/lib/control/family-counts';
import { readSubjectList, setSubjectList } from '@/lib/control/family-settings';
import { requireAiControl } from '@/lib/ai/control-guard';
import { withPlatformService } from '@/lib/auth/db';

// Control → Family: counts only, through family.control_counts(). The founder only.
//   GET   the counts, the subjects open to every child (C298) and those that show checked explanations only (C300)
//   POST  { action: 'open_subjects' | 'reviewed_only', subjects: [...] }  set one of the two lists; the founder with the
//         authenticator (aal2), as Control → AI; audited
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  try {
    const counts = await withTenantContext(guard.claims, (db) => loadFamilyCounts(db));
    return NextResponse.json({ ...counts, ...(await withPlatformService(async (db) => ({ openSubjects: await readSubjectList(db, 'open'), reviewedOnly: await readSubjectList(db, 'reviewed_only') }))) });
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAiControl(req);
  if ('error' in guard) return guard.error;
  const b = await req.json().catch(() => null);
  const list = b?.action === 'open_subjects' ? 'open' : b?.action === 'reviewed_only' ? 'reviewed_only' : null;
  if (!list) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const result = await withPlatformService((db) => setSubjectList(db, { userId: guard.claims.sub }, list, b.subjects));
  return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.code }, { status: 400 });
}
