'use client';

// The call's realtime leg (W16-A4), a stub until a provider has a key. The server mints a short-lived token for the
// provider Control chose for `family.voice_call` (POST /api/family/voice/call/token); a built leg would open a live
// two-way voice straight to that provider with it, and the audio would never touch NetCyberAI's servers. Today no
// provider is chosen, so the token route answers 503 `not_switched_on` and this reports "not available": the call then
// uses the chain (listen, answer, speak sentence by sentence). Even with a token, the connecting half is not built, so it
// also reports "not available" and the chain keeps the call. Nothing is kept: the token is dropped when this returns.

export type RealtimeLeg = { available: false; reason: 'not_switched_on' | 'not_built' | 'failed' };

export async function openRealtimeLeg(): Promise<RealtimeLeg> {
  let res: Response;
  try {
    res = await fetch('/api/family/voice/call/token', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return { available: false, reason: 'failed' };
  }
  if (res.status === 503) {
    const error = (await res.json().catch(() => ({})))?.error;
    return { available: false, reason: error === 'not_switched_on' ? 'not_switched_on' : 'failed' };
  }
  await res.body?.cancel().catch(() => {});
  return { available: false, reason: res.ok ? 'not_built' : 'failed' };
}
