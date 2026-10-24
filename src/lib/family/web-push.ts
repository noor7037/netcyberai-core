import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from 'crypto';
import { familyHashKey } from './secret';

// Web Push to a browser (M3-8b, C339; the supervisor's answer 1 in C230-AD: browsers get standard Web Push, VAPID, with
// no Firebase). The standard parts, written here so no new package carries the server's key:
//   - The server's VAPID key pair (RFC 8292) is DERIVED from the server's secret for this one purpose (secret.ts), so
//     it is never stored, typed or handed to anyone. A new server secret makes new keys; the old subscriptions then
//     stop working and the parent turns notifications on again.
//   - Each message is encrypted for that one browser (RFC 8291, aes128gcm), so the push service carries it unread.
//   - A message goes only to a known push service's address (an https address on its host list): a browser gives the
//     address, and the server never posts anywhere else on a browser's say-so.
// What a message says is fixed by the service worker (public/sw.js): a kind of news and a page of the app, never a
// child's name, marks, fees or any personal detail.

const b64url = (b: Buffer) => b.toString('base64url');

// The P-256 key pair. A derived scalar at or above the curve's order is about one in 2^32; the next label is used then.
function keyPair(): { d: Buffer; publicKey: Buffer } {
  for (let i = 0; i < 4; i++) {
    const seed = i === 0 ? familyHashKey('push-vapid.v1') : Buffer.from(hkdfSync('sha256', familyHashKey('push-vapid.v1'), Buffer.alloc(0), `retry.${i}`, 32));
    try {
      const ecdh = createECDH('prime256v1');
      ecdh.setPrivateKey(seed);
      return { d: seed, publicKey: ecdh.getPublicKey() };
    } catch {
      // the next one
    }
  }
  throw new Error('no push key could be made');
}

// The server's public key, for a browser to subscribe with (base64url, uncompressed point).
export function vapidPublicKey(): string {
  return b64url(keyPair().publicKey);
}

// The push services of the browsers people use: Chrome and Android browsers (FCM), Firefox, Safari, Edge.
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
const PUSH_HOST_ENDS = ['.notify.windows.com', '.push.apple.com'];
export function pushEndpointAllowed(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length > 1000) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOSTS.includes(host) || PUSH_HOST_ENDS.some((end) => host.endsWith(end) && host.length > end.length);
}

// A browser's subscription keys: p256dh, an uncompressed P-256 point (65 bytes); auth, 16 bytes; both base64url.
export function subscriptionKeysOk(p256dh: unknown, auth: unknown): boolean {
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(p256dh) || !/^[A-Za-z0-9_-]+={0,2}$/.test(auth)) return false;
  const key = Buffer.from(p256dh, 'base64url');
  return key.length === 65 && key[0] === 4 && Buffer.from(auth, 'base64url').length === 16;
}

// The message for one browser, encrypted (RFC 8291, aes128gcm: one record).
export function encryptForBrowser(plain: Buffer, p256dh: string, auth: string, salt: Buffer = randomBytes(16), sender?: ReturnType<typeof createECDH>): Buffer {
  const uaPublic = Buffer.from(p256dh, 'base64url');
  const authSecret = Buffer.from(auth, 'base64url');
  // A new key pair of the server's for each message (the tests give their own).
  const ours = sender ?? createECDH('prime256v1');
  if (!sender) ours.generateKeys();
  const asPublic = ours.getPublicKey();
  const shared = ours.computeSecret(uaPublic);
  const ikm = Buffer.from(hkdfSync('sha256', shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([plain, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

// The VAPID header for one push service (RFC 8292): a JWT for that service's origin, signed with the server's key.
export function vapidAuthorization(endpoint: string, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const { d, publicKey } = keyPair();
  const key = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: b64url(d), x: b64url(publicKey.subarray(1, 33)), y: b64url(publicKey.subarray(33, 65)) }, format: 'jwk' });
  const head = b64url(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSeconds + 12 * 3600, sub: 'mailto:admin@netcyberai.com' })));
  const signature = sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64url(signature)}, k=${b64url(publicKey)}`;
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
// 'sent'; 'gone' (the browser ended it: 404 or 410, so it is removed); 'failed' (anything else, tried again next time).
export type PushOutcome = 'sent' | 'gone' | 'failed';
export type PushSender = (to: PushTarget, payload: Record<string, string>) => Promise<PushOutcome>;

export const sendWebPush: PushSender = async (to, payload) => {
  if (!pushEndpointAllowed(to.endpoint) || !subscriptionKeysOk(to.p256dh, to.auth)) return 'gone';
  try {
    const res = await fetch(to.endpoint, {
      method: 'POST',
      headers: { Authorization: vapidAuthorization(to.endpoint), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '43200', Urgency: 'normal' },
      body: new Uint8Array(encryptForBrowser(Buffer.from(JSON.stringify(payload)), to.p256dh, to.auth)),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
};
