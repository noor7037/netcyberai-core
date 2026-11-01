import { randomBytes } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { requireStepUp } from '@/lib/auth/step-up';
import { withTenantContext } from '@/lib/auth/db';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { SERVICE_ROLE_SETTING_NAME } from '@/lib/auth/env';
import { createLoginAccount, deleteLoginAccount, hasLoginAccount } from '@/lib/auth/admin-actions';
import { makePassword, usernameOf } from '@/lib/auth/usernames';
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
//
// W14-B: a login for a person the school already has (`userId`, seeded staff with no sign-in) is that person's: the
// account takes their id, their users row gets the sign-in email, and no second person or membership is made. GET
// lists the school's staff with no sign-in yet, for the dialog's "Existing staff" choice. A second person with the
// same email in one school is refused before any account is made.
export const dynamic = 'force-dynamic';

const NIL = '00000000-0000-0000-0000-000000000000';
type Existing = { user_id: string; display_name: string; email: string | null; role: string; membership_id: string };

export async function GET(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  try {
    const rows = await withTenantContext(guard.claims, async (client) =>
      (
        await client.query(
          `select u.user_id, u.display_name, u.email, m.role::text as role
             from memberships m join users u on u.user_id = m.user_id
            where m.school_id = $1 and m.role::text <> 'parent' and m.is_active and u.is_active
            order by lower(u.display_name)`,
          [params.schoolId]
        )
      ).rows as Omit<Existing, 'membership_id'>[]
    );
    // No email: no sign-in can exist. With one: Supabase Auth is asked whether an account has that id, a few at a time.
    const without: typeof rows = [];
    for (let i = 0; i < rows.length; i += 8) {
      const part = rows.slice(i, i + 8);
      const has = await Promise.all(part.map((r) => (r.email ? hasLoginAccount(r.user_id) : Promise.resolve(false))));
      part.forEach((r, j) => has[j] === false && without.push(r));
    }
    return NextResponse.json(
      { staff: without.map((r) => ({ userId: r.user_id, name: r.display_name, role: r.role, signIn: usernameOf(r.email) ?? r.email ?? null })) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}

export async function POST(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;
  if (!isUuid(params.schoolId)) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const parsed = parseNewLogin(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: 'not created', code: parsed.problem }, { status: 400 });
  const { login } = parsed;
  // A login for an existing person is that person's account and role (a principal's, maybe): the same proof the
  // temporary password asks for (C260), so a stolen founder cookie without it cannot take a staff identity over.
  if (login.userId) {
    const stepUp = await requireStepUp(req, guard.claims);
    if (stepUp) return stepUp;
  }
  const password = login.password ?? makePassword(randomBytes(64));

  try {
    const found = await withTenantContext(guard.claims, async (client) => {
      const school = (await client.query(`select name from schools where school_id = $1`, [params.schoolId])).rows[0] as { name: string } | undefined;
      if (!school) return { school, guardian: null, taken: false, existing: null, sameEmail: false };
      // The same email for two people of one school: refused here, before Supabase makes anything (W14-B).
      const sameEmail =
        (
          await client.query(
            `select 1 from users u
              where lower(u.email) = lower($2) and u.user_id <> $3::uuid
                and (u.school_id = $1 or exists (select 1 from memberships m where m.user_id = u.user_id and m.school_id = $1))
              limit 1`,
            [params.schoolId, login.signIn.email, login.userId ?? NIL]
          )
        ).rows.length > 0;
      const existing = login.userId
        ? (((
            await client.query(
              `select u.user_id, u.display_name, u.email, m.role::text as role, m.membership_id
                 from users u join memberships m on m.user_id = u.user_id and m.school_id = $2
                where u.user_id = $1 and m.role::text <> 'parent'`,
              [login.userId, params.schoolId]
            )
          ).rows[0] as Existing | undefined) ?? null)
        : null;
      if (!login.parentId) return { school, guardian: null, taken: false, existing, sameEmail };
      const guardian = (await client.query(`select name from parents where parent_id = $1 and school_id = $2 and merged_into is null`, [login.parentId, params.schoolId])).rows[0] as { name: string } | undefined;
      const taken = (await client.query(`select 1 from users where user_id = $1`, [login.parentId])).rows.length > 0;
      return { school, guardian: guardian ?? null, taken, existing, sameEmail };
    });
    if (!found.school) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const school = found.school;
    if (login.parentId && !found.guardian) return NextResponse.json({ error: 'not created', code: 'guardian' }, { status: 404 });
    if (login.parentId && found.taken) return NextResponse.json({ error: 'not created', code: 'already_registered' }, { status: 409 });
    if (login.userId && !found.existing) return NextResponse.json({ error: 'not created', code: 'staff' }, { status: 404 });
    if (found.sameEmail) return NextResponse.json({ error: 'not created', code: 'taken' }, { status: 409 });
    const existing = found.existing;
    const name = existing?.display_name ?? found.guardian?.name ?? login.name;
    const role = existing?.role ?? login.role;

    const created = await createLoginAccount(login.signIn.email, password, existing?.user_id ?? login.parentId ?? undefined);
    if (!created.ok) {
      const status = created.failure === 'service_key' ? 503 : created.failure === 'already_registered' ? 409 : created.failure === 'email' ? 400 : 502;
      return NextResponse.json({ error: 'not created', code: created.failure, ...(created.failure === 'service_key' ? { setting: SERVICE_ROLE_SETTING_NAME } : {}) }, { status });
    }

    let membershipId: string;
    try {
      membershipId = await withTenantContext(guard.claims, async (client) => {
        let id: string;
        if (existing) {
          // The person the school already has: their row takes the sign-in email; their membership stays as it is.
          await client.query(`update users set email = $2, updated_at = now() where user_id = $1`, [existing.user_id, login.signIn.email]);
          id = existing.membership_id;
        } else {
          await client.query(
            `insert into users (user_id, school_id, email, role, display_name, is_active, token_version)
             values ($1, $2, $3, $4, $5, true, 0)`,
            [created.userId, params.schoolId, login.signIn.email, login.role, name]
          );
          const { rows } = await client.query(`insert into memberships (user_id, school_id, role) values ($1, $2, $3) returning membership_id`, [created.userId, params.schoolId, login.role]);
          id = rows[0].membership_id as string;
        }
        // A login made for someone whose invitation was never sent replaces it (W11-B): the invitation is withdrawn,
        // so its job stops trying and the school's page no longer lists it as waiting.
        await client.query(
          `update staff_invitations set status = 'revoked', updated_at = now() where school_id = $1 and email_key = lower($2) and status = 'pending'`,
          [params.schoolId, login.signIn.email]
        );
        await writeAuditLog(client, {
          schoolId: params.schoolId,
          actorUserId: guard.claims.sub,
          actorRole: guard.claims.role,
          eventAction: 'membership.login_created',
          targetType: 'memberships',
          targetId: id,
          // Ids, the role and the kind of sign-in name only: never the name, the sign-in name or the password.
          afterState: { role, targetUserId: created.userId, signInKind: login.signIn.kind, ...(existing ? { existingPerson: true } : {}) },
        });
        return id;
      });
    } catch (err) {
      // No account is left with no school: the Supabase account goes too.
      await deleteLoginAccount(created.userId);
      throw err;
    }

    return NextResponse.json(
      { userId: created.userId, membershipId, schoolName: school.name, role, name, signIn: login.signIn.kind === 'username' ? login.signIn.username : login.signIn.email, password },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
