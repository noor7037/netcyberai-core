import { NextRequest, NextResponse } from 'next/server';
import { appRoute, jsonError, readJson } from '@/lib/frameworks/route';
import { writeAuditLog } from '@/lib/audit/log';
import { mayChangeBranding } from '@/lib/school/branding';
import { isSchoolTheme } from '@/lib/theme/school-theme';

// PUT { theme }: the school app's theme for everyone at the school (C553), one of classic, emerald, royal. The principal
// and the school admin only (as for the school's name and logo); row level security keeps it to their own school.
export async function PUT(req: NextRequest) {
  const body = await readJson(req);
  return appRoute(req, async ({ claims, db }) => {
    if (!mayChangeBranding(claims.role)) return jsonError(403, 'only the principal or the school admin can change the theme');
    if (!isSchoolTheme(body?.theme)) return jsonError(400, 'theme must be classic, emerald or royal');
    const before = (await db.query(`select app_theme from schools where school_id = $1`, [claims.schoolId])).rows[0];
    const done = await db.query(`update schools set app_theme = $2 where school_id = $1`, [claims.schoolId, body.theme]);
    if (done.rowCount !== 1) return jsonError(404, 'school not found');
    await writeAuditLog(db, { schoolId: claims.schoolId, actorUserId: claims.sub, actorRole: claims.role, eventAction: 'school.theme', targetType: 'schools', targetId: claims.schoolId, beforeState: { app_theme: before?.app_theme ?? null }, afterState: { app_theme: body.theme } });
    return NextResponse.json({ theme: body.theme });
  });
}
