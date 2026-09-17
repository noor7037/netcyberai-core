import { signAccessToken } from '../../src/lib/auth/jwt';

const role = process.argv[2] as any;
const schoolId = process.argv[3] === 'null' ? null : process.argv[3];

async function main() {
  const token = await signAccessToken({
    sub: '00000000-0000-0000-0000-0000000000aa',
    role,
    schoolId,
    membershipId: schoolId ? '00000000-0000-0000-0000-0000000000bb' : null,
    tokenVersion: 0,
    aal: role === 'super_admin' ? 'aal2' : 'aal1',
    sessionId: '00000000-0000-0000-0000-0000000000cc',
  });
  console.log(token);
}
main();
