import { NextRequest, NextResponse } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson, ruleError } from '@/lib/frameworks/route';
import { listNotices, noticeClasses, writeNotice } from '@/lib/communication/notices';

// Notices to parents (docs/25 slice 7i, C191).
//   GET   the notices this person may see, and the classes they may write for
//   POST  { classId | null, body }  write one; it waits for the principal. null: every class (the office only)
const STAFF: readonly string[] = ['principal', 'school_admin', 'teacher'];

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    if (!STAFF.includes(claims.role)) return ruleError(403, 'not_allowed');
    const actor = { schoolId: claims.schoolId, userId: claims.sub, role: claims.role };
    return NextResponse.json({ notices: await listNotices(db, claims.schoolId), classes: await noticeClasses(db, actor), mayDecide: claims.role === 'principal', mayWriteToAll: claims.role !== 'teacher' }, { headers: { 'Cache-Control': 'no-store' } });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const body = await readJson(req);
    if (typeof body?.body !== 'string' || body.body.length > 2000 || !(body.classId === null || isUuid(body.classId))) return ruleError(400, 'not_sent_properly');
    const made = await writeNotice(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, { classId: body.classId as string | null, body: body.body });
    if (made.ok) return NextResponse.json({ noticeId: made.noticeId }, { status: 201 });
    return made.reason === 'not_allowed' ? ruleError(403, 'not_allowed') : jsonError(400, 'the notice was not saved', { code: made.reason });
  });
}
