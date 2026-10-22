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

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

// The day's limit as Control set it, and the seconds this child has used today.
export async function voiceDay(db: Db, accountId: string, childId: string, day: string): Promise<{ limit: number; used: number; left: number }> {
  const { rows: s } = await db.query(`select value from control.settings where key = $1`, [VOICE_SECONDS_SETTING]);
  const v = Number(s[0]?.value);
  const limit = Math.max(0, Math.round(Number.isFinite(v) && v >= 0 ? v : 120));
  const { rows } = await db.query(`select voice_seconds from family.day_counts where account_id = $1 and child_id = $2 and day = $3`, [accountId, childId, day]);
  const used = Number(rows[0]?.voice_seconds ?? 0);
  return { limit, used, left: Math.max(0, limit - used) };
}

// Takes the seconds from the child's day if they fit under the limit (one statement, so two recordings at once cannot
// both take the last seconds); null when they do not.
export async function takeVoiceSeconds(db: Db, accountId: string, childId: string, day: string, seconds: number, limit: number): Promise<number | null> {
  const { rows } = await db.query(
    `insert into family.day_counts as d (account_id, child_id, day, voice_seconds) select $1, $2, $3, $5::int where $5::int <= $4::int
     on conflict (child_id, day) do update set voice_seconds = d.voice_seconds + $5::int where d.voice_seconds + $5::int <= $4::int
     returning voice_seconds`,
    [accountId, childId, day, limit, seconds]
  );
  return rows.length ? Number(rows[0].voice_seconds) : null;
}

export async function giveBackVoiceSeconds(db: Db, accountId: string, childId: string, day: string, seconds: number): Promise<void> {
  await db.query(`update family.day_counts set voice_seconds = greatest(voice_seconds - $4::int, 0) where account_id = $1 and child_id = $2 and day = $3`, [accountId, childId, day, seconds]);
}

export type AudioType ='audio/webm' | 'audio/ogg' | 'audio/mp4' | 'audio/wav';

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

// The fewest seconds a recording of this size can hold, so a phone that says "1 second" for a long recording is
// still charged for it: a WAV by its own byte rate; a compressed recording at 32 KB a second (256 kbps, more than any
// phone's voice recording uses), which never charges an honest recording more than its timer says.
export function leastSeconds(bytes: Uint8Array, type: AudioType): number {
  if (type === 'audio/wav' && bytes.length >= 44) {
    const rate = (bytes[28] | (bytes[29] << 8) | (bytes[30] << 16) | (bytes[31] << 24)) >>> 0;
    if (rate >= 1000) return Math.min(VOICE_MAX_SECONDS, Math.max(1, Math.ceil((bytes.length - 44) / rate)));
  }
  return Math.min(VOICE_MAX_SECONDS, Math.max(1, Math.ceil(bytes.length / 32_000)));
}

// The words as the child will see them: one line of plain text, at most 500 characters, with any number the
// 12-digit rule refuses (an Aadhaar-like number) taken out before it leaves the server.
export function cleanTranscript(text: string): string {
  const flat = text.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  const hidden = hideAadhaarNumbers(flat, '').replace(/\s+/g, ' ').trim();
  // Again after the cut: cutting a longer number short could leave twelve digits behind.
  return hideAadhaarNumbers(hidden.slice(0, VOICE_TEXT_MAX), '').replace(/\s+/g, ' ').trim();
}
