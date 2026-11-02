import { openaiAdapter } from './openai';
import { realtimeInstructions } from './realtime-safety';
import { capabilities, type RealtimeAdapter, type RealtimeRequest, type RealtimeResult } from './types';

// OpenAI's realtime voice (W16-A4), the call's later leg. This adapter only mints the short-lived client secret the
// phone uses to open its own WebRTC session with OpenAI; no audio ever passes through this server. It is a stub in
// the sense that nothing sets it up today: `family.voice_call` has no provider in Control, and the route answers
// "not switched on" until the founder chooses one and a key exists. The same OpenAI key as the text adapter.
// Nothing here is stored, logged or thrown but the one case below.
const SESSIONS_URL = 'https://api.openai.com/v1/realtime/sessions';
const CONNECT_URL = 'https://api.openai.com/v1/realtime';
const OPENAI_REALTIME_MODEL = /^[a-z0-9][a-z0-9.-]{1,60}$/;
const MINT_TIMEOUT_MS = 8_000;
const VOICE = 'sage';
export const openaiRealtimeAdapter: RealtimeAdapter = {
  providerId: 'openai',
  capability: 'realtime',
  termsNote: 'no_under_13',
  needsKey: true,
  capabilities: capabilities(['realtime']),
  keyLooksRight: (key) => openaiAdapter.keyLooksRight(key),
  modelLooksRight: (model) => OPENAI_REALTIME_MODEL.test(model),
  async mintToken(request: RealtimeRequest): Promise<RealtimeResult> {
    // No key: this provider is not set up, and no token is ever minted for it.
    if (!request.apiKey) throw new Error('not_switched_on');
    if (!OPENAI_REALTIME_MODEL.test(request.model)) return { ok: false, failure: 'http', status: 400 };
    let res: Response;
    try {
      res = await fetch(SESSIONS_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${request.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: request.model, voice: VOICE, instructions: realtimeInstructions(request.language) }),
        redirect: 'error',
        signal: AbortSignal.timeout(MINT_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, failure: 'network' };
    }
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, failure: 'http', status: res.status };
    }
    const body = (await res.json().catch(() => null)) as { client_secret?: { value?: unknown; expires_at?: unknown } } | null;
    const token = body?.client_secret?.value;
    const expires = body?.client_secret?.expires_at;
    if (typeof token !== 'string' || !token) return { ok: false, failure: 'bad_stream' };
    // The vendor's expiry is in seconds since the epoch; a missing one is read as a minute from now.
    const expiresAt = typeof expires === 'number' && Number.isFinite(expires) ? expires * 1000 : Date.now() + 60_000;
    return { ok: true, token, expiresAt, url: CONNECT_URL, model: request.model };
  },
};
