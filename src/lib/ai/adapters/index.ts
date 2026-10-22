import { anthropicAdapter } from './anthropic';
import { openaiAdapter } from './openai';
import { youtubeAdapter } from './youtube';
import type { AdapterResult, TextAdapter } from './types';

export type { AdapterRequest, AdapterResult, ChatMessage, TextAdapter } from './types';

// The stand-in: answers from the request alone and sends nothing anywhere, so the whole flow (profile, minors check,
// cap, metering) can be built and tested before any key exists. Like configuredProvider's stand-in in ../provider.ts
// it does not exist in a production build: adapterFor() never returns it there, whatever the database says.
export const STAND_IN_PROVIDER = 'stand-in';
export const standInAdapter: TextAdapter = {
  providerId: STAND_IN_PROVIDER,
  capability: 'text',
  minorsEligible: true,
  needsKey: false,
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

// Providers whose key Control → AI keeps: every text adapter, and the content adapters that are not text models (the
// video finder's YouTube, M2-5). A content adapter is never returned by adapterFor(), so no AI profile can choose it.
export type KeyedProvider = { providerId: string; capability: 'text' | 'video'; needsKey: boolean; keyLooksRight: (key: string) => boolean };
const CONTENT: readonly KeyedProvider[] = [youtubeAdapter];

export function keyedProviderFor(providerId: string, env: Record<string, string | undefined> = process.env): KeyedProvider | null {
  return adapterFor(providerId, env) ?? CONTENT.find((a) => a.providerId === providerId) ?? null;
}
