import { createHmac, randomInt } from 'crypto';
import type { ChildPhone } from './child-phone-shape';
import { familyHashKey } from './secret';

export type { ChildPhone };

// A child's own phone (M2b-2, C342; docs/34 §9.4; M2B_PLAN.md). The parent's app shows a one-time code for one child;
// the child's phone enters it and gets a session for that one child, which the parent removes at once from the parent
// area.
//   - The code: six digits, ten minutes, used once, kept only as a keyed hash (the key is the server's own, so the
//     database alone cannot test codes). A new code for the child replaces the unused one; at most five an hour.
//   - Spending it: family.redeem_child_link_code, the only way, from a phone with no session yet. At most ten tries an
//     hour from one network (kept as a keyed hash of its address, never the address) and three hundred in all.
//   - The phone's session: the family session with its device and child (session.ts); the database shows that child
//     only and checks the phone is still linked on every request (src/lib/auth/db.ts). It never opens parent mode.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export const LINK_CODE_MINUTES = 10;
export const CODES_AN_HOUR = 5;

const keyed = (label: string, value: string) => createHmac('sha256', familyHashKey('child-link.v1')).update(`${label}\u0000${value}`).digest('hex');
export const linkCodeHash = (code: string) => keyed('code', code);
// A network's key for counting tries: the address is never kept.
export const tryKey = (ip: string) => keyed('ip', ip || 'unknown');

// What the phone typed, made comparable: six digits, spaces and dashes ignored; anything else is not a code.
export function normalizeLinkCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\s-]/g, '');
  return /^[0-9]{6}$/.test(s) ? s : null;
}

export type IssueResult = { ok: true; code: string; expiresAt: string } | { ok: false; reason: 'not_found' | 'too_many' };

// The parent's code for one of the account's children (in the parent's own session).
export async function issueLinkCode(db: Db, accountId: string, childId: string): Promise<IssueResult> {
  const child = (await db.query(`select 1 from family.children where account_id = $1 and child_id = $2`, [accountId, childId])).rows[0];
  if (!child) return { ok: false, reason: 'not_found' };
  const recent = Number((await db.query(`select count(*) as n from family.child_link_codes where account_id = $1 and created_at > now() - interval '1 hour'`, [accountId])).rows[0].n);
  if (recent >= CODES_AN_HOUR) return { ok: false, reason: 'too_many' };
  // The child's unused code stops working (kept, so it still counts towards the hour's five).
  await db.query(`update family.child_link_codes set used_at = now() where account_id = $1 and child_id = $2 and used_at is null`, [accountId, childId]);
  for (let i = 0; i < 5; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const made = await db.query(
      `insert into family.child_link_codes (account_id, child_id, code_hash, expires_at) values ($1, $2, $3, now() + make_interval(mins => $4))
       on conflict (code_hash) do nothing returning expires_at`,
      [accountId, childId, linkCodeHash(code), LINK_CODE_MINUTES]
    );
    if (made.rows[0]) return { ok: true, code, expiresAt: new Date(made.rows[0].expires_at as string).toISOString() };
  }
  return { ok: false, reason: 'too_many' };
}

export type RedeemResult = { ok: true; accountId: string; childId: string; deviceId: string; tokenVersion: number } | { ok: false; reason: 'wrong' | 'too_many' };

// A phone with no session spends a code (withFamilyGate: the family role with no account).
export async function redeemLinkCode(db: Db, typed: unknown, ip: string): Promise<RedeemResult> {
  const code = normalizeLinkCode(typed);
  const r = (await db.query(`select outcome, account_id, child_id, device_id, token_version from family.redeem_child_link_code($1, $2)`, [code ? linkCodeHash(code) : '0'.repeat(64), tryKey(ip)]))
    .rows[0];
  if (r?.outcome === 'linked') return { ok: true, accountId: String(r.account_id), childId: String(r.child_id), deviceId: String(r.device_id), tokenVersion: Number(r.token_version) };
  return { ok: false, reason: r?.outcome === 'too_many' ? 'too_many' : 'wrong' };
}


// The children's phones still linked, for the parent area.
export async function listChildPhones(db: Db, accountId: string): Promise<ChildPhone[]> {
  const { rows } = await db.query(
    `select device_id, child_id, linked_at, last_seen_at from family.child_devices where account_id = $1 and revoked_at is null order by linked_at`,
    [accountId]
  );
  return rows.map((r) => ({
    deviceId: String(r.device_id),
    childId: String(r.child_id),
    linkedAt: new Date(r.linked_at as string).toISOString(),
    lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at as string).toISOString() : null,
  }));
}

// The parent removes a phone (or the phone signs itself out): its session ends at its next request.
export async function removeChildPhone(db: Db, accountId: string, deviceId: string): Promise<boolean> {
  return ((await db.query(`update family.child_devices set revoked_at = now() where account_id = $1 and device_id = $2 and revoked_at is null`, [accountId, deviceId])).rowCount ?? 0) > 0;
}
