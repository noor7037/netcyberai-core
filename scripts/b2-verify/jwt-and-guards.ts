// The only part of B2's auth stack this sandbox's network policy lets us
// exercise end-to-end: pure JS, no outbound HTTP, no Postgres. See the
// B2 report's "network constraint" section for why the Supabase Auth
// HTTP calls (signInWithPassword, mfa.enroll/challenge/verify) could not
// be run live from here, and what was substituted instead.
import { signAccessToken, verifyAccessToken } from '../../src/lib/auth/jwt';
import { canAccessControl, canAccessApp, shellForRole } from '../../src/lib/auth/guards';

async function main() {
  const claims = {
    sub: '00000000-0000-0000-0000-000000000001',
    role: 'teacher' as const,
    schoolId: '00000000-0000-0000-0000-000000000002',
    membershipId: '00000000-0000-0000-0000-000000000003',
    tokenVersion: 0,
    aal: 'aal1' as const,
    sessionId: '00000000-0000-0000-0000-000000000004',
  };
  const token = await signAccessToken(claims);
  const verified = await verifyAccessToken(token);
  console.log('1. signed token verifies back to identical claims:', JSON.stringify(verified) === JSON.stringify(claims));

  console.log('2. canAccessControl(teacher):', canAccessControl(verified), '  canAccessApp(teacher):', canAccessApp(verified));
  const superClaims = { ...claims, role: 'super_admin' as const, schoolId: null, membershipId: null };
  console.log('3. canAccessControl(super_admin, no school):', canAccessControl(superClaims), '  canAccessApp(super_admin, no school):', canAccessApp(superClaims));
  console.log('4. shellForRole: teacher=', shellForRole('teacher'), ' accountant=', shellForRole('accountant'), ' principal=', shellForRole('principal'), ' academic_coordinator=', shellForRole('academic_coordinator'), ' super_admin=', shellForRole('super_admin'));

  const tampered = token.slice(0, -3) + 'xyz';
  console.log('5. verifyAccessToken(tampered signature):', await verifyAccessToken(tampered));

  const shortLived = await signAccessToken(claims, 1);
  await new Promise((r) => setTimeout(r, 1500));
  console.log('6. verifyAccessToken(real clock, expired 1s TTL after 1.5s wait):', await verifyAccessToken(shortLived));
}

main().catch((err) => { console.error(err); process.exit(1); });
