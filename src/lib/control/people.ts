import type { PoolClient } from 'pg';
import { hasAadhaarNumber } from '@/lib/privacy/aadhaar';
import { usernameOf } from '@/lib/auth/usernames';

// The people of one school, for the founder's school page (C165): who they
// are, what they do there, and whether they can be viewed as. Read inside
// the founder's own platform transaction.

// signIn: what the person types to sign in, a username or an email (C230-D); null when the account has neither.
export type SchoolPerson = { userId: string; membershipId: string; name: string; role: string; status: 'active' | 'inactive'; signIn: string | null };

export async function listSchoolPeople(db: Pick<PoolClient, 'query'>, schoolId: string): Promise<SchoolPerson[]> {
  const { rows } = await db.query(
    `select m.user_id, m.membership_id, u.display_name, u.email, m.role::text as role, (m.is_active and u.is_active) as active
       from memberships m join users u on u.user_id = m.user_id
      where m.school_id = $1
      order by (m.is_active and u.is_active) desc, m.role::text, lower(u.display_name)`,
    [schoolId]
  );
  return rows.map((r) => ({ userId: r.user_id as string, membershipId: r.membership_id as string, name: r.display_name as string, role: r.role as string, status: r.active ? 'active' : 'inactive', signIn: usernameOf(r.email) ?? ((r.email as string | null) || null) }));
}

// Which of a person's memberships a "View as" opens: the one the founder
// chose on that school's page, never simply the first. With none named (an
// older caller), a person with exactly one membership is unambiguous; with
// several, nothing is chosen.
export function membershipToViewAs<M extends { membershipId: string }>(memberships: readonly M[], membershipId: string | null): M | null {
  if (membershipId) return memberships.find((m) => m.membershipId === membershipId) ?? null;
  return memberships.length === 1 ? memberships[0] : null;
}

// The reason the founder gives for a "View as" (C165), read: 1 to 300 characters once trimmed, and never an Aadhaar
// number (the one rule; the database refuses one too). It is kept on the viewing's own row and shown to the school
// viewed, never in the audit row (C232 part B).
export const VIEW_REASON_MAX = 300;
export function viewAsReason(raw: unknown): { ok: true; reason: string } | { ok: false; code: 'reason' | 'aadhaar' } {
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (!reason || reason.length > VIEW_REASON_MAX) return { ok: false, code: 'reason' };
  if (hasAadhaarNumber(reason)) return { ok: false, code: 'aadhaar' };
  return { ok: true, reason };
}
