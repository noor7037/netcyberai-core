import { NextRequest, NextResponse } from 'next/server';
import { writeAuditLog } from '@/lib/audit/log';
import { checkModuleAccess } from '@/lib/frameworks/entitlements';
import { accessDenied, appRoute, readJson, ruleError } from '@/lib/frameworks/route';
import { isIsoDate } from '@/lib/time/india';

// The school's holidays (C176): days it is closed. With the working-days setting they decide what a "working day" is.
//   GET     the holidays from 60 days ago onwards
//   POST    { date, name }  add one (principal or school admin)
//   DELETE  ?date=          remove one
const OFFICE: readonly string[] = ['principal', 'school_admin'];

export async function GET(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, 'setup');
    if (!access.ok) return accessDenied(access);
    const { rows } = await db.query(`select holiday_date::text as date, name from school_holidays where school_id = $1 and holiday_date > current_date - 60 order by holiday_date limit 200`, [claims.schoolId]);
    return NextResponse.json({ holidays: rows, mayEdit: OFFICE.includes(claims.role) });
  });
}

export async function POST(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, 'setup', { write: true });
    if (!access.ok) return accessDenied(access);
    if (!OFFICE.includes(claims.role)) return ruleError(403, 'not_allowed');
    const body = await readJson(req);
    const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    if (!isIsoDate(body?.date) || name.length < 1 || name.length > 80) return ruleError(400, 'not_sent_properly');
    const made = await db.query(`insert into school_holidays (school_id, holiday_date, name, created_by) values ($1, $2, $3, $4) on conflict (school_id, holiday_date) do nothing`, [claims.schoolId, body.date, name, claims.sub]);
    if (made.rowCount !== 1) return NextResponse.json({ ok: true }); // already a holiday: nothing to add
    await writeAuditLog(db, { schoolId: claims.schoolId, actorUserId: claims.sub, actorRole: claims.role, eventAction: 'settings.holiday_added', targetType: 'school_holidays', targetId: body.date as string, beforeState: undefined, afterState: { date: body.date, name } });
    return NextResponse.json({ ok: true }, { status: 201 });
  });
}

export async function DELETE(req: NextRequest) {
  return appRoute(req, async ({ claims, db }) => {
    const access = await checkModuleAccess(db, claims, 'setup', { write: true });
    if (!access.ok) return accessDenied(access);
    if (!OFFICE.includes(claims.role)) return ruleError(403, 'not_allowed');
    const date = req.nextUrl.searchParams.get('date');
    if (!isIsoDate(date)) return ruleError(400, 'not_sent_properly');
    const gone = await db.query(`delete from school_holidays where school_id = $1 and holiday_date = $2`, [claims.schoolId, date]);
    if (gone.rowCount !== 1) return ruleError(404, 'not_found');
    await writeAuditLog(db, { schoolId: claims.schoolId, actorUserId: claims.sub, actorRole: claims.role, eventAction: 'settings.holiday_removed', targetType: 'school_holidays', targetId: date, beforeState: { date }, afterState: undefined });
    return NextResponse.json({ ok: true });
  });
}
