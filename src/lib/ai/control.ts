import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';
import { adapterFor, keyedProviderFor, providerCapabilities, speechAdapterFor, moderationAdapterFor, voiceAdapterFor, standInAllowed, textAdapters, STAND_IN_PROVIDER, type Capabilities, type Capability, type TermsNote } from './adapters';
import { checkEndpoint, checkEndpointShape, type EndpointError } from './adapters/endpoint-guard';
import { vertexModelLooksRight } from './adapters/vertex-ai';
import { cleanWorkersAccount, cleanWorkersToken, workersAccountLooksRight, workersModelLooksRight, workersTokenLooksRight } from './adapters/workers-ai';
import { testYoutubeKey } from './adapters/youtube';
import { aiEncryptionKey, sealAiKey, unsealAiKey, type SealedRow } from './credentials';
import { DAILY_REQUESTS_SETTING } from './daily-cap';
import { SPEND_ALERT_MAX_USD, SPEND_ALERT_SETTING, spendAlertUsd, spentOn } from './gateway/upkeep';
import { capableAdapter, chainOf, missingCapabilities, PROFILES, profileById, profileNeeds } from './platform';
import { activated, activating, loadRouteRevisions, revisionToRestore } from './gateway/revisions';
import { loadProviderHealth } from './gateway/circuit';
import { loadUsageLedger } from './gateway/ledger';
import type { LedgerAttempt, ProviderHealth, RouteRevision } from '@/lib/contracts/ai-gateway';
export { loadRouteRevisions, loadProviderHealth, loadUsageLedger };

// The routing records Control → AI shows (G2, C370; G3, C371): the latest route revisions (enough for every profile's
// history), every circuit, and the latest attempts in the ledger.
export type AiRouting = { revisions: RouteRevision[]; health: ProviderHealth[]; ledger: LedgerAttempt[] };
export async function loadAiRouting(db: Sql): Promise<AiRouting> {
  return { revisions: await loadRouteRevisions(db, { limit: 200 }), health: await loadProviderHealth(db), ledger: await loadUsageLedger(db, { limit: 200 }) };
}

// Control → AI (docs/family-app/10 §3, §7; C249). NetCyberAI's founder only (super_admin with the authenticator,
// checked by the route). Every statement runs as the platform role (nca_super), from a fixed, parameterised list.
//
// Each change — a provider's key, a provider's clearance for minors, a provider's address (G1: the OpenAI-compatible
// adapter's base URL), a profile's provider/model/prompt version/on-off, the daily cap — writes one platform audit row (school null) with the before and after: ids, flags and numbers,
// never a key. Each can be undone in one step from that row's before state. A key itself is never kept anywhere but
// sealed in control.ai_credentials, so undoing a key change can remove a key that was added, but cannot bring back an
// earlier key: that one is entered again.
//
// G2 (C370): every change of a profile's route (a save, an undo, a rollback) is also an immutable route revision
// (control.ai_route_revisions, written by the database in the same statement). rollbackRoute() activates the revision
// before the active one again, as a new revision, with its own audit row (an ordinary profile change, so it can be undone).

export type By = { userId: string };
export type Link = { provider: string; model: string };
export type ChangeResult = { ok: true } | { ok: false; code: ChangeError };
export type ChangeError =
  | 'account_id_format'
  | 'token_format'
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
  // W5-7 (C394): the spend alert is an amount in US dollars from 0.01 to 10,000, or off.
  | 'spend'
  | 'not_found'
  | 'cannot_restore_key'
  | 'no_key'
  | 'not_testable'
  | 'no_revision'
  // G1 (C369): a profile on a provider whose adapter lacks what the profile needs (for example photos).
  | 'capability'
  // G1: the founder's address for the OpenAI-compatible adapter, refused (shape, a private address, or not found).
  | 'base_url'
  | 'base_url_private'
  | 'base_url_dns'
  | 'no_base_url'
  // G5 (C373): a price outside 0 to 1000 US dollars per million tokens, or not a number.
  | 'price';

export type AiOverview = {
  keyReady: boolean;
  today: string;
  month: string;
  providers: {
    providerId: string;
    hasAdapter: boolean;
    // The provider's switch (control.ai_providers.enabled) and whether its adapter needs a key (G3: its state).
    enabled: boolean;
    needsKey: boolean;
    // 'video': a content provider (the video finder's YouTube, M2-5): a key and a test, never a profile's choice.
    // 'text_to_speech': a voice-only provider (Google Cloud Text-to-Speech, C386).
    capability: 'text' | 'video' | 'text_to_speech' | null;
    // What the provider's adapters declare (G1, C369), shown beside it; null for a content provider or none.
    capabilities: Capabilities | null;
    // The founder's address, for the adapter whose address is his (G1); needsBaseUrl says the box is shown.
    needsBaseUrl: boolean;
    baseUrl: string | null;
    // Whether "Test the key" works for it: the video finder's provider and the adapters with a connection test.
    testable: boolean;
    // What the vendor's terms say for a product children use, shown beside the switch as advice (C368).
    termsNote: TermsNote | null;
    clearedForMinors: boolean;
    termsUrl: string | null;
    clearedAt: string | null;
    clearedByName: string | null;
    credential: { keyLast4: string; setAt: string; setByName: string | null; testedAt: string | null; testOk: boolean | null } | null;
  }[];
  // usesPrompt: only a text profile reads a prompt version; speech and the safety check have none to choose (C314).
  // needs: what the profile's provider must declare (G1).
  profiles: { profileId: string; carriesChildWords: boolean; needs: Capability[]; providerId: string | null; model: string | null; fallback: Link[]; promptVersion: string; usesPrompt: boolean; enabled: boolean }[];
  usage: { profileId: string; today: Counts; month: Counts }[];
  cap: number | null;
  // W5-7 (C394): the daily spend alert in US dollars (null: off), and today's known cost against it.
  spendAlert: number | null;
  spentToday: { usd: number; unpriced: number };
  changes: { auditId: string; action: string; at: string; byName: string | null; target: string | null; canUndo: boolean }[];
  // G5 (C373): the founder's prices, US dollars per million tokens in and out, per provider and model.
  prices: ModelPrice[];
  // G6 (C379): each provider's model ids for the pickers, from its latest key test or health probe.
  modelLists: Record<string, ModelList>;
};
export type ModelPrice = { providerId: string; model: string; inUsd: number; outUsd: number; setAt: string; setByName: string | null };
export type PriceEntry = { inUsd: number; outUsd: number };
export type Counts = { requests: number; failures: number; capRefusals: number; tokensIn: number; tokensOut: number };

const ACTIONS = ['ai.credential_set', 'ai.provider_clearance', 'ai.endpoint_changed', 'ai.profile_changed', 'ai.cap_changed', 'ai.price_set', 'ai.spend_alert_changed'] as const;
type Action = (typeof ACTIONS)[number];
// A model id as the vendor names it; Workers AI ids start with "@" (C230-U). The database holds the same rule.
const MODEL = /^@?[A-Za-z0-9._:/-]{1,80}$/;
const PROMPT_VERSION = /^[a-z0-9.-]{1,32}$/;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const num = (v: unknown) => Number(v ?? 0);
const CHECK_VIOLATION = '23514';
const isCheckViolation = (err: unknown) => (err as { code?: string })?.code === CHECK_VIOLATION;

async function audit(db: Sql, by: By, action: Action, targetId: string, before: unknown, after: unknown) {
  await writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: action, targetType: action.split('_')[0].replace('ai.', 'ai_'), targetId, beforeState: before, afterState: after });
}

function knownProvider(providerId: string): boolean {
  return providerId === STAND_IN_PROVIDER ? standInAllowed() : adapterFor(providerId) !== null || voiceAdapterFor(providerId) !== null;
}

// ---- reading -------------------------------------------------------------------------------------------------------

export async function loadAiOverview(db: Sql): Promise<AiOverview> {
  const today = indiaDate();
  const month = today.slice(0, 7);
  const providers = await db.query(
    `select p.provider_id, p.enabled, p.base_url, p.cleared_for_minors, p.cleared_terms_url, p.cleared_at, cu.display_name as cleared_by_name,
            c.key_last4, c.set_at, su.display_name as set_by_name, c.tested_at, c.test_ok
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
  const spendAlert = await spendAlertUsd(db);
  const spentToday = await spentOn(db, today);
  const changes = await db.query(
    `select a.audit_id, a.event_action, a.occurred_at, a.target_id, a.before_state, u.display_name
       from audit_log a left join users u on u.user_id = a.actor_user_id
      where a.school_id is null and a.event_action = any($1::text[])
      order by a.audit_id desc limit 15`,
    [ACTIONS as unknown as string[]]
  );

  const prices = await db.query(
    `select pr.provider_id, pr.model, pr.usd_per_mtok_in, pr.usd_per_mtok_out, pr.set_at, u.display_name
       from control.ai_model_prices pr left join users u on u.user_id = pr.set_by order by pr.provider_id, pr.model`
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
      const adapter = adapterFor(r.provider_id) ?? speechAdapterFor(r.provider_id) ?? moderationAdapterFor(r.provider_id) ?? voiceAdapterFor(r.provider_id);
      const keyed = keyedProviderFor(r.provider_id);
      const text = adapterFor(r.provider_id);
      const voice = voiceAdapterFor(r.provider_id);
      return {
        providerId: r.provider_id,
        hasAdapter: keyed !== null,
        enabled: r.enabled !== false,
        needsKey: keyed?.needsKey !== false,
        capability: keyed?.capability ?? null,
        capabilities: keyed?.capability === 'video' ? null : providerCapabilities(r.provider_id),
        needsBaseUrl: text?.needsBaseUrl === true,
        baseUrl: r.base_url ?? null,
        testable: keyed?.capability === 'video' || typeof text?.testConnection === 'function' || typeof voice?.testConnection === 'function',
        termsNote: adapter?.termsNote ?? null,
        clearedForMinors: r.cleared_for_minors === true,
        termsUrl: r.cleared_terms_url ?? null,
        clearedAt: iso(r.cleared_at),
        clearedByName: r.cleared_by_name ?? null,
        credential: r.key_last4
          ? { keyLast4: r.key_last4, setAt: iso(r.set_at) as string, setByName: r.set_by_name ?? null, testedAt: iso(r.tested_at), testOk: typeof r.test_ok === 'boolean' ? r.test_ok : null }
          : null,
      };
    }),
    profiles: profiles.rows.map((r) => ({
      profileId: r.profile_id,
      needs: (() => {
        const p = profileById(r.profile_id);
        return p ? profileNeeds(p) : [];
      })(),
      carriesChildWords: r.carries_child_words === true || profileById(r.profile_id)?.carriesChildWords === true,
      providerId: r.provider_id ?? null,
      model: r.model ?? null,
      fallback: (chainOf({ provider_id: 'x', model: 'x', fallback: r.fallback }) ?? []).slice(1),
      promptVersion: r.prompt_version,
      usesPrompt: profileById(r.profile_id)?.capability === 'text',
      enabled: r.enabled === true,
    })),
    usage: Array.from(byProfile, ([profileId, c]) => ({ profileId, ...c })),
    cap: typeof capValue === 'number' ? capValue : null,
    spendAlert,
    spentToday,
    changes: changes.rows.map((r) => ({
      auditId: String(r.audit_id),
      action: r.event_action,
      at: iso(r.occurred_at) as string,
      byName: r.display_name ?? null,
      target: r.target_id ?? null,
      canUndo: r.before_state !== null && !(r.event_action === 'ai.credential_set' && r.before_state?.had === true),
    })),
    modelLists: await loadModelLists(db),
    prices: prices.rows.map((r) => ({
      providerId: r.provider_id,
      model: r.model,
      inUsd: Number(r.usd_per_mtok_in),
      outUsd: Number(r.usd_per_mtok_out),
      setAt: iso(r.set_at) as string,
      setByName: r.display_name ?? null,
    })),
  };
}

// The adapters the code has, for the screen's choices (the stand-in only where it may run): every text provider and a
// voice-only one (C386). Each feature's card offers only the providers whose adapters declare what it needs.
export function providerChoices(): string[] {
  const voiceOnly = ['google_tts'].filter((p) => voiceAdapterFor(p) !== null && adapterFor(p) === null);
  return [...textAdapters().map((a) => a.providerId), ...voiceOnly, ...(standInAllowed() ? [STAND_IN_PROVIDER] : [])];
}

// ---- changes -------------------------------------------------------------------------------------------------------

// Set or replace a provider's key. Sealed here; the screen afterwards sees only its last four characters.
export async function setCredential(db: Sql, by: By, providerId: string, apiKey: string): Promise<ChangeResult> {
  const adapter = keyedProviderFor(providerId);
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

// Cloudflare Workers AI's key in its two parts (C317): the Account ID and the API token, each checked with its own
// plain message, then kept as one key, "<account id>:<token>", exactly as an entry in one box would be.
export async function setWorkersCredential(db: Sql, by: By, accountRaw: string, tokenRaw: string): Promise<ChangeResult> {
  const account = cleanWorkersAccount(accountRaw);
  if (!workersAccountLooksRight(account)) return { ok: false, code: 'account_id_format' };
  const token = cleanWorkersToken(tokenRaw);
  if (!workersTokenLooksRight(token)) return { ok: false, code: 'token_format' };
  return setCredential(db, by, 'workers-ai', `${account}:${token}`);
}

// "Test key" for a content provider (M2-5): the key is opened in the first transaction, the provider is asked with no
// database connection held, and the outcome (true or false and a code, never the key) is written in a second one.
// Text providers are tested by running their profile; only the video finder's provider has a test call here.
// `of` names the sealed row that was tested, so a key saved again during the call does not take this key's outcome.
// `models` (G6, C379): a text provider's model ids from the same request, or null when it gave none that could be read
// (the picker then says the list is unavailable); absent for the video finder's key, which has no model list.
export type KeyTestOutcome = { ok: boolean; code: string; of: string; models?: string[] | null };
export type KeyTest = { ok: true; run: () => Promise<KeyTestOutcome> } | { ok: false; code: ChangeError };

export async function prepareKeyTest(db: Sql, providerId: string): Promise<KeyTest> {
  // G1 (C369): a text adapter with its own connection test (Vertex AI, the OpenAI-compatible adapter) as well.
  const text = adapterFor(providerId);
  // C386: a voice-only provider (Google Cloud Text-to-Speech) is tested by its own free check.
  const voice = voiceAdapterFor(providerId);
  const connect = text?.testConnection?.bind(text) ?? voice?.testConnection?.bind(voice);
  if (keyedProviderFor(providerId)?.capability !== 'video' && !connect) return { ok: false, code: 'not_testable' };
  let baseUrl: string | undefined;
  if (text?.needsBaseUrl) {
    baseUrl = (await db.query(`select base_url from control.ai_providers where provider_id = $1`, [providerId])).rows[0]?.base_url ?? undefined;
    if (!baseUrl) return { ok: false, code: 'no_base_url' };
  }
  const k = aiEncryptionKey();
  if (!k) return { ok: false, code: 'no_encryption_key' };
  const row = (await db.query(`select ciphertext, iv, tag, key_version from control.ai_sealed_credential($1)`, [providerId])).rows[0] as SealedRow | undefined;
  if (!row) return { ok: false, code: 'no_key' };
  let apiKey: string;
  try {
    apiKey = unsealAiKey(k, providerId, row);
  } catch {
    return { ok: false, code: 'no_key' };
  }
  return {
    ok: true,
    run: async () => {
      // The outcome is its kind and status only: neither the key nor anything the vendor said is kept or returned.
      const r = connect ? await connect(apiKey, baseUrl).catch(() => ({ ok: false as const, failure: 'network' as const, status: undefined })) : await testYoutubeKey(apiKey);
      const listed = r.ok && 'models' in r && Array.isArray(r.models) ? (r.models as string[]) : null;
      const models = connect ? listed : undefined;
      return r.ok ? { ok: true, code: 'ok', of: row.ciphertext, models } : { ok: false, code: r.status ? `${r.failure}_${r.status}` : r.failure, of: row.ciphertext, models };
    },
  };
}

export async function recordKeyTest(db: Sql, providerId: string, outcome: KeyTestOutcome): Promise<void> {
  await db.query(`update control.ai_credentials set tested_at = now(), test_ok = $2, test_message = $3 where provider_id = $1 and ciphertext = $4`, [
    providerId,
    outcome.ok,
    outcome.code.slice(0, 40),
    outcome.of,
  ]);
  await recordModelList(db, providerId, outcome.models);
}

// The provider's model ids for the pickers (G6, C379), kept from the latest key test or health probe. null: the fetch
// failed or gave nothing readable (the list is emptied and marked unavailable); undefined: nothing to record.
export async function recordModelList(db: Sql, providerId: string, models: string[] | null | undefined): Promise<void> {
  if (models === undefined) return;
  await db.query(
    `insert into control.ai_model_lists (provider_id, models, ok) values ($1, $2::text[], $3)
     on conflict (provider_id) do update set models = excluded.models, ok = excluded.ok, fetched_at = now()`,
    [providerId, models ?? [], models !== null]
  );
}

export type ModelList = { models: string[]; ok: boolean; fetchedAt: string };
export async function loadModelLists(db: Sql): Promise<Record<string, ModelList>> {
  const { rows } = await db.query(`select provider_id, models, ok, fetched_at from control.ai_model_lists`);
  return Object.fromEntries(rows.map((r) => [String(r.provider_id), { models: (r.models as string[]) ?? [], ok: r.ok === true, fetchedAt: iso(r.fetched_at) as string }]));
}

// ---- the founder's address for the OpenAI-compatible adapter (G1, C369) ---------------------------------------------

const ENDPOINT_CODE: Record<EndpointError, ChangeError> = {
  not_https: 'base_url',
  credentials: 'base_url',
  query: 'base_url',
  port: 'base_url',
  host: 'base_url',
  too_long: 'base_url',
  redirect: 'base_url',
  private_address: 'base_url_private',
  dns: 'base_url_dns',
};

// The whole check (its name resolved, every address public), run by the route before any transaction is opened, so
// no database connection waits on DNS. Returns the address as it is stored.
export async function checkBaseUrl(raw: string): Promise<{ ok: true; normal: string } | { ok: false; code: ChangeError }> {
  const r = await checkEndpoint(raw);
  return r.ok ? r : { ok: false, code: ENDPOINT_CODE[r.code] };
}

type Endpoint = { providerId: string; baseUrl: string | null };

async function writeEndpoint(db: Sql, by: By, next: Endpoint, undoOf?: string): Promise<ChangeResult> {
  if (adapterFor(next.providerId)?.needsBaseUrl !== true) return { ok: false, code: 'provider' };
  // The shape again here (no network): every caller passes an address already checked, an undo the one stored before.
  // The adapter checks the address in full again at every call.
  if (next.baseUrl !== null) {
    const shape = checkEndpointShape(next.baseUrl);
    if (!shape.ok) return { ok: false, code: ENDPOINT_CODE[shape.code] };
    next = { ...next, baseUrl: shape.normal };
  }
  const row = (await db.query(`select base_url, cleared_for_minors from control.ai_providers where provider_id = $1`, [next.providerId])).rows[0];
  if (!row) return { ok: false, code: 'provider' };
  const before: Endpoint = { providerId: next.providerId, baseUrl: row.base_url ?? null };
  const host = (u: string | null) => (u ? new URL(u).host : null);
  const hostChanged = host(before.baseUrl) !== host(next.baseUrl);
  // A clearance for children's words was given for the service the founder read the terms of: a new host is another
  // service, so the clearance is withdrawn with the change, and he clears the new one after reading its terms. While a
  // profile that carries children's words still uses this provider the database refuses that, and so the change.
  let clearanceWithdrawn = false;
  if (hostChanged && row.cleared_for_minors === true) {
    try {
      await db.query(`update control.ai_providers set cleared_for_minors = false, cleared_terms_url = null, cleared_at = null, cleared_by = null where provider_id = $1`, [next.providerId]);
    } catch (err) {
      if (isCheckViolation(err)) return { ok: false, code: 'in_use' };
      throw err;
    }
    clearanceWithdrawn = true;
  }
  try {
    await db.query(`update control.ai_providers set base_url = $2 where provider_id = $1`, [next.providerId, next.baseUrl]);
  } catch (err) {
    if (isCheckViolation(err)) return { ok: false, code: 'base_url' };
    throw err;
  }
  // A key goes only to the host it was saved for: when the host changes (or the address is cleared), the key is
  // removed, so a key entered for one service is never sent to another. The founder enters the new service's key.
  let keyRemoved = false;
  if (hostChanged) {
    keyRemoved = (await db.query(`delete from control.ai_credentials where provider_id = $1 returning provider_id`, [next.providerId])).rows.length > 0;
  }
  await audit(db, by, 'ai.endpoint_changed', next.providerId, before, { ...next, ...(keyRemoved ? { keyRemoved } : {}), ...(clearanceWithdrawn ? { clearanceWithdrawn } : {}), ...(undoOf ? { undoOf } : {}) });
  return { ok: true };
}

// Set or clear the address. `checked` comes from checkBaseUrl (or null to clear it).
export async function setEndpoint(db: Sql, by: By, providerId: string, checked: string | null): Promise<ChangeResult> {
  return writeEndpoint(db, by, { providerId, baseUrl: checked });
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

// `how`: an undo names the audit row it undoes; a rollback names the revision it restores.
async function writeProfile(db: Sql, by: By, profileId: string, next: ProfileSettings, how: { undoOf?: string; rollbackOf?: string } = {}): Promise<ChangeResult> {
  const profile = profileById(profileId);
  if (!profile) return { ok: false, code: 'profile' };
  const providers = [next.providerId, ...next.fallback.map((f) => f.provider)].filter((p): p is string => p !== null);
  // A provider must have an adapter of the profile's capability: voice input (speech_to_text, C281) takes only a provider
  // that can hear, so Anthropic cannot be chosen for it.
  // A route is Primary, Backup 1 and Backup 2 (docs/37 §3.3): at most two backups.
  if (next.fallback.length > 2 || providers.some((p) => !knownProvider(p) || capableAdapter(profile.id, p) === null)) return { ok: false, code: 'provider' };
  if ((next.model !== null && !MODEL.test(next.model)) || next.fallback.some((f) => !MODEL.test(f.model))) return { ok: false, code: 'model' };
  // Workers AI names its models "@cf/<vendor>/<model>" (C230-U); any other id for it would fail every call, so it is
  // refused here, where the founder sees it.
  const links = [{ provider: next.providerId, model: next.model }, ...next.fallback];
  if (links.some((l) => l.provider === 'workers-ai' && (l.model === null || !workersModelLooksRight(l.model)))) return { ok: false, code: 'model' };
  // A Vertex AI model id becomes part of its address (adapters/vertex-ai.ts): any other shape is refused here too.
  if (links.some((l) => l.provider === 'vertex_ai' && (l.model === null || !vertexModelLooksRight(l.model)))) return { ok: false, code: 'model' };
  // The server voice (C386): a voice's model id may become part of the vendor's voice name (Google: "Neural2-A").
  if (profile.capability === 'text_to_speech' && links.some((l) => l.provider !== null && l.model !== null && voiceAdapterFor(l.provider)?.modelLooksRight(l.model) === false)) return { ok: false, code: 'model' };
  // G1 (C369): every provider in the chain must declare what the profile needs (photos for AI marking, for example).
  if (providers.some((p) => missingCapabilities(profile.id, p).length > 0)) return { ok: false, code: 'capability' };
  if (!PROMPT_VERSION.test(next.promptVersion)) return { ok: false, code: 'prompt_version' };
  if ((next.providerId === null) !== (next.model === null) || (next.enabled && next.providerId === null)) return { ok: false, code: 'incomplete' };
  const before = await profileSettings(db, profileId);
  if (!before) return { ok: false, code: 'profile' };
  try {
    // The database writes the route revision in the same statement, with why it was activated.
    await activating(db, how.rollbackOf ? 'rollback' : how.undoOf ? 'undo' : 'set', how.rollbackOf ?? null);
    await db.query(
      `update control.ai_profiles set provider_id = $2, model = $3, fallback = $4::jsonb, prompt_version = $5, enabled = $6, updated_at = now(), updated_by = $7 where profile_id = $1`,
      [profileId, next.providerId, next.model, JSON.stringify(next.fallback), next.promptVersion, next.enabled, by.userId]
    );
    await activated(db);
  } catch (err) {
    // The minors check (C368: the one gate): the database refuses a child-words profile on a provider the founder has
    // not cleared in Control.
    if (isCheckViolation(err)) return { ok: false, code: 'not_cleared_for_minors' };
    throw err;
  }
  await audit(db, by, 'ai.profile_changed', profileId, before, { ...next, ...(how.undoOf ? { undoOf: how.undoOf } : {}), ...(how.rollbackOf ? { rollbackOf: how.rollbackOf } : {}) });
  return { ok: true };
}

export async function setProfile(db: Sql, by: By, profileId: string, next: ProfileSettings): Promise<ChangeResult> {
  return writeProfile(db, by, profileId, next);
}

// Rollback (the brief's §5.4): the profile's route as it was at the revision before the active one (or at the revision
// named), activated again as a new revision, checked as any save is (the minors check included), and audited. One
// transaction: the caller's.
export async function rollbackRoute(db: Sql, by: By, profileId: string, revisionId: string | null = null): Promise<ChangeResult> {
  if (!profileById(profileId)) return { ok: false, code: 'profile' };
  if (revisionId !== null && !/^\d{1,18}$/.test(revisionId)) return { ok: false, code: 'no_revision' };
  const target = await revisionToRestore(db, profileId, revisionId);
  if (!target) return { ok: false, code: 'no_revision' };
  const fallback = (chainOf({ provider_id: 'x', model: 'x', fallback: target.fallback }) ?? []).slice(1);
  return writeProfile(db, by, profileId, { providerId: target.providerId, model: target.model, promptVersion: target.promptVersion, enabled: target.enabled, fallback }, { rollbackOf: target.revisionId });
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

// ---- prices (G5, C373) ----------------------------------------------------------------------------------------------

// What a provider and model cost, as the founder reads it on the vendor's price page: US dollars per million tokens in
// and out, each from 0 to 1000. Null removes the price (the cost is unknown again). From then on each attempt's cost
// is written with the price in force (control.record_ai_attempt); costs already written stay as they were.
const priceOk = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1000;

export async function setPrice(db: Sql, by: By, providerId: string, model: string, price: PriceEntry | null): Promise<ChangeResult> {
  if (!MODEL.test(model)) return { ok: false, code: 'model' };
  if (price && (!priceOk(price.inUsd) || !priceOk(price.outUsd))) return { ok: false, code: 'price' };
  if (!(await db.query(`select 1 from control.ai_providers where provider_id = $1`, [providerId])).rows[0]) return { ok: false, code: 'provider' };
  return writePrice(db, by, providerId, model, price);
}

async function writePrice(db: Sql, by: By, providerId: string, model: string, price: PriceEntry | null, undoOf?: string): Promise<ChangeResult> {
  const prior = (await db.query(`select usd_per_mtok_in, usd_per_mtok_out from control.ai_model_prices where provider_id = $1 and model = $2`, [providerId, model])).rows[0];
  if (price) {
    await db.query(
      `insert into control.ai_model_prices (provider_id, model, usd_per_mtok_in, usd_per_mtok_out, set_by) values ($1, $2, $3, $4, $5)
       on conflict (provider_id, model) do update set usd_per_mtok_in = excluded.usd_per_mtok_in, usd_per_mtok_out = excluded.usd_per_mtok_out, set_by = excluded.set_by, set_at = now()`,
      [providerId, model, price.inUsd, price.outUsd, by.userId]
    );
  } else {
    await db.query(`delete from control.ai_model_prices where provider_id = $1 and model = $2`, [providerId, model]);
  }
  const before = { providerId, model, price: prior ? { inUsd: Number(prior.usd_per_mtok_in), outUsd: Number(prior.usd_per_mtok_out) } : null };
  await audit(db, by, 'ai.price_set', providerId, before, { providerId, model, price, ...(undoOf ? { undoOf } : {}) });
  return { ok: true };
}

export async function setCap(db: Sql, by: By, value: number): Promise<ChangeResult> {
  return writeCap(db, by, value);
}

// The daily spend alert (W5-7, C394): US dollars of known AI cost in one India day, from 0.01 to SPEND_ALERT_MAX_USD;
// null turns it off. The upkeep job reads it each hour.
const spendOk = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0.01 && v <= SPEND_ALERT_MAX_USD;

export async function setSpendAlert(db: Sql, by: By, value: number | null): Promise<ChangeResult> {
  if (value !== null && !spendOk(value)) return { ok: false, code: 'spend' };
  return writeSpendAlert(db, by, value === null ? null : Math.round(value * 100) / 100);
}

async function writeSpendAlert(db: Sql, by: By, value: number | null, undoOf?: string): Promise<ChangeResult> {
  const before = await spendAlertUsd(db);
  await db.query(
    `insert into control.settings (key, value, updated_by) values ($1, $2::jsonb, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [SPEND_ALERT_SETTING, JSON.stringify(value), by.userId]
  );
  await audit(db, by, 'ai.spend_alert_changed', SPEND_ALERT_SETTING, { key: SPEND_ALERT_SETTING, value: before }, { key: SPEND_ALERT_SETTING, value, ...(undoOf ? { undoOf } : {}) });
  return { ok: true };
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
    case 'ai.endpoint_changed':
      return writeEndpoint(db, by, { providerId: String(before.providerId), baseUrl: typeof before.baseUrl === 'string' ? before.baseUrl : null }, auditId);
    case 'ai.profile_changed':
      return writeProfile(
        db,
        by,
        String(row.target_id),
        { providerId: (before.providerId as string) ?? null, model: (before.model as string) ?? null, promptVersion: String(before.promptVersion), enabled: before.enabled === true, fallback: Array.isArray(before.fallback) ? (before.fallback as Link[]) : [] },
        { undoOf: auditId }
      );
    case 'ai.cap_changed':
      return typeof before.value === 'number' ? writeCap(db, by, before.value, auditId) : { ok: false, code: 'not_found' };
    case 'ai.spend_alert_changed':
      return before.value === null || spendOk(before.value) ? writeSpendAlert(db, by, (before.value as number | null) ?? null, auditId) : { ok: false, code: 'not_found' };
    case 'ai.price_set': {
      const p = before.price as PriceEntry | null;
      return typeof before.providerId === 'string' && typeof before.model === 'string'
        ? writePrice(db, by, before.providerId, before.model, p && priceOk(p.inUsd) && priceOk(p.outUsd) ? { inUsd: p.inUsd, outUsd: p.outUsd } : null, auditId)
        : { ok: false, code: 'not_found' };
    }
  }
  return { ok: false, code: 'not_found' };
}
