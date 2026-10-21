import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { familyHashKey } from './secret';

// The parent PIN (docs/34 §9.1 rule 1; M1-2, C248). Six digits, set at sign-up; it guards the parent area (settings,
// consents, children, deleting the account), so on a shared phone the child never reaches parent controls.
// - Stored only as a salted hash: scrypt over an HMAC of the PIN with a server-side key (a pepper), so a copy of the
//   database alone cannot be searched through the million possible PINs.
// - After 5 wrong tries the wait grows: 1, 5, 15, then 60 minutes for every further wrong try. No hints, never shown.
// - Reset only by a code sent to the parent's email (purpose pin_reset).

const scrypt = promisify(scryptCb) as (pw: Buffer, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) => Promise<Buffer>;
const N = 1 << 14;
const R = 8;
const P = 1;

export const FREE_TRIES = 5;
const WAIT_MINUTES = [1, 5, 15, 60];

// A PIN is six digits, not all the same and not a straight run (123456, 654321): the first guesses anyone tries.
export function pinProblem(raw: unknown): 'format' | 'too_simple' | null {
  if (typeof raw !== 'string' || !/^[0-9]{6}$/.test(raw)) return 'format';
  const d = [...raw].map(Number);
  const same = d.every((x) => x === d[0]);
  const up = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const down = d.every((x, i) => i === 0 || x === d[i - 1] - 1);
  return same || up || down ? 'too_simple' : null;
}

function pepper(pin: string): Buffer {
  return createHmac('sha256', familyHashKey('parent-pin.v1')).update(pin).digest();
}

export async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(pepper(pin), salt, 32, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function pinMatches(stored: string, pin: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  const salt = Buffer.from(parts[4], 'base64');
  const want = Buffer.from(parts[5], 'base64');
  const got = await scrypt(pepper(pin), salt, want.length, { N: n, r, p, maxmem: 64 * 1024 * 1024 });
  return got.length === want.length && timingSafeEqual(got, want);
}

// How long to wait after this many wrong tries in a row (0 while tries are free).
export function waitAfter(failures: number): number {
  if (failures < FREE_TRIES) return 0;
  return WAIT_MINUTES[Math.min(failures - FREE_TRIES, WAIT_MINUTES.length - 1)] * 60_000;
}

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type PinCheck = { status: 'ok' } | { status: 'wrong' } | { status: 'wait'; minutes: number } | { status: 'no_pin' };

// Check the PIN for the signed-in account (its own row, inside withFamilyContext), counting a wrong try.
export async function checkPin(db: Db, accountId: string, pin: string, now: Date = new Date()): Promise<PinCheck> {
  const { rows } = await db.query(`select pin_hash, pin_failures, pin_locked_until from family.accounts where account_id = $1 for update`, [accountId]);
  const row = rows[0];
  if (!row || !row.pin_hash) return { status: 'no_pin' };
  const lockedUntil = row.pin_locked_until ? new Date(String(row.pin_locked_until)) : null;
  if (lockedUntil && lockedUntil > now) return { status: 'wait', minutes: Math.ceil((lockedUntil.getTime() - now.getTime()) / 60_000) };
  if (await pinMatches(String(row.pin_hash), pin)) {
    await db.query(`update family.accounts set pin_failures = 0, pin_locked_until = null where account_id = $1`, [accountId]);
    return { status: 'ok' };
  }
  const failures = Number(row.pin_failures) + 1;
  const wait = waitAfter(failures);
  await db.query(`update family.accounts set pin_failures = $2, pin_locked_until = $3 where account_id = $1`, [accountId, Math.min(failures, 1000), wait ? new Date(now.getTime() + wait) : null]);
  return wait ? { status: 'wait', minutes: Math.ceil(wait / 60_000) } : { status: 'wrong' };
}

// Set (or, after a reset code, replace) the PIN. Clears the wrong-try count.
export async function setPin(db: Db, accountId: string, pin: string): Promise<void> {
  await db.query(`update family.accounts set pin_hash = $2, pin_set_at = now(), pin_failures = 0, pin_locked_until = null where account_id = $1`, [accountId, await hashPin(pin)]);
}
