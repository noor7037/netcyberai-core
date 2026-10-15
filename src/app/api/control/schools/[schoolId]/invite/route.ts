import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-super-admin';
import { withTenantContext } from '@/lib/auth/db';
import { newAuthAdminClient } from '@/lib/auth/supabase';
import { SERVICE_ROLE_SETTING_NAME, hasServiceRoleKey } from '@/lib/auth/env';
import { INVITE_FAILURE_TEXT, inviteFailure } from '@/lib/auth/invite-failure';
import { sessionErrorResponse } from '@/lib/auth/session-error-response';
import { writeAuditLog } from '@/lib/audit/log';
import type { StaffRole } from '@/lib/auth/types';

// Task 4: memberships row (user_id, school_id, role), never a legacy
// single-school assignment (Decision Log C14). Credential delivery is
// entirely Supabase Auth's own admin.inviteUserByEmail -- a one-time
// email link Supabase generates and sends itself. This app never sees,
// mints, or logs a plaintext credential: there isn't one to log. Never
// invites super_admin here -- that's a platform-level identity, not a
// school-scoped one this endpoint has any business creating.
const INVITABLE_ROLES: StaffRole[] = ['school_admin', 'principal', 'teacher', 'accountant', 'academic_coordinator'];

export async function POST(req: NextRequest, { params }: { params: { schoolId: string } }) {
  const guard = await requireSuperAdmin(req);
  if ('error' in guard) return guard.error;

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = body?.role as StaffRole | undefined;
  const displayName = typeof body?.displayName === 'string' ? body.displayName.trim() : '';
  if (!email || !role || !INVITABLE_ROLES.includes(role) || !displayName) {
    return NextResponse.json(
      { error: `email, displayName, and role (one of ${INVITABLE_ROLES.join(', ')}) are required` },
      { status: 400 }
    );
  }

  // Without the service key nothing can be invited: say which setting, rather than failing inside the client.
  if (!hasServiceRoleKey()) return NextResponse.json({ error: INVITE_FAILURE_TEXT.service_key, code: 'service_key', setting: SERVICE_ROLE_SETTING_NAME }, { status: 503 });
  const admin = newAuthAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email);
  if (inviteError || !invited?.user) {
    // Supabase's own error text (e.g. "user already registered") is safe
    // to relay -- it never contains a credential, only account-existence
    // information the caller (a super_admin doing onboarding) already
    // has a legitimate reason to see. The known refusals get a code and
    // plain words (src/lib/auth/invite-failure.ts): a wrong service key
    // is a deployment setting, not the caller's slip, and the screen says so.
    const code = inviteFailure(inviteError);
    const error = code === 'other' ? (inviteError?.message ?? 'invite failed') : INVITE_FAILURE_TEXT[code];
    // The screen names the setting from here, so the message files never carry the credential's name.
    return NextResponse.json(code === 'service_key' ? { error, code, setting: SERVICE_ROLE_SETTING_NAME } : { error, code }, { status: code === 'service_key' ? 503 : 502 });
  }
  const authUserId = invited.user.id;

  try {
    const membership = await withTenantContext(guard.claims, async (client) => {
      await client.query(
        `insert into users (user_id, school_id, email, role, display_name, is_active, token_version)
         values ($1, $2, $3, $4, $5, true, 0)
         on conflict (user_id) do nothing`,
        [authUserId, params.schoolId, email, role, displayName]
      );

      const { rows } = await client.query(
        `insert into memberships (user_id, school_id, role)
         values ($1, $2, $3)
         returning membership_id, user_id, school_id, role`,
        [authUserId, params.schoolId, role]
      );

      await writeAuditLog(client, {
        schoolId: params.schoolId,
        actorUserId: guard.claims.sub,
        actorRole: guard.claims.role,
        eventAction: 'membership.invite',
        targetType: 'memberships',
        targetId: rows[0].membership_id,
        // IDs and the changed field name only -- never the raw email/
        // displayName values themselves (Pre-F Architecture Hardening,
        // docs/10_DECISION_LOG.md's audit-PII rule). The invited
        // person's identity is already on their own users row, keyed
        // by targetUserId; the hash-chained, append-only audit_log is
        // the wrong place to duplicate it, since DPDP erasure of that
        // person's data can never touch this table.
        afterState: { role, targetUserId: authUserId },
      });

      return rows[0];
    });
    return NextResponse.json({ membership }, { status: 201 });
  } catch (err) {
    const resp = sessionErrorResponse(err);
    if (resp) return resp;
    throw err;
  }
}
