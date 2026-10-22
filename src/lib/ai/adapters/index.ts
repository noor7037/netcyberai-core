import { anthropicAdapter } from './anthropic';
import { openaiAdapter, openaiSpeechAdapter } from './openai';
import type { AdapterResult, SpeechAdapter, SpeechResult, TextAdapter } from './types';

export type { AdapterRequest, AdapterResult, ChatImage, ChatMessage, SpeechAdapter, SpeechMediaType, SpeechResult, TextAdapter } from './types';

// The stand-in: answers from the request alone and sends nothing anywhere, so the whole flow (profile, minors check,
// cap, metering) can be built and tested before any key exists. Like configuredProvider's stand-in in ../provider.ts
// it does not exist in a production build: adapterFor() never returns it there, whatever the database says.
export const STAND_IN_PROVIDER = 'stand-in';
export const standInAdapter: TextAdapter = {
  providerId: STAND_IN_PROVIDER,
  capability: 'text',
  minorsEligible: true,
  needsKey: false,
  vision: true,
  keyLooksRight: () => false,
  async streamText(request, onDelta): Promise<AdapterResult> {
    const asked = request.messages.filter((m) => m.role === 'user').length;
    const text = request.responseFormat === 'json' ? JSON.stringify({ stand_in: true, model: request.model, questions: asked }) : `Stand-in answer (${asked} question${asked === 1 ? '' : 's'}).`;
    for (const piece of text.match(/[\s\S]{1,16}/g) ?? []) onDelta(piece);
    const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
    return { ok: true, text, tokensIn: words(request.system) + request.messages.reduce((n, m) => n + words(m.content), 0), tokensOut: words(text) };
  },
};

const REAL: readonly TextAdapter[] = [anthropicAdapter, openaiAdapter];

// The build's own NODE_ENV is checked as well as the one passed, so no caller can switch the stand-in on in production.
export function standInAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return process.env.NODE_ENV !== 'production' && env.NODE_ENV !== 'production' && env.AI_PLATFORM_STAND_IN === 'on';
}

// The adapter for a provider id, or null when the code has none (a provider Control lists but no adapter exists for
// yet cannot be used).
export function adapterFor(providerId: string, env: Record<string, string | undefined> = process.env): TextAdapter | null {
  if (providerId === STAND_IN_PROVIDER) return standInAllowed(env) ? standInAdapter : null;
  return REAL.find((a) => a.providerId === providerId) ?? null;
}

export function textAdapters(): readonly TextAdapter[] {
  return REAL;
}

// ---- speech to text (M2-7, C281) -----------------------------------------------------------------------------------

// The stand-in's ear: hears nothing and says a fixed sentence, so voice input can be built and shown without a key.
export const standInSpeechAdapter: SpeechAdapter = {
  providerId: STAND_IN_PROVIDER,
  capability: 'speech_to_text',
  minorsEligible: true,
  needsKey: false,
  async transcribe(request): Promise<SpeechResult> {
    return { ok: true, text: request.language === 'hi' ? 'प्रकाश संश्लेषण क्या है?' : 'What is photosynthesis?', tokensIn: 0, tokensOut: 0 };
  },
};

const REAL_SPEECH: readonly SpeechAdapter[] = [openaiSpeechAdapter];

// The speech adapter for a provider id, or null when the code has none (Anthropic has no speech to text).
export function speechAdapterFor(providerId: string, env: Record<string, string | undefined> = process.env): SpeechAdapter | null {
  if (providerId === STAND_IN_PROVIDER) return standInAllowed(env) ? standInSpeechAdapter : null;
  return REAL_SPEECH.find((a) => a.providerId === providerId) ?? null;
}
