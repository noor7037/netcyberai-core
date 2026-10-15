// The roles that reach a login path. `student` stays in the DB's user_role enum and is never issued a session (C24).
// `parent` was kept out too (C13) until the founder asked for parent logins (2026-10-15, C230-D): a parent's session
// carries the role `parent` and reaches only the family app; canAccessApp and every staff guard refuse it.
export type StaffRole =
  | 'super_admin'
  | 'school_admin'
  | 'principal'
  | 'teacher'
  | 'accountant'
  | 'academic_coordinator';

// A parent's session (founder, 2026-10-15, C230-D): only the family app, never /app, /control or a staff API.
export type SessionRole = StaffRole | 'parent';

// What a session is once the staff gate (canAccessApp) has passed it: a staff role and a school.
export type AppSessionClaims = SessionClaims & { role: Exclude<StaffRole, 'super_admin'>; schoolId: string };
// What a session is once the family gate (canAccessFamily) has passed it.
export type FamilySessionClaims = SessionClaims & { role: 'parent'; schoolId: string; membershipId: string };

export interface SessionClaims {
  sub: string; // users.user_id
  role: SessionRole;
  schoolId: string | null; // null only for super_admin (platform-scoped)
  membershipId: string | null; // null only for super_admin
  tokenVersion: number; // snapshot at issuance, checked live on every DB-touching request
  aal: 'aal1' | 'aal2';
  sessionId: string; // sessions.session_id, correlates to the refresh-token row
  // Present only while a super_admin is impersonating this claims' own
  // subject (sub/role/schoolId are already the TARGET's real membership
  // here -- impersonation never carries its own elevated logic, see
  // Decision Log C38's sibling entry on this prompt). withTenantContext
  // re-validates impersonationId against impersonation_sessions on every
  // request, live -- not just at mint time -- so expiry is enforced the
  // same way token_version already is.
  impersonation?: { impersonationId: string; actorUserId: string } | null;
}

export interface MembershipRow {
  membershipId: string;
  schoolId: string;
  schoolName: string;
  role: SessionRole;
  isActive: boolean;
}

export type LoginOutcome =
  | { status: 'email_step'; pendingToken: string; maskedEmail: string; setupNext: boolean }
  | { status: 'mfa_required'; pendingToken: string }
  // A platform admin without an authenticator, after the email step: enrol
  // one on this screen before a session is issued (C95).
  | { status: 'mfa_setup'; pendingToken: string }
  | { status: 'no_memberships' }
  | { status: 'select_school'; pendingToken: string; memberships: MembershipRow[] }
  | { status: 'ok'; accessToken: string; refreshToken: string; claims: SessionClaims };
