import type { PoolClient } from 'pg';

// The people of one school, for the founder's school page (C165): who they
// are, what they do there, and whether they can be viewed as. Read inside
// the founder's own platform transaction.

export type SchoolPerson = { userId: string; membershipId: string; name: string; role: string; status: 'active' | 'inactive' };

export async function listSchoolPeople(db: Pick<PoolClient, 'query'>, schoolId: string): Promise<SchoolPerson[]> {
  const { rows } = await db.query(
    `select m.user_id, m.membership_id, u.display_name, m.role::text as role, (m.is_active and u.is_active) as active
       from memberships m join users u on u.user_id = m.user_id
      where m.school_id = $1
      order by (m.is_active and u.is_active) desc, m.role::text, lower(u.display_name)`,
    [schoolId]
  );
  return rows.map((r) => ({ userId: r.user_id as string, membershipId: r.membership_id as string, name: r.display_name as string, role: r.role as string, status: r.active ? 'active' : 'inactive' }));
}

// Which of a person's memberships a "View as" opens: the one the founder
// chose on that school's page, never simply the first. With none named (an
// older caller), a person with exactly one membership is unambiguous; with
// several, nothing is chosen.
export function membershipToViewAs<M extends { membershipId: string }>(memberships: readonly M[], membershipId: string | null): M | null {
  if (membershipId) return memberships.find((m) => m.membershipId === membershipId) ?? null;
  return memberships.length === 1 ? memberships[0] : null;
}
