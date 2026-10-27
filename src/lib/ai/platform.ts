import { withPlatformService } from '@/lib/auth/db';
import type { Sql } from '@/lib/jobs/types';
import type { MessageKey } from '@/lib/i18n';
import { adapterFor, moderationAdapterFor, speechAdapterFor, type AdapterResult, type ChatImage, type ChatMessage, type ModerationAdapter, type ModerationResult, type SpeechAdapter, type SpeechMediaType, type SpeechResult, type TextAdapter } from './adapters';
import { probeWorkersTransports } from './adapters/workers-ai';
import { resolverPrompt } from './prompts/family.resolver';
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
//      cleared for minors in Control (the one gate, C368) → otherwise 'not_cleared_for_minors';
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

export type ProfileId =
  | 'family.resolver'
  | 'family.homework'
  | 'family.voice_input'
  | 'family.moderation'
  | 'family.syllabus_extract'
  | 'copilot.draft'
  | 'parent_ai.home_help'
  | 'content.syllabus_extract'
  | 'content.prepare'
  | 'exams.read_pages'
  | 'exams.mark'
  | 'exams.write_questions';
export type Capability = 'text' | 'speech_to_text' | 'moderation';
// `audience`: a family profile counts against the family's daily cap; a school profile's limit is the school's own
// monthly one, which its caller checks (src/lib/copilot/copilot.ts; AI marking's pages, src/app/api/app/marking); a
// control profile runs only for Control's staff.
// `callMs`: a profile whose answer is long (many page pictures in, a long JSON out) gives its whole chain this long,
// shared by every provider tried (C349). Without it each provider gets the adapter's own limit.
export type AiProfile = { id: ProfileId; carriesChildWords: boolean; capability: Capability; audience: 'family' | 'school' | 'control'; callMs?: number };

// Code-defined: which profiles exist, whether a child's words may pass, and which capability each one uses. Control
// sets each one's provider, model, prompt version and on switch; never this list. M2 (C275): the homework helper reads a
// photo, voice input hears a child (speech_to_text, M2-7, C281: prepareTranscription below).
export const PROFILES: readonly AiProfile[] = [
  { id: 'family.resolver', carriesChildWords: true, capability: 'text', audience: 'family' },
  { id: 'family.homework', carriesChildWords: true, capability: 'text', audience: 'family' },
  { id: 'family.voice_input', carriesChildWords: true, capability: 'speech_to_text', audience: 'family' },
  // W2 (C314): the safety check (Llama Guard) on a child's typed words and on every live answer before it is shown.
  // It takes no daily-cap place of its own: it runs only beside a call that already took one.
  { id: 'family.moderation', carriesChildWords: true, capability: 'moderation', audience: 'family' },
  // C230-AB: a parent's photos of a book's contents pages, read for the chapter and topic names of their child's own
  // syllabus (parent mode). A printed book's titles, never a child's words; the parent checks every line before use.
  { id: 'family.syllabus_extract', carriesChildWords: false, capability: 'text', audience: 'family' },
  // M2-10 (C284): Copilot and Parent AI. Their requests name a class level, subject and topic, never a person.
  { id: 'copilot.draft', carriesChildWords: false, capability: 'text', audience: 'school' },
  { id: 'parent_ai.home_help', carriesChildWords: false, capability: 'text', audience: 'school' },
  // M2-12 (C286): reads a board's public syllabus PDF for Control's catalog import; a reviewer approves every line.
  { id: 'content.syllabus_extract', carriesChildWords: false, capability: 'text', audience: 'control' },
  // W2 (C313; C230-T): NetCyberAI staff prepare the library's explanations before children ask (Control → Content →
  // Responses). No child's words; what it makes reaches a child only once a person has checked it (C300, the
  // responses' read policy).
  { id: 'content.prepare', carriesChildWords: false, capability: 'text', audience: 'control' },
  // AM-2 (C349): AI answer-sheet marking. Both read photos of children's handwritten answer sheets, so only a provider
  // cleared for children may serve them. The request carries the paper and the page pictures, never a name or a roster:
  // the pages are matched to the class in code (src/lib/marking/matching.ts). Their limit is the school's monthly pages
  // (exams.ai_marking_pages), checked when pages are uploaded. They run in the school's marking jobs, one a run of the
  // job runner (src/lib/jobs/runner.ts), so their chain may take longer than a person waits.
  { id: 'exams.read_pages', carriesChildWords: true, capability: 'text', audience: 'school', callMs: 90_000 },
  { id: 'exams.mark', carriesChildWords: true, capability: 'text', audience: 'school', callMs: 200_000 },
  // AQ-2 (C363): writes a question paper's questions for the chapters and topics, class level, subject, language, kinds,
  // marks and difficulty a plan names (src/lib/papers/scope.ts), with the paper's other questions to avoid; never a
  // child's name or words. It runs in the school's papers.make job (a long job), at most two rounds of this time.
  { id: 'exams.write_questions', carriesChildWords: false, capability: 'text', audience: 'school', callMs: 90_000 },
];

// The adapter a profile would use for a provider: the one of the profile's capability, or null when the code has none
// (a provider without a speech adapter cannot serve voice input). Control checks a choice against it; the platform
// skips a provider without one.
export function capableAdapter(profileId: string, providerId: string, env: Record<string, string | undefined> = process.env): TextAdapter | SpeechAdapter | ModerationAdapter | null {
  const profile = profileById(profileId);
  if (!profile) return null;
  if (profile.capability === 'moderation') return moderationAdapterFor(providerId, env);
  return profile.capability === 'speech_to_text' ? speechAdapterFor(providerId, env) : adapterFor(providerId, env);
}

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
export type AiResult = { ok: true; text: string; tokensIn: number; tokensOut: number; provider: string; model: string; finish?: string } | { ok: false; reason: AiRefusal };
export type { ChatMessage, ChatImage };

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

type Ready<A> = { link: Link; adapter: A; apiKey: string };

// Opens each provider's key inside this call only. A provider without an adapter (of the capability `find` looks up),
// a key, or a key that opens is left out of the chain.
async function usableLinks<A extends { needsKey: boolean }>(db: Sql, chain: Link[], providers: Map<string, ProviderRow>, env: Record<string, string | undefined>, find: (providerId: string) => A | null): Promise<Ready<A>[]> {
  const ready: Ready<A>[] = [];
  const k = aiEncryptionKey(env);
  for (const link of chain) {
    const adapter = find(link.provider);
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

type Checked = { ok: true; profile: AiProfile; row: ProfileRow; chain: Link[]; providers: Map<string, ProviderRow> } | { ok: false; reason: AiRefusal };

// 1 and 2, for either capability: the profile switched on, and the minors check on the whole chain, against the
// adapter of the profile's own capability.
async function checkProfile(db: Sql, ctx: AiContext, profileId: ProfileId, capability: Capability, env: Record<string, string | undefined>): Promise<Checked> {
  const profile = profileById(profileId);
  if (!profile || profile.capability !== capability || !UUID.test(ctx.accountId) || !DAY.test(ctx.day)) return { ok: false, reason: 'failed' };

  // 1. Switched on?
  const row = await profileRow(db, profile.id);
  const chain = row ? chainOf(row) : null;
  if (!row || !row.enabled || !chain) return { ok: false, reason: 'not_switched_on' };

  // 2. The minors check, on the whole chain, before anything else is looked at.
  const { rows: providerRows } = await db.query(`select provider_id, cleared_for_minors, enabled from control.ai_providers where provider_id = any($1::text[])`, [chain.map((l) => l.provider)]);
  const providers = new Map((providerRows as ProviderRow[]).map((p) => [p.provider_id, p]));
  if (profile.carriesChildWords || row.carries_child_words) {
    // Every provider in the chain must be cleared in Control (C368: the founder's switch is the one gate). A text
    // provider needs its adapter (as before); a provider with no speech adapter is not refused for that alone: it is
    // skipped at step 3.
    const cleared = chain.every((l) => providers.get(l.provider)?.cleared_for_minors === true && (capability !== 'text' || capableAdapter(profile.id, l.provider, env) !== null));
    if (!cleared) return { ok: false, reason: 'not_cleared_for_minors' };
  }
  return { ok: true, profile, row, chain, providers };
}

// 4. The family's daily cap, counted before the request leaves.
async function takeCap(db: Sql, ctx: AiContext, profile: AiProfile, first: Link): Promise<boolean> {
  if (profile.audience !== 'family') return true;
  const limit = await dailyLimit(db);
  if (limit === null || !(await takeDailyRequest(db, ctx.accountId, ctx.day, limit))) {
    await count(db, ctx.day, profile.id, first, { capRefusals: 1 });
    return false;
  }
  return true;
}

// A provider is not tried on a profile's own time (callMs) with less than this left.
const CHAIN_MIN_MS = 15_000;

// 1–5: every check, the daily cap taken, the key opened and the request cleaned, in the caller's transaction.
export async function prepareText(db: Sql, ctx: AiContext, profileId: ProfileId, request: AiRequest): Promise<Prepared> {
  const env = process.env;
  const checked = await checkProfile(db, ctx, profileId, 'text', env);
  if (!checked.ok) return checked;
  const { profile, row, chain, providers } = checked;

  // 3. A provider that can answer (and, for a request with photos, that can see them).
  const withPhotos = request.messages.some((m) => (m.images?.length ?? 0) > 0);
  const ready = (await usableLinks(db, chain, providers, env, (p) => adapterFor(p, env))).filter((r) => !withPhotos || r.adapter.vision);
  if (ready.length === 0) return { ok: false, reason: 'not_switched_on' };

  // 4. The family's daily cap (a school or Control profile's limit is checked by its caller).
  if (!(await takeCap(db, ctx, profile, ready[0].link))) return { ok: false, reason: 'cap_reached' };

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
    // A profile with its own time (callMs) shares it across the chain: each provider gets what is left, and none is
    // tried once less than CHAIN_MIN_MS is left.
    const deadline = profile.callMs ? Date.now() + profile.callMs : null;
    // 6. Down the chain until one answers.
    for (const { link, adapter, apiKey } of ready) {
      const left = deadline === null ? null : deadline - Date.now();
      if (left !== null && left < CHAIN_MIN_MS) break;
      let streamed = false;
      let result: AdapterResult;
      try {
        const timeout = left === null ? {} : { timeoutMs: left };
        result = await adapter.streamText({ apiKey, model: link.model, system: clean.system, messages: clean.messages, maxTokens, responseFormat: request.responseFormat, ...timeout }, (piece) => {
          streamed = true;
          onDelta(piece);
        });
      } catch {
        // An adapter never throws by design; if one did (or the caller's onDelta did), the call is still counted.
        result = { ok: false, failure: 'network' };
      }
      if (result.ok) {
        usage.push({ link, counts: { requests: 1, tokensIn: result.tokensIn, tokensOut: result.tokensOut } });
        return { result: { ok: true, text: result.text, tokensIn: result.tokensIn, tokensOut: result.tokensOut, provider: link.provider, model: link.model, ...(result.finish ? { finish: result.finish } : {}) }, record };
      }
      usage.push({ link, counts: { requests: 1, failures: 1 } });
      // Text already shown cannot be taken back: a second provider's answer would be stitched onto it.
      if (streamed) break;
    }
    return { result: { ok: false, reason: 'failed' }, record };
  };
  return { ok: true, text: { send } };
}

// ---- speech to text (M2-7, C281) -----------------------------------------------------------------------------------

const SPEECH_CHAIN_BUDGET_MS = 30_000;

export type SpeechInput ={ audio: Uint8Array; mediaType: SpeechMediaType; language: 'en' | 'hi' };
export type TranscriptResult = { ok: true; text: string; provider: string; model: string } | { ok: false; reason: AiRefusal };
export type SentTranscript = { result: TranscriptResult; record: (db: Sql) => Promise<void> };
export type PreparedSpeech = { send: () => Promise<SentTranscript> };
export type PreparedTranscription = { ok: true; speech: PreparedSpeech } | { ok: false; reason: AiRefusal };

// The same seven steps as prepareText, for a recording: 1–4 here, in the caller's transaction (the profile, the minors
// check on the whole chain, a provider with a speech adapter and a key, the family's daily cap). Step 5 has nothing to
// clean: the request is the recording, the model, the language and a fixed file name, with no name, email or number of
// the family's. 6 (send, no database) and 7 (record: counts and tokens only) as for text. The recording lives only in
// the prepared call's closure and is never stored or logged; the words that come back are the caller's to check.
export async function prepareTranscription(db: Sql, ctx: AiContext, profileId: ProfileId, input: SpeechInput): Promise<PreparedTranscription> {
  const env = process.env;
  const checked = await checkProfile(db, ctx, profileId, 'speech_to_text', env);
  if (!checked.ok) return checked;
  const { profile, chain, providers } = checked;

  // 3. A provider that can hear: one without a speech adapter is skipped.
  const ready = await usableLinks(db, chain, providers, env, (p) => speechAdapterFor(p, env));
  if (ready.length === 0) return { ok: false, reason: 'not_switched_on' };

  // 4. The family's daily cap.
  if (!(await takeCap(db, ctx, profile, ready[0].link))) return { ok: false, reason: 'cap_reached' };

  let sent = false;
  const send = async (): Promise<SentTranscript> => {
    const usage: { link: Link; counts: Counts }[] = [];
    const record = async (tx: Sql) => {
      for (const u of usage) await count(tx, ctx.day, profile.id, u.link, u.counts);
    };
    if (sent) return { result: { ok: false, reason: 'failed' }, record };
    sent = true;
    // 6. Down the chain until one hears it, within the route's minute: no next provider once 30 seconds have gone.
    const began = Date.now();
    for (const { link, adapter, apiKey } of ready) {
      if (Date.now() - began > SPEECH_CHAIN_BUDGET_MS) break;
      let result: SpeechResult;
      try {
        result = await adapter.transcribe({ apiKey, model: link.model, audio: input.audio, mediaType: input.mediaType, language: input.language });
      } catch {
        result = { ok: false, failure: 'network' };
      }
      if (result.ok) {
        usage.push({ link, counts: { requests: 1, tokensIn: result.tokensIn, tokensOut: result.tokensOut } });
        return { result: { ok: true, text: result.text, provider: link.provider, model: link.model }, record };
      }
      usage.push({ link, counts: { requests: 1, failures: 1 } });
    }
    return { result: { ok: false, reason: 'failed' }, record };
  };
  return { ok: true, speech: { send } };
}

// ---- moderation (W2, C314) -------------------------------------------------------------------------------------------

export type ModerationVerdict = { safe: boolean; categories: string[] };
// A prepared safety check: check() may run several times in one request (the question, then each block of the answer)
// with no database; null means the check could not be made, and the caller then shows nothing. record() writes the
// counts of every check made, in the caller's next transaction.
export type PreparedModeration = { check: (turns: { user: string; assistant?: string }) => Promise<ModerationVerdict | null>; record: (db: Sql) => Promise<void> };
export type ModerationReady = { ok: true; moderation: PreparedModeration } | { ok: false; reason: AiRefusal };

// Steps 1–3 and 5 of the seven, in the caller's transaction (the profile, the minors check on the whole chain, a
// provider with a moderation adapter and a key; no daily-cap place: it runs beside a call that took one). Step 5 runs
// on every check: the child's names and the parent's email are removed from the words before they leave. 6 (check, no
// database) tries the chain in order; 7 (record) counts requests, failures and tokens only. The words are never stored.
export async function prepareModeration(db: Sql, ctx: AiContext): Promise<ModerationReady> {
  const env = process.env;
  const checked = await checkProfile(db, ctx, 'family.moderation', 'moderation', env);
  if (!checked.ok) return checked;
  const { profile, chain, providers } = checked;
  const ready = await usableLinks(db, chain, providers, env, (p) => moderationAdapterFor(p, env));
  if (ready.length === 0) return { ok: false, reason: 'not_switched_on' };

  const usage: { link: Link; counts: Counts }[] = [];
  const check = async (turns: { user: string; assistant?: string }): Promise<ModerationVerdict | null> => {
    const clean = scrubRequest(
      { system: '', messages: [{ role: 'user', content: turns.user }, ...(turns.assistant === undefined ? [] : [{ role: 'assistant' as const, content: turns.assistant }])] },
      { childFirstNames: ctx.childFirstNames, parentEmail: ctx.parentEmail }
    );
    const user = clean.messages[0].content;
    const assistant = turns.assistant === undefined ? undefined : clean.messages[1].content;
    for (const { link, adapter, apiKey } of ready) {
      let result: ModerationResult;
      try {
        result = await adapter.moderate({ apiKey, model: link.model, user, assistant });
      } catch {
        result = { ok: false, failure: 'network' };
      }
      if (result.ok) {
        usage.push({ link, counts: { requests: 1, tokensIn: result.tokensIn, tokensOut: result.tokensOut } });
        return { safe: result.safe, categories: result.categories };
      }
      usage.push({ link, counts: { requests: 1, failures: 1 } });
    }
    return null;
  };
  const record = async (tx: Sql) => {
    for (const u of usage.splice(0)) await count(tx, ctx.day, profile.id, u.link, u.counts);
  };
  return { ok: true, moderation: { check, record } };
}

// ---- the smoke test (W2, C316) ---------------------------------------------------------------------------------------

// One live call to each children's profile as Control has set it, with made-up inputs and no child in them: a short
// text answer in JSON, a photo of a printed question, the same spoken question in each format a phone records, and the
// safety check. It answers what AI_PROVIDERS.md lists as "not verified yet" (photos on the chosen route, the audio
// formats, the safety check's answer form). The minors check applies as for a child's call; no family's daily cap is
// taken. Prepared in the caller's transaction, sent with no database, recorded (counts only) in the next one.
// `start`: the first words of a made-up answer (C320), kept so a format problem can be seen; the inputs name no one.
export type SmokeCheck = { check: string; profile: ProfileId; ok: boolean; provider?: string; model?: string; failure?: string; status?: number; ms?: number; note?: string; start?: string; raw?: string };
// `topic`: a syllabus line (no child's words) the real explanation prompt is tried on, both ways (C326).
export type SmokeTopic = { board: string; classLevel: number; subject: string; chapter: string; topic: string };
export type SmokeInputs = { photoJpegBase64: string; speech: readonly { mediaType: SpeechMediaType; base64: string }[]; topic: SmokeTopic };
export type PreparedSmoke = { send: () => Promise<SmokeCheck[]>; record: (db: Sql) => Promise<void> };

const SMOKE_QUESTION = 'What does a magnet attract?';
export async function prepareSmokeTest(db: Sql, ctx: AiContext, inputs: SmokeInputs): Promise<PreparedSmoke> {
  const env = process.env;
  const usage: { profile: ProfileId; link: Link; counts: Counts }[] = [];
  type Step = () => Promise<SmokeCheck[]>;
  const steps: Step[] = [];
  const refused = (check: string, profile: ProfileId, reason: string): Step => async () => [{ check, profile, ok: false, failure: reason }];

  const textChain = async (profile: ProfileId, check: string, request: AdapterRequestPart, judge: (text: string, finish?: string) => string | undefined) => {
    const c = await checkProfile(db, ctx, profile, 'text', env);
    if (!c.ok) return steps.push(refused(check, profile, c.reason));
    const usable = await usableLinks(db, c.chain, c.providers, env, (p) => adapterFor(p, env));
    const ready = usable.filter((r) => !request.images || r.adapter.vision);
    if (!ready.length) return steps.push(refused(check, profile, usable.length ? 'no_provider_reads_photos' : 'not_switched_on'));
    const { link, adapter, apiKey } = ready[0];
    steps.push(async () => {
      const began = Date.now();
      let r: AdapterResult;
      try {
        const maxTokens = request.fullLength ? Number(c.row.max_output_tokens) : 300;
        r = await adapter.streamText({ apiKey, model: link.model, system: request.system, messages: [{ role: 'user', content: request.user, images: request.images }], maxTokens, ...(request.instructionsAs ? { instructionsAs: request.instructionsAs } : {}) }, () => {});
      } catch {
        r = { ok: false, failure: 'network' };
      }
      usage.push({ profile, link, counts: r.ok ? { requests: 1, tokensIn: r.tokensIn, tokensOut: r.tokensOut } : { requests: 1, failures: 1 } });
      return [{ check, profile, ok: r.ok, provider: link.provider, model: link.model, ms: Date.now() - began, ...(r.ok ? { note: judge(r.text, r.finish), start: r.text.replace(/\s+/g, ' ').trim().slice(0, 160) } : { failure: r.failure, status: r.status }) }];
    });
  };
  const jsonNote = (text: string) => {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    try {
      JSON.parse(text.slice(start, end + 1));
      return start === 0 && end === text.trim().length - 1 ? 'json: one object, nothing around it' : 'json: an object, with text around it';
    } catch {
      return 'json: none readable';
    }
  };
  const jsonAsk = { system: 'Answer with one JSON object only, on one line: {"type":"answer","word":"<one word>"}.', user: `${SMOKE_QUESTION} One word.` };
  // The instructions where the adapter puts them, then in a system message, to compare the two (C320).
  await textChain('family.resolver', 'text', jsonAsk, jsonNote);
  await textChain('family.resolver', 'text:system', { ...jsonAsk, instructionsAs: 'system' }, jsonNote);
  // The real explanation prompt (content.prepare's version) at its full length, with the instructions in the first user
  // message and in a system message, in English and Hindi (C326): which required blocks arrive, and why it stopped.
  const blocksNote = (text: string, finish?: string) => {
    const types = Array.from(text.matchAll(/"type"\s*:\s*"([a-z_]+)"/g), (m) => m[1]);
    const missing = ['explanation', 'check', 'practice'].filter((t) => !types.includes(t));
    return `blocks: ${types.join(', ') || 'none'}; ${missing.length ? `missing ${missing.join(', ')}` : 'all required'}; finish: ${finish ?? 'not said'}`;
  };
  const explain = resolverPrompt(await activePromptVersion(db, 'content.prepare'), false);
  for (const language of ['en', 'hi'] as const) {
    const t = inputs.topic;
    const ask = { board: t.board, classLevel: t.classLevel, subject: t.subject, openSubjects: [t.subject], classSubjects: [t.subject], chapter: t.chapter, topic: t.topic, question: null, language, style: language, followUp: null, misconception: null };
    const request = { system: explain.system(ask), user: explain.user(ask), fullLength: true };
    await textChain('content.prepare', `prepare:${language}:user`, { ...request, instructionsAs: 'user' }, blocksNote);
    await textChain('content.prepare', `prepare:${language}:system`, { ...request, instructionsAs: 'system' }, blocksNote);
  }
  // Workers AI: the same question over each of its four transports, to see which keeps the JSON whole (C321).
  {
    const c = await checkProfile(db, ctx, 'family.resolver', 'text', env);
    const ready = c.ok ? (await usableLinks(db, c.chain, c.providers, env, (p) => adapterFor(p, env))).filter((r) => r.link.provider === 'workers-ai') : [];
    if (ready[0]) {
      const { link, apiKey } = ready[0];
      steps.push(async () => {
        const probes = await probeWorkersTransports(apiKey, link.model, jsonAsk.system, jsonAsk.user);
        for (const p of probes) usage.push({ profile: 'family.resolver', link, counts: p.ok ? { requests: 1 } : { requests: 1, failures: 1 } });
        return probes.map((p) => ({ check: `transport:${p.transport}`, profile: 'family.resolver' as ProfileId, ok: p.ok, provider: link.provider, model: link.model, ...(p.ok ? { note: jsonNote(p.start ?? ''), start: p.start, ...(p.raw ? { raw: p.raw } : {}) } : { status: p.status }) }));
      });
    }
  }
  await textChain(
    'family.homework',
    'photo',
    { system: 'Read the question in the photo. Answer with one JSON object only: {"question":"<the question as printed>"}.', user: 'The photo.', images: [{ mediaType: 'image/jpeg', base64: inputs.photoJpegBase64 }] },
    (text) => (/magnet/i.test(text) ? 'read the printed question' : 'answered, but not with the printed question')
  );

  const voice = await checkProfile(db, ctx, 'family.voice_input', 'speech_to_text', env);
  if (!voice.ok) steps.push(refused('voice', 'family.voice_input', voice.reason));
  else {
    const ready = await usableLinks(db, voice.chain, voice.providers, env, (p) => speechAdapterFor(p, env));
    if (!ready.length) steps.push(refused('voice', 'family.voice_input', 'not_switched_on'));
    else {
      const { link, adapter, apiKey } = ready[0];
      for (const s of inputs.speech) {
        steps.push(async () => {
          const began = Date.now();
          let r: SpeechResult;
          try {
            r = await adapter.transcribe({ apiKey, model: link.model, audio: Buffer.from(s.base64, 'base64'), mediaType: s.mediaType, language: 'en' });
          } catch {
            r = { ok: false, failure: 'network' };
          }
          usage.push({ profile: 'family.voice_input', link, counts: r.ok ? { requests: 1 } : { requests: 1, failures: 1 } });
          const check = `voice:${s.mediaType.slice(6)}`;
          return [{ check, profile: 'family.voice_input', ok: r.ok, provider: link.provider, model: link.model, ms: Date.now() - began, ...(r.ok ? { note: /magnet/i.test(r.text) ? 'heard the question' : 'heard something else' } : { failure: r.failure, status: r.status }) }];
        });
      }
    }
  }

  const guard = await checkProfile(db, ctx, 'family.moderation', 'moderation', env);
  if (!guard.ok) steps.push(refused('safety', 'family.moderation', guard.reason));
  else {
    const ready = await usableLinks(db, guard.chain, guard.providers, env, (p) => moderationAdapterFor(p, env));
    if (!ready.length) steps.push(refused('safety', 'family.moderation', 'not_switched_on'));
    else {
      const { link, adapter, apiKey } = ready[0];
      steps.push(async () => {
        const began = Date.now();
        let r: ModerationResult;
        try {
          r = await adapter.moderate({ apiKey, model: link.model, user: SMOKE_QUESTION, assistant: 'Iron, nickel and cobalt.' });
        } catch {
          r = { ok: false, failure: 'network' };
        }
        usage.push({ profile: 'family.moderation', link, counts: r.ok ? { requests: 1, tokensIn: r.tokensIn, tokensOut: r.tokensOut } : { requests: 1, failures: 1 } });
        return [{ check: 'safety', profile: 'family.moderation', ok: r.ok, provider: link.provider, model: link.model, ms: Date.now() - began, ...(r.ok ? { note: `${r.safe ? 'safe' : 'unsafe'}; answered as ${r.form ?? 'unknown'}` } : { failure: r.failure, status: r.status }) }];
      });
    }
  }

  return {
    send: async () => (await Promise.all(steps.map((s) => s()))).flat(),
    record: async (tx) => {
      for (const u of usage.splice(0)) await count(tx, ctx.day, u.profile, u.link, u.counts);
    },
  };
}
// `fullLength`: the profile's own output limit instead of the smoke test's short one.
type AdapterRequestPart = { system: string; user: string; images?: ChatImage[]; instructionsAs?: 'system' | 'user'; fullLength?: boolean };

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
