import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { loadFamilyCounts } from '@/lib/control/family-counts';
import { readOpenSubjects, setOpenSubjects } from '@/lib/control/family-settings';
import { requireAiControl } from '@/lib/ai/control-guard';

// Control → Family: counts only, through family.control_counts(). The founder only.
//   GET   the counts, and the subjects open to every child (C298)
//   POST  { action: 'open_subjects', subjects: [...] }  set the subjects open to every child; the founder with the
//         authenticator (aal2), as Control → AI; audited
// Both run in the founder's own transaction (the platform role, the account checked live), as the counts do.
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  try {
    return NextResponse.json(await withTenantContext(guard.claims, async (db) => ({ ...(await loadFamilyCounts(db)), openSubjects: await readOpenSubjects(db) })));
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
  try {
    const result = await withTenantContext(guard.claims, (db) => setOpenSubjects(db, { userId: guard.claims.sub }, b.subjects));
    return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.code }, { status: 400 });
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
