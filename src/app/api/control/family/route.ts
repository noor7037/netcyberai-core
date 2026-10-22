import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { loadFamilyCounts } from '@/lib/control/family-counts';
import { readOpenSubjects, setOpenSubjects } from '@/lib/control/family-settings';
import { requireAiControl } from '@/lib/ai/control-guard';
import { withPlatformService } from '@/lib/auth/db';

// Control → Family: counts only, through family.control_counts(). The founder only.
//   GET   the counts, and the subjects open to every child (C298)
//   POST  { action: 'open_subjects', subjects: [...] }  set the subjects open to every child; the founder with the
//         authenticator (aal2), as Control → AI; audited
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  try {
    const counts = await withTenantContext(guard.claims, (db) => loadFamilyCounts(db));
    return NextResponse.json({ ...counts, openSubjects: await withPlatformService((db) => readOpenSubjects(db)) });
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
  if (b?.action !== 'open_subjects') return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const result = await withPlatformService((db) => setOpenSubjects(db, { userId: guard.claims.sub }, b.subjects));
  return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.code }, { status: 400 });
}
