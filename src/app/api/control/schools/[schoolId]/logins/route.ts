import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { SERVICE_ROLE_SETTING_NAME } from '@/lib/auth/env';
import { createLoginAccount, deleteLoginAccount } from '@/lib/auth/admin-actions';
import { makePassword } from '@/lib/auth/usernames';
import { writeAuditLog } from '@/lib/audit/log';
import { parseNewLogin } from '@/lib/control/logins';
import { isUuid } from '@/lib/frameworks/custom-fields';

// Control → a school → People → "Create a login" (founder, 2026-10-15, C230-D). The founder gives a name, a role and
// a sign-in name (a username or an email); the password is the one typed, or one made here. The account is made in
// Supabase Auth already confirmed, so no email is sent, then the person's users row and membership exactly as the
// invite route makes them. The password is in this one answer only: never stored by this app, never logged, never in
// the audit row (which holds the role, the account id and the kind of sign-in name).
//
// A parent's login (role `parent`) names one guardian record of this school: the account's id is the guardian's
// parent_id, so the database's parent rules apply to it, and its name is the guardian's. One login per guardian.
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const parsed = parseNewLogin(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: 'not created', code: parsed.problem }, { status: 400 });
  const { login } = parsed;
  const password = login.password ?? makePassword(randomBytes(64));

  try {
    const found = await withTenantContext(guard.claims, async (client) => {
      const school = (await client.query(`select name from schools where school_id = $1`, [params.schoolId])).rows[0] as { name: string } | undefined;
      if (!school || !login.parentId) return { school, guardian: null, taken: false };
      const guardian = (await client.query(`select name from parents where parent_id = $1 and school_id = $2 and merged_into is null`, [login.parentId, params.schoolId])).rows[0] as { name: string } | undefined;
      const taken = (await client.query(`select 1 from users where user_id = $1`, [login.parentId])).rows.length > 0;
      return { school, guardian: guardian ?? null, taken };
    });
    if (!found.school) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const school = found.school;
    if (login.parentId && !found.guardian) return NextResponse.json({ error: 'not created', code: 'guardian' }, { status: 404 });
    if (login.parentId && found.taken) return NextResponse.json({ error: 'not created', code: 'already_registered' }, { status: 409 });
    const name = found.guardian?.name ?? login.name;

    const created = await createLoginAccount(login.signIn.email, password, login.parentId ?? undefined);
    if (!created.ok) {
      const status = created.failure === 'service_key' ? 503 : created.failure === 'already_registered' ? 409 : created.failure === 'email' ? 400 : 502;
      return NextResponse.json({ error: 'not created', code: created.failure, ...(created.failure === 'service_key' ? { setting: SERVICE_ROLE_SETTING_NAME } : {}) }, { status });
    }

    let membershipId: string;
    try {
      membershipId = await withTenantContext(guard.claims, async (client) => {
        await client.query(
          `insert into users (user_id, school_id, email, role, display_name, is_active, token_version)
           values ($1, $2, $3, $4, $5, true, 0)`,
          [created.userId, params.schoolId, login.signIn.email, login.role, name]
        );
        const { rows } = await client.query(`insert into memberships (user_id, school_id, role) values ($1, $2, $3) returning membership_id`, [created.userId, params.schoolId, login.role]);
        await writeAuditLog(client, {
          schoolId: params.schoolId,
          actorUserId: guard.claims.sub,
          actorRole: guard.claims.role,
          eventAction: 'membership.login_created',
          targetType: 'memberships',
          targetId: rows[0].membership_id,
          // Ids, the role and the kind of sign-in name only: never the name, the sign-in name or the password.
          afterState: { role: login.role, targetUserId: created.userId, signInKind: login.signIn.kind },
        });
        return rows[0].membership_id as string;
      });
    } catch (err) {
      // No account is left with no school: the Supabase account goes too.
      await deleteLoginAccount(created.userId);
      throw err;
    }

    return NextResponse.json(
      { userId: created.userId, membershipId, schoolName: school.name, role: login.role, name, signIn: login.signIn.kind === 'username' ? login.signIn.username : login.signIn.email, password },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
