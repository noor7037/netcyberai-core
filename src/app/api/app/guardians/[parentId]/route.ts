import { NextRequest, NextResponse } from 'next/server';
import { requireAppSession, canWriteMasterData } from '@/lib/auth/require-app-session';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import { assertRowsAffected, NoRowsAffectedError } from '@/lib/db/rows';
import { checkEmail, checkPhone, validationError } from '@/lib/errors/catalogue';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { appRoute, ruleError } from '@/lib/frameworks/route';
import { PARENT_SCREEN_ROLES, guardianDetail } from '@/lib/parents/guardians';

// preferred_language (C190): 'en', 'hi', or empty for "the school's default".
const EDITABLE_FIELDS = ['name', 'phone', 'email', 'relation', 'preferred_language'] as const;

// GET: one guardian as the Parents screen shows them (C192): children, consent by purpose, the phone and its state,
// data requests. A teacher gets only a guardian of their own classes; for anyone else's it is "not found".
export async function GET(req: NextRequest, { params }: { params: { parentId: string } }) {
  return appRoute(req, async ({ claims, db }) => {
    if (!PARENT_SCREEN_ROLES.includes(claims.role)) return ruleError(403, 'not_allowed');
    const detail = isUuid(params.parentId) ? await guardianDetail(db, { schoolId: claims.schoolId, role: claims.role }, params.parentId) : null;
    if (!detail) return ruleError(404, 'not_found', { field: 'guardian' });
    return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } });
  });
}

// Correcting a guardian's own details (a mistyped phone number, an
// added email) -- not for re-pointing which student(s) they're linked
// to, that's the guardians sub-route's link/unlink pair.
export async function PATCH(req: NextRequest, { params }: { params: { parentId: string } }) {
  const guard = await requireAppSession(req);
  if ('error' in guard) return guard.error;
  if (!canWriteMasterData(guard.claims.role)) {
    return ruleError(403, 'not_allowed');
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return ruleError(400, 'not_sent_properly');
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      if ((field === 'name' || field === 'phone') && !String(body[field] ?? '').trim()) {
        return NextResponse.json(validationError('required', { field: field === 'name' ? 'guardian_name' : 'phone' }), { status: 400 });
      }
      // The same checks as adding a guardian (docs/19 rule 9).
      if (field === 'phone') {
        const phoneCheck = checkPhone(String(body.phone));
        if (!phoneCheck.ok) return NextResponse.json(phoneCheck.error, { status: 400 });
      }
      if (field === 'preferred_language' && !['en', 'hi', '', null].includes(body.preferred_language)) return ruleError(400, 'not_sent_properly');
      if (field === 'email' && typeof body.email === 'string' && body.email.trim()) {
        const emailProblem = checkEmail(body.email);
        if (emailProblem) return NextResponse.json(emailProblem, { status: 400 });
      }
      values.push(body[field] === '' ? null : body[field]);
      setClauses.push(`${field} = $${values.length}`);
    }
  }
  if (setClauses.length === 0) {
    return ruleError(400, 'nothing_to_save');
  }

  try {
    const guardian = await withTenantContext(guard.claims, async (client) => {
      const before = await client.query(
        `select parent_id, name, phone, email, relation, preferred_language from parents where school_id = $1 and parent_id = $2`,
        [guard.claims.schoolId, params.parentId]
      );
      if (!before.rows[0]) return null;

      values.push(guard.claims.schoolId, params.parentId);
      const result = await client.query(
        `update parents set ${setClauses.join(', ')}
         where school_id = $${values.length - 1} and parent_id = $${values.length}
         returning parent_id, name, phone, email, relation, preferred_language`,
        values
      );
      assertRowsAffected(result, `guardian ${params.parentId} update matched 0 rows`);
      const row = result.rows[0];
      await writeAuditLog(client, {
        schoolId: guard.claims.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'guardian.update',
        targetType: 'parents',
        targetId: row.parent_id,
        afterState: { changed: EDITABLE_FIELDS.filter((f) => f in body) }, // which details, never their values (C224)
      });
      return row;
    });
    if (!guardian) return ruleError(404, 'not_found', { field: 'guardian' });
    return NextResponse.json({ guardian });
  } catch (err) {
    if (err instanceof NoRowsAffectedError) {
      return ruleError(404, 'not_found', { field: 'guardian' });
    }
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
