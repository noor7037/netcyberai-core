// The text capability (docs/family-app/03 §7): one interface, one adapter per vendor. A vendor's host and wire format
// live only in this folder (scripts/check_family_boundary.py); a feature never calls a vendor itself.
//
// An adapter is handed the key already opened by the platform, inside the server call, and keeps nothing: no key, no
// prompt and no answer is stored, logged or thrown. A failure says only what kind of failure it was.

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

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
  keyLooksRight(key: string): boolean;
  streamText(request: AdapterRequest, onDelta: (text: string) => void): Promise<AdapterResult>;
}

export const JSON_ONLY = 'Answer with one JSON object only, and nothing outside it.';

// The longest a vendor call may take before it is given up (and the next provider in the chain is tried).
export const CALL_TIMEOUT_MS = 60_000;
