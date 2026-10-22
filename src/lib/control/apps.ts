import type { PoolClient } from 'pg';
import { writeAuditLog } from '@/lib/audit/log';
import { APP_IDS, FLAG_AUDIENCES, WHOLE_APP, type AppFlag, type AppId, type BannerTone, type FlagAudience } from '@/lib/contracts/app-flags';
import type { SessionRole } from '@/lib/auth/types';
import { FAMILY_MODULES } from '@/lib/contracts/family-modules';

// Control → Apps v1 (docs/family-app/10 §2, M1-7): the version setting, the module flags with their audience, the
// kill switches, the banner and the preview accounts of the three apps, as the platform role (the founder's session).
// Every change writes an audit row (platform-level: school_id null) holding the state before and after, with the
// reason inside the after state, and can be undone in one step (undoChange), which is itself audited.
//
// Nothing here reads a name, a child or an answer: flags, banners and ids of accounts only.

type Sql = Pick<PoolClient, 'query'>;
export interface Actor {
  userId: string;
  role: SessionRole;
}
export type Failure = { ok: false; code: string };
export type Done<T = object> = ({ ok: true } & T) | Failure;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODULE = /^[a-z][a-z0-9_.]{1,59}$/;
const REASON_MAX = 300;
const TEXT_MAX = 300;

// The audit actions this screen writes: the only ones the Undo list reads.
export const APP_AUDIT_ACTIONS = ['app_flag.set', 'app_version.set', 'app_banner.create', 'app_banner.end', 'preview_account.add', 'preview_account.remove'] as const;
export type AppAuditAction = (typeof APP_AUDIT_ACTIONS)[number];
export const UNDO_ACTION = 'app_change.undo';

const isApp = (v: unknown): v is AppId => typeof v === 'string' && (APP_IDS as readonly string[]).includes(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function parseReason(v: unknown): string | null {
  const r = text(v);
  return r.length >= 1 && r.length <= REASON_MAX ? r : null;
}

// --- The live build -------------------------------------------------------------------------------------------------

export interface LiveBuild {
  commit: string | null; // the first 7 characters of the commit, when the environment gives it
  deployedAt: string | null; // ISO, when the environment gives it
}

export function liveBuild(env: Record<string, string | undefined> = process.env): LiveBuild {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim();
  const at = env.VERCEL_DEPLOYMENT_CREATED_AT ?? env.VERCEL_DEPLOY_TIME ?? env.NCA_DEPLOYED_AT;
  let deployedAt: string | null = null;
  if (at && at.trim()) {
    const n = Number(at);
    const d = new Date(Number.isFinite(n) && n > 1e9 ? (n < 1e12 ? n * 1000 : n) : at);
    deployedAt = Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return { commit: sha && /^[0-9a-f]{7,}$/i.test(sha) ? sha.slice(0, 7) : null, deployedAt };
}

// --- What the page reads ------------------------------------------------------------------------------------------------

export interface FlagRow {
  app: AppId;
  module: string;
  enabled: boolean;
  audience: FlagAudience;
  audience_percent: number | null;
  audience_schools: string[] | null;
  reason: string | null;
  ends_at: string | null;
  off_message_en: string | null;
  off_message_hi: string | null;
  updated_at: string;
}
export interface BannerRow {
  banner_id: string;
  app: AppId;
  tone: BannerTone;
  text_en: string;
  text_hi: string;
  starts_at: string;
  ends_at: string;
  ended_at: string | null;
}
export interface PreviewRow {
  account_id: string;
  added_by: string;
  added_at: string;
}
export interface ChangeRow {
  audit_id: string;
  occurred_at: string;
  event_action: string;
  target_id: string | null;
  actor_name: string | null;
  reason: string | null;
  undone: boolean;
  undoable: boolean;
}
export interface ControlApps {
  minShell: Record<AppId, number>;
  flags: FlagRow[];
  banners: BannerRow[]; // those not ended and not yet past their end
  preview: PreviewRow[];
  changes: ChangeRow[];
  schools: { id: string; name: string }[]; // for the "listed schools" audience
}

const FLAG_COLUMNS = `app, module, enabled, audience, audience_percent, audience_schools, reason, ends_at, off_message_en, off_message_hi, updated_at`;
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : new Date(v as string).toISOString());
const flagFromRow = (r: Record<string, unknown>): FlagRow => ({
  app: r.app as AppId,
  module: r.module as string,
  enabled: r.enabled as boolean,
  audience: r.audience as FlagAudience,
  audience_percent: r.audience_percent === null ? null : Number(r.audience_percent),
  audience_schools: (r.audience_schools as string[] | null) ?? null,
  reason: (r.reason as string | null) ?? null,
  ends_at: iso(r.ends_at),
  off_message_en: (r.off_message_en as string | null) ?? null,
  off_message_hi: (r.off_message_hi as string | null) ?? null,
  updated_at: iso(r.updated_at) as string,
});

// The Family app's modules as Control → Apps lists them (C230-V): every built module of the registry, in its order, with
// its row when one was ever saved and an "off, never set" row when not, so a module shipped after the first rows were
// written can still be switched on (saving inserts its row). A saved row for a module the registry does not list
// (one retired, for example) is kept at the end, so it can still be switched off.
export function familyModuleRows(flags: readonly FlagRow[]): { flag: FlagRow; everSet: boolean }[] {
  const saved = new Map(flags.filter((f) => f.app === 'family' && f.module !== WHOLE_APP).map((f) => [f.module, f]));
  const built = Array.from(new Set(FAMILY_MODULES.filter((m) => m.built).map((m) => m.flag)));
  const listed = built.map((module) => {
    const row = saved.get(module);
    return row
      ? { flag: row, everSet: true }
      : { flag: { app: 'family' as const, module, enabled: false, audience: 'everyone' as const, audience_percent: null, audience_schools: null, reason: null, ends_at: null, off_message_en: null, off_message_hi: null, updated_at: '' }, everSet: false };
  });
  const extra = Array.from(saved.values()).filter((f) => !built.includes(f.module)).map((flag) => ({ flag, everSet: true }));
  return [...listed, ...extra];
}

// The row as the one function every app uses reads it (flagOn): the page shows "on now" by that same function.
export const toAppFlag = (f: FlagRow): AppFlag => ({
  app: f.app,
  module: f.module,
  enabled: f.enabled,
  audience: f.audience,
  audiencePercent: f.audience_percent,
  audienceSchools: f.audience_schools,
  reason: f.reason,
  endsAt: f.ends_at ? new Date(f.ends_at) : null,
  offMessageEn: f.off_message_en,
  offMessageHi: f.off_message_hi,
});

export async function loadControlApps(db: Sql): Promise<ControlApps> {
  const flags = (await db.query(`select ${FLAG_COLUMNS} from control.app_flags order by app, (module <> '*'), module`)).rows.map(flagFromRow);
  const versions = (await db.query(`select app, min_shell_version from control.app_versions`)).rows;
  const minShell = { family: 0, teacher: 0, school_web: 0 } as Record<AppId, number>;
  for (const v of versions) {
    const a: unknown = v.app;
    if (isApp(a)) minShell[a] = Number(v.min_shell_version);
  }
  const banners = (
    await db.query(`select banner_id, app, tone, text_en, text_hi, starts_at, ends_at, ended_at from control.app_banners where ended_at is null and ends_at > now() order by starts_at desc`)
  ).rows.map((r) => ({ banner_id: r.banner_id, app: r.app, tone: r.tone, text_en: r.text_en, text_hi: r.text_hi, starts_at: iso(r.starts_at) as string, ends_at: iso(r.ends_at) as string, ended_at: iso(r.ended_at) })) as BannerRow[];
  const preview = (await db.query(`select account_id, added_by, added_at from control.preview_accounts order by added_at desc`)).rows.map((r) => ({ account_id: r.account_id, added_by: r.added_by, added_at: iso(r.added_at) as string })) as PreviewRow[];
  const changes = (
    await db.query(
      `select a.audit_id::text as audit_id, a.occurred_at, a.event_action, a.target_id, u.display_name as actor_name,
              a.after_state->>'change_reason' as reason,
              exists (select 1 from audit_log z where z.event_action = $2 and z.after_state->>'undoes' = a.audit_id::text) as undone
         from audit_log a left join users u on u.user_id = a.actor_user_id
        where a.school_id is null and (a.event_action = any($1::text[]) or a.event_action = $2)
        order by a.audit_id desc limit 20`,
      [APP_AUDIT_ACTIONS, UNDO_ACTION]
    )
  ).rows.map((r) => ({ audit_id: r.audit_id, occurred_at: iso(r.occurred_at) as string, event_action: r.event_action, target_id: r.target_id, actor_name: r.actor_name ?? null, reason: r.reason ?? null, undone: Boolean(r.undone), undoable: !r.undone && r.event_action !== UNDO_ACTION })) as ChangeRow[];
  const schools = (await db.query(`select school_id, name from schools order by name`)).rows.map((r) => ({ id: r.school_id as string, name: r.name as string }));
  return { minShell, flags, banners, preview, changes, schools };
}

// --- Writing ------------------------------------------------------------------------------------------------------------

const audit = (db: Sql, actor: Actor, eventAction: string, targetType: string, targetId: string, beforeState: unknown, afterState: unknown) =>
  writeAuditLog(db, { schoolId: null, actorUserId: actor.userId, actorRole: actor.role, eventAction, targetType, targetId, beforeState, afterState });

async function flagState(db: Sql, app: string, module: string): Promise<Record<string, unknown> | null> {
  const r = (await db.query(`select ${FLAG_COLUMNS.replace(', updated_at', '')} from control.app_flags where app = $1 and module = $2`, [app, module])).rows[0];
  return r ? { ...flagFromRow({ ...r, updated_at: new Date() }), updated_at: undefined } : null;
}
const strip = (s: Record<string, unknown> | null) => (s ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'updated_at')) : null);

export interface FlagInput {
  app: AppId;
  module: string;
  enabled: boolean;
  audience: FlagAudience;
  audiencePercent: number | null;
  audienceSchools: string[] | null;
  reason: string;
  endsAt: string | null;
  offMessageEn: string | null;
  offMessageHi: string | null;
}

export function parseFlagInput(body: unknown): Done<{ value: FlagInput }> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isApp(b.app)) return { ok: false, code: 'app' };
  const module = text(b.module);
  if (module !== WHOLE_APP && !MODULE.test(module)) return { ok: false, code: 'module' };
  if (typeof b.enabled !== 'boolean') return { ok: false, code: 'enabled' };
  const reason = parseReason(b.reason);
  if (!reason) return { ok: false, code: 'reason' };
  const audience = (b.audience ?? 'everyone') as FlagAudience;
  if (!(FLAG_AUDIENCES as readonly string[]).includes(audience)) return { ok: false, code: 'audience' };
  if (module === WHOLE_APP && audience !== 'everyone') return { ok: false, code: 'audience' };
  let audiencePercent: number | null = null;
  if (audience === 'percent') {
    const p = b.audiencePercent;
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 0 || p > 100) return { ok: false, code: 'percent' };
    audiencePercent = p;
  }
  let audienceSchools: string[] | null = null;
  if (audience === 'schools') {
    const list = Array.isArray(b.audienceSchools) ? b.audienceSchools.map((s) => text(s)).filter(Boolean) : [];
    if (list.length === 0 || list.some((s) => !UUID.test(s))) return { ok: false, code: 'schools' };
    audienceSchools = [...new Set(list.map((s) => s.toLowerCase()))];
  }
  let endsAt: string | null = null;
  if (b.endsAt !== null && b.endsAt !== undefined && b.endsAt !== '') {
    const d = new Date(String(b.endsAt));
    if (Number.isNaN(d.getTime())) return { ok: false, code: 'ends_at' };
    endsAt = d.toISOString();
  }
  const message = (v: unknown): string | null | undefined => {
    const m = text(v);
    if (m.length > TEXT_MAX) return undefined;
    return m || null;
  };
  const offMessageEn = message(b.offMessageEn);
  const offMessageHi = message(b.offMessageHi);
  if (offMessageEn === undefined || offMessageHi === undefined) return { ok: false, code: 'message' };
  return { ok: true, value: { app: b.app, module, enabled: b.enabled, audience, audiencePercent, audienceSchools, reason, endsAt, offMessageEn, offMessageHi } };
}

const UPSERT_FLAG = `insert into control.app_flags (app, module, enabled, audience, audience_percent, audience_schools, reason, ends_at, off_message_en, off_message_hi, updated_at, updated_by)
     values ($1, $2, $3, $4, $5, $6::uuid[], $7, $8, $9, $10, now(), $11)
     on conflict (app, module) do update set enabled = excluded.enabled, audience = excluded.audience, audience_percent = excluded.audience_percent,
       audience_schools = excluded.audience_schools, reason = excluded.reason, ends_at = excluded.ends_at, off_message_en = excluded.off_message_en,
       off_message_hi = excluded.off_message_hi, updated_at = now(), updated_by = excluded.updated_by`;

export async function setFlag(db: Sql, actor: Actor, input: FlagInput): Promise<{ ok: true }> {
  const before = strip(await flagState(db, input.app, input.module));
  await db.query(UPSERT_FLAG, [input.app, input.module, input.enabled, input.audience, input.audiencePercent, input.audienceSchools, input.reason, input.endsAt, input.offMessageEn, input.offMessageHi, actor.userId]);
  const after = strip(await flagState(db, input.app, input.module));
  await audit(db, actor, 'app_flag.set', 'control.app_flags', `${input.app}:${input.module}`, before, { ...after, change_reason: input.reason });
  return { ok: true };
}

export function parseMinShell(body: unknown): Done<{ app: AppId; minShell: number; reason: string }> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isApp(b.app)) return { ok: false, code: 'app' };
  const v = b.minShellVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1_000_000) return { ok: false, code: 'version' };
  const reason = parseReason(b.reason);
  if (!reason) return { ok: false, code: 'reason' };
  return { ok: true, app: b.app, minShell: v, reason };
}

export async function setMinShell(db: Sql, actor: Actor, input: { app: AppId; minShell: number; reason: string }): Promise<{ ok: true }> {
  const before = (await db.query(`select min_shell_version from control.app_versions where app = $1`, [input.app])).rows[0];
  await db.query(
    `insert into control.app_versions (app, min_shell_version, updated_at, updated_by) values ($1, $2, now(), $3)
     on conflict (app) do update set min_shell_version = excluded.min_shell_version, updated_at = now(), updated_by = excluded.updated_by`,
    [input.app, input.minShell, actor.userId]
  );
  await audit(db, actor, 'app_version.set', 'control.app_versions', input.app, before ? { min_shell_version: Number(before.min_shell_version) } : null, { min_shell_version: input.minShell, change_reason: input.reason });
  return { ok: true };
}

export function parseBannerInput(body: unknown): Done<{ app: AppId; tone: BannerTone; textEn: string; textHi: string; startsAt: string; endsAt: string; reason: string }> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isApp(b.app)) return { ok: false, code: 'app' };
  const tone = b.tone === 'warning' ? 'warning' : b.tone === 'info' ? 'info' : null;
  if (!tone) return { ok: false, code: 'tone' };
  const textEn = text(b.textEn);
  const textHi = text(b.textHi);
  if (textEn.length < 1 || textEn.length > TEXT_MAX || textHi.length < 1 || textHi.length > TEXT_MAX) return { ok: false, code: 'text' };
  const starts = b.startsAt === undefined || b.startsAt === null || b.startsAt === '' ? new Date() : new Date(String(b.startsAt));
  const ends = new Date(String(b.endsAt));
  if (Number.isNaN(starts.getTime()) || Number.isNaN(ends.getTime()) || ends.getTime() <= starts.getTime()) return { ok: false, code: 'dates' };
  const reason = parseReason(b.reason);
  if (!reason) return { ok: false, code: 'reason' };
  return { ok: true, app: b.app, tone, textEn, textHi, startsAt: starts.toISOString(), endsAt: ends.toISOString(), reason };
}

export async function addBanner(db: Sql, actor: Actor, input: { app: AppId; tone: BannerTone; textEn: string; textHi: string; startsAt: string; endsAt: string; reason: string }): Promise<{ ok: true; bannerId: string }> {
  const row = (
    await db.query(`insert into control.app_banners (app, tone, text_en, text_hi, starts_at, ends_at, created_by) values ($1, $2, $3, $4, $5, $6, $7) returning banner_id`, [input.app, input.tone, input.textEn, input.textHi, input.startsAt, input.endsAt, actor.userId])
  ).rows[0];
  await audit(db, actor, 'app_banner.create', 'control.app_banners', row.banner_id, null, { banner_id: row.banner_id, app: input.app, tone: input.tone, text_en: input.textEn, text_hi: input.textHi, starts_at: input.startsAt, ends_at: input.endsAt, change_reason: input.reason });
  return { ok: true, bannerId: row.banner_id };
}

export function parseWithReason(body: unknown, idKey: string): Done<{ id: string; reason: string }> {
  const b = (body ?? {}) as Record<string, unknown>;
  const id = text(b[idKey]);
  if (!UUID.test(id)) return { ok: false, code: 'id' };
  const reason = parseReason(b.reason);
  if (!reason) return { ok: false, code: 'reason' };
  return { ok: true, id: id.toLowerCase(), reason };
}

export async function endBanner(db: Sql, actor: Actor, input: { id: string; reason: string }): Promise<Done> {
  const before = (await db.query(`select banner_id, ended_at from control.app_banners where banner_id = $1`, [input.id])).rows[0];
  if (!before) return { ok: false, code: 'not_found' };
  if (before.ended_at) return { ok: false, code: 'already_ended' };
  const after = (await db.query(`update control.app_banners set ended_at = now() where banner_id = $1 returning ended_at`, [input.id])).rows[0];
  await audit(db, actor, 'app_banner.end', 'control.app_banners', input.id, { banner_id: input.id, ended_at: null }, { banner_id: input.id, ended_at: iso(after.ended_at), change_reason: input.reason });
  return { ok: true };
}

// Put a family account on the staff-preview list (C230-V), from Control → Family → People: it then sees modules set to
// staff preview, so the founder sees a module the moment it ships while real families do not. Audited; Undo takes it off.
export async function addPreview(db: Sql, actor: Actor, input: { id: string; reason: string }): Promise<Done> {
  const added = (await db.query(`insert into control.preview_accounts (account_id, added_by) values ($1, $2) on conflict (account_id) do nothing returning added_at`, [input.id, actor.userId])).rows[0];
  if (!added) return { ok: false, code: 'already_listed' };
  await audit(db, actor, 'preview_account.add', 'control.preview_accounts', input.id, null, { account_id: input.id, added_by: actor.userId, added_at: iso(added.added_at), change_reason: input.reason });
  return { ok: true };
}

export async function removePreview(db: Sql, actor: Actor, input: { id: string; reason: string }): Promise<Done> {
  const before = (await db.query(`select account_id, added_by, added_at from control.preview_accounts where account_id = $1`, [input.id])).rows[0];
  if (!before) return { ok: false, code: 'not_found' };
  await db.query(`delete from control.preview_accounts where account_id = $1`, [input.id]);
  await audit(db, actor, 'preview_account.remove', 'control.preview_accounts', input.id, { account_id: before.account_id, added_by: before.added_by, added_at: iso(before.added_at) }, { account_id: before.account_id, removed: true, change_reason: input.reason });
  return { ok: true };
}

// --- Undo ---------------------------------------------------------------------------------------------------------------

// One step back: restores the state an earlier change recorded as "before", and writes its own audit row (which holds
// the id it undid, so a change is undone once). A banner that was created is ended (a banner row is never deleted).
export async function undoChange(db: Sql, actor: Actor, auditId: string, reason: string | null): Promise<Done> {
  if (!/^\d{1,18}$/.test(auditId)) return { ok: false, code: 'id' };
  const row = (await db.query(`select audit_id::text as audit_id, event_action, target_type, target_id, before_state, after_state from audit_log where audit_id = $1 and school_id is null and event_action = any($2::text[])`, [auditId, APP_AUDIT_ACTIONS])).rows[0];
  if (!row) return { ok: false, code: 'not_found' };
  const done = (await db.query(`select 1 from audit_log where event_action = $1 and after_state->>'undoes' = $2 limit 1`, [UNDO_ACTION, auditId])).rows[0];
  if (done) return { ok: false, code: 'already_undone' };
  const why = reason ?? `Undo of change ${auditId}`;
  const before = row.before_state as Record<string, unknown> | null;
  const action = row.event_action as AppAuditAction;
  const target = row.target_id as string;
  let current: unknown = null;
  let restored: unknown = null;
  if (action === 'app_flag.set') {
    const [app, ...rest] = target.split(':');
    const module = rest.join(':');
    current = strip(await flagState(db, app, module));
    if (before === null) {
      // The flag did not exist before, and a missing row is off. Control may not delete a flag row (nca_super holds
      // no DELETE on control.app_flags), so the row is switched off: the same effect.
      await db.query(`update control.app_flags set enabled = false, reason = $3, updated_at = now(), updated_by = $4 where app = $1 and module = $2`, [app, module, why.slice(0, REASON_MAX), actor.userId]);
      restored = { app, module, enabled: false };
    } else {
      const f = before as Record<string, unknown>;
      await db.query(UPSERT_FLAG, [app, module, f.enabled, f.audience, f.audience_percent ?? null, f.audience_schools ?? null, f.reason ?? null, f.ends_at ?? null, f.off_message_en ?? null, f.off_message_hi ?? null, actor.userId]);
      restored = before;
    }
  } else if (action === 'app_version.set') {
    const cur = (await db.query(`select min_shell_version from control.app_versions where app = $1`, [target])).rows[0];
    current = cur ? { min_shell_version: Number(cur.min_shell_version) } : null;
    const v = before ? Number(before.min_shell_version) : 0;
    await db.query(`update control.app_versions set min_shell_version = $2, updated_at = now(), updated_by = $3 where app = $1`, [target, v, actor.userId]);
    restored = { min_shell_version: v };
  } else if (action === 'app_banner.create') {
    const cur = (await db.query(`select banner_id, ended_at from control.app_banners where banner_id = $1`, [target])).rows[0];
    current = cur ? { banner_id: target, ended_at: iso(cur.ended_at) } : null;
    await db.query(`update control.app_banners set ended_at = coalesce(ended_at, now()) where banner_id = $1`, [target]);
    restored = { banner_id: target, ended: true };
  } else if (action === 'app_banner.end') {
    const cur = (await db.query(`select banner_id, ended_at from control.app_banners where banner_id = $1`, [target])).rows[0];
    current = cur ? { banner_id: target, ended_at: iso(cur.ended_at) } : null;
    await db.query(`update control.app_banners set ended_at = null where banner_id = $1`, [target]);
    restored = { banner_id: target, ended_at: null };
  } else if (action === 'preview_account.add') {
    // Only the listing this change made: if the account was taken off and added again since, the newer listing stays.
    const after = row.after_state as Record<string, unknown> | null;
    const gone = (await db.query(`delete from control.preview_accounts where account_id = $1 and abs(extract(epoch from added_at - $2::timestamptz)) < 0.001 returning account_id`, [target, after?.added_at ?? null])).rows[0];
    if (!gone) return { ok: false, code: 'not_found' };
    current = { account_id: target };
    restored = { account_id: target, removed: true };
  } else if (action === 'preview_account.remove') {
    const b = before as Record<string, unknown>;
    current = null;
    await db.query(`insert into control.preview_accounts (account_id, added_by, added_at) values ($1, $2, $3) on conflict (account_id) do nothing`, [b.account_id, b.added_by, b.added_at]);
    restored = b;
  }
  await audit(db, actor, UNDO_ACTION, row.target_type as string, target, current, { ...(restored as object | null), undoes: auditId, undid: action, change_reason: why });
  return { ok: true };
}
