import type { PoolClient } from 'pg';
import { requestEmailCode, revokeAllSessions } from './account';
import { writeAuditLog } from '@/lib/audit/log';
import type { SessionClaims, StaffRole } from './types';

// Staff account administration (C89): principals and school admins manage
// the accounts of their own school; super_admin manages every account.
// "Reset" never lets an admin see or choose someone else's password: it
// emails the person a reset code (the same Supabase recovery email as the
// login page's "Forgot password"), and can sign them out everywhere.

export const SCHOOL_ACCOUNT_ADMINS: StaffRole[] = ['principal', 'school_admin'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUserId = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

export interface StaffAccount {
  userId: string;
  displayName: string;
  email: string | null;
  role: string;
  isActive: boolean;
  schools?: string;
}

// Platform (super_admin) accounts are never listed or reachable from a
// school: a school admin must not be able to sign a platform admin out.
//
// Inside withTenantContext for a school session. RLS (users_tenant_isolation
// + users_school_staff_read) keeps this to the current school's accounts.
export async function listSchoolAccounts(client: PoolClient, schoolId: string): Promise<StaffAccount[]> {
  const { rows } = await client.query(
    `select u.user_id, u.display_name, u.email, m.role, (m.is_active and u.is_active) as is_active
     from memberships m
     join users u on u.user_id = m.user_id
     where m.school_id = $1 and u.role <> 'super_admin'
     order by m.role, u.display_name`,
    [schoolId]
  );
  return rows.map((r) => ({ userId: r.user_id, displayName: r.display_name, email: r.email, role: r.role, isActive: r.is_active }));
}

// Inside withTenantContext for a super_admin session (nca_super).
export async function listAllAccounts(client: PoolClient): Promise<StaffAccount[]> {
  const { rows } = await client.query(
    `select u.user_id, u.display_name, u.email, u.role, u.is_active,
            coalesce(string_agg(s.name || ' · ' || m.role, ', ' order by s.name), '') as schools
     from users u
     left join memberships m on m.user_id = u.user_id and m.is_active
     left join schools s on s.school_id = m.school_id
     group by u.user_id
     order by (u.role = 'super_admin') desc, u.display_name
     limit 1000`
  );
  return rows.map((r) => ({ userId: r.user_id, displayName: r.display_name, email: r.email, role: r.role, isActive: r.is_active, schools: r.schools }));
}

export async function findSchoolAccount(client: PoolClient, schoolId: string, userId: string): Promise<StaffAccount | null> {
  const all = await client.query(
    `select u.user_id, u.display_name, u.email, m.role, (m.is_active and u.is_active) as is_active
     from memberships m join users u on u.user_id = m.user_id
     where m.school_id = $1 and m.user_id = $2 and u.role <> 'super_admin'
     limit 1`,
    [schoolId, userId]
  );
  const r = all.rows[0];
  return r ? { userId: r.user_id, displayName: r.display_name, email: r.email, role: r.role, isActive: r.is_active } : null;
}

export async function findAnyAccount(client: PoolClient, userId: string): Promise<(StaffAccount & { schoolId: string | null }) | null> {
  const { rows } = await client.query(`select user_id, display_name, email, role, is_active, school_id from users where user_id = $1`, [userId]);
  const r = rows[0];
  return r ? { userId: r.user_id, displayName: r.display_name, email: r.email, role: r.role, isActive: r.is_active, schoolId: r.school_id } : null;
}

// Sends the reset email, optionally signs the person out everywhere, and
// writes the audit entry (IDs and flags only, never the email: C41).
export async function sendResetFor(
  client: PoolClient,
  actor: SessionClaims,
  target: { userId: string; email: string; schoolId: string | null },
  signOutEverywhere: boolean
): Promise<{ signedOutSessions: number }> {
  await requestEmailCode(target.email, 'reset');
  const signedOutSessions = signOutEverywhere ? await revokeAllSessions(target.userId) : 0;
  await writeAuditLog(client, {
    schoolId: target.schoolId,
    actorUserId: actor.sub,
    actorRole: actor.role,
    eventAction: 'user.password_reset_sent',
    targetType: 'users',
    targetId: target.userId,
    afterState: { signOutEverywhere, signedOutSessions },
  });
  return { signedOutSessions };
}
