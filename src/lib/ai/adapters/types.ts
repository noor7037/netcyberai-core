// The text capability (docs/family-app/03 §7): one interface, one adapter per vendor. A vendor's host and wire format
// live only in this folder (scripts/check_family_boundary.py); a feature never calls a vendor itself.
//
// An adapter is handed the key already opened by the platform, inside the server call, and keeps nothing: no key, no
// prompt and no answer is stored, logged or thrown. A failure says only what kind of failure it was.

// A photo sent with a message (M2-6, C280: the homework helper): read inside the call, never stored or logged.
export type ChatImage = { mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; base64: string };
export type ChatMessage = { role: 'user' | 'assistant'; content: string; images?: ChatImage[] };

export type AdapterRequest = {
  apiKey: string;
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  responseFormat?: 'json';
  // Where the instructions go, when the caller must choose (only the smoke test does, C320); otherwise the adapter's own.
  instructionsAs?: 'system' | 'user';
  // The longest this call may take, set by the platform only for a profile with a long answer of its own (AI marking's
  // two tasks, C349: up to 40 page pictures in, a long JSON answer out). Never above MAX_CALL_TIMEOUT_MS.
  timeoutMs?: number;
  // The address the founder set in Control for a provider whose address is his choice (the OpenAI-compatible adapter,
  // G1, C369). Checked again by the adapter at every call (./endpoint-guard.ts); ignored by every other adapter.
  baseUrl?: string;
  // W10 (latency): whether a model that thinks before it answers may do so. Off unless a caller asks for 'on'; only the
  // NVIDIA adapter reads it (its reasoning models sent minutes of thinking before the first word of a child's answer).
  reasoning?: 'off' | 'on';
  // W10: the platform's own abort for this attempt (a first-text deadline passed), beside the adapter's time limit.
  signal?: AbortSignal;
};

// 'endpoint': the founder's address was refused at call time (not https, a private or reserved address, a redirect),
// or none is set (G1, C369).
export type AdapterFailure = 'http' | 'refused' | 'network' | 'bad_stream' | 'cut_short' | 'endpoint';
// `finish`: why the vendor stopped ("stop", or "length" when its token limit cut the answer), when it says (C318).
export type AdapterResult = { ok: true; text: string; tokensIn: number; tokensOut: number; finish?: string } | { ok: false; failure: AdapterFailure; status?: number };

// What an adapter can do (G1, C369), declared by the adapter and never guessed: a feature that needs something the
// chosen adapter does not declare is refused when it is saved in Control and again at run time, never sent and left to
// fail. text: words in, words out. vision: a message may carry photos (ChatMessage.images); a call with photos skips a
// provider that cannot. stream: the answer arrives piece by piece. json: the vendor itself holds the answer to one JSON
// object (elsewhere only the instructions ask for it). stt: speech to text. tts: text to speech (C386: OpenAI and Google Cloud).
export const CAPABILITIES = ['text', 'vision', 'stream', 'json', 'stt', 'tts'] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type Capabilities = Readonly<Record<Capability, boolean>>;
export const capabilities = (has: readonly Capability[]): Capabilities => Object.freeze(Object.fromEntries(CAPABILITIES.map((c) => [c, has.includes(c)])) as Record<Capability, boolean>);

// A key test's outcome (G1): whether the vendor took the key, and the kind of failure. Never the key or the answer.
// `models` (G6, C379): the provider's model ids when its check is a model list that could be read; absent otherwise.
export type ConnectionTest = { ok: true; models?: string[] } | { ok: false; failure: AdapterFailure; status?: number };

export interface TextAdapter {
  readonly providerId: string;
  readonly capability: 'text';
  readonly termsNote: TermsNote | null;
  readonly needsKey: boolean;
  readonly capabilities: Capabilities;
  // true: the founder sets the address in Control (the OpenAI-compatible adapter, G1); every call is refused without it.
  readonly needsBaseUrl?: boolean;
  keyLooksRight(key: string): boolean;
  streamText(request: AdapterRequest, onDelta: (text: string) => void): Promise<AdapterResult>;
  // A cheap call that proves the key (and the address, where the founder sets one) works, for Control's "Test the key".
  testConnection?(apiKey: string, baseUrl?: string): Promise<ConnectionTest>;
}

// What the supervisor found in a vendor's terms for a product children use (docs/family-app/AI_PROVIDERS.md,
// 2026-10-22), shown in Control beside the provider's switch as advice (C368). It never blocks: the one gate for a
// child's words is the founder's clearance in Control (control.ai_providers.cleared_for_minors, with the terms page,
// who and when), and the person who clears a provider carries that decision. Null: nothing to say (the stand-in).
export const TERMS_NOTES = ['minors_with_safeguards', 'no_under_13', 'adults_only', 'no_bar_found'] as const;
export type TermsNote = (typeof TERMS_NOTES)[number];

export const JSON_ONLY = 'Answer with one JSON object only, and nothing outside it.';

// The longest a vendor call may take before it is given up (and the next provider in the chain is tried).
export const CALL_TIMEOUT_MS = 60_000;
// A whole answer (not streamed, C322) shows nothing until it is done, so it is given longer before it is given up (C323).
export const WHOLE_ANSWER_TIMEOUT_MS = 120_000;
// The most any one call may be given (a request's own timeoutMs): inside the job runner's 300 s route with room for
// the job's reads and writes (src/lib/jobs/runner.ts, LONG_JOB_START_MS).
export const MAX_CALL_TIMEOUT_MS = 240_000;

// The time a call is given: the request's own limit when it has one (at least a second, at most MAX_CALL_TIMEOUT_MS),
// else the adapter's usual one.
export function callTimeoutMs(request: Pick<AdapterRequest, 'timeoutMs'>, usual: number): number {
  const asked = request.timeoutMs;
  return typeof asked === 'number' && Number.isFinite(asked) ? Math.min(MAX_CALL_TIMEOUT_MS, Math.max(1_000, Math.floor(asked))) : usual;
}

// ---- speech to text (M2-7, C281: voice input) ----------------------------------------------------------------------

// A transcription of at most 30 seconds takes a few seconds; one that takes longer is given up, so two providers in
// a chain still fit inside a route's minute.
export const SPEECH_TIMEOUT_MS = 25_000;

// A short recording of a child speaking a question: read inside the call and dropped, never stored or logged.
export type SpeechMediaType = 'audio/webm' | 'audio/ogg' | 'audio/mp4' | 'audio/wav';
export type SpeechRequest = { apiKey: string; model: string; audio: Uint8Array; mediaType: SpeechMediaType; language: 'en' | 'hi' };
export type SpeechResult = { ok: true; text: string; tokensIn: number; tokensOut: number } | { ok: false; failure: AdapterFailure; status?: number };

// The speech_to_text capability (docs/family-app/03 §7), beside the text one, under the same rules: the key is opened
// by the platform and handed in; nothing is kept, logged or thrown; a failure says only its kind.
export interface SpeechAdapter {
  readonly providerId: string;
  readonly capability: 'speech_to_text';
  readonly termsNote: TermsNote | null;
  readonly needsKey: boolean;
  readonly capabilities: Capabilities;
  transcribe(request: SpeechRequest): Promise<SpeechResult>;
}

// ---- moderation (W2, C314: Llama Guard on a child's words and on answers) -------------------------------------------

// A check of one short exchange takes well under a second; one that takes longer is given up (the block is then not
// shown), so the four or so checks of one answer stay well inside the route's time.
export const MODERATION_TIMEOUT_MS = 8_000;

// The words to check: a child's question alone (`user`), or an answer (`assistant`) to what was asked (`user`). Read
// inside the call and dropped, never stored or logged.
export type ModerationRequest = { apiKey: string; model: string; user: string; assistant?: string };
// `categories` are the classifier's own codes (Llama Guard's S1–S14), kept only in memory to choose what the child is
// told; never stored with the words.
// `form`: how the classifier answered (its text, or an object), for the smoke test to record (C316).
export type ModerationResult = { ok: true; safe: boolean; categories: string[]; tokensIn: number; tokensOut: number; form?: 'text' | 'object' } | { ok: false; failure: AdapterFailure; status?: number };

// The moderation capability, beside text and speech, under the same rules: the key is opened by the platform and
// handed in; nothing is kept, logged or thrown; a failure says only its kind.
export interface ModerationAdapter {
  readonly providerId: string;
  readonly capability: 'moderation';
  readonly termsNote: TermsNote | null;
  readonly needsKey: boolean;
  readonly capabilities: Capabilities;
  moderate(request: ModerationRequest): Promise<ModerationResult>;
}

// ---- text to speech (Wave 4 slice 2, C386: a server voice) ----------------------------------------------------------

// One sentence (or one short reply) to speech takes a second or two; one that takes longer is given up, so the next
// provider still fits and the phone falls back to its own voice without a long wait.
export const VOICE_TIMEOUT_MS = 15_000;
// The most characters one request may speak (the platform refuses more before anything leaves).
export const VOICE_TEXT_MAX = 600;

export type VoiceMediaType = 'audio/mpeg' | 'audio/ogg';
// `language`: the line's language; an adapter picks its voice for it (Google: en-IN or hi-IN; OpenAI: one voice that
// reads either, the language being in the text itself). The text is the server's own (a chapter's narration or a
// checked reply), read inside the call and dropped, never stored or logged.
export type VoiceRequest = { apiKey: string; model: string; text: string; language: 'en' | 'hi' };
// `characters`: what the vendor bills by; the platform meters it as "tokens in" (so a price per million in Control is a
// price per million characters for these providers).
export type VoiceResult = { ok: true; audio: Uint8Array; mediaType: VoiceMediaType; characters: number } | { ok: false; failure: AdapterFailure; status?: number };

// The text_to_speech capability, beside the others and under the same rules: the key is opened by the platform and
// handed in; nothing is kept, logged or thrown; a failure says only its kind. Declares `tts`.
export interface VoiceAdapter {
  readonly providerId: string;
  readonly capability: 'text_to_speech';
  readonly termsNote: TermsNote | null;
  readonly needsKey: boolean;
  readonly capabilities: Capabilities;
  keyLooksRight(key: string): boolean;
  // A model id this adapter can use (it may become part of the request's voice name).
  modelLooksRight(model: string): boolean;
  synthesize(request: VoiceRequest): Promise<VoiceResult>;
  testConnection?(apiKey: string): Promise<ConnectionTest>;
}
