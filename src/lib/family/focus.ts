import { createHash, createHmac } from 'crypto';
import { isPrePrimary, listChildren } from './children';
import { readFamilySwitches, switchOn } from './flags';
import { dayPlan, type PlanKind } from './plan';
import { familyHashKey } from './secret';

// The Focus Lock's server (M2b-1, C305; docs/34 §9; M2B_PLAN.md, Decisions C304). The lock itself runs on the phone and
// keeps its rules there (the apps, the lock times, the parent session, WhatsApp, the educational apps). The server only:
// - says, for the children set for a phone, whether today's plan is done (from that day's checked answers alone, as
//   dayPlan decides), what is still pending (titles and keys, for the block screen), and the parent PIN's version;
// - keeps the phone's lock health: three flags, about every 30 minutes while the lock is on, and nothing else (no app
//   name, no time of use);
// - tells the parent, in the parent area and by one email, when a permission was switched off, the clock was changed,
//   or the reports stopped while the lock was on (family.focus_sweep(), in the migration).
// A phone is known by a keyed hash of its own random id (the X-Focus-Device header), never by the id itself.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

export const FOCUS_DEVICE_HEADER = 'x-focus-device';
// The phone's own random id: at least 32 characters of base64url (the plugin makes 32 random bytes).
const DEVICE_ID = /^[A-Za-z0-9_-]{32,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

// The keyed hash the server keeps, bound to the account (the same phone in two families gives two unrelated hashes);
// null for anything that is not a phone id.
export function deviceHash(accountId: string, raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !DEVICE_ID.test(raw)) return null;
  return createHmac('sha256', familyHashKey('focus-device.v1')).update(`${accountId}\u0000${raw}`).digest('hex');
}

// The Focus Lock works for a family when Control has it switched on for them (off by default, C304), and the plan it
// reads is switched on too.
export async function focusOn(db: Db, accountId: string): Promise<boolean> {
  const s = await readFamilySwitches(db, accountId);
  return switchOn(s, 'focus_lock') && switchOn(s, 'plan');
}

// ---- the heartbeat --------------------------------------------------------------------------------------------------

export type Heartbeat = { lockOn: boolean; permissionsOk: boolean; clockChanged: boolean };
const HEARTBEAT_FIELDS = ['lockOn', 'permissionsOk', 'clockChanged'] as const;
// The three flags as JSON are well under this; anything longer carries something else.
export const HEARTBEAT_MAX_BYTES = 200;
// A report that repeats the last one within this is refused; a report that changes a flag is always taken, so the
// phone's report "at once on a change" (the lock ending with its window, a permission switched off) is never lost
// (review of C305). The phone sends one about every 30 minutes.
export const HEARTBEAT_MIN_SECONDS = 60;

// Exactly the three flags, each true or false: a missing one, another field, or another shape is refused.
export function parseHeartbeat(text: string): Heartbeat | null {
  if (Buffer.byteLength(text, 'utf8') > HEARTBEAT_MAX_BYTES) return null;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.getPrototypeOf(body) !== Object.prototype) return null;
  const keys = Object.keys(body);
  if (keys.length !== HEARTBEAT_FIELDS.length || !HEARTBEAT_FIELDS.every((k) => keys.includes(k))) return null;
  const o = body as Record<string, unknown>;
  if (!HEARTBEAT_FIELDS.every((k) => typeof o[k] === 'boolean')) return null;
  return { lockOn: o.lockOn as boolean, permissionsOk: o.permissionsOk as boolean, clockChanged: o.clockChanged as boolean };
}

export type NoticeKind = 'stopped' | 'permissions' | 'clock';

// One report from the phone. A permission switched off (or off at the first report) and a clock change each leave one
// notice, kept until the parent has seen it (a repeat while one is unseen adds nothing). A report also ends a gap, so a
// later stop is told again.
export async function recordHeartbeat(db: Db, accountId: string, hash: string, hb: Heartbeat): Promise<'ok' | 'unknown_device' | 'too_soon'> {
  const { rows } = await db.query(
    `select device_id, lock_on, permissions_ok, clock_changed, coalesce(last_heartbeat_at > now() - make_interval(secs => $3), false) as too_soon
       from family.focus_devices where account_id = $1 and device_hash = $2 for update`,
    [accountId, hash, HEARTBEAT_MIN_SECONDS]
  );
  const d = rows[0];
  if (!d) return 'unknown_device';
  const same = d.lock_on === hb.lockOn && d.permissions_ok === hb.permissionsOk && d.clock_changed === hb.clockChanged;
  if (d.too_soon === true && same) return 'too_soon';
  await db.query(
    `update family.focus_devices set last_heartbeat_at = now(), lock_on = $3, permissions_ok = $4, clock_changed = $5, stop_noticed_at = null
      where account_id = $1 and device_id = $2`,
    [accountId, d.device_id, hb.lockOn, hb.permissionsOk, hb.clockChanged]
  );
  const kinds: NoticeKind[] = [];
  if (!hb.permissionsOk && d.permissions_ok !== false) kinds.push('permissions');
  if (hb.clockChanged) kinds.push('clock');
  for (const kind of kinds) {
    await db.query(`insert into family.focus_notices (account_id, device_id, kind) values ($1, $2, $3) on conflict (device_id, kind) where seen_at is null do nothing`, [
      accountId,
      d.device_id,
      kind,
    ]);
  }
  return 'ok';
}

// Control has the Focus Lock off for this family: its phones' locks are no longer on as far as the server is concerned,
// so a phone that stops reporting now is never told to the parent as a stopped lock.
export async function standDown(db: Db, accountId: string): Promise<void> {
  await db.query(`update family.focus_devices set lock_on = false, stop_noticed_at = null where account_id = $1 and lock_on`, [accountId]);
}

// ---- the status -----------------------------------------------------------------------------------------------------

export type FocusPending = { key: string; title: string; subject: string; kind: PlanKind };
export type FocusChildStatus = { childId: string; firstName: string; done: boolean; pending: FocusPending[] };
export type FocusStatus = { day: string; pinVersion: string | null; children: FocusChildStatus[] };

// The parent PIN's version: changes whenever the PIN is set again (a reset), so the lock asks for the new one.
export function pinVersionOf(pinSetAt: unknown): string | null {
  if (pinSetAt == null) return null;
  const at = pinSetAt instanceof Date ? pinSetAt.toISOString() : String(pinSetAt);
  return createHash('sha256').update(`pin-version\u0000${at}`).digest('hex').slice(0, 16);
}

export async function deviceId(db: Db, accountId: string, hash: string): Promise<string | null> {
  const { rows } = await db.query(`select device_id from family.focus_devices where account_id = $1 and device_hash = $2`, [accountId, hash]);
  return rows[0] ? String(rows[0].device_id) : null;
}

// For each child set for the phone (in the order the family added them): today's plan, done only when every item has a
// checked answer today (dayPlan), and what is still pending. A day with nothing in the plan counts as done: the lock
// never holds a child with nothing to do (review of C305). The day is India's, from the server.
export async function focusStatus(db: Db, accountId: string, device: string, day: string): Promise<FocusStatus> {
  const set = new Set(
    (await db.query(`select child_id from family.focus_device_children where account_id = $1 and device_id = $2`, [accountId, device])).rows.map((r) => String(r.child_id))
  );
  const children = (await listChildren(db, accountId)).filter((c) => set.has(c.childId));
  const out: FocusChildStatus[] = [];
  for (const child of children) {
    const plan = await dayPlan(db, accountId, child, day, child.language);
    out.push({
      childId: child.childId,
      firstName: child.firstName,
      done: plan.complete || plan.items.length === 0,
      pending: plan.items.filter((i) => !i.done).map((i) => ({ key: i.topicKey, title: i.title, subject: i.subject, kind: i.kind })),
    });
  }
  const { rows } = await db.query(`select pin_set_at from family.accounts where account_id = $1`, [accountId]);
  return { day, pinVersion: pinVersionOf(rows[0]?.pin_set_at), children: out };
}

// ---- the parent's side ----------------------------------------------------------------------------------------------

export const MAX_DEVICE_CHILDREN = 8;

// The children a phone is set for: one to eight distinct ids, each a child of this family.
export async function checkDeviceChildren(db: Db, accountId: string, raw: unknown): Promise<string[] | null> {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_DEVICE_CHILDREN || !raw.every(isUuid)) return null;
  const ids = Array.from(new Set(raw as string[]));
  if (ids.length !== raw.length) return null;
  // A pre-primary child has no study plan (dayPlan gives no topics), so the lock has nothing to unlock with: not set.
  const own = new Set((await listChildren(db, accountId)).filter((c) => !isPrePrimary(c.classLevel)).map((c) => c.childId));
  return ids.every((id) => own.has(id)) ? ids : null;
}

// Set up this phone, or change the children it is set for. The phone's id is kept only as its keyed hash.
export async function registerDevice(db: Db, accountId: string, hash: string, childIds: string[]): Promise<string> {
  const { rows } = await db.query(
    `insert into family.focus_devices (account_id, device_hash) values ($1, $2)
     on conflict (account_id, device_hash) do update set device_hash = excluded.device_hash
     returning device_id`,
    [accountId, hash]
  );
  const id = String(rows[0].device_id);
  await db.query(`delete from family.focus_device_children where account_id = $1 and device_id = $2`, [accountId, id]);
  await db.query(
    `insert into family.focus_device_children (account_id, device_id, child_id) select $1, $2, c from unnest($3::uuid[]) as c`,
    [accountId, id, childIds]
  );
  return id;
}

export async function removeDevice(db: Db, accountId: string, device: string): Promise<boolean> {
  const res = await db.query(`delete from family.focus_devices where account_id = $1 and device_id = $2`, [accountId, device]);
  return (res.rowCount ?? 0) > 0;
}

export async function markNoticeSeen(db: Db, accountId: string, notice: string): Promise<boolean> {
  const res = await db.query(`update family.focus_notices set seen_at = now() where account_id = $1 and notice_id = $2 and seen_at is null`, [accountId, notice]);
  return (res.rowCount ?? 0) > 0;
}

export type ParentFocusDevice = { deviceId: string; childNames: string[]; lastReportAt: string | null; lockOn: boolean | null; permissionsOk: boolean | null };
export type ParentFocusNotice = { noticeId: string; deviceId: string; kind: NoticeKind; at: string };
export type ParentFocus = { devices: ParentFocusDevice[]; notices: ParentFocusNotice[] };

const iso = (v: unknown) => (v == null ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

// The parent area's view: the phones set up, their last report, and the notices not yet seen (newest first).
export async function parentFocus(db: Db, accountId: string): Promise<ParentFocus> {
  const children = await listChildren(db, accountId);
  const { rows: d } = await db.query(
    `select d.device_id, d.last_heartbeat_at, d.lock_on, d.permissions_ok, coalesce(array_agg(c.child_id::text) filter (where c.child_id is not null), '{}'::text[]) as child_ids
       from family.focus_devices d left join family.focus_device_children c on c.device_id = d.device_id and c.account_id = d.account_id
      where d.account_id = $1 group by d.device_id order by d.created_at, d.device_id`,
    [accountId]
  );
  const { rows: n } = await db.query(`select notice_id, device_id, kind, at from family.focus_notices where account_id = $1 and seen_at is null order by at desc, notice_id`, [accountId]);
  return {
    devices: d.map((r) => ({
      deviceId: String(r.device_id),
      // In the order the family added its children.
      childNames: children.filter((c) => (r.child_ids as string[]).includes(c.childId)).map((c) => c.firstName),
      lastReportAt: iso(r.last_heartbeat_at),
      lockOn: r.lock_on == null ? null : r.lock_on === true,
      permissionsOk: r.permissions_ok == null ? null : r.permissions_ok === true,
    })),
    notices: n.map((r) => ({ noticeId: String(r.notice_id), deviceId: String(r.device_id), kind: r.kind as NoticeKind, at: iso(r.at)! })),
  };
}

// "24 Oct, 4:30 pm" in India time, in the parent's language.
export function focusTimeLabel(at: string, lang: 'en' | 'hi'): string {
  return new Intl.DateTimeFormat(lang === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(at));
}
