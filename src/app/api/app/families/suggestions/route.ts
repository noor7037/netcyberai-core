import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { appRoute, jsonError, readJson } from '@/lib/frameworks/route';
import { emailKey, phoneKey, suggestSiblingsFor } from '@/lib/families/families';

// Possible siblings for a guardian phone or email (C116): guardians already
// on record with the same phone (last ten digits) or email, and their
// children. Suggestions only; nothing is linked until the office confirms.
export async function POST(req: NextRequest) {
  const body = await readJson(req);
  const phone = phoneKey(body?.phone);
  const email = emailKey(body?.email);
  if (!phone && !email) return jsonError(400, 'a phone with at least 10 digits, or an email, is required');
  const exclude = isUuid(body?.excludeStudentId) ? [body!.excludeStudentId as string] : [];
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, 'students', { write: true });
    if (!access.ok) return jsonError(access.status, access.error);
    const found = await suggestSiblingsFor(db, claims.schoolId, [{ key: 'q', phone, email }], exclude);
    return NextResponse.json({ suggestions: found.get('q') ?? [] }, { headers: { 'cache-control': 'no-store' } });
  });
}
