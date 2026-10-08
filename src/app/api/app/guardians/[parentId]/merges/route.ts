import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { accessDenied, appRoute, ruleError } from '@/lib/frameworks/route';
import { guardianMerges } from '@/lib/families/families';

// What was merged into (or out of) a guardian record (C116), with the
// merged record's details as they stand. Office only (RLS as well).
export async function GET(req: NextRequest, { params }: { params: { parentId: string } }) {
  if (!isUuid(params.parentId)) return ruleError(404, 'not_found', { field: 'guardian' });
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, 'parents');
    if (!access.ok) return accessDenied(access);
    return NextResponse.json({ merges: await guardianMerges(db, claims.schoolId, params.parentId) });
  });
}
