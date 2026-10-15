import type { SessionClaims, StaffRole } from './types';

type GateInput = Pick<SessionClaims, 'role' | 'schoolId'> | null;

// Pure, DB-free authorization decisions given an already-verified session.
// Deliberately separate from withTenantContext: these decide whether a
// request may proceed at all (middleware/route-entry concern); RLS
// inside withTenantContext is the backstop if a route ever forgets to
// call these -- not a redundant check, a different layer. See the B2
// report's "RLS is still the backstop" section.
//
// Only role and schoolId are read (never sub/tokenVersion/etc.), so
// middleware -- which reconstructs just these two fields after a
// refresh, without a full SessionClaims -- can call these directly.

export function canAccessControl(claims: GateInput): boolean {
  return claims?.role === 'super_admin';
}

// "an active, currently-selected membership (any role except student)" --
// student can never reach this claims shape at all (StaffRole excludes
// it structurally), so the only real gate left is: was a school actually
// selected. super_admin has no membership/school_id and is not meant to
// use /app/* without one, same as anyone else.
//
// A parent's session (C230-D) is never a staff session: it reaches the family app only, never /app or a staff API.
export function canAccessApp<T extends GateInput>(claims: T): claims is NonNullable<T> & { role: Exclude<StaffRole, 'super_admin'>; schoolId: string } {
  if (!claims) return false;
  return claims.schoolId !== null && claims.role !== 'super_admin' && claims.role !== 'parent';
}

// The family app (C230-D): a parent's session with a school, and nothing else.
export function canAccessFamily<T extends GateInput>(claims: T): claims is NonNullable<T> & { role: 'parent'; schoolId: string } {
  return !!claims && claims.role === 'parent' && claims.schoolId !== null;
}

export function shellForRole(role: SessionClaims['role']): 'office' | 'finance' | 'academic' | 'teacher' | null {
  switch (role) {
    case 'school_admin':
    case 'principal':
      return 'office';
    case 'accountant':
      return 'finance';
    case 'academic_coordinator':
      return 'academic';
    case 'teacher':
      return 'teacher';
    default:
      return null;
  }
}
