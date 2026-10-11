import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { accessDenied, appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { mergeGuardians } from '@/lib/families/families';

// Merge two guardian records that are the same person (C116):
// { keepParentId, mergeParentId }. The merged record's links move to the
// kept one; the merged record stays, marked, so nothing is lost. Office only.
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return ruleError(400, 'not_sent_properly');
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, 'parents', { write: true });
    if (!access.ok) return accessDenied(access);
    const r = await mergeGuardians(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, body.keepParentId, body.mergeParentId);
    return r.ok ? NextResponse.json(r) : jsonError(r.status, r.error);
  });
}
