import { NextRequest, NextResponse } from 'next/server';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { appRoute, jsonError, readJson } from '@/lib/frameworks/route';
import { linkSiblings } from '@/lib/families/families';

// Link students as siblings (C116): { studentIds } (2 to 20) become one
// family, the one some are already in or a new one. Office only, audited.
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (!body) return jsonError(400, 'studentIds are required');
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, 'students', { write: true });
    if (!access.ok) return jsonError(access.status, access.error);
    const r = await linkSiblings(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, body.studentIds);
    return r.ok ? NextResponse.json({ family: { familyId: r.familyId, familyCode: r.familyCode }, linked: r.changed.length }) : jsonError(r.status, r.error);
  });
}
