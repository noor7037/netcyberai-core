// Phase 1 roles that can actually reach a login path. `student` and
// `parent` stay in the DB's user_role enum but are never issued a
// session by this module — see Decision Log C13 (no parent login) and
// C24 (no student login). Enforced here, not just by convention: no
// function in this module can produce a session claiming either role.
export type StaffRole =
  | 'super_admin'
  | 'school_admin'
  | 'principal'
  | 'teacher'
  | 'accountant'
  | 'academic_coordinator';

export interface SessionClaims {
  sub: string; // users.user_id
  role: StaffRole;
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
  role: StaffRole;
  isActive: boolean;
}

export type LoginOutcome =
  | { status: 'email_step'; pendingToken: string; maskedEmail: string }
  | { status: 'mfa_required'; pendingToken: string }
  // A platform admin without an authenticator, after the email step: enrol
  // one on this screen before a session is issued (C95).
  | { status: 'mfa_setup'; pendingToken: string }
  | { status: 'no_memberships' }
  | { status: 'select_school'; pendingToken: string; memberships: MembershipRow[] }
  | { status: 'ok'; accessToken: string; refreshToken: string; claims: SessionClaims };
