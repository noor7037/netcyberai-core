// The audio a voice adapter gets back (C386), read with a ceiling: a sentence of speech is tens of kilobytes, so an
// answer above VOICE_AUDIO_MAX, an empty one, or one that is JSON or text (a vendor's error sent with a 200) is not audio.
export const VOICE_AUDIO_MAX = 2_000_000;

export async function readAudio(res: Response): Promise<Uint8Array | null> {
  if (/json|text\//i.test(res.headers.get('content-type') ?? '')) {
    await res.body?.cancel().catch(() => {});
    return null;
  }
  try {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.length > 0 && buf.length <= VOICE_AUDIO_MAX ? buf : null;
  } catch {
    return null;
  }
}

// Base64 audio inside a JSON answer (Google's audioContent), with the same ceiling.
export function audioFromBase64(b64: unknown): Uint8Array | null {
  if (typeof b64 !== 'string' || b64.length === 0 || b64.length > Math.ceil((VOICE_AUDIO_MAX * 4) / 3) + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const buf = new Uint8Array(Buffer.from(b64, 'base64'));
  return buf.length > 0 ? buf : null;
}
