import { hideAadhaarNumbers } from '@/lib/privacy/aadhaar';

// Voice input (M2-7, C281): a child may speak a question in Study instead of typing it. The recording is read once by
// the family.voice_input profile (speech to text, a provider cleared for minors) and dropped: never stored, never
// logged. Only the words come back, to the question box, for the child to check and edit before asking. Needs the
// parent's voice_practice consent as well as study_core, and the voice_input module; capped in seconds a day per child
// (Control: family.voice_input_seconds_per_day, family.day_counts.voice_seconds).

export const VOICE_MAX_SECONDS = 30;
// About a megabyte: 30 seconds of the phone's compressed recording is far smaller; a 16 kHz WAV just fits.
export const VOICE_MAX_BYTES = 1_000_000;
export const VOICE_TEXT_MAX = 500;
export const VOICE_SECONDS_SETTING = 'family.voice_input_seconds_per_day';

export type AudioType = 'audio/webm' | 'audio/ogg' | 'audio/mp4' | 'audio/wav';

// The container by its own bytes, never by what the phone says it is: WebM (EBML), Ogg, MP4 (ftyp) or WAV (RIFF/WAVE).
export function sniffAudio(bytes: Uint8Array): AudioType | null {
  const at = (i: number, ...v: number[]) => bytes.length >= i + v.length && v.every((b, k) => bytes[i + k] === b);
  if (at(0, 0x1a, 0x45, 0xdf, 0xa3)) return 'audio/webm';
  if (at(0, 0x4f, 0x67, 0x67, 0x53)) return 'audio/ogg';
  if (at(4, 0x66, 0x74, 0x79, 0x70)) return 'audio/mp4';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x41, 0x56, 0x45)) return 'audio/wav';
  return null;
}

// The seconds counted against the day: the phone's own timer, rounded up, at least 1 and at most 30. A missing or
// strange value counts as the longest recording, so leaving it out never buys more time.
export function countedSeconds(duration: unknown): number {
  const d = typeof duration === 'number' && Number.isFinite(duration) ? Math.ceil(duration) : VOICE_MAX_SECONDS;
  return Math.min(VOICE_MAX_SECONDS, Math.max(1, d));
}

// The words as the child will see them: one line of plain text, at most 500 characters, with any number the
// 12-digit rule refuses (an Aadhaar-like number) taken out before it leaves the server.
export function cleanTranscript(text: string): string {
  const flat = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const hidden = hideAadhaarNumbers(flat, '').replace(/\s+/g, ' ').trim();
  // Again after the cut: cutting a longer number short could leave twelve digits behind.
  return hideAadhaarNumbers(hidden.slice(0, VOICE_TEXT_MAX), '').replace(/\s+/g, ' ').trim();
}
