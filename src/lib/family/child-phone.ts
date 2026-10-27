import { createHmac, randomBytes, randomInt } from 'crypto';
import type { ChildPhone } from './child-phone-shape';
import { readFamilySwitches } from './flags';
import { familyHashKey } from './secret';

export type { ChildPhone };

// A child's own phone (M2b-2, C342; reversed by C230-AF, C346; docs/34 §9.4). The CHILD's phone asks for a code and
// shows it; the parent, signed in, in parent mode, types it in the parent area and says which child; the phone that
// asked then takes a session for that one child, which the parent removes at once from the parent area.
//   - The code: six digits, ten minutes, kept only as a keyed hash (the key is the server's own, so the database alone
//     cannot test codes). A code alone opens nothing: only a signed-in parent can approve it, for their own child, at
//     most ten tries an hour; and only the phone holding the claim (a long random value in its own cookie, kept here
//     only as a keyed hash) can take the session.
//   - Asking: at most ten an hour from one network (an IPv4 address, or an IPv6 /64; kept as a keyed hash, never the
//     address) and three hundred in all.
//   - The phone's session: the family session with its device and child (session.ts); the database shows that child
//     only and checks the phone is still linked on every request (src/lib/auth/db.ts). It never opens parent mode.
//   - Only while Control has the Focus Lock switched on (C230-AF): for the family, to approve; for anyone, to ask.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export const LINK_CODE_MINUTES = 10;
// The phone's claim, in its own cookie, sent only to the link route.
export const CHILD_LINK_COOKIE = 'ncf_link';
export const CHILD_LINK_COOKIE_PATH = '/api/family/child-phone/link';

const keyed = (label: string, value: string) => createHmac('sha256', familyHashKey('child-link.v1')).update(`${label}\u0000${value}`).digest('hex');
export const linkCodeHash = (code: string) => keyed('code', code);
export const claimHash = (claim: string) => keyed('claim', claim);
// The network an address belongs to, for counting tries: an IPv4 address as it is; an IPv6 address by its /64, the block
// one home or phone is given, so changing the last 64 bits does not buy more tries (review of C342).
export function networkOf(ip: string): string {
  const a = ip.trim().toLowerCase().replace(/%.*$/, '');
  if (!a.includes(':')) return a || 'unknown';
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) return mapped[1];
  const [head, tail] = a.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = tail === undefined ? left : [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return 'unknown';
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

// A network's key for counting tries: the address is never kept.
export const tryKey = (ip: string) => keyed('ip', networkOf(ip));

// What the parent typed, made comparable: six digits, spaces and dashes ignored; anything else is not a code.
export function normalizeLinkCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/[\s-]/g, '');
  return /^[0-9]{6}$/.test(s) ? s : null;
}

// Whether children's own phones are open to anyone: Control has the Focus Lock switched on for some audience. A phone
// with no session cannot say whose it is, so this is all it is asked; the parent's approval checks the family's own.
export async function childPhonesOffered(db: Db): Promise<boolean> {
  return (await readFamilySwitches(db, null)).flags.some((f) => f.module === 'focus_lock' && f.enabled);
}

export type StartResult = { ok: true; code: string; claim: string; expiresAt: string } | { ok: false; reason: 'too_many' };

// A phone with no session asks for a code (withFamilyGate: the family role with no account).
export async function startChildLink(db: Db, ip: string): Promise<StartResult> {
  for (let i = 0; i < 5; i++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const claim = randomBytes(32).toString('base64url');
    const out = (await db.query(`select family.open_child_link_request($1, $2, $3) as outcome`, [linkCodeHash(code), claimHash(claim), tryKey(ip)])).rows[0]?.outcome;
    if (out === 'made') return { ok: true, code, claim, expiresAt: new Date(Date.now() + LINK_CODE_MINUTES * 60_000).toISOString() };
    if (out !== 'taken') return { ok: false, reason: 'too_many' };
  }
  return { ok: false, reason: 'too_many' };
}

export type ApproveResult = { ok: true } | { ok: false; reason: 'wrong' | 'too_many' | 'not_found' };

// The parent, in their own session, types the code shown on the child's phone, for one of their children.
export async function approveChildLink(db: Db, childId: string, typed: unknown): Promise<ApproveResult> {
  const code = normalizeLinkCode(typed);
  const out = (await db.query(`select family.approve_child_link($1, $2) as outcome`, [code ? linkCodeHash(code) : '0'.repeat(64), childId])).rows[0]?.outcome;
  if (out === 'linked') return { ok: true };
  return { ok: false, reason: out === 'too_many' ? 'too_many' : out === 'not_found' ? 'not_found' : 'wrong' };
}

export type ClaimResult = { status: 'linked'; accountId: string; childId: string; deviceId: string; tokenVersion: number } | { status: 'waiting' } | { status: 'gone' };

// The phone that asked, with its claim, takes its session once the parent has approved (withFamilyGate).
export async function claimChildLink(db: Db, claim: string | undefined): Promise<ClaimResult> {
  if (!claim || !/^[A-Za-z0-9_-]{43}$/.test(claim)) return { status: 'gone' };
  const r = (await db.query(`select outcome, account_id, child_id, device_id, token_version from family.claim_child_link($1)`, [claimHash(claim)])).rows[0];
  if (r?.outcome === 'linked') return { status: 'linked', accountId: String(r.account_id), childId: String(r.child_id), deviceId: String(r.device_id), tokenVersion: Number(r.token_version) };
  return r?.outcome === 'waiting' ? { status: 'waiting' } : { status: 'gone' };
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
