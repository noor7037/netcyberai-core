// The family database door (docs/family-app/03 §14): every family read and write goes through these two, which set
// the family_app role and the verified account in src/lib/auth/db.ts, the one module allowed to (check_choke_point.py).
// withFamilyContext: a signed-in family, own account only. withFamilyGate: no account yet (sign-in, the code step).
export { withFamilyContext, withFamilyGate, FamilySessionRevokedError } from '@/lib/auth/db';
