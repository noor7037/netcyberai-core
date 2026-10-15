import { NextRequest, NextResponse } from 'next/server';
import { withTenantContext } from '@/lib/auth/db';
import { canAccessApp, canAccessControl, canAccessFamily } from '@/lib/auth/guards';
import { requireSession } from '@/lib/auth/require-session';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { isSchoolId, readSchoolLogo } from '@/lib/school/branding';
import { supabaseFileStorage } from '@/lib/storage/supabase-file-storage';

// GET /api/branding/logo?v=<version>: the school's logo, for the top of every screen (C235-B).
//   - a school's own staff session, or a parent's session: its own school's logo, the school taken from the session;
//   - NetCyberAI's platform session (Control): the school named by ?school=<id>.
// Anyone else is refused. The address carries the logo's version (when it last changed), so the browser keeps the
// answer for a day (private: never a shared cache) and asks again only when the logo changes; no signed link is
// handed to the browser. The bytes are the stored file's own, sent with the type read from them and nosniff.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const claims = await requireSession(req);
  if (!claims) return NextResponse.json({ error: 'not authenticated' }, { status: 401 });
  let schoolId: string | null = null;
  if (canAccessApp(claims) || canAccessFamily(claims)) schoolId = claims.schoolId;
  else if (canAccessControl(claims)) {
    const asked = req.nextUrl.searchParams.get('school');
    schoolId = isSchoolId(asked) ? asked : null;
  }
  if (!schoolId) return NextResponse.json({ error: 'not allowed' }, { status: claims.role === 'super_admin' ? 400 : 403 });
  const school = schoolId;

  try {
    const logo = await withTenantContext(claims, (db) => readSchoolLogo(db, supabaseFileStorage, school));
    if (!logo) return NextResponse.json({ error: 'no logo' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new NextResponse(Buffer.from(logo.bytes), {
      status: 200,
      headers: {
        'Content-Type': logo.type,
        'Content-Length': String(logo.bytes.length),
        'Cache-Control': 'private, max-age=86400',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': 'inline',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
