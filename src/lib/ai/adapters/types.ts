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
};

export type AdapterFailure = 'http' | 'refused' | 'network' | 'bad_stream' | 'cut_short';
export type AdapterResult = { ok: true; text: string; tokensIn: number; tokensOut: number } | { ok: false; failure: AdapterFailure; status?: number };

export interface TextAdapter {
  readonly providerId: string;
  readonly capability: 'text';
  // Set here, in code, after reading the vendor's terms for a product used by children. Control's clearance
  // (control.ai_providers.cleared_for_minors) is needed as well: both, or a child's words never go to this vendor.
  readonly minorsEligible: boolean;
  readonly needsKey: boolean;
  // Whether a message may carry photos (ChatMessage.images). A call with photos skips a provider that cannot.
  readonly vision: boolean;
  keyLooksRight(key: string): boolean;
  streamText(request: AdapterRequest, onDelta: (text: string) => void): Promise<AdapterResult>;
}

export const JSON_ONLY = 'Answer with one JSON object only, and nothing outside it.';

// The longest a vendor call may take before it is given up (and the next provider in the chain is tried).
export const CALL_TIMEOUT_MS = 60_000;

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
  // The code's half of the minors check, as for a text adapter; Control's clearance is needed as well.
  readonly minorsEligible: boolean;
  readonly needsKey: boolean;
  transcribe(request: SpeechRequest): Promise<SpeechResult>;
}
