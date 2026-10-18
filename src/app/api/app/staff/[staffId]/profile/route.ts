import type { NextRequest } from 'next/server';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, jsonError, readJson } from '@/lib/frameworks/route';
import { saveResponse } from '@/lib/staff/profile-routes';
import { saveStaffProfile } from '@/lib/staff/profile-write';

// PUT (JSON: staff_code, designation, employment_type, joining_date, date_of_birth, address, emergency_contact; an
// empty field is cleared): a member of staff's profile (C238). The principal and the school admin of the session's own
// school only (src/lib/staff/profile-write.ts, and the database's own rules); audited with the names of the fields
// changed, never their values.
type Ctx = { params: { staffId: string } };

export async function PUT(req: NextRequest, { params }: Ctx) {
  return appRoute(req, async ({ claims, db }) => {
    if (!isUuid(params.staffId)) return jsonError(404, 'this member of staff was not found', { code: 'not_found' });
    const body = await readJson(req);
    if (!body) return jsonError(400, 'the form was not sent properly', { code: 'not_sent' });
    return saveResponse(await saveStaffProfile(db, { schoolId: claims.schoolId, userId: claims.sub, role: claims.role }, params.staffId, body));
  });
}
