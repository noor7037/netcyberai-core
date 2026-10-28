import { hkdfSync } from 'crypto';
import { appSessionSecret } from '@/lib/auth/env';

// Keys for the Family app's keyed hashes and sealed items (the sign-in codes, the parent PIN's pepper, the answer keys of
// checks, the Focus Lock's phone ids, Web Push), each derived from the server's secret for one purpose only (HKDF with
// its own label), so what is made for one purpose means nothing for another and nothing outside this server. No key is
// stored, logged or sent anywhere.
export function familyHashKey(label: 'sign-in-codes.v1' | 'parent-pin.v1' | 'check-items.v1' | 'homework.v1' | 'push-vapid.v1' | 'focus-device.v1' | 'child-link.v1' | 'voice-lines.v1'): Buffer {
  return Buffer.from(hkdfSync('sha256', appSessionSecret(), Buffer.alloc(0), `nca.family.${label}`, 32));
}
