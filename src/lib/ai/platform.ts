import { withPlatformService } from '@/lib/auth/db';
import type { Sql } from '@/lib/jobs/types';
import type { MessageKey } from '@/lib/i18n';
import { adapterFor, moderationAdapterFor, realtimeAdapterFor, speechAdapterFor, voiceAdapterFor, type AdapterResult, type Capability as AdapterCapability, type ChatImage, type ChatMessage, type ModerationAdapter, type ModerationResult, type RealtimeAdapter, type RealtimeToken, type SpeechAdapter, type SpeechMediaType, type SpeechResult, type TextAdapter, type VoiceAdapter, type VoiceMediaType, type VoiceResult } from './adapters';
import { probeWorkersTransports } from './adapters/workers-ai';
import { resolverPrompt } from './prompts/family.resolver';
import { searchVideoIds, videoDetails, type VideoCandidate, type VideoKind } from './adapters/youtube';
import { watchYoutubeVideo, type VideoScores } from './adapters/gemini-video';
import { VIDEO_REVIEW_MIN, videoReviewHides } from './video-review-rule';
import { aiEncryptionKey, unsealAiKey, type SealedRow } from './credentials';
import { UNCAPPED_LEFT, countDailyRequest, countVoiceChars, dailyLimit, dailyRequestsUsed, giveVoiceCharsBack, takeDailyRequest, takeVoiceChars, testingModeOn, voiceCharLimit, voiceCharsLeft } from './daily-cap';
import { takeTextTurn, tutorLimits } from '@/lib/family/tutor-meter';
import { scrubRequest } from './preprocess';
import { admit, type Admission } from './gateway/circuit';
import { recordAttempts, type Attempt, type LedgerSource } from './gateway/ledger';
import { TRY_JSON_ASK, TRY_PHOTO_ASK, TRY_SAFETY_PAIR, TRY_SPOKEN, TRY_INPUTS } from './try-inputs';
import { classifyFailure, ranItsTime } from './gateway/taxonomy';
import { CALL_TIMEOUT_MS, SPEECH_TIMEOUT_MS, MODERATION_TIMEOUT_MS, VOICE_TEXT_MAX, VOICE_TIMEOUT_MS } from './adapters/types';

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
//   6. the chain (the route: Primary, Backup 1, Backup 2) is tried in order until one answers. A provider whose circuit
//      is open is skipped (src/lib/ai/gateway/circuit.ts). A retryable failure before any text is streamed hands over
//      to the next; a refusal, a wrong key or request, or any failure once text has streamed ends it there
//      (src/lib/ai/gateway/taxonomy.ts) → 'failed' when none answers;
//   7. the call is metered with counts and tokens only (control.count_ai_usage), and each attempt is one ledger row
//      (control.ai_usage_ledger, src/lib/ai/gateway/ledger.ts) that also moves the provider's circuit. No prompt or
//      answer is stored or logged.
//
// Testing mode (W8-AI, Control's 'ai.testing_mode', src/lib/ai/daily-cap.ts): while it is on, step 2 reads every
// provider as cleared, step 4 counts without refusing, the safety pre-check (family.moderation) is skipped, and a text
// call gets the profile's max_output_tokens as saved. Off, every step is exactly as above.
//
// `db` is the caller's family_app client, inside withFamilyContext. The answer is data, never code: callers parse it
// against their schema and drop anything outside it. The key opened in 3 lives only inside the prepared call (a closure,
// never a field), and a prepared call sends once: one daily-cap place, one vendor request.

export type ProfileId =
  | 'family.resolver'
  | 'family.homework'
  | 'family.voice_input'
  | 'family.moderation'
  | 'family.plan'
  | 'family.syllabus_extract'
  | 'family.english_conversation'
  | 'family.summary'
  | 'family.text_to_speech'
  | 'family.quiz'
  | 'family.parent_report'
  | 'family.qc'
  | 'family.word_help'
  | 'family.voice_call'
  | 'family.video_review'
  | 'copilot.draft'
  | 'parent_ai.home_help'
  | 'content.syllabus_extract'
  | 'content.prepare'
  | 'exams.read_pages'
  | 'exams.mark'
  | 'exams.write_questions'
  | 'students.register_ocr';
export type Capability = 'text' | 'speech_to_text' | 'moderation' | 'text_to_speech' | 'realtime';
// `audience`: a family profile counts against the family's daily cap; a school profile's limit is the school's own
// monthly one, which its caller checks (src/lib/copilot/copilot.ts; AI marking's pages, src/app/api/app/marking); a
// control profile runs only for Control's staff.
// `callMs`: a profile whose answer is long (many page pictures in, a long JSON out) gives its whole chain this long,
// shared by every provider tried (C349). Without it each provider gets the adapter's own limit.
// `needs`: what the chosen adapter must declare beyond its capability's own (G1, C369), for example `vision` for a
// profile that reads photos. Refused when saved in Control (control.ts) and at run time (checkProfile), never a no-op.
// `besideCall` (W9-B): a family profile that runs only beside another call which already took the family's daily place
// (the teaching plan before the answer); it takes none of its own.
// `firstTextMs` (W10, latency): a person is waiting, so a streaming provider that has sent no answer text this long
// after the call went out (thinking does not count) is given up as a timeout and the next provider is tried. It needs
// `callMs`, which then holds the whole chain.
export type AiProfile = { id: ProfileId; carriesChildWords: boolean; capability: Capability; audience: 'family' | 'school' | 'control'; callMs?: number; firstTextMs?: number; chainFrom?: ProfileId; needs?: readonly AdapterCapability[]; besideCall?: boolean };

// Code-defined: which profiles exist, whether a child's words may pass, and which capability each one uses. Control
// sets each one's provider, model, prompt version and on switch; never this list. M2 (C275): the homework helper reads a
// photo, voice input hears a child (speech_to_text, M2-7, C281: prepareTranscription below).
export const PROFILES: readonly AiProfile[] = [
  { id: 'family.resolver', carriesChildWords: true, capability: 'text', audience: 'family', callMs: 40_000, firstTextMs: 12_000 },
  { id: 'family.homework', carriesChildWords: true, capability: 'text', audience: 'family', callMs: 40_000, firstTextMs: 12_000, needs: ['vision'] },
  { id: 'family.voice_input', carriesChildWords: true, capability: 'speech_to_text', audience: 'family' },
  // W2 (C314): the safety check (Llama Guard) on a child's typed words and on every live answer before it is shown.
  // It takes no daily-cap place of its own: it runs only beside a call that already took one.
  { id: 'family.moderation', carriesChildWords: true, capability: 'moderation', audience: 'family' },
  // W9-B (docs/39 §3): the teaching plan, one short call before the answer that says how to teach a child's question
  // (its type, the depth, the blocks and visuals). It reads the child's question, so only a provider cleared for minors
  // may serve it; it takes no daily place of its own, as it runs only beside the answer's call. C516: held to 3.5 s (its
  // typical answer is 1.3 s, the slowest one in ten 2.7 s); past that the default plan stands, never a 10 s stall.
  { id: 'family.plan', carriesChildWords: true, capability: 'text', audience: 'family', callMs: 3_500, firstTextMs: 2_500, besideCall: true },
  // C230-AB: a parent's photos of a book's contents pages, read for the chapter and topic names of their child's own
  // syllabus (parent mode). A printed book's titles, never a child's words; the parent checks every line before use.
  { id: 'family.syllabus_extract', carriesChildWords: false, capability: 'text', audience: 'family', needs: ['vision'] },
  // E1 (C382): the live spoken-English tutor's short role-play replies, its rolling summary of older turns and its
  // end-of-session recap. Carries the child's corrected words (the transcript, never the recording). Speech to text
  // stays family.voice_input: the same capability, the same provider choice and the same voice budget.
  { id: 'family.english_conversation', carriesChildWords: true, capability: 'text', audience: 'family' },
  // W9-A (C406): the running summary of a tutor chat, rewritten every fifth child turn from the chat's own questions
  // and the tutor's explanations, so a follow-up is answered with the chat in view. Carries the child's words.
  { id: 'family.summary', carriesChildWords: true, capability: 'text', audience: 'family', callMs: 15_000, firstTextMs: 6_000 },
  // C386 (Wave 4 slice 2): the server voice. It reads the chapter reader's narration (NetCyberAI's own text) and the live
  // English partner's checked replies, which are made from a child's words, so it is a children's-words profile: only a
  // provider cleared for minors in Control may speak, as for every such profile. It speaks only text the server holds
  // (src/lib/family/voice-out.ts), never text a phone sends.
  { id: 'family.text_to_speech', carriesChildWords: true, capability: 'text_to_speech', audience: 'family' },
  // W16-A1 (the Tutor's agent registry, src/lib/ai/agents/registry.ts). The quiz made from a session at its end (a job,
  // W16-B1) reads the session's questions and answers. The weekly parent report (a job, W16-B3) is written from counts
  // and chapter names only, never a child's words. The quality check (W16-A5) reads the answer beside the child's
  // question, beside the answer's call. The voice call's profile is below (W16-A4).
  // chainFrom (2 Nov): with no service of its own, the quiz and the weekly report follow the tutor's chain (family.resolver),
  // so they work the moment the tutor does; each keeps its own switch, prompt and limits, and a service set here wins.
  { id: 'family.quiz', carriesChildWords: true, capability: 'text', audience: 'family', callMs: 45_000, firstTextMs: 10_000, chainFrom: 'family.resolver' },
  { id: 'family.parent_report', carriesChildWords: false, capability: 'text', audience: 'family', callMs: 30_000, chainFrom: 'family.resolver' },
  { id: 'family.qc', carriesChildWords: true, capability: 'text', audience: 'family', callMs: 10_000, firstTextMs: 6_000, besideCall: true },
  // W23-B (C494): the tap menu's meaning and translation of a tapped word or sentence in the child's language. A selection
  // can be the child's own words, so only a provider cleared for minors may serve it. It follows the tutor's chain until
  // Control gives it one. besideCall: it takes no place in the family's daily AI requests (the tutor's); the route counts
  // its own generous per-account allowance (family.ai_daily.word_helps) before it asks.
  { id: 'family.word_help', carriesChildWords: true, capability: 'text', audience: 'family', callMs: 12_000, firstTextMs: 6_000, chainFrom: 'family.resolver', besideCall: true },
  // W16-A4: the call's realtime leg, a live two-way voice the phone opens straight to the provider with a token the
  // server mints (src/app/api/family/voice/call/token). The child's voice goes to that provider, so only one cleared for
  // minors may serve it. No provider today: the call then uses the chain (listen, answer, speak) and says nothing of it.
  { id: 'family.voice_call', carriesChildWords: true, capability: 'realtime', audience: 'family' },
  // The video finder's judge (src/lib/family/video-review.ts): Gemini watches a public YouTube video once ever and scores
  // it for accuracy, clarity, class fit, clickbait and child safety. Sent the video's address only, never a child's words
  // or anything about a family. It runs in the background after a search, so no one waits for it; its own daily limit
  // is family.video_reviews_per_day. Only Gemini can watch a YouTube address, so another provider set here is not used.
  { id: 'family.video_review', carriesChildWords: false, capability: 'text', audience: 'control', callMs: 90_000 },
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
  { id: 'exams.read_pages', carriesChildWords: true, capability: 'text', audience: 'school', callMs: 90_000, needs: ['vision'] },
  { id: 'exams.mark', carriesChildWords: true, capability: 'text', audience: 'school', callMs: 200_000, needs: ['vision'] },
  // AQ-2 (C363): writes a question paper's questions for the chapters and topics, class level, subject, language, kinds,
  // marks and difficulty a plan names (src/lib/papers/scope.ts), with the paper's other questions to avoid; never a
  // child's name or words. It runs in the school's papers.make job (a long job), at most two rounds of this time.
  { id: 'exams.write_questions', carriesChildWords: false, capability: 'text', audience: 'school', callMs: 90_000 },
  // W21-M5 (docs/42 Medium): a photographed page of a school's paper admission register, read into the office's student
  // import as checked rows (src/lib/students/register-ocr.ts). It reads children's names, dates of birth and addresses,
  // so only a provider cleared for children may serve it. With no service of its own it runs on the marking page
  // reader's chain (a vision chain on the school side), and keeps its own switch, prompt and limits. The office reads
  // it while waiting, so its chain gets the reader's time. Nothing it returns is saved until the office imports it.
  { id: 'students.register_ocr', carriesChildWords: true, capability: 'text', audience: 'school', callMs: 90_000, chainFrom: 'exams.read_pages', needs: ['vision'] },
];

// The adapter a profile would use for a provider: the one of the profile's capability, or null when the code has none
// (a provider without a speech adapter cannot serve voice input). Control checks a choice against it; the platform
// skips a provider without one.
export function capableAdapter(profileId: string, providerId: string, env: Record<string, string | undefined> = process.env): TextAdapter | SpeechAdapter | ModerationAdapter | VoiceAdapter | RealtimeAdapter | null {
  const profile = profileById(profileId);
  if (!profile) return null;
  if (profile.capability === 'realtime') return realtimeAdapterFor(providerId);
  if (profile.capability === 'moderation') return moderationAdapterFor(providerId, env);
  if (profile.capability === 'text_to_speech') return voiceAdapterFor(providerId, env);
  return profile.capability === 'speech_to_text' ? speechAdapterFor(providerId, env) : adapterFor(providerId, env);
}

// Everything a profile needs its adapter to declare (G1, C369): its capability's own (text; stt for voice input; text
// for the safety check; tts for the server voice, C386) and the profile's `needs`.
const OWN_NEED: Record<Capability, AdapterCapability> = { text: 'text', speech_to_text: 'stt', moderation: 'text', text_to_speech: 'tts', realtime: 'realtime' };
export function profileNeeds(profile: AiProfile): AdapterCapability[] {
  return [OWN_NEED[profile.capability], ...(profile.needs ?? [])];
}

// What the chosen provider's adapter lacks of what the profile needs: [] when it has everything, or when the code has
// no adapter of the profile's capability for it (that is a different refusal: the provider cannot be chosen at all).
export function missingCapabilities(profileId: string, providerId: string, env: Record<string, string | undefined> = process.env): AdapterCapability[] {
  const profile = profileById(profileId);
  const adapter = profile ? capableAdapter(profile.id, providerId, env) : null;
  if (!profile || !adapter) return [];
  return profileNeeds(profile).filter((c) => !adapter.capabilities[c]);
}

export type AiContext = {
  accountId: string;
  childFirstNames: string[];
  parentEmail?: string;
  day: string; // the India date, YYYY-MM-DD
  // W16-B4: the child a family text turn is for. With it, the tutor's answers (family.resolver) are metered and capped
  // per child (text turns, src/lib/family/tutor-meter.ts); without it the family's daily requests cap holds as before.
  childId?: string;
};
export type AiRequest = {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  responseFormat?: 'json';
  // W14-C: the sampling temperature, for a task that must answer the same way each time (exams.mark asks for 0). Passed
  // to the adapters that take it; left out, each vendor's own default (or the adapter's) holds.
  temperature?: number;
};
// 'not_capable' (G1, C369): a provider in the chain lacks something the profile needs (Control refuses saving that;
// this holds if the code's declarations change after it was saved).
export type AiRefusal = 'not_switched_on' | 'cap_reached' | 'not_cleared_for_minors' | 'not_capable' | 'failed';
export type AiResult = { ok: true; text: string; tokensIn: number; tokensOut: number; provider: string; model: string; finish?: string } | { ok: false; reason: AiRefusal };
export type { ChatMessage, ChatImage };

// The family-facing words for each refusal (English and Hindi in the message files).
export const REFUSAL_MESSAGE: Record<AiRefusal, MessageKey> = {
  not_switched_on: 'ai.not_switched_on',
  cap_reached: 'ai.cap_reached',
  not_cleared_for_minors: 'ai.not_cleared_for_minors',
  not_capable: 'ai.not_capable',
  failed: 'ai.failed',
};

type ProfileRow = { provider_id: string | null; model: string | null; fallback: unknown; prompt_version: string; max_output_tokens: number; enabled: boolean; carries_child_words: boolean; revision_id: string | number | null };
type ProviderRow = { provider_id: string; cleared_for_minors: boolean; enabled: boolean; base_url: string | null };
type Link = { provider: string; model: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function profileById(id: string): AiProfile | null {
  return PROFILES.find((p) => p.id === id) ?? null;
}

async function profileRow(db: Sql, id: ProfileId): Promise<ProfileRow | null> {
  const { rows } = await db.query(
    `select provider_id, model, fallback, prompt_version, max_output_tokens, enabled, carries_child_words, revision_id from control.ai_profiles where profile_id = $1`,
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

// `position`: the link's place in the route (0 Primary, 1 Backup 1, 2 Backup 2), for the ledger. `baseUrl`: the address
// the founder set for the provider, for the adapter whose address is his (G1); else absent.
type Ready<A> = { link: Link; adapter: A; apiKey: string; position: number; baseUrl?: string };

// Opens each provider's key inside this call only. A provider without an adapter (of the capability `find` looks up),
// a key, or a key that opens is left out of the chain.
async function usableLinks<A extends { needsKey: boolean }>(db: Sql, chain: Link[], providers: Map<string, ProviderRow>, env: Record<string, string | undefined>, find: (providerId: string) => A | null): Promise<Ready<A>[]> {
  const ready: Ready<A>[] = [];
  const k = aiEncryptionKey(env);
  for (const [position, link] of chain.entries()) {
    const adapter = find(link.provider);
    const provider = providers.get(link.provider);
    if (!adapter || !provider?.enabled) continue;
    const at = provider.base_url ? { baseUrl: provider.base_url } : {};
    if (!adapter.needsKey) {
      ready.push({ link, adapter, apiKey: '', position, ...at });
      continue;
    }
    if (!k) continue;
    const { rows } = await db.query(`select ciphertext, iv, tag, key_version from control.ai_sealed_credential($1)`, [link.provider]);
    if (!rows[0]) continue;
    try {
      ready.push({ link, adapter, apiKey: unsealAiKey(k, link.provider, rows[0] as SealedRow), position, ...at });
    } catch {
      // Sealed with another key version, or the row was changed: this provider cannot be used until its key is set again.
    }
  }
  return ready;
}

// The circuits, in the caller's prepare transaction: a provider whose circuit is open is left out, as a skipped
// attempt for the ledger; one past its cool-down goes as the half-open trial.
type Gated<A> = { admitted: (Ready<A> & { gate: Admission })[]; skipped: Attempt[] };
async function gateLinks<A>(db: Sql, ready: Ready<A>[]): Promise<Gated<A>> {
  const admitted: (Ready<A> & { gate: Admission })[] = [];
  const skipped: Attempt[] = [];
  for (const r of ready) {
    const gate = await admit(db, r.link.provider, r.link.model);
    if (gate === 'open') skipped.push(skippedAttempt(r, 'skipped_open_circuit'));
    else admitted.push({ ...r, gate });
  }
  return { admitted, skipped };
}
function skippedAttempt(r: { link: Link; position: number }, outcome: 'skipped_open_circuit' | 'skipped_deadline'): Attempt {
  return { provider: r.link.provider, model: r.link.model, position: r.position, outcome, circuit: 'none', latencyMs: null, tokensIn: 0, tokensOut: 0, streamed: false };
}
// The ledger's ids for a call: the day, the profile and the route revision it ran on.
type LedgerOf = { day: string; profileId: string; revisionId: string | null };
const ledgerOf = (ctx: AiContext, profile: AiProfile, row: ProfileRow): LedgerOf => ({ day: ctx.day, profileId: profile.id, revisionId: row.revision_id === null || row.revision_id === undefined ? null : String(row.revision_id) });
// The vendor's HTTP status of a failed attempt, kept beside the attempt and not in it: the ledger stores no vendor status,
// but Try it shows it, so that a 400 (a request shape we got wrong) is told apart from 401/403 (the key) and 429 (the quota).
const vendorStatus = new WeakMap<Attempt, number>();
// One attempt that came back: an answer, or a failure in its class.
function attemptOf(r: { link: Link; position: number }, result: { ok: true; tokensIn: number; tokensOut: number } | { ok: false; failure: string; status?: number }, at: { streamed: boolean; elapsedMs: number; limitMs: number }): { attempt: Attempt; retryable: boolean } {
  const base = { provider: r.link.provider, model: r.link.model, position: r.position, latencyMs: at.elapsedMs, streamed: at.streamed };
  if (result.ok) return { attempt: { ...base, outcome: 'ok', circuit: 'success', tokensIn: result.tokensIn, tokensOut: result.tokensOut }, retryable: false };
  const c = classifyFailure(result, { streamed: at.streamed, timedOut: ranItsTime(at.elapsedMs, at.limitMs) });
  const attempt: Attempt = { ...base, outcome: c.outcome, circuit: c.circuit, tokensIn: 0, tokensOut: 0 };
  if (typeof result.status === 'number') vendorStatus.set(attempt, result.status);
  return { attempt, retryable: c.retryable };
}

// Usage to add to Control's counts once the call is over (counts and tokens only).
type Counts = { requests?: number; failures?: number; capRefusals?: number; tokensIn?: number; tokensOut?: number };

// A call that passed every check, ready to go to the vendor. send() needs no database.
// `request` (W9-B): the request to send instead of the one prepared, built after an earlier call answered (the resolver's
// prompt is written from the teaching plan). It is cleaned the same way; one with photos goes only where the prepared
// one had photos (the providers were chosen for them).
export type PreparedText = { send: (onDelta?: (text: string) => void, request?: AiRequest) => Promise<SentText> };
// A call that went out: its result, and the metering to write in the caller's next transaction. Each record() adds
// the counts again, so a caller records once, or again only when its transaction was refused before anything ran.
export type SentText = { result: AiResult; record: (db: Sql) => Promise<void> };
export type Prepared = { ok: true; text: PreparedText } | { ok: false; reason: AiRefusal };

type Checked = { ok: true; profile: AiProfile; row: ProfileRow; chain: Link[]; providers: Map<string, ProviderRow> } | { ok: false; reason: AiRefusal };

// 1 and 2, for either capability: the profile switched on, and the minors check on the whole chain, against the
// adapter of the profile's own capability.
async function checkProfile(db: Sql, ctx: AiContext, profileId: ProfileId, capability: Capability, env: Record<string, string | undefined>, testing = false): Promise<Checked> {
  const profile = profileById(profileId);
  if (!profile || profile.capability !== capability || !UUID.test(ctx.accountId) || !DAY.test(ctx.day)) return { ok: false, reason: 'failed' };

  // 1. Switched on?
  const row = await profileRow(db, profile.id);
  let chain = row ? chainOf(row) : null;
  // No service of its own: a profile that follows another's chain (chainFrom) runs on that one's providers and models.
  if (row && !chain && profile.chainFrom) {
    const from = await profileRow(db, profile.chainFrom);
    chain = from ? chainOf(from) : null;
  }
  if (!row || !row.enabled || !chain) return { ok: false, reason: 'not_switched_on' };
  const gated = await gateChain(db, profile, row, chain, capability, env, testing);
  return gated.ok ? { ok: true, profile, row, chain, providers: gated.providers } : gated;
}

// 2 and the capability check, on one chain (the profile's own, or its paid one, C504): the same gate for both.
async function gateChain(db: Sql, profile: AiProfile, row: ProfileRow, chain: Link[], capability: Capability, env: Record<string, string | undefined>, testing: boolean): Promise<{ ok: true; providers: Map<string, ProviderRow> } | { ok: false; reason: AiRefusal }> {
  // 2. The minors check, on the whole chain, before anything else is looked at.
  const { rows: providerRows } = await db.query(`select provider_id, cleared_for_minors, enabled, base_url from control.ai_providers where provider_id = any($1::text[])`, [chain.map((l) => l.provider)]);
  const providers = new Map((providerRows as ProviderRow[]).map((p) => [p.provider_id, p]));
  if (profile.carriesChildWords || row.carries_child_words) {
    // Every provider in the chain must be cleared in Control (C368: the founder's switch is the one gate). A text
    // provider needs its adapter (as before); a provider with no speech adapter is not refused for that alone: it is
    // skipped at step 3.
    // Testing mode reads every provider as cleared; the founder's switch in Control keeps its own value for later.
    const cleared = chain.every((l) => (testing || providers.get(l.provider)?.cleared_for_minors === true) && (capability !== 'text' || capableAdapter(profile.id, l.provider, env) !== null));
    if (!cleared) return { ok: false, reason: 'not_cleared_for_minors' };
  }
  // The capability check (G1, C369), on the whole chain: a provider whose adapter lacks what the profile needs is a
  // refusal with its own reason, never a call sent to fail or a provider quietly skipped.
  if (chain.some((l) => missingCapabilities(profile.id, l.provider, env).length > 0)) return { ok: false, reason: 'not_capable' };
  return { ok: true, providers };
}

// The paid route (C504): a paying customer's text call runs on the profile's paid chain when the database grants it
// (control.ai_paid_take: a paying caller, an enabled paid route, every link priced, and the chain's worst-case cost
// held within this India month's limit). It must then pass the same minors and capability gate as the normal chain.
// Anything short of that is the normal chain, silently: never a refusal. A profile that follows another's chain
// (chainFrom) follows that one's paid chain too.
type PaidHold = { holdId: string; chain: Link[]; providers: Map<string, ProviderRow> };
// The token bound a hold is priced at: at least PAID_HOLD_MIN_TOKENS_IN in (a later request can carry a longer
// prompt), three per character of the request, and each photo; out, the profile's own limit.
export const PAID_HOLD_MIN_TOKENS_IN = 32_000;
const PAID_HOLD_PHOTO_TOKENS = 3_000;
export function paidTokensIn(request: AiRequest): number {
  const chars = request.system.length + request.messages.reduce((n, m) => n + m.content.length, 0);
  const photos = request.messages.reduce((n, m) => n + (m.images?.length ?? 0), 0);
  return Math.max(PAID_HOLD_MIN_TOKENS_IN, 3 * chars) + photos * PAID_HOLD_PHOTO_TOKENS;
}
async function takePaid(db: Sql, profile: AiProfile, row: ProfileRow, capability: Capability, env: Record<string, string | undefined>, testing: boolean, tokens: { in: number; out: number }): Promise<PaidHold | null> {
  const routeOf = !chainOf(row) && profile.chainFrom ? profile.chainFrom : profile.id;
  const { rows } = await db.query(`select hold_id, provider_id, model, fallback from control.ai_paid_take($1::text, $2::bigint, $3::bigint)`, [routeOf, Math.ceil(tokens.in), Math.ceil(tokens.out)]);
  const r = rows[0] as { hold_id: string; provider_id: string; model: string; fallback: unknown } | undefined;
  if (!r) return null;
  const chain = chainOf(r);
  const gated = chain ? await gateChain(db, profile, row, chain, capability, env, testing) : null;
  if (!chain || !gated?.ok) {
    await releasePaid(db, r.hold_id);
    return null;
  }
  return { holdId: r.hold_id, chain, providers: gated.providers };
}
async function releasePaid(db: Sql, holdId: string | null): Promise<void> {
  if (holdId) await db.query(`select control.ai_paid_release($1::uuid)`, [holdId]);
}

// Whether a profile could serve a call now, without taking a daily-cap place or sending anything (E1, C382): steps 1–3
// (switched on, the minors check on the whole chain, a provider with an adapter of the capability and a key that
// opens). For a screen that must say plainly what is not set up before a child speaks.
export async function profileReady(db: Sql, ctx: AiContext, profileId: ProfileId): Promise<'ready' | AiRefusal> {
  const env = process.env;
  const profile = profileById(profileId);
  if (!profile) return 'failed';
  const testing = await testingModeOn(db);
  // Testing mode skips the safety pre-check, so it never stands in a child's way.
  if (testing && profile.id === 'family.moderation') return 'ready';
  const checked = await checkProfile(db, ctx, profileId, profile.capability, env, testing);
  if (!checked.ok) return checked.reason;
  const find = (p: string) => capableAdapter(profile.id, p, env);
  const usable = await usableLinks(db, checked.chain, checked.providers, env, find);
  return usable.length > 0 ? 'ready' : 'not_switched_on';
}

// The family's daily requests left today (Control's cap less what the account has used); 0 when the setting is missing;
// uncapped while testing mode is on.
export async function dailyRequestsLeft(db: Sql, accountId: string, day: string): Promise<number> {
  if (await testingModeOn(db)) return UNCAPPED_LEFT;
  const limit = await dailyLimit(db);
  if (limit === null || !UUID.test(accountId) || !DAY.test(day)) return 0;
  return Math.max(0, limit - (await dailyRequestsUsed(db, accountId, day)));
}

// w16-b4 start
const isTutorTextTurn = (profile: AiProfile, ctx: AiContext): ctx is AiContext & { childId: string } => profile.id === 'family.resolver' && typeof ctx.childId === 'string' && UUID.test(ctx.childId);
// w16-b4 end

// 4. The family's daily cap, counted before the request leaves.
async function takeCap(db: Sql, ctx: AiContext, profile: AiProfile, first: Link, testing: boolean): Promise<boolean> {
  if (profile.audience !== 'family' || profile.besideCall) return true;
  // Testing mode: the request is counted, never refused.
  if (testing) {
    await countDailyRequest(db, ctx.accountId, ctx.day);
    if (isTutorTextTurn(profile, ctx)) await takeTextTurn(db, ctx.accountId, ctx.childId, ctx.day, null);
    return true;
  }
  // w16-b4 start
  // A tutor answer for a known child takes one of that child's text turns (the plan's cap, Plus times more) in place of a
  // place in the family's daily requests, which it still counts.
  if (isTutorTextTurn(profile, ctx)) {
    const limits = await tutorLimits(db, ctx.accountId);
    if (!(await takeTextTurn(db, ctx.accountId, ctx.childId, ctx.day, limits.textTurns))) {
      await count(db, ctx.day, profile.id, first, { capRefusals: 1 });
      return false;
    }
    await countDailyRequest(db, ctx.accountId, ctx.day);
    return true;
  }
  // w16-b4 end
  const limit = await dailyLimit(db);
  if (limit === null || !(await takeDailyRequest(db, ctx.accountId, ctx.day, limit))) {
    await count(db, ctx.day, profile.id, first, { capRefusals: 1 });
    return false;
  }
  return true;
}

// 4, for a line to speak: the family's voice allowance in characters (C388) instead of a request place.
async function takeVoiceCap(db: Sql, ctx: AiContext, profile: AiProfile, first: Link, chars: number, testing: boolean): Promise<boolean> {
  if (profile.audience !== 'family') return true;
  // Testing mode: the characters are counted, never refused.
  if (testing) return countVoiceChars(db, ctx.accountId, ctx.day, chars);
  const limit = await voiceCharLimit(db);
  if (limit === null || !(await takeVoiceChars(db, ctx.accountId, ctx.day, chars, limit))) {
    await count(db, ctx.day, profile.id, first, { capRefusals: 1 });
    return false;
  }
  return true;
}

// A provider is not tried on a profile's own time (callMs) with less than this left.
export const CHAIN_MIN_MS = 15_000;
const CHAIN_GRACE_MS = 1_500;
// W10: with a first-text deadline (firstTextMs), a provider reached by the one before it timing out is still tried with
// this much left (a person is waiting; even a short try beats the default answer).
const FIRST_TEXT_FLOOR_MS = 3_000;
// The time a paid window may be short of the floor before its link is skipped (C530).
const WINDOW_GRACE_MS = 500;

// A provider's share of the route's remaining time (`left`), with `behind` providers still after it. A streaming
// provider holds reserveMs for each one behind (their first-text wait, at most CHAIN_MIN_MS). C421: a provider that
// answers in one piece (Workers AI) is given its whole answer time: it holds one first-text wait for whoever is
// behind, not one share per backup, because the first backup that shows text then owns the rest of the route's time.
// On the resolver (40 s, first text 12 s, three slots) that is 28 s for Scout in front, not the 15 s that cut 1 in 10
// of its answers at upstream_timeout.
export function chainShareMs(a: { left: number; behind: number; reserveMs: number; firstTextMs: number | null; streams: boolean }): number {
  const hold = a.behind === 0 ? 0 : !a.streams && a.firstTextMs !== null ? a.firstTextMs : a.behind * a.reserveMs;
  return Math.min(a.left, Math.max(a.reserveMs, a.left - hold));
}

// C507: the time a paid chain may use before it shows text; the rest of the deadline is the normal chain's, should the
// paid chain end with nothing shown. With a first-text deadline the paid chain gets one first-text wait (as generous as a
// normal link's), shortened only to leave the normal chain NORMAL_AFTER_PAID_MS, and never under FIRST_TEXT_FLOOR_MS.
// Without one, it gets the deadline less one CHAIN_MIN_MS share, and at least CHAIN_MIN_MS. On the resolver (40 s, first
// text 12 s): 12 s for the paid chain, 28 s left for the normal chain.
export const NORMAL_AFTER_PAID_MS = 4_000;
export function paidWindowMs(a: { callMs: number; firstTextMs: number | null }): number {
  const want = a.firstTextMs === null ? Math.max(CHAIN_MIN_MS, a.callMs - CHAIN_MIN_MS) : Math.max(FIRST_TEXT_FLOOR_MS, Math.min(a.firstTextMs, a.callMs - NORMAL_AFTER_PAID_MS));
  return Math.max(0, Math.min(a.callMs, want));
}

// Who a call is for (W17-B1). LIVE: a child's or staff member's own request, every step as above. TRY_IT: Control's
// Try it, the same chain walked the same way on made-up inputs, but it takes no family's daily place (no family asked)
// and its ledger rows say 'try_it'. `watch` is handed each send's attempts as they are made, so Try it can say which
// place in the route answered and how the last one failed. Only this file builds a non-live run.
type Run = { source: LedgerSource; uncapped: boolean; watch?: (attempts: readonly Attempt[]) => void };
const LIVE: Run = { source: 'live', uncapped: false };

// 1–5: every check, the daily cap taken, the key opened and the request cleaned, in the caller's transaction.
export async function prepareText(db: Sql, ctx: AiContext, profileId: ProfileId, request: AiRequest): Promise<Prepared> {
  return textRun(db, ctx, profileId, request, LIVE);
}
async function textRun(db: Sql, ctx: AiContext, profileId: ProfileId, request: AiRequest, run: Run): Promise<Prepared> {
  const env = process.env;
  const testing = await testingModeOn(db);
  const checked = await checkProfile(db, ctx, profileId, 'text', env, testing);
  if (!checked.ok) return checked;
  const { profile, row } = checked;

  // 3. A provider that can answer (and, for a request with photos, that can see them).
  const withPhotos = request.messages.some((m) => (m.images?.length ?? 0) > 0);
  const usableOf = async (chain: Link[], providers: Map<string, ProviderRow>) => (await usableLinks(db, chain, providers, env, (p) => adapterFor(p, env))).filter((r) => !withPhotos || r.adapter.capabilities.vision);
  const ledger = ledgerOf(ctx, profile, row);
  // C504: a paying customer's live call tries the paid chain first; one with no usable or admitted provider gives its
  // hold back and the normal chain serves.
  let paid: PaidHold | null = run.source === 'live' ? await takePaid(db, profile, row, 'text', env, testing, { in: paidTokensIn(request), out: row.max_output_tokens }) : null;
  let gatedPaid: Gated<TextAdapter> | null = null;
  if (paid) {
    const usablePaid = await usableOf(paid.chain, paid.providers);
    gatedPaid = usablePaid.length > 0 ? await gateLinks(db, usablePaid) : null;
    if (!gatedPaid || gatedPaid.admitted.length === 0) {
      await releasePaid(db, paid.holdId);
      paid = null;
      gatedPaid = null;
    }
  }
  let ready: Gated<TextAdapter>['admitted'];
  let skipped: Attempt[];
  // C507: behind a paid chain, the profile's normal chain, gated here (same minors, capability and circuit checks) for
  // a paid call that ends before any text.
  let normal: Gated<TextAdapter> | null = null;
  if (gatedPaid) {
    ({ admitted: ready, skipped } = gatedPaid);
    const usable = await usableOf(checked.chain, checked.providers);
    normal = usable.length > 0 ? await gateLinks(db, usable) : null;
  } else {
    const usable = await usableOf(checked.chain, checked.providers);
    if (usable.length === 0) return { ok: false, reason: 'not_switched_on' };
    // Every provider of the route has its circuit open: nothing is sent and no cap place is taken.
    ({ admitted: ready, skipped } = await gateLinks(db, usable));
    if (ready.length === 0) {
      await recordAttempts(db, ledger, skipped, run.source);
      return { ok: false, reason: 'failed' };
    }
  }
  const holdId = paid?.holdId ?? null;

  // 4. The family's daily cap (a school or Control profile's limit is checked by its caller).
  if (!run.uncapped && !(await takeCap(db, ctx, profile, ready[0].link, testing))) {
    await releasePaid(db, holdId);
    return { ok: false, reason: 'cap_reached' };
  }

  // 5. Nothing that names a child leaves the server (a request given at send time is cleaned there, the same way).
  const cleanOf = (r: AiRequest) => scrubRequest(r, { childFirstNames: ctx.childFirstNames, parentEmail: ctx.parentEmail });
  // Testing mode honours the profile's limit as saved in Control, whatever smaller limit the caller asked for.
  const limitOf = (r: AiRequest) => (testing ? row.max_output_tokens : Math.min(Math.max(1, Math.floor(r.maxTokens ?? row.max_output_tokens)), row.max_output_tokens));
  const prepared = cleanOf(request);

  let sent = false;
  const send = async (onDelta: (text: string) => void = () => {}, late?: AiRequest): Promise<SentText> => {
    const usage: { link: Link; counts: Counts }[] = [];
    const attempts: Attempt[] = [];
    run.watch?.(attempts);
    // C507: the attempts on the paid chain come first; those from normalFrom on ran on the normal chain (paid = false).
    let normalFrom = holdId === null ? 0 : -1;
    const record = async (tx: Sql) => {
      for (const u of usage) await count(tx, ctx.day, profile.id, u.link, u.counts);
      const split = normalFrom < 0 ? attempts.length : normalFrom;
      await recordAttempts(tx, ledger, attempts.slice(0, split), run.source, true);
      await recordAttempts(tx, ledger, attempts.slice(split), run.source, false);
      // The hold goes in the same transaction as the ledger rows that replace it (C504).
      await releasePaid(tx, holdId);
    };
    // One cap place, one request: a prepared call never goes out twice.
    if (sent) return { result: { ok: false, reason: 'failed' }, record };
    // A late request with photos, for providers chosen without them, is refused before anything is sent.
    if (late && !withPhotos && late.messages.some((m) => (m.images?.length ?? 0) > 0)) return { result: { ok: false, reason: 'failed' }, record };
    sent = true;
    const clean = late ? cleanOf(late) : prepared;
    const maxTokens = limitOf(late ?? request);
    const responseFormat = (late ?? request).responseFormat;
    const temperature = (late ?? request).temperature;
    attempts.push(...skipped);
    // A profile with its own time (callMs) is the route's deadline, shared across the chain: each provider gets what is
    // left less CHAIN_MIN_MS for each provider still behind it, so a Primary that times out leaves its backups their
    // turn inside the deadline; none is tried once less than CHAIN_MIN_MS is left.
    const deadline = profile.callMs ? Date.now() + profile.callMs : null;
    // W10: a profile with a first-text deadline holds for each provider behind what the profile has beyond one
    // first-text wait (at most CHAIN_MIN_MS), so a Primary that says nothing in time leaves its backup that much.
    const firstTextMs = profile.callMs && profile.firstTextMs ? profile.firstTextMs : null;
    const reserveMs = firstTextMs === null ? CHAIN_MIN_MS : Math.min(CHAIN_MIN_MS, Math.max(FIRST_TEXT_FLOOR_MS, (profile.callMs ?? 0) - firstTextMs));
    // A backup is tried when it still has CHAIN_MIN_MS less a grace: a Primary that used exactly its share leaves its backup a few
    // milliseconds under CHAIN_MIN_MS, which used to skip it (skipped_deadline) on every profile whose time is under two shares.
    const floorMs = firstTextMs === null ? CHAIN_MIN_MS - CHAIN_GRACE_MS : FIRST_TEXT_FLOOR_MS;
    // C507: a paid chain may use only its window (paidWindowMs) before it shows text, so the normal chain behind it
    // keeps a real share of the deadline; once paid text flows it may use what is left, as any link may.
    const paidWindowEnd = holdId !== null && deadline !== null && profile.callMs ? Date.now() + paidWindowMs({ callMs: profile.callMs, firstTextMs }) : null;
    type Walked = { answer: SentText['result'] } | { next: boolean };
    // 6. Down one chain until one answers, or a failure that may not go on to the next. `next`: the chain ended with no
    // text shown and no vendor refusal, so a chain behind it may still answer.
    const walk = async (chain: Gated<TextAdapter>['admitted'], end: number | null): Promise<Walked> => {
      let next = true;
      for (const [i, r] of chain.entries()) {
        const { link, adapter, apiKey, baseUrl } = r;
        const left = deadline === null ? null : deadline - Date.now();
        const windowLeft = left === null || end === null ? left : Math.min(left, end - Date.now());
        // A paid window can be exactly the floor (FIRST_TEXT_FLOOR_MS), so the milliseconds spent before its first link
        // would skip that link every time; the window alone is held to the floor less WINDOW_GRACE_MS.
        const windowShort = end !== null && end - Date.now() < floorMs - WINDOW_GRACE_MS;
        if (left !== null && (left < floorMs || windowShort)) {
          attempts.push(...chain.slice(i).map((x) => skippedAttempt(x, 'skipped_deadline')));
          break;
        }
        const limitMs = windowLeft === null ? null : chainShareMs({ left: windowLeft, behind: chain.length - 1 - i, reserveMs, firstTextMs, streams: adapter.capabilities.stream });
        // W10: a streaming provider must send answer text within its first-text time (never more than its share above);
        // once text flows no backup may take over, so it may then use what is left of the route's time. A provider that
        // answers in one piece (Workers AI) has no first text before its whole answer and keeps its share as its limit.
        const watchMs = firstTextMs !== null && left !== null && limitMs !== null && adapter.capabilities.stream ? Math.min(firstTextMs, limitMs) : null;
        const sendMs = watchMs !== null ? left : limitMs;
        let streamed = false;
        let gaveUp = false;
        let result: AdapterResult | { ok: false; failure: 'timeout' };
        const began = Date.now();
        const abort = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const timeout = sendMs === null ? {} : { timeoutMs: sendMs };
          const call = adapter.streamText({ apiKey, model: link.model, system: clean.system, messages: clean.messages, maxTokens, responseFormat, ...(typeof temperature === 'number' && Number.isFinite(temperature) ? { temperature } : {}), ...timeout, ...(baseUrl ? { baseUrl } : {}), ...(watchMs !== null ? { signal: abort.signal } : {}) }, (piece) => {
            // Words from an attempt already given up never reach the caller (an adapter that ignores the abort).
            if (gaveUp) return;
            // W10: only words count as text shown (and as the first text); blank pieces a model sends first do not.
            if (watchMs === null || piece.trim()) streamed = true;
            onDelta(piece);
          });
          // No answer text by the first-text time (thinking is not text): the attempt is aborted and counted a timeout.
          const firstText = watchMs === null ? null : new Promise<{ ok: false; failure: 'timeout' }>((resolve) => {
            timer = setTimeout(() => {
              if (streamed) return;
              gaveUp = true;
              abort.abort();
              resolve({ ok: false, failure: 'timeout' });
            }, watchMs);
          });
          result = firstText ? await Promise.race([call, firstText]) : await call;
        } catch {
          // An adapter never throws by design; if one did (or the caller's onDelta did), the call is still counted.
          result = { ok: false, failure: 'network' };
        } finally {
          clearTimeout(timer);
        }
        const tried = attemptOf(r, result, { streamed, elapsedMs: Date.now() - began, limitMs: sendMs ?? CALL_TIMEOUT_MS });
        attempts.push(tried.attempt);
        if (result.ok) {
          usage.push({ link, counts: { requests: 1, tokensIn: result.tokensIn, tokensOut: result.tokensOut } });
          return { answer: { ok: true, text: result.text, tokensIn: result.tokensIn, tokensOut: result.tokensOut, provider: link.provider, model: link.model, ...(result.finish ? { finish: result.finish } : {}) } };
        }
        usage.push({ link, counts: { requests: 1, failures: 1 } });
        // A refusal, a wrong key or request, or text already shown (a second provider's answer would be stitched onto
        // it): the answer ends here.
        if (!tried.retryable) {
          next = !streamed && tried.attempt.outcome !== 'content_rejected';
          break;
        }
      }
      return { next };
    };
    const first = await walk(ready, paidWindowEnd);
    if ('answer' in first) return { result: first.answer, record };
    // C507: a paid chain that showed no text (every link failed, timed out or was out of time) hands the call to the
    // profile's normal chain, inside the same deadline. A vendor's refusal or text already shown ends it, as above.
    if (holdId !== null && normal && first.next) {
      normalFrom = attempts.length;
      attempts.push(...normal.skipped);
      const second = await walk(normal.admitted, null);
      if ('answer' in second) return { result: second.answer, record };
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
  return transcriptionRun(db, ctx, profileId, input, LIVE);
}
async function transcriptionRun(db: Sql, ctx: AiContext, profileId: ProfileId, input: SpeechInput, run: Run): Promise<PreparedTranscription> {
  const env = process.env;
  const testing = await testingModeOn(db);
  const checked = await checkProfile(db, ctx, profileId, 'speech_to_text', env, testing);
  if (!checked.ok) return checked;
  const { profile, row, chain, providers } = checked;

  // 3. A provider that can hear: one without a speech adapter is skipped, and so is one whose circuit is open.
  const usable = await usableLinks(db, chain, providers, env, (p) => speechAdapterFor(p, env));
  if (usable.length === 0) return { ok: false, reason: 'not_switched_on' };
  const ledger = ledgerOf(ctx, profile, row);
  const { admitted: ready, skipped } = await gateLinks(db, usable);
  if (ready.length === 0) {
    await recordAttempts(db, ledger, skipped, run.source);
    return { ok: false, reason: 'failed' };
  }

  // 4. The family's daily cap.
  if (!run.uncapped && !(await takeCap(db, ctx, profile, ready[0].link, testing))) return { ok: false, reason: 'cap_reached' };

  let sent = false;
  const send = async (): Promise<SentTranscript> => {
    const usage: { link: Link; counts: Counts }[] = [];
    const attempts: Attempt[] = [];
    run.watch?.(attempts);
    const record = async (tx: Sql) => {
      for (const u of usage) await count(tx, ctx.day, profile.id, u.link, u.counts);
      await recordAttempts(tx, ledger, attempts, run.source);
    };
    if (sent) return { result: { ok: false, reason: 'failed' }, record };
    sent = true;
    attempts.push(...skipped);
    // 6. Down the chain until one hears it, within the route's minute: no next provider once 30 seconds have gone.
    const began = Date.now();
    for (const [i, r] of ready.entries()) {
      const { link, adapter, apiKey } = r;
      if (Date.now() - began > SPEECH_CHAIN_BUDGET_MS) {
        attempts.push(...ready.slice(i).map((x) => skippedAttempt(x, 'skipped_deadline')));
        break;
      }
      let result: SpeechResult;
      const start = Date.now();
      try {
        result = await adapter.transcribe({ apiKey, model: link.model, audio: input.audio, mediaType: input.mediaType, language: input.language });
      } catch {
        result = { ok: false, failure: 'network' };
      }
      const tried = attemptOf(r, result, { streamed: false, elapsedMs: Date.now() - start, limitMs: SPEECH_TIMEOUT_MS });
      attempts.push(tried.attempt);
      if (result.ok) {
        usage.push({ link, counts: { requests: 1, tokensIn: result.tokensIn, tokensOut: result.tokensOut } });
        return { result: { ok: true, text: result.text, provider: link.provider, model: link.model }, record };
      }
      usage.push({ link, counts: { requests: 1, failures: 1 } });
      if (!tried.retryable) break;
    }
    return { result: { ok: false, reason: 'failed' }, record };
  };
  return { ok: true, speech: { send } };
}

// ---- text to speech (C386: a server voice) ----------------------------------------------------------------------------

// The route's whole budget for one line: a second provider is not tried once this much has gone.
const VOICE_CHAIN_BUDGET_MS = 20_000;
export { VOICE_TEXT_MAX, voiceCharsLeft };

export type SpeakInput = { text: string; language: 'en' | 'hi' };
export type VoiceAudio = { ok: true; audio: Uint8Array; mediaType: VoiceMediaType; provider: string; model: string } | { ok: false; reason: AiRefusal };
export type SentVoice = { result: VoiceAudio; record: (db: Sql) => Promise<void> };
export type PreparedVoice = { send: () => Promise<SentVoice> };
export type PreparedSpeak = { ok: true; voice: PreparedVoice } | { ok: false; reason: AiRefusal };

// The same seven steps, for one line to speak: 1–4 in the caller's transaction (the profile, the minors check on the
// whole chain, a provider with a voice adapter and a key, the family's voice allowance: the line's characters); 5, the child's
// names and the parent's email taken out of the line; 6 (send, no database) down the chain; 7 (record) counts and the
// ledger, with the characters spoken as "tokens in". A line longer than VOICE_TEXT_MAX, or empty, is refused before
// anything is taken. The caller passes only text the server holds; the audio is returned, never stored or logged.
export async function prepareSpeak(db: Sql, ctx: AiContext, profileId: ProfileId, input: SpeakInput): Promise<PreparedSpeak> {
  return speakRun(db, ctx, profileId, input, LIVE);
}
async function speakRun(db: Sql, ctx: AiContext, profileId: ProfileId, input: SpeakInput, run: Run): Promise<PreparedSpeak> {
  const env = process.env;
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text || text.length > VOICE_TEXT_MAX || (input.language !== 'en' && input.language !== 'hi')) return { ok: false, reason: 'failed' };
  const testing = await testingModeOn(db);
  const checked = await checkProfile(db, ctx, profileId, 'text_to_speech', env, testing);
  if (!checked.ok) return checked;
  const { profile, row, chain, providers } = checked;

  // 3. A provider that can speak; one whose circuit is open is skipped.
  const usable = await usableLinks(db, chain, providers, env, (p) => voiceAdapterFor(p, env));
  if (usable.length === 0) return { ok: false, reason: 'not_switched_on' };
  const ledger = ledgerOf(ctx, profile, row);
  const { admitted: ready, skipped } = await gateLinks(db, usable);
  if (ready.length === 0) {
    await recordAttempts(db, ledger, skipped, run.source);
    return { ok: false, reason: 'failed' };
  }

  // 4. The family's daily voice allowance, in characters (C388), not the daily requests: a line takes its length.
  if (!run.uncapped && !(await takeVoiceCap(db, ctx, profile, ready[0].link, text.length, testing))) return { ok: false, reason: 'cap_reached' };

  // 5. Nothing that names a child leaves the server.
  const clean = scrubRequest({ system: '', messages: [{ role: 'user', content: text }] }, { childFirstNames: ctx.childFirstNames, parentEmail: ctx.parentEmail }).messages[0].content;

  let sent = false;
  const send = async (): Promise<SentVoice> => {
    const usage: { link: Link; counts: Counts }[] = [];
    const attempts: Attempt[] = [];
    run.watch?.(attempts);
    let spoke = false;
    const record = async (tx: Sql) => {
      for (const u of usage) await count(tx, ctx.day, profile.id, u.link, u.counts);
      await recordAttempts(tx, ledger, attempts, run.source);
      // Nothing spoken: the line's characters go back to the family's day.
      if (!spoke && profile.audience === 'family' && !run.uncapped) await giveVoiceCharsBack(tx, ctx.accountId, ctx.day, text.length);
    };
    if (sent) return { result: { ok: false, reason: 'failed' }, record: async () => {} };
    sent = true;
    attempts.push(...skipped);
    const began = Date.now();
    for (const [i, r] of ready.entries()) {
      const { link, adapter, apiKey } = r;
      if (Date.now() - began > VOICE_CHAIN_BUDGET_MS) {
        attempts.push(...ready.slice(i).map((x) => skippedAttempt(x, 'skipped_deadline')));
        break;
      }
      let result: VoiceResult;
      const start = Date.now();
      try {
        result = await adapter.synthesize({ apiKey, model: link.model, text: clean, language: input.language });
      } catch {
        result = { ok: false, failure: 'network' };
      }
      const tried = attemptOf(r, result.ok ? { ok: true, tokensIn: result.characters, tokensOut: 0 } : result, { streamed: false, elapsedMs: Date.now() - start, limitMs: VOICE_TIMEOUT_MS });
      attempts.push(tried.attempt);
      if (result.ok) {
        spoke = true;
        usage.push({ link, counts: { requests: 1, tokensIn: result.characters } });
        return { result: { ok: true, audio: result.audio, mediaType: result.mediaType, provider: link.provider, model: link.model }, record };
      }
      usage.push({ link, counts: { requests: 1, failures: 1 } });
      if (!tried.retryable) break;
    }
    return { result: { ok: false, reason: 'failed' }, record };
  };
  return { ok: true, voice: { send } };
}

// ---- realtime voice (W16-A4) ----------------------------------------------------------------------------------------

export type RealtimeGrant = RealtimeToken & { provider: string };
export type SentRealtime = { result: { ok: true; grant: RealtimeGrant } | { ok: false; reason: AiRefusal }; record: (db: Sql) => Promise<void> };
export type PreparedRealtime = { ok: true; session: { send: () => Promise<SentRealtime> } } | { ok: false; reason: AiRefusal };

// The same seven steps for one short-lived client token: 1–4 in the caller's transaction (the profile, the minors check
// on the whole chain, a provider with a realtime adapter and a key, one place from the family's daily requests, as a
// session is a request); 6 (mint, no database) down the chain; 7 (record) counts and the ledger. Only the token and the
// provider's connect details go back; the audio never touches this server. A profile with no provider answers
// 'not_switched_on' before anything is taken, and the call then uses the chain.
export async function prepareRealtimeToken(db: Sql, ctx: AiContext, profileId: ProfileId, input: { language: 'en' | 'hi'; maxSeconds?: number }): Promise<PreparedRealtime> {
  return realtimeRun(db, ctx, profileId, input, LIVE);
}
async function realtimeRun(db: Sql, ctx: AiContext, profileId: ProfileId, input: { language: 'en' | 'hi'; maxSeconds?: number }, run: Run): Promise<PreparedRealtime> {
  const env = process.env;
  if (input.language !== 'en' && input.language !== 'hi') return { ok: false, reason: 'failed' };
  const testing = await testingModeOn(db);
  const checked = await checkProfile(db, ctx, profileId, 'realtime', env, testing);
  if (!checked.ok) return checked;
  const { profile, row, chain, providers } = checked;
  const usable = await usableLinks(db, chain, providers, env, (p) => realtimeAdapterFor(p));
  if (usable.length === 0) return { ok: false, reason: 'not_switched_on' };
  const ledger = ledgerOf(ctx, profile, row);
  const { admitted: ready, skipped } = await gateLinks(db, usable);
  if (ready.length === 0) {
    await recordAttempts(db, ledger, skipped, run.source);
    return { ok: false, reason: 'failed' };
  }
  if (!run.uncapped && !(await takeCap(db, ctx, profile, ready[0].link, testing))) return { ok: false, reason: 'cap_reached' };

  let sent = false;
  const send = async (): Promise<SentRealtime> => {
    const usage: { link: Link; counts: Counts }[] = [];
    const attempts: Attempt[] = [];
    run.watch?.(attempts);
    const record = async (tx: Sql) => {
      for (const u of usage) await count(tx, ctx.day, profile.id, u.link, u.counts);
      await recordAttempts(tx, ledger, attempts, run.source);
    };
    if (sent) return { result: { ok: false, reason: 'failed' }, record: async () => {} };
    sent = true;
    attempts.push(...skipped);
    for (const r of ready) {
      const { link, adapter, apiKey } = r;
      const start = Date.now();
      let minted: Awaited<ReturnType<RealtimeAdapter['mintToken']>>;
      try {
        minted = await adapter.mintToken({ apiKey, model: link.model, language: input.language, maxSeconds: input.maxSeconds });
      } catch {
        minted = { ok: false, failure: 'network' };
      }
      const tried = attemptOf(r, minted.ok ? { ok: true, tokensIn: 0, tokensOut: 0 } : minted, { streamed: false, elapsedMs: Date.now() - start, limitMs: 8_000 });
      attempts.push(tried.attempt);
      if (minted.ok) {
        usage.push({ link, counts: { requests: 1 } });
        return { result: { ok: true, grant: { provider: link.provider, token: minted.token, expiresAt: minted.expiresAt, url: minted.url, model: minted.model } }, record };
      }
      usage.push({ link, counts: { requests: 1, failures: 1 } });
      if (!tried.retryable) break;
    }
    return { result: { ok: false, reason: 'failed' }, record };
  };
  return { ok: true, session: { send } };
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
export async function prepareModeration(db: Sql, ctx: AiContext, replyProfile: ProfileId | null = null): Promise<ModerationReady> {
  return moderationRun(db, ctx, replyProfile, LIVE);
}
async function moderationRun(db: Sql, ctx: AiContext, replyProfile: ProfileId | null, run: Run): Promise<ModerationReady> {
  const env = process.env;
  const testing = await testingModeOn(db);
  // Testing mode skips the safety pre-check: nothing is sent, nothing is counted, every check reads as safe. Try it
  // still calls the provider (the founder asked to see it answer), with the minors check read as testing reads it.
  if (testing && run.source === 'live') return { ok: true, moderation: { check: async () => ({ safe: true, categories: [] }), record: async () => {} } };
  const checked = await checkProfile(db, ctx, 'family.moderation', 'moderation', env, testing);
  if (!checked.ok) return checked;
  const { profile, row, chain, providers } = checked;
  const usable = await usableLinks(db, chain, providers, env, (p) => moderationAdapterFor(p, env));
  if (usable.length === 0) return { ok: false, reason: 'not_switched_on' };
  const ledger = ledgerOf(ctx, profile, row);
  const { admitted: ready, skipped } = await gateLinks(db, usable);
  if (ready.length === 0) {
    await recordAttempts(db, ledger, skipped, run.source);
    return { ok: false, reason: 'failed' };
  }

  const usage: { link: Link; counts: Counts }[] = [];
  const attempts: Attempt[] = [...skipped];
  run.watch?.(attempts);
  let checks = 0;
  const check = async (turns: { user: string; assistant?: string }): Promise<ModerationVerdict | null> => {
    checks += 1;
    const clean = scrubRequest(
      { system: '', messages: [{ role: 'user', content: turns.user }, ...(turns.assistant === undefined ? [] : [{ role: 'assistant' as const, content: turns.assistant }])] },
      { childFirstNames: ctx.childFirstNames, parentEmail: ctx.parentEmail }
    );
    const user = clean.messages[0].content;
    const assistant = turns.assistant === undefined ? undefined : clean.messages[1].content;
    for (const r of ready) {
      const { link, adapter, apiKey } = r;
      let result: ModerationResult;
      const start = Date.now();
      try {
        result = await adapter.moderate({ apiKey, model: link.model, user, assistant });
      } catch {
        result = { ok: false, failure: 'network' };
      }
      const tried = attemptOf(r, result, { streamed: false, elapsedMs: Date.now() - start, limitMs: MODERATION_TIMEOUT_MS });
      attempts.push(tried.attempt);
      if (result.ok) {
        usage.push({ link, counts: { requests: 1, tokensIn: result.tokensIn, tokensOut: result.tokensOut } });
        return { safe: result.safe, categories: result.categories };
      }
      usage.push({ link, counts: { requests: 1, failures: 1 } });
      if (!tried.retryable) break;
    }
    return null;
  };
  const record = async (tx: Sql) => {
    for (const u of usage.splice(0)) await count(tx, ctx.day, profile.id, u.link, u.counts);
    await recordAttempts(tx, ledger, attempts.splice(0), run.source);
    // C390: how many checks this reply took, one row per reply, so the Quality Lab shows the cost of checking. Try it
    // checks no reply, so it adds none.
    if (checks > 0 && run.source === 'live') await tx.query(`select control.record_reply_checks($1::date, $2::text, $3::int)`, [ctx.day, replyProfile, checks]);
    checks = 0;
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

// The JSON request, the photo request and the safety pair are Try it's inputs too (try-inputs.ts), word for word.
export async function prepareSmokeTest(db: Sql, ctx: AiContext, inputs: SmokeInputs): Promise<PreparedSmoke> {
  const env = process.env;
  // The minors check as a child's call reads it now (testing mode included).
  const testing = await testingModeOn(db);
  const usage: { profile: ProfileId; link: Link; counts: Counts }[] = [];
  // W17-B1: each vendor call is also one ledger row marked 'smoke', so Control sees it beside live use and Try it. Its
  // circuit effect is 'none': the smoke test asks the primary alone, outside the route's walk, and moves no circuit, as
  // before it was in the ledger. The transport probes stay counts only (they are not a feature's call).
  const ledgered: { ledger: LedgerOf; attempt: Attempt }[] = [];
  const ledger = (c: { profile: AiProfile; row: ProfileRow }, r: { link: Link; position: number }, result: { ok: true; tokensIn: number; tokensOut: number } | { ok: false; failure: string; status?: number }, began: number, limitMs: number) =>
    ledgered.push({ ledger: ledgerOf(ctx, c.profile, c.row), attempt: { ...attemptOf(r, result, { streamed: false, elapsedMs: Date.now() - began, limitMs }).attempt, circuit: 'none' } });
  type Step = () => Promise<SmokeCheck[]>;
  const steps: Step[] = [];
  const refused = (check: string, profile: ProfileId, reason: string): Step => async () => [{ check, profile, ok: false, failure: reason }];

  const textChain = async (profile: ProfileId, check: string, request: AdapterRequestPart, judge: (text: string, finish?: string) => string | undefined) => {
    const c = await checkProfile(db, ctx, profile, 'text', env, testing);
    if (!c.ok) return steps.push(refused(check, profile, c.reason));
    const usable = await usableLinks(db, c.chain, c.providers, env, (p) => adapterFor(p, env));
    const ready = usable.filter((r) => !request.images || r.adapter.capabilities.vision);
    if (!ready.length) return steps.push(refused(check, profile, usable.length ? 'no_provider_reads_photos' : 'not_switched_on'));
    const { link, adapter, apiKey, baseUrl } = ready[0];
    steps.push(async () => {
      const began = Date.now();
      let r: AdapterResult;
      try {
        const maxTokens = request.fullLength ? Number(c.row.max_output_tokens) : 300;
        r = await adapter.streamText({ apiKey, model: link.model, system: request.system, messages: [{ role: 'user', content: request.user, images: request.images }], maxTokens, ...(request.instructionsAs ? { instructionsAs: request.instructionsAs } : {}), ...(baseUrl ? { baseUrl } : {}) }, () => {});
      } catch {
        r = { ok: false, failure: 'network' };
      }
      usage.push({ profile, link, counts: r.ok ? { requests: 1, tokensIn: r.tokensIn, tokensOut: r.tokensOut } : { requests: 1, failures: 1 } });
      ledger(c, ready[0], r, began, CALL_TIMEOUT_MS);
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
  const jsonAsk = { system: TRY_JSON_ASK.system, user: TRY_JSON_ASK.user };
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
    const c = await checkProfile(db, ctx, 'family.resolver', 'text', env, testing);
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
    { system: TRY_PHOTO_ASK.system, user: TRY_PHOTO_ASK.user, images: [{ mediaType: 'image/jpeg', base64: inputs.photoJpegBase64 }] },
    (text) => (/magnet/i.test(text) ? 'read the printed question' : 'answered, but not with the printed question')
  );

  const voice = await checkProfile(db, ctx, 'family.voice_input', 'speech_to_text', env, testing);
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
          ledger(voice, ready[0], r, began, SPEECH_TIMEOUT_MS);
          const check = `voice:${s.mediaType.slice(6)}`;
          return [{ check, profile: 'family.voice_input', ok: r.ok, provider: link.provider, model: link.model, ms: Date.now() - began, ...(r.ok ? { note: /magnet/i.test(r.text) ? 'heard the question' : 'heard something else' } : { failure: r.failure, status: r.status }) }];
        });
      }
    }
  }

  const guard = await checkProfile(db, ctx, 'family.moderation', 'moderation', env, testing);
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
          r = await adapter.moderate({ apiKey, model: link.model, user: TRY_SAFETY_PAIR.user, assistant: TRY_SAFETY_PAIR.assistant });
        } catch {
          r = { ok: false, failure: 'network' };
        }
        usage.push({ profile: 'family.moderation', link, counts: r.ok ? { requests: 1, tokensIn: r.tokensIn, tokensOut: r.tokensOut } : { requests: 1, failures: 1 } });
        ledger(guard, ready[0], r, began, MODERATION_TIMEOUT_MS);
        return [{ check: 'safety', profile: 'family.moderation', ok: r.ok, provider: link.provider, model: link.model, ms: Date.now() - began, ...(r.ok ? { note: `${r.safe ? 'safe' : 'unsafe'}; answered as ${r.form ?? 'unknown'}` } : { failure: r.failure, status: r.status }) }];
      });
    }
  }

  return {
    send: async () => (await Promise.all(steps.map((s) => s()))).flat(),
    record: async (tx) => {
      for (const u of usage.splice(0)) await count(tx, ctx.day, u.profile, u.link, u.counts);
      for (const l of ledgered.splice(0)) await recordAttempts(tx, l.ledger, [l.attempt], 'smoke');
    },
  };
}
// `fullLength`: the profile's own output limit instead of the smoke test's short one.
type AdapterRequestPart = { system: string; user: string; images?: ChatImage[]; instructionsAs?: 'system' | 'user'; fullLength?: boolean };

// ---- Try it (W17-B1) ------------------------------------------------------------------------------------------------

// Control → AI's "Try it": one live call of a feature as Control has set it now, on made-up inputs (try-inputs.ts, and
// the smoke test's fixture photo and WAV recording), never a child's data. Unlike the smoke test, which asks the primary
// alone, it runs the feature's own prepare function, so the route is walked exactly as a child's call walks it: the
// minors check, the usable providers, the circuits, Primary then the backups, the deadlines. Run as TRY_IT it takes no
// family's daily place, and its ledger rows say 'try_it' (the counts are added as for any call). Prepared in the
// caller's transaction, sent with no database, recorded in the next. The answer goes back to Control's screen only,
// never stored or logged; a realtime token is reported by its expiry alone and never leaves this function.
export type TryInputs = { photoJpegBase64: string; speechWavBase64: string };
export type TryClip = { language: 'en' | 'hi'; audioBase64: string; mediaType: string };
export type TryOutput = { kind: 'text'; text: string } | { kind: 'json'; json: unknown } | { kind: 'audio'; clips: TryClip[] } | { kind: 'token'; expiresAt: string };
// `backupUsed`: a place after Primary answered. `failure`: a refusal before anything was sent (not_switched_on,
// not_cleared_for_minors, not_capable, failed), or the class of the last attempt that failed (auth_failed, rate_limited…).
export type TryResult = { ok: boolean; provider: string | null; model: string | null; ms: number; backupUsed: boolean; output?: TryOutput; failure?: string; status?: number };
export type SentTry = { result: TryResult; record: (db: Sql) => Promise<void> };
export type PreparedTry = { ok: true; send: () => Promise<SentTry> } | { ok: false; result: TryResult };

// The same short answer the smoke test asks for: enough to see the feature answer and its format.
const TRY_TEXT_TOKENS = 300;
type TryLeg = () => Promise<{ output: TryOutput | null; record: (db: Sql) => Promise<void> }>;

// A JSON feature's answer shown parsed (the first object in it); text that holds no readable object is shown as text.
function textOutput(text: string, json: boolean): TryOutput {
  if (json) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return { kind: 'json', json: JSON.parse(text.slice(start, end + 1)) };
      } catch {
        // Not readable as JSON: shown as the text it is, which is what the founder needs to see.
      }
    }
  }
  return { kind: 'text', text };
}

export async function prepareTryIt(db: Sql, ctx: AiContext, profileId: string, inputs: TryInputs): Promise<PreparedTry> {
  const refusal = (failure: string): PreparedTry => ({ ok: false, result: { ok: false, provider: null, model: null, ms: 0, backupUsed: false, failure } });
  const profile = profileById(profileId);
  if (!profile) return refusal('profile');
  const input = TRY_INPUTS[profile.id];
  // Every attempt of every leg, as the prepare functions make them: which place answered, and how the last one failed.
  const seen: (readonly Attempt[])[] = [];
  const run: Run = { source: 'try_it', uncapped: true, watch: (a) => seen.push(a) };
  const legs: TryLeg[] = [];

  if (input.kind === 'text') {
    const images: ChatImage[] | undefined = input.photo ? [{ mediaType: 'image/jpeg', base64: inputs.photoJpegBase64 }] : undefined;
    const p = await textRun(db, ctx, profile.id, { system: input.system, messages: [{ role: 'user', content: input.user, ...(images ? { images } : {}) }], maxTokens: TRY_TEXT_TOKENS, ...(input.json ? { responseFormat: 'json' as const } : {}) }, run);
    if (!p.ok) return refusal(p.reason);
    legs.push(async () => {
      const s = await p.text.send();
      return { output: s.result.ok ? textOutput(s.result.text, input.json) : null, record: s.record };
    });
  } else if (input.kind === 'hear') {
    const p = await transcriptionRun(db, ctx, profile.id, { audio: Buffer.from(inputs.speechWavBase64, 'base64'), mediaType: 'audio/wav', language: 'en' }, run);
    if (!p.ok) return refusal(p.reason);
    legs.push(async () => {
      const s = await p.speech.send();
      return { output: s.result.ok ? { kind: 'text', text: s.result.text } : null, record: s.record };
    });
  } else if (input.kind === 'speak') {
    // Both lines prepared before either is sent, so a refusal sends nothing.
    const prepared = [];
    for (const line of TRY_SPOKEN) {
      const p = await speakRun(db, ctx, profile.id, { text: line.text, language: line.language }, run);
      if (!p.ok) return refusal(p.reason);
      prepared.push({ line, voice: p.voice });
    }
    for (const { line, voice } of prepared)
      legs.push(async () => {
        const s = await voice.send();
        const clip = s.result.ok ? { language: line.language, audioBase64: Buffer.from(s.result.audio).toString('base64'), mediaType: s.result.mediaType } : null;
        return { output: clip ? { kind: 'audio', clips: [clip] } : null, record: s.record };
      });
  } else if (input.kind === 'safety') {
    const p = await moderationRun(db, ctx, null, run);
    if (!p.ok) return refusal(p.reason);
    legs.push(async () => {
      const verdict = await p.moderation.check(TRY_SAFETY_PAIR);
      return { output: verdict ? { kind: 'json', json: verdict } : null, record: p.moderation.record };
    });
  } else {
    const p = await realtimeRun(db, ctx, profile.id, { language: 'en' }, run);
    if (!p.ok) return refusal(p.reason);
    legs.push(async () => {
      const s = await p.session.send();
      // Only when it expires: the token and its connect address stay here.
      return { output: s.result.ok ? { kind: 'token', expiresAt: new Date(s.result.grant.expiresAt).toISOString() } : null, record: s.record };
    });
  }

  return {
    ok: true,
    send: async () => {
      const began = Date.now();
      const done = await Promise.all(legs.map((leg) => leg()));
      const ms = Date.now() - began;
      const attempts = seen.flat();
      const answered = attempts.filter((a) => a.outcome === 'ok');
      const failed = attempts.filter((a) => a.outcome !== 'ok');
      const outputs = done.map((d) => d.output);
      const ok = outputs.every((o) => o !== null);
      const by = answered[0] ?? failed[failed.length - 1] ?? null;
      const output: TryOutput | undefined = !ok ? undefined : outputs.length > 1 ? { kind: 'audio', clips: outputs.flatMap((o) => (o?.kind === 'audio' ? o.clips : [])) } : (outputs[0] ?? undefined);
      const last = failed[failed.length - 1];
      const status = last ? vendorStatus.get(last) : undefined;
      const result: TryResult = { ok, provider: by?.provider ?? null, model: by?.model ?? null, ms, backupUsed: answered.some((a) => a.position > 0), ...(output ? { output } : { failure: last?.outcome ?? 'failed', ...(status !== undefined ? { status } : {}) }) };
      return {
        result,
        record: async (tx) => {
          for (const d of done) await d.record(tx);
        },
      };
    },
  };
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
// noAds: Control marked the channel as one that runs no ads on its videos (ranked first; nothing in code strips ads).
export type VideoChannel = { channelId: string; kind: VideoKind; noAds?: boolean };
// C522: language is a two-letter ISO 639-1 code (the child's chosen language; the adapter checks it).
// curatedIds: videos a person chose for this topic (content.curated_topic_videos), read with the search's results so
// they pass the same live checks (embedding, privacy, age, paid placement); searchOff: enough curated ones, no search.
export type VideoPlan = { query: string; language: string; channelIds: string[]; curatedIds?: string[]; searchOff?: boolean };
export type FoundVideos = { ok: true; candidates: VideoCandidate[] } | { ok: false };
export type PreparedVideos = { ok: true; searches: number; find: () => Promise<FoundVideos> } | { ok: false; reason: 'no_key' | 'quota' };

const VIDEO_PROVIDER = 'youtube';
// At most this many channel searches (official, then approved; the caller turns the lists by topic) beside the wider
// catalogue, each one a search from the day's quota (family.video_searches_per_day): a refresh takes 1 to 3.
const CHANNEL_SEARCHES = 2;

// The channels Control listed (official, approved, blocked). Control's own table: families have no read of it, so it is
// read here with the platform role, in a short transaction of its own (ids and kinds only; no family data is near it).
export async function videoChannels(): Promise<VideoChannel[]> {
  const rows = await withPlatformService(async (db) => (await db.query(`select channel_id, kind, no_ads from content.video_channels order by kind, added_at`)).rows);
  return rows.map((r) => ({ channelId: String(r.channel_id), kind: r.kind as VideoKind, noAds: r.no_ads === true }));
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
  const curatedIds = (a.plan.curatedIds ?? []).slice(0, 10);
  const channels = a.plan.searchOff ? [] : a.plan.channelIds.slice(0, CHANNEL_SEARCHES);
  let searches = 0;
  for (let i = 0; !a.plan.searchOff && i < 1 + channels.length; i++) {
    const took = await db.query(`select content.take_video_search($1::date, $2::int) as ok`, [a.day, Math.max(0, Math.floor(a.perDay))]);
    if (took.rows[0]?.ok !== true) break;
    searches++;
  }
  // No search left: curated videos are still read (one details call, not a search), or nothing is.
  if (searches === 0 && !curatedIds.length) return { ok: false, reason: 'quota' };
  // Fewer searches left than planned: the wider catalogue keeps its one, the channel searches give way.
  const channelIds = channels.slice(0, Math.max(0, searches - 1));
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
      const results = searches === 0 ? [] : await Promise.all([
        ...channelIds.map((channelId) => searchVideoIds(apiKey, { query, language, channelId, maxResults: 5 })),
        searchVideoIds(apiKey, { query, language, maxResults: 10 }),
      ]);
      if (results.length && !results.some((r) => r.ok) && !curatedIds.length) return { ok: false };
      const ids = [...curatedIds, ...results.flatMap((r) => (r.ok ? r.value : []))];
      const details = await videoDetails(apiKey, Array.from(new Set(ids)));
      return details.ok ? { ok: true, candidates: details.value } : { ok: false };
    },
  };
}

// ---- the video judge (family.video_review; src/lib/family/video-review.ts) --------------------------------------------
//
// Gemini watches a public YouTube video and scores it. Not a text call through the chain: only Gemini takes a YouTube
// address as the video, so the profile's own provider must be Gemini (Control can switch it off or change its model).
// The key is Control's stored Gemini connection, else the server's GEMINI_API_KEY; never in code. The day's reviews
// are limited by family.video_reviews_per_day (India day), checked here in the caller's transaction.
export type PreparedVideoReview = { ok: true; model: string; apiKey: string; left: number } | { ok: false; reason: 'not_switched_on' | 'no_key' | 'cap_reached' };
const REVIEW_PROVIDER = 'gemini';
const REVIEW_MODEL = 'gemini-3.8-flash';
export async function prepareVideoReview(db: Sql, env: Record<string, string | undefined> = process.env): Promise<PreparedVideoReview> {
  const profile = await profileRow(db, 'family.video_review');
  if (!profile || !profile.enabled || (profile.provider_id !== null && profile.provider_id !== REVIEW_PROVIDER)) return { ok: false, reason: 'not_switched_on' };
  const cap = Number((await db.query(`select value from control.settings where key = 'family.video_reviews_per_day'`)).rows[0]?.value ?? 100);
  const done = Number((await db.query(`select count(*)::int as n from content.video_reviews where (reviewed_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date`)).rows[0]?.n ?? 0);
  const left = (Number.isFinite(cap) && cap >= 0 ? Math.floor(cap) : 100) - done;
  if (left <= 0) return { ok: false, reason: 'cap_reached' };
  let apiKey: string | null = null;
  const k = aiEncryptionKey(env);
  const { rows } = await db.query(`select ciphertext, iv, tag, key_version from control.ai_sealed_credential($1)`, [REVIEW_PROVIDER]);
  if (k && rows[0]) {
    try {
      apiKey = unsealAiKey(k, REVIEW_PROVIDER, rows[0] as SealedRow);
    } catch {
      apiKey = null;
    }
  }
  apiKey ??= env.GEMINI_API_KEY?.trim() || null;
  if (!apiKey) return { ok: false, reason: 'no_key' };
  return { ok: true, model: profile.model && /^[A-Za-z0-9._-]{1,80}$/.test(profile.model) ? profile.model : REVIEW_MODEL, apiKey, left };
}

export { VIDEO_REVIEW_MIN, videoReviewHides };
export type { VideoScores };
export type VideoReviewOutcome = { ok: true; scores: VideoScores; hidden: boolean } | { ok: false; reason: 'bad_request' | 'not_switched_on' | 'no_key' | 'cap_reached' | 'failed' | 'already' };
type PlatformDb = <T>(fn: (db: Sql) => Promise<T>) => Promise<T>;

// One video judged now, once ever: the profile and key opened in a short platform transaction, Gemini called with no
// connection held, the scores kept in a second (a video already judged is left as it is).
export async function reviewVideoNow(videoId: string, deps: { fetch?: typeof fetch; withDb?: PlatformDb } = {}): Promise<VideoReviewOutcome> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return { ok: false, reason: 'bad_request' };
  const withDb: PlatformDb = deps.withDb ?? ((fn) => withPlatformService((c) => fn(c as unknown as Sql)));
  const prepared = await withDb(async (db): Promise<PreparedVideoReview | { ok: false; reason: 'already' }> => {
    if ((await db.query(`select 1 from content.video_reviews where video_id = $1`, [videoId])).rows.length) return { ok: false, reason: 'already' };
    return prepareVideoReview(db);
  });
  if (!prepared.ok) return { ok: false, reason: prepared.reason };
  const watched = await watchYoutubeVideo(prepared.apiKey, prepared.model, videoId, deps.fetch);
  if (!watched.ok) return { ok: false, reason: 'failed' };
  const s = watched.scores;
  await withDb((db) =>
    db.query(
      `insert into content.video_reviews (video_id, accuracy, clarity, class_fit, clickbait, child_safety, reason, model) values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (video_id) do nothing`,
      [videoId, s.accuracy, s.clarity, s.class_fit, s.clickbait, s.child_safety, s.reason, prepared.model]
    )
  );
  return { ok: true, scores: s, hidden: videoReviewHides(s) };
}
