import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { loadFamilyCounts } from '@/lib/control/family-counts';
import { readSubjectList, setSubjectList } from '@/lib/control/family-settings';
import { requireAiControl } from '@/lib/ai/control-guard';

// Control → Family: counts only, through family.control_counts(). The founder only.
//   GET   the counts, the subjects open to every child (C298) and those that show checked explanations only (C300)
//   POST  { action: 'open_subjects' | 'reviewed_only', subjects: [...] }  set one of the two lists; the founder with the
//         authenticator (aal2), as Control → AI; audited
// Both run in the founder's own transaction (the platform role, the account checked live), as the counts do.
export async function GET(req: NextRequest) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  try {
    return NextResponse.json(
      await withTenantContext(guard.claims, async (db) => ({ ...(await loadFamilyCounts(db)), openSubjects: await readSubjectList(db, 'open'), reviewedOnly: await readSubjectList(db, 'reviewed_only') }))
    );
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
  try {
    const result = await withTenantContext(guard.claims, (db) => setSubjectList(db, { userId: guard.claims.sub }, list, b.subjects));
    return result.ok ? NextResponse.json(result) : NextResponse.json({ error: result.code }, { status: 400 });
  } catch (err) {
    const res = sessionErrorResponse(err);
    if (res) return res;
    throw err;
  }
}
