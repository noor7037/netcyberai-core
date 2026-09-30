import { NextRequest, NextResponse } from 'next/server';
import { BULK_ACTIONS } from '@/lib/frameworks/bulk-actions';
import { appRoute } from '@/lib/frameworks/route';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { canWrite, isModuleEnabled } from '@/lib/contracts/entitlements';

// The bulk actions this person may run on a list (C112): GET ?listId=.
export async function GET(req: NextRequest) {
  const listId = req.nextUrl.searchParams.get('listId');
  return appRoute(req, async ({ claims, db }) => {
    const e = await loadEntitlements(db, claims.schoolId);
    const actions = BULK_ACTIONS.map((a) => a.def).filter(
      (d) => d.listId === listId && d.allowedRoles.includes(claims.role) && isModuleEnabled(e, d.moduleId) && canWrite(e)
    );
    return NextResponse.json({ actions });
  });
}
