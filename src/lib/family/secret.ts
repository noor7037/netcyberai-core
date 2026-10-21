import { hkdfSync } from 'crypto';
import { appSessionSecret } from '@/lib/auth/env';

// Keys for the Family app's keyed hashes (the sign-in codes, the parent PIN's pepper), each derived from the server's
// secret for one purpose only (HKDF with its own label), so a hash made for one purpose means nothing for another and
// nothing outside this server. Nothing here is stored, logged or sent anywhere.
export function familyHashKey(label: 'sign-in-codes.v1' | 'parent-pin.v1'): Buffer {
  return Buffer.from(hkdfSync('sha256', appSessionSecret(), Buffer.alloc(0), `nca.family.${label}`, 32));
}
