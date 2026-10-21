import { withBackendConnection } from './db';
import { signDeviceToken, verifyDeviceToken } from './jwt';
import { fetchLiveUser } from './resolve';

// "Trust this browser for 30 days" (F1-1, C257; C90 before it). A browser that passed a sign-in step with the box
// ticked gets a trusted_devices row and a signed token naming it. Next time, a password on that browser skips what the
// browser proved: the emailed code ('email'), or the authenticator and the emailed code ('authenticator'). It counts
// only while all of this holds: the token's signature, the row belongs to the same person, the row is not forgotten,
// it has not expired (30 days from when it was trusted, never lengthened), and the person's token_version is the one
// it was made under (a password reset or "sign out everywhere" moves it). A password change and "sign out everywhere"
// also end every row, and "forget" ends one, from this browser or from the account page's list.

export type DeviceProof = 'authenticator' | 'email';
export const DEVICE_TRUST_DAYS = 30;
const DEVICE_TRUST_MS = DEVICE_TRUST_DAYS * 24 * 60 * 60 * 1000;

// A short name for the account page's list, from the browser's user agent: never the whole string.
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  if (/NetCyberAIFamily\//.test(ua)) return 'NetCyberAI Family app';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /SamsungBrowser\//.test(ua)
      ? 'Samsung Internet'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'A browser';
  const system = /Android/.test(ua)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iPhone or iPad'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'Mac'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return system ? `${browser} on ${system}` : browser;
}

// A new trusted row for this browser, and the token that names it. A token this browser already held is ended first,
// so one browser has one row.
export async function trustDevice(userId: string, proof: DeviceProof, userAgent: string | null, previousToken?: string): Promise<{ token: string; ttlSeconds: number }> {
  const live = await fetchLiveUser(userId);
  const previous = previousToken ? await verifyDeviceToken(previousToken) : null;
  const deviceId = await withBackendConnection(async (client) => {
    if (previous && previous.userId === userId) {
      await client.query(`update trusted_devices set revoked_at = now() where device_id = $1 and user_id = $2 and revoked_at is null`, [previous.deviceId, userId]);
    }
    const { rows } = await client.query(
      `insert into trusted_devices (user_id, proof, label, expires_at) values ($1, $2, $3, $4) returning device_id`,
      [userId, proof, deviceLabel(userAgent), new Date(Date.now() + DEVICE_TRUST_MS)]
    );
    return String(rows[0].device_id);
  });
  const ttlSeconds = DEVICE_TRUST_DAYS * 24 * 60 * 60;
  return { token: await signDeviceToken(userId, Number(live.token_version), deviceId, ttlSeconds), ttlSeconds };
}

// What this browser proved for this person, or null when it is not (or no longer) trusted.
export async function deviceProof(token: string | undefined, userId: string): Promise<DeviceProof | null> {
  if (!token) return null;
  const device = await verifyDeviceToken(token);
  if (!device || device.userId !== userId) return null;
  const live = await fetchLiveUser(userId);
  if (Number(live.token_version) !== device.tokenVersion) return null;
  return withBackendConnection(async (client) => {
    const { rows } = await client.query(
      `update trusted_devices set last_used_at = now()
        where device_id = $1 and user_id = $2 and revoked_at is null and expires_at > now()
        returning proof`,
      [device.deviceId, userId]
    );
    return (rows[0]?.proof as DeviceProof | undefined) ?? null;
  });
}

export type TrustedDevice = { deviceId: string; label: string; proof: DeviceProof; createdAt: string; lastUsedAt: string; expiresAt: string; thisDevice: boolean };

// The account page's list: this person's trusted browsers that still count, newest use first.
export async function listDevices(userId: string, currentToken?: string): Promise<TrustedDevice[]> {
  const current = currentToken ? await verifyDeviceToken(currentToken) : null;
  const rows = await withBackendConnection(async (client) => {
    const { rows } = await client.query(
      `select device_id, label, proof, created_at, last_used_at, expires_at from trusted_devices
        where user_id = $1 and revoked_at is null and expires_at > now()
        order by last_used_at desc limit 50`,
      [userId]
    );
    return rows;
  });
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
  return rows.map((r) => ({
    deviceId: String(r.device_id),
    label: String(r.label),
    proof: r.proof as DeviceProof,
    createdAt: iso(r.created_at),
    lastUsedAt: iso(r.last_used_at),
    expiresAt: iso(r.expires_at),
    thisDevice: current?.userId === userId && current.deviceId === String(r.device_id),
  }));
}

// "Forget": one of this person's own rows. False when it is not theirs or already ended.
export async function forgetDevice(userId: string, deviceId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(deviceId)) return false;
  return withBackendConnection(async (client) => {
    const { rowCount } = await client.query(`update trusted_devices set revoked_at = now() where device_id = $1 and user_id = $2 and revoked_at is null`, [deviceId, userId]);
    return (rowCount ?? 0) > 0;
  });
}

// "Forget this device" from the browser itself: the row its token names, if the token is genuine.
export async function forgetThisDevice(token: string | undefined): Promise<boolean> {
  const device = token ? await verifyDeviceToken(token) : null;
  return device ? forgetDevice(device.userId, device.deviceId) : false;
}

// A password change or "sign out everywhere": every trusted browser of the person.
export async function forgetAllDevices(userId: string): Promise<number> {
  return withBackendConnection(async (client) => {
    const { rowCount } = await client.query(`update trusted_devices set revoked_at = now() where user_id = $1 and revoked_at is null`, [userId]);
    return rowCount ?? 0;
  });
}
