import { withPlatformService } from '@/lib/auth/db';
import type { Sql } from '@/lib/jobs/types';
import type { MessageKey } from '@/lib/i18n';
import { adapterFor, type AdapterResult, type ChatMessage, type TextAdapter } from './adapters';
import { searchVideoIds, videoDetails, type VideoCandidate, type VideoKind } from './adapters/youtube';
import { aiEncryptionKey, unsealAiKey, type SealedRow } from './credentials';
import { dailyLimit, takeDailyRequest } from './daily-cap';
import { scrubRequest } from './preprocess';

// The AI platform's public interface (docs/family-app/03 §7, C249). The ONLY AI module family code may import
// (scripts/check_family_boundary.py). A feature profile runs in three steps, so no database connection is held while a
// vendor answers (F1-3): prepareText() does 1–5 in the caller's first short transaction; its send() does 6 with no
// database at all; the sent call's record() does 7 in the caller's second short transaction. streamText() runs the three
// on one client, for a caller that has nothing to hold the connection for.
//
//   1. the profile as Control set it (control.ai_profiles): off, or no provider or model → 'not_switched_on';
//   2. the minors check: a profile that may carry a child's words runs only when its provider AND every fallback is
//      cleared for minors in Control AND its adapter is eligible in code → otherwise 'not_cleared_for_minors';
//   3. a usable provider: an adapter exists, and its key is set and opens with the server's key → else 'not_switched_on';
//   4. the family's daily cap (Control's setting, read live), counted in the caller's transaction → 'cap_reached';
//   5. the pre-processor removes every child identifier from the whole request;
//   6. the chain is tried in order until one answers; a provider that fails before any text is streamed hands over
//      to the next → 'failed' when none answers;
//   7. the call is metered with counts and tokens only (control.count_ai_usage). No prompt or answer is stored or logged.
//
// `db` is the caller's family_app client, inside withFamilyContext. The answer is data, never code: callers parse it
// against their schema and drop anything outside it. The key opened in 3 lives only inside the prepared call (a closure,
// never a field), and a prepared call sends once: one daily-cap place, one vendor request.

export type ProfileId = 'family.resolver' | 'family.homework' | 'family.voice_input';
export type AiProfile = { id: ProfileId; carriesChildWords: boolean };

// Code-defined: which profiles exist and whether a child's words may pass. Control sets each one's provider, model,
// prompt version and on switch; never this list. M2 (C275): the homework helper reads a photo, voice input hears a child.
export const PROFILES: readonly AiProfile[] = [
  { id: 'family.resolver', carriesChildWords: true },
  { id: 'family.homework', carriesChildWords: true },
  { id: 'family.voice_input', carriesChildWords: true },
];

export type AiContext = {
  accountId: string;
  childFirstNames: string[];
  parentEmail?: string;
  day: string; // the India date, YYYY-MM-DD
};
export type AiRequest = {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  responseFormat?: 'json';
};
export type AiRefusal = 'not_switched_on' | 'cap_reached' | 'not_cleared_for_minors' | 'failed';
export type AiResult = { ok: true; text: string; tokensIn: number; tokensOut: number; provider: string; model: string } | { ok: false; reason: AiRefusal };
export type { ChatMessage };

// The family-facing words for each refusal (English and Hindi in the message files).
export const REFUSAL_MESSAGE: Record<AiRefusal, MessageKey> = {
  not_switched_on: 'ai.not_switched_on',
  cap_reached: 'ai.cap_reached',
  not_cleared_for_minors: 'ai.not_cleared_for_minors',
  failed: 'ai.failed',
};

type ProfileRow = { provider_id: string | null; model: string | null; fallback: unknown; prompt_version: string; max_output_tokens: number; enabled: boolean; carries_child_words: boolean };
type ProviderRow = { provider_id: string; cleared_for_minors: boolean; enabled: boolean };
type Link = { provider: string; model: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function profileById(id: string): AiProfile | null {
  return PROFILES.find((p) => p.id === id) ?? null;
}

async function profileRow(db: Sql, id: ProfileId): Promise<ProfileRow | null> {
  const { rows } = await db.query(
    `select provider_id, model, fallback, prompt_version, max_output_tokens, enabled, carries_child_words from control.ai_profiles where profile_id = $1`,
    [id]
  );
  return (rows[0] as ProfileRow | undefined) ?? null;
}

// The prompt version Control chose for a profile (the prompt text itself lives in the repository, 08 §7).
export async function activePromptVersion(db: Sql, profileId: ProfileId): Promise<string | null> {
  if (!profileById(profileId)) return null;
  return (await profileRow(db, profileId))?.prompt_version ?? null;
}

// The provider and model, then each fallback as Control set it: [{ "provider": "...", "model": "..." }].
export function chainOf(row: Pick<ProfileRow, 'provider_id' | 'model' | 'fallback'>): Link[] | null {
  if (!row.provider_id || !row.model) return null;
  const chain: Link[] = [{ provider: row.provider_id, model: row.model }];
  for (const f of Array.isArray(row.fallback) ? row.fallback : []) {
    const provider = (f as { provider?: unknown })?.provider;
    const model = (f as { model?: unknown })?.model;
    if (typeof provider === 'string' && typeof model === 'string' && provider && model) chain.push({ provider, model });
  }
  return chain;
}

async function count(db: Sql, day: string, profile: string, link: Link, c: { requests?: number; failures?: number; capRefusals?: number; tokensIn?: number; tokensOut?: number }): Promise<void> {
  await db.query(`select control.count_ai_usage($1::date, $2::text, $3::text, $4::text, $5::int, $6::int, $7::int, $8::bigint, $9::bigint)`, [
    day,
    profile,
    link.provider,
    link.model,
    c.requests ?? 0,
    c.failures ?? 0,
    c.capRefusals ?? 0,
    Math.max(0, Math.round(c.tokensIn ?? 0)),
    Math.max(0, Math.round(c.tokensOut ?? 0)),
  ]);
}

type Ready = { link: Link; adapter: TextAdapter; apiKey: string };

// Opens each provider's key inside this call only. A provider without an adapter, a key, or a key that opens is
// left out of the chain.
async function usableLinks(db: Sql, chain: Link[], providers: Map<string, ProviderRow>, env: Record<string, string | undefined>): Promise<Ready[]> {
  const ready: Ready[] = [];
  const k = aiEncryptionKey(env);
  for (const link of chain) {
    const adapter = adapterFor(link.provider, env);
    const provider = providers.get(link.provider);
    if (!adapter || !provider?.enabled) continue;
    if (!adapter.needsKey) {
      ready.push({ link, adapter, apiKey: '' });
      continue;
    }
    if (!k) continue;
    const { rows } = await db.query(`select ciphertext, iv, tag, key_version from control.ai_sealed_credential($1)`, [link.provider]);
    if (!rows[0]) continue;
    try {
      ready.push({ link, adapter, apiKey: unsealAiKey(k, link.provider, rows[0] as SealedRow) });
    } catch {
      // Sealed with another key version, or the row was changed: this provider cannot be used until its key is set again.
    }
  }
  return ready;
}

// Usage to add to Control's counts once the call is over (counts and tokens only).
type Counts = { requests?: number; failures?: number; capRefusals?: number; tokensIn?: number; tokensOut?: number };

// A call that passed every check, ready to go to the vendor. send() needs no database.
export type PreparedText = { send: (onDelta?: (text: string) => void) => Promise<SentText> };
// A call that went out: its result, and the metering to write in the caller's next transaction. Each record() adds
// the counts again, so a caller records once, or again only when its transaction was refused before anything ran.
export type SentText = { result: AiResult; record: (db: Sql) => Promise<void> };
export type Prepared = { ok: true; text: PreparedText } | { ok: false; reason: AiRefusal };

// 1–5: every check, the daily cap taken, the key opened and the request cleaned, in the caller's transaction.
export async function prepareText(db: Sql, ctx: AiContext, profileId: ProfileId, request: AiRequest): Promise<Prepared> {
  const env = process.env;
  const profile = profileById(profileId);
  if (!profile || !UUID.test(ctx.accountId) || !DAY.test(ctx.day)) return { ok: false, reason: 'failed' };

  // 1. Switched on?
  const row = await profileRow(db, profile.id);
  const chain = row ? chainOf(row) : null;
  if (!row || !row.enabled || !chain) return { ok: false, reason: 'not_switched_on' };

  // 2. The minors check, on the whole chain, before anything else is looked at.
  const { rows: providerRows } = await db.query(`select provider_id, cleared_for_minors, enabled from control.ai_providers where provider_id = any($1::text[])`, [chain.map((l) => l.provider)]);
  const providers = new Map((providerRows as ProviderRow[]).map((p) => [p.provider_id, p]));
  if (profile.carriesChildWords || row.carries_child_words) {
    const cleared = chain.every((l) => providers.get(l.provider)?.cleared_for_minors === true && adapterFor(l.provider, env)?.minorsEligible === true);
    if (!cleared) return { ok: false, reason: 'not_cleared_for_minors' };
  }

  // 3. A provider that can answer.
  const ready = await usableLinks(db, chain, providers, env);
  if (ready.length === 0) return { ok: false, reason: 'not_switched_on' };

  // 4. The family's daily cap, counted before the request leaves.
  const limit = await dailyLimit(db);
  if (limit === null || !(await takeDailyRequest(db, ctx.accountId, ctx.day, limit))) {
    await count(db, ctx.day, profile.id, ready[0].link, { capRefusals: 1 });
    return { ok: false, reason: 'cap_reached' };
  }

  // 5. Nothing that names a child leaves the server.
  const clean = scrubRequest(request, { childFirstNames: ctx.childFirstNames, parentEmail: ctx.parentEmail });
  const maxTokens = Math.min(Math.max(1, Math.floor(request.maxTokens ?? row.max_output_tokens)), row.max_output_tokens);

  let sent = false;
  const send = async (onDelta: (text: string) => void = () => {}): Promise<SentText> => {
    const usage: { link: Link; counts: Counts }[] = [];
    const record = async (tx: Sql) => {
      for (const u of usage) await count(tx, ctx.day, profile.id, u.link, u.counts);
    };
    // One cap place, one request: a prepared call never goes out twice.
    if (sent) return { result: { ok: false, reason: 'failed' }, record };
    sent = true;
    // 6. Down the chain until one answers.
    for (const { link, adapter, apiKey } of ready) {
      let streamed = false;
      let result: AdapterResult;
      try {
        result = await adapter.streamText({ apiKey, model: link.model, system: clean.system, messages: clean.messages, maxTokens, responseFormat: request.responseFormat }, (piece) => {
          streamed = true;
          onDelta(piece);
        });
      } catch {
        // An adapter never throws by design; if one did (or the caller's onDelta did), the call is still counted.
        result = { ok: false, failure: 'network' };
      }
      if (result.ok) {
        usage.push({ link, counts: { requests: 1, tokensIn: result.tokensIn, tokensOut: result.tokensOut } });
        return { result: { ok: true, text: result.text, tokensIn: result.tokensIn, tokensOut: result.tokensOut, provider: link.provider, model: link.model }, record };
      }
      usage.push({ link, counts: { requests: 1, failures: 1 } });
      // Text already shown cannot be taken back: a second provider's answer would be stitched onto it.
      if (streamed) break;
    }
    return { result: { ok: false, reason: 'failed' }, record };
  };
  return { ok: true, text: { send } };
}

// The three steps on one client: for a caller with nothing to do between them.
export async function streamText(db: Sql, ctx: AiContext, profileId: ProfileId, request: AiRequest, onDelta: (text: string) => void = () => {}): Promise<AiResult> {
  const prepared = await prepareText(db, ctx, profileId, request);
  if (!prepared.ok) return prepared;
  const sent = await prepared.text.send(onDelta);
  await sent.record(db);
  return sent.result;
}

// ---- the video finder (docs/family-app/03 §8; M2-5, C279) -----------------------------------------------------------
//
// Not an AI profile: a content provider whose key Control → AI keeps (provider 'youtube'). The same three steps as a
// text call, so no database connection is held while YouTube answers: prepareVideoSearch() opens the key and takes the
// day's searches in the caller's transaction; find() calls the provider with no database at all; the caller saves what
// it ranked in its next transaction (content.save_video_picks). The search is built by the caller from the catalog —
// a topic's title with its subject and class words — never from anything a child typed or said.

export type { VideoCandidate, VideoChapter, VideoKind } from './adapters/youtube';
export type VideoChannel = { channelId: string; kind: VideoKind };
export type VideoPlan = { query: string; language: 'en' | 'hi'; channelIds: string[] };
export type FoundVideos = { ok: true; candidates: VideoCandidate[] } | { ok: false };
export type PreparedVideos = { ok: true; searches: number; find: () => Promise<FoundVideos> } | { ok: false; reason: 'no_key' | 'quota' };

const VIDEO_PROVIDER = 'youtube';
// At most this many channel searches (official, then approved; the caller turns the lists by topic) beside the wider
// catalogue, each one a search from the day's quota (family.video_searches_per_day): a refresh takes 1 to 3.
const CHANNEL_SEARCHES = 2;

// The channels Control listed (official, approved, blocked). Control's own table: families have no read of it, so it is
// read here with the platform role, in a short transaction of its own (ids and kinds only; no family data is near it).
export async function videoChannels(): Promise<VideoChannel[]> {
  const rows = await withPlatformService(async (db) => (await db.query(`select channel_id, kind from content.video_channels order by kind, added_at`)).rows);
  return rows.map((r) => ({ channelId: String(r.channel_id), kind: r.kind as VideoKind }));
}

// In the caller's transaction: the provider's key (none, or one that does not open → nothing is searched and no quota
// is spent), then up to 1 + CHANNEL_SEARCHES searches from today's quota.
export async function prepareVideoSearch(db: Sql, a: { day: string; perDay: number; plan: VideoPlan }): Promise<PreparedVideos> {
  if (!DAY.test(a.day)) return { ok: false, reason: 'quota' };
  const k = aiEncryptionKey();
  if (!k) return { ok: false, reason: 'no_key' };
  const { rows } = await db.query(`select ciphertext, iv, tag, key_version from control.ai_sealed_credential($1)`, [VIDEO_PROVIDER]);
  if (!rows[0]) return { ok: false, reason: 'no_key' };
  let apiKey: string;
  try {
    apiKey = unsealAiKey(k, VIDEO_PROVIDER, rows[0] as SealedRow);
  } catch {
    return { ok: false, reason: 'no_key' };
  }
  const channels = a.plan.channelIds.slice(0, CHANNEL_SEARCHES);
  let searches = 0;
  for (let i = 0; i < 1 + channels.length; i++) {
    const took = await db.query(`select content.take_video_search($1::date, $2::int) as ok`, [a.day, Math.max(0, Math.floor(a.perDay))]);
    if (took.rows[0]?.ok !== true) break;
    searches++;
  }
  if (searches === 0) return { ok: false, reason: 'quota' };
  // Fewer searches left than planned: the wider catalogue keeps its one, the channel searches give way.
  const channelIds = channels.slice(0, searches - 1);
  const { query, language } = a.plan;
  let used = false;
  return {
    ok: true,
    searches,
    // Each search taken is sent at most once.
    find: async (): Promise<FoundVideos> => {
      if (used) return { ok: false };
      used = true;
      // The channel searches and the wider one at once (one round trip); the channels' results come first.
      const results = await Promise.all([
        ...channelIds.map((channelId) => searchVideoIds(apiKey, { query, language, channelId, maxResults: 5 })),
        searchVideoIds(apiKey, { query, language, maxResults: 10 }),
      ]);
      if (!results.some((r) => r.ok)) return { ok: false };
      const ids = results.flatMap((r) => (r.ok ? r.value : []));
      const details = await videoDetails(apiKey, Array.from(new Set(ids)));
      return details.ok ? { ok: true, candidates: details.value } : { ok: false };
    },
  };
}
