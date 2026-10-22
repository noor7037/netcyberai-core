import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';
import { adapterFor, standInAllowed, textAdapters, STAND_IN_PROVIDER } from './adapters';
import { aiEncryptionKey, sealAiKey } from './credentials';
import { DAILY_REQUESTS_SETTING } from './daily-cap';
import { capableAdapter, chainOf, PROFILES, profileById } from './platform';

// Control → AI (docs/family-app/10 §3, §7; C249). NetCyberAI's founder only (super_admin with the authenticator,
// checked by the route). Every statement runs as the platform role (nca_super), from a fixed, parameterised list.
//
// Each change — a provider's key, a provider's clearance for minors, a profile's provider/model/prompt version/on-off,
// the daily cap — writes one platform audit row (school null) with the before and after: ids, flags and numbers,
// never a key. Each can be undone in one step from that row's before state. A key itself is never kept anywhere but
// sealed in control.ai_credentials, so undoing a key change can remove a key that was added, but cannot bring back an
// earlier key: that one is entered again.

export type By = { userId: string };
export type Link = { provider: string; model: string };
export type ChangeResult = { ok: true } | { ok: false; code: ChangeError };
export type ChangeError =
  | 'no_encryption_key'
  | 'provider'
  | 'key_format'
  | 'terms_url'
  | 'in_use'
  | 'profile'
  | 'model'
  | 'prompt_version'
  | 'incomplete'
  | 'not_cleared_for_minors'
  | 'cap'
  | 'not_found'
  | 'cannot_restore_key';

export type AiOverview = {
  keyReady: boolean;
  today: string;
  month: string;
  providers: {
    providerId: string;
    hasAdapter: boolean;
    minorsEligible: boolean;
    clearedForMinors: boolean;
    termsUrl: string | null;
    clearedAt: string | null;
    clearedByName: string | null;
    credential: { keyLast4: string; setAt: string; setByName: string | null } | null;
  }[];
  profiles: { profileId: string; carriesChildWords: boolean; providerId: string | null; model: string | null; fallback: Link[]; promptVersion: string; enabled: boolean }[];
  usage: { profileId: string; today: Counts; month: Counts }[];
  cap: number | null;
  changes: { auditId: string; action: string; at: string; byName: string | null; target: string | null; canUndo: boolean }[];
};
export type Counts = { requests: number; failures: number; capRefusals: number; tokensIn: number; tokensOut: number };

const ACTIONS = ['ai.credential_set', 'ai.provider_clearance', 'ai.profile_changed', 'ai.cap_changed'] as const;
type Action = (typeof ACTIONS)[number];
const MODEL = /^[A-Za-z0-9._:/-]{1,80}$/;
const PROMPT_VERSION = /^[a-z0-9.-]{1,32}$/;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const num = (v: unknown) => Number(v ?? 0);
const CHECK_VIOLATION = '23514';
const isCheckViolation = (err: unknown) => (err as { code?: string })?.code === CHECK_VIOLATION;

async function audit(db: Sql, by: By, action: Action, targetId: string, before: unknown, after: unknown) {
  await writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: action, targetType: action.split('_')[0].replace('ai.', 'ai_'), targetId, beforeState: before, afterState: after });
}

function knownProvider(providerId: string): boolean {
  return providerId === STAND_IN_PROVIDER ? standInAllowed() : adapterFor(providerId) !== null;
}

// ---- reading -------------------------------------------------------------------------------------------------------

export async function loadAiOverview(db: Sql): Promise<AiOverview> {
  const today = indiaDate();
  const month = today.slice(0, 7);
  const providers = await db.query(
    `select p.provider_id, p.cleared_for_minors, p.cleared_terms_url, p.cleared_at, cu.display_name as cleared_by_name,
            c.key_last4, c.set_at, su.display_name as set_by_name
       from control.ai_providers p
       left join control.ai_credentials c on c.provider_id = p.provider_id
       left join users cu on cu.user_id = p.cleared_by
       left join users su on su.user_id = c.set_by
      order by p.provider_id`
  );
  const profiles = await db.query(`select profile_id, provider_id, model, fallback, prompt_version, enabled, carries_child_words from control.ai_profiles order by profile_id`);
  const usage = await db.query(
    `select profile_id, (day = $1::date) as is_today, sum(requests) as requests, sum(failures) as failures, sum(cap_refusals) as cap_refusals, sum(tokens_in) as tokens_in, sum(tokens_out) as tokens_out
       from control.ai_usage where day >= date_trunc('month', $1::date)::date and day <= $1::date
      group by profile_id, (day = $1::date)`,
    [today]
  );
  const cap = await db.query(`select value from control.settings where key = $1`, [DAILY_REQUESTS_SETTING]);
  const changes = await db.query(
    `select a.audit_id, a.event_action, a.occurred_at, a.target_id, a.before_state, u.display_name
       from audit_log a left join users u on u.user_id = a.actor_user_id
      where a.school_id is null and a.event_action = any($1::text[])
      order by a.audit_id desc limit 15`,
    [ACTIONS as unknown as string[]]
  );

  const zero = (): Counts => ({ requests: 0, failures: 0, capRefusals: 0, tokensIn: 0, tokensOut: 0 });
  const byProfile = new Map<string, { today: Counts; month: Counts }>(PROFILES.map((p) => [p.id, { today: zero(), month: zero() }]));
  for (const r of usage.rows) {
    const entry = byProfile.get(r.profile_id) ?? { today: zero(), month: zero() };
    byProfile.set(r.profile_id, entry);
    const add = (c: Counts) => {
      c.requests += num(r.requests);
      c.failures += num(r.failures);
      c.capRefusals += num(r.cap_refusals);
      c.tokensIn += num(r.tokens_in);
      c.tokensOut += num(r.tokens_out);
    };
    add(entry.month);
    if (r.is_today) add(entry.today);
  }
  const capValue = cap.rows[0]?.value;

  return {
    keyReady: aiEncryptionKey() !== null,
    today,
    month,
    providers: providers.rows.map((r) => {
      const adapter = adapterFor(r.provider_id);
      return {
        providerId: r.provider_id,
        hasAdapter: adapter !== null,
        minorsEligible: adapter?.minorsEligible === true,
        clearedForMinors: r.cleared_for_minors === true,
        termsUrl: r.cleared_terms_url ?? null,
        clearedAt: iso(r.cleared_at),
        clearedByName: r.cleared_by_name ?? null,
        credential: r.key_last4 ? { keyLast4: r.key_last4, setAt: iso(r.set_at) as string, setByName: r.set_by_name ?? null } : null,
      };
    }),
    profiles: profiles.rows.map((r) => ({
      profileId: r.profile_id,
      carriesChildWords: r.carries_child_words === true || profileById(r.profile_id)?.carriesChildWords === true,
      providerId: r.provider_id ?? null,
      model: r.model ?? null,
      fallback: (chainOf({ provider_id: 'x', model: 'x', fallback: r.fallback }) ?? []).slice(1),
      promptVersion: r.prompt_version,
      enabled: r.enabled === true,
    })),
    usage: Array.from(byProfile, ([profileId, c]) => ({ profileId, ...c })),
    cap: typeof capValue === 'number' ? capValue : null,
    changes: changes.rows.map((r) => ({
      auditId: String(r.audit_id),
      action: r.event_action,
      at: iso(r.occurred_at) as string,
      byName: r.display_name ?? null,
      target: r.target_id ?? null,
      canUndo: r.before_state !== null && !(r.event_action === 'ai.credential_set' && r.before_state?.had === true),
    })),
  };
}

// The adapters the code has, for the screen's choices (the stand-in only where it may run).
export function providerChoices(): string[] {
  return [...textAdapters().map((a) => a.providerId), ...(standInAllowed() ? [STAND_IN_PROVIDER] : [])];
}

// ---- changes -------------------------------------------------------------------------------------------------------

// Set or replace a provider's key. Sealed here; the screen afterwards sees only its last four characters.
export async function setCredential(db: Sql, by: By, providerId: string, apiKey: string): Promise<ChangeResult> {
  const adapter = adapterFor(providerId);
  if (!adapter || !adapter.needsKey) return { ok: false, code: 'provider' };
  const key = apiKey.trim();
  if (!adapter.keyLooksRight(key)) return { ok: false, code: 'key_format' };
  const k = aiEncryptionKey();
  if (!k) return { ok: false, code: 'no_encryption_key' };
  const exists = await db.query(`select 1 from control.ai_providers where provider_id = $1`, [providerId]);
  if (!exists.rows[0]) return { ok: false, code: 'provider' };
  const prior = (await db.query(`select key_last4 from control.ai_credentials where provider_id = $1`, [providerId])).rows[0];
  const sealed = sealAiKey(k, providerId, key);
  const last4 = key.slice(-4);
  await db.query(
    `insert into control.ai_credentials (provider_id, ciphertext, iv, tag, key_version, key_last4, set_by) values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (provider_id) do update set ciphertext = excluded.ciphertext, iv = excluded.iv, tag = excluded.tag, key_version = excluded.key_version,
       key_last4 = excluded.key_last4, set_by = excluded.set_by, set_at = now(), tested_at = null, test_ok = null, test_message = null`,
    [providerId, sealed.ciphertext, sealed.iv, sealed.tag, sealed.keyVersion, last4, by.userId]
  );
  await audit(db, by, 'ai.credential_set', providerId, { providerId, had: !!prior, ...(prior ? { keyLast4: prior.key_last4 } : {}) }, { providerId, had: true, keyLast4: last4 });
  return { ok: true };
}

type Clearance = { providerId: string; cleared: boolean; termsUrl: string | null; clearedAt: string | null; clearedBy: string | null };

async function clearanceOf(db: Sql, providerId: string): Promise<Clearance | null> {
  const r = (await db.query(`select provider_id, cleared_for_minors, cleared_terms_url, cleared_at, cleared_by from control.ai_providers where provider_id = $1`, [providerId])).rows[0];
  return r ? { providerId, cleared: r.cleared_for_minors === true, termsUrl: r.cleared_terms_url ?? null, clearedAt: iso(r.cleared_at), clearedBy: r.cleared_by ?? null } : null;
}

async function writeClearance(db: Sql, by: By, next: Clearance, undoOf?: string): Promise<ChangeResult> {
  const before = await clearanceOf(db, next.providerId);
  if (!before) return { ok: false, code: 'provider' };
  try {
    await db.query(`update control.ai_providers set cleared_for_minors = $2, cleared_terms_url = $3, cleared_at = $4::timestamptz, cleared_by = $5::uuid where provider_id = $1`, [
      next.providerId,
      next.cleared,
      next.termsUrl,
      next.clearedAt,
      next.clearedBy,
    ]);
  } catch (err) {
    // The database refuses to withdraw a clearance a child-words profile still relies on (move the profile first).
    if (isCheckViolation(err)) return { ok: false, code: 'in_use' };
    throw err;
  }
  await audit(db, by, 'ai.provider_clearance', next.providerId, before, { ...next, ...(undoOf ? { undoOf } : {}) });
  return { ok: true };
}

// Clear a provider for children's words, with the terms page the founder read, or withdraw the clearance.
export async function setClearance(db: Sql, by: By, providerId: string, cleared: boolean, termsUrl: string): Promise<ChangeResult> {
  if (!/^[a-z][a-z0-9_-]{1,39}$/.test(providerId)) return { ok: false, code: 'provider' };
  const url = termsUrl.trim();
  if (cleared && !/^https:\/\/[^\s]{4,490}$/.test(url)) return { ok: false, code: 'terms_url' };
  return writeClearance(db, by, cleared ? { providerId, cleared: true, termsUrl: url, clearedAt: new Date().toISOString(), clearedBy: by.userId } : { providerId, cleared: false, termsUrl: null, clearedAt: null, clearedBy: null });
}

export type ProfileSettings = { providerId: string | null; model: string | null; promptVersion: string; enabled: boolean; fallback: Link[] };

async function profileSettings(db: Sql, profileId: string): Promise<ProfileSettings | null> {
  const r = (await db.query(`select provider_id, model, fallback, prompt_version, enabled from control.ai_profiles where profile_id = $1`, [profileId])).rows[0];
  if (!r) return null;
  return { providerId: r.provider_id ?? null, model: r.model ?? null, promptVersion: r.prompt_version, enabled: r.enabled === true, fallback: (chainOf({ provider_id: 'x', model: 'x', fallback: r.fallback }) ?? []).slice(1) };
}

async function writeProfile(db: Sql, by: By, profileId: string, next: ProfileSettings, undoOf?: string): Promise<ChangeResult> {
  const profile = profileById(profileId);
  if (!profile) return { ok: false, code: 'profile' };
  const providers = [next.providerId, ...next.fallback.map((f) => f.provider)].filter((p): p is string => p !== null);
  // A provider must have an adapter of the profile's capability: voice input (speech_to_text, C281) takes only a provider
  // that can hear, so Anthropic cannot be chosen for it.
  if (next.fallback.length > 3 || providers.some((p) => !knownProvider(p) || capableAdapter(profile.id, p) === null)) return { ok: false, code: 'provider' };
  if ((next.model !== null && !MODEL.test(next.model)) || next.fallback.some((f) => !MODEL.test(f.model))) return { ok: false, code: 'model' };
  if (!PROMPT_VERSION.test(next.promptVersion)) return { ok: false, code: 'prompt_version' };
  if ((next.providerId === null) !== (next.model === null) || (next.enabled && next.providerId === null)) return { ok: false, code: 'incomplete' };
  // The code's half of the minors check; the database adds Control's clearance (its trigger) below.
  if (profile.carriesChildWords && providers.some((p) => capableAdapter(profile.id, p)?.minorsEligible !== true)) return { ok: false, code: 'not_cleared_for_minors' };
  const before = await profileSettings(db, profileId);
  if (!before) return { ok: false, code: 'profile' };
  try {
    await db.query(
      `update control.ai_profiles set provider_id = $2, model = $3, fallback = $4::jsonb, prompt_version = $5, enabled = $6, updated_at = now(), updated_by = $7 where profile_id = $1`,
      [profileId, next.providerId, next.model, JSON.stringify(next.fallback), next.promptVersion, next.enabled, by.userId]
    );
  } catch (err) {
    if (isCheckViolation(err)) return { ok: false, code: 'not_cleared_for_minors' };
    throw err;
  }
  await audit(db, by, 'ai.profile_changed', profileId, before, { ...next, ...(undoOf ? { undoOf } : {}) });
  return { ok: true };
}

export async function setProfile(db: Sql, by: By, profileId: string, next: ProfileSettings): Promise<ChangeResult> {
  return writeProfile(db, by, profileId, next);
}

async function writeCap(db: Sql, by: By, value: number, undoOf?: string): Promise<ChangeResult> {
  if (!Number.isInteger(value) || value < 0 || value > 1000) return { ok: false, code: 'cap' };
  const before = (await db.query(`select value from control.settings where key = $1`, [DAILY_REQUESTS_SETTING])).rows[0]?.value ?? null;
  await db.query(
    `insert into control.settings (key, value, updated_by) values ($1, $2::jsonb, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [DAILY_REQUESTS_SETTING, JSON.stringify(value), by.userId]
  );
  await audit(db, by, 'ai.cap_changed', DAILY_REQUESTS_SETTING, { key: DAILY_REQUESTS_SETTING, value: before }, { key: DAILY_REQUESTS_SETTING, value, ...(undoOf ? { undoOf } : {}) });
  return { ok: true };
}

export async function setCap(db: Sql, by: By, value: number): Promise<ChangeResult> {
  return writeCap(db, by, value);
}

// One step back: the change's before state, restored and itself audited (so an undo can be undone).
export async function undoChange(db: Sql, by: By, auditId: string): Promise<ChangeResult> {
  if (!/^\d{1,18}$/.test(auditId)) return { ok: false, code: 'not_found' };
  const row = (await db.query(`select event_action, target_id, before_state from audit_log where audit_id = $1::bigint and school_id is null and event_action = any($2::text[])`, [auditId, ACTIONS as unknown as string[]])).rows[0];
  const before = row?.before_state as Record<string, unknown> | null | undefined;
  if (!row || !before) return { ok: false, code: 'not_found' };
  switch (row.event_action as Action) {
    case 'ai.credential_set': {
      if (before.had === true) return { ok: false, code: 'cannot_restore_key' };
      const providerId = String(row.target_id);
      const prior = (await db.query(`delete from control.ai_credentials where provider_id = $1 returning key_last4`, [providerId])).rows[0];
      await audit(db, by, 'ai.credential_set', providerId, prior ? { providerId, had: true, keyLast4: prior.key_last4 } : { providerId, had: false }, { providerId, had: false, undoOf: auditId });
      return { ok: true };
    }
    case 'ai.provider_clearance':
      return writeClearance(db, by, { providerId: String(before.providerId), cleared: before.cleared === true, termsUrl: (before.termsUrl as string) ?? null, clearedAt: (before.clearedAt as string) ?? null, clearedBy: (before.clearedBy as string) ?? null }, auditId);
    case 'ai.profile_changed':
      return writeProfile(
        db,
        by,
        String(row.target_id),
        { providerId: (before.providerId as string) ?? null, model: (before.model as string) ?? null, promptVersion: String(before.promptVersion), enabled: before.enabled === true, fallback: Array.isArray(before.fallback) ? (before.fallback as Link[]) : [] },
        auditId
      );
    case 'ai.cap_changed':
      return typeof before.value === 'number' ? writeCap(db, by, before.value, auditId) : { ok: false, code: 'not_found' };
  }
  return { ok: false, code: 'not_found' };
}
