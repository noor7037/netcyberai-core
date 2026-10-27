// The family database door (docs/family-app/03 §14): every family read and write goes through these two, which set
// the family_app role and the verified account in src/lib/auth/db.ts, the one module allowed to (check_choke_point.py).
// withFamilyContext: a signed-in family, own account only. withFamilyGate: no account yet (sign-in, the code step).
export { withFamilyContext, withFamilyGate, FamilySessionRevokedError, type FamilyClaims } from '@/lib/auth/db';
import type { FamilyClaims } from '@/lib/auth/db';

// A session's claims for the database: its account, its version and, on a child's own phone, its device and child (C342).
// The only way family code builds claims (test/family/child-phone.test.ts fails on any other), so a phone's scope is
// never dropped.
export function familyClaims(s: { accountId: string; tokenVersion: number; device?: { deviceId: string; childId: string } | null }): FamilyClaims {
  return { accountId: s.accountId, tokenVersion: s.tokenVersion, device: s.device ?? null };
}
