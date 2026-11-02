import { UNCAPPED_LEFT, testingModeOn } from '@/lib/ai/daily-cap';
import { plusOpen } from './home-plan';

// W16-B4 (the proposal's M10): the tutor's use is metered per child per India day in three dimensions, each capped by
// the family's plan. Counts only, never a word a child said or read.
//   text turns     questions the tutor answered (the resolver)        family.day_counts.text_turns
//   voice minutes  the child's speaking time, a call or a question    family.day_counts.voice_seconds (seconds, shown as minutes)
//   photo doubts   a photo read for the child (homework, attachment)  family.day_counts.photo_questions
// The numbers are Control's (Control → Family): family.tutor.text_turns_per_day, family.tutor.voice_minutes_per_day and
// family.tutor.photo_doubts_per_day, read live. A family on Plus gets the base times family.plus.multiplier (3 unless
// Control sets another); Plus is whatever plusOpen() says it is today (the pilot's switch, no checkout before P3). No new
// billing: the plan only changes a multiplier.
// Until Control sets a new number, the older setting for the same thing still holds (the daily requests, the voice
// input seconds, the photo questions), so nothing a family had changes by this build; the built-in numbers below apply
// only where neither is set. Testing mode (C404) lifts every cap in the callers, as it does for the daily requests.

export const TEXT_TURNS_SETTING = 'family.tutor.text_turns_per_day';
export const VOICE_MINUTES_SETTING = 'family.tutor.voice_minutes_per_day';
export const PHOTO_DOUBTS_SETTING = 'family.tutor.photo_doubts_per_day';
export const PLUS_MULTIPLIER_SETTING = 'family.plus.multiplier';
const LEGACY_TEXT = 'family.ai.daily_requests';
const LEGACY_VOICE_SECONDS = 'family.voice_input_seconds_per_day';
const LEGACY_PHOTO = 'family.photo_questions_per_day';

export const DEFAULT_TEXT_TURNS = 40;
export const DEFAULT_VOICE_MINUTES = 20;
export const DEFAULT_PHOTO_DOUBTS = 5;
export const DEFAULT_PLUS_MULTIPLIER = 3;
export const CAP_MAX = 10_000;
export const MULTIPLIER_MAX = 20;

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type TutorCaps = { textTurns: number; voiceMinutes: number; photoDoubts: number };
export type TutorLimits = TutorCaps & { voiceSeconds: number; plus: boolean; multiplier: number };
export type TutorUse = { textTurns: number; voiceSeconds: number; photoDoubts: number };
export type TutorDay = { limits: TutorLimits; used: TutorUse; voiceMinutesUsed: number };

const KEYS = [TEXT_TURNS_SETTING, VOICE_MINUTES_SETTING, PHOTO_DOUBTS_SETTING, PLUS_MULTIPLIER_SETTING, LEGACY_TEXT, LEGACY_VOICE_SECONDS, LEGACY_PHOTO];
const whole = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= CAP_MAX * 60 ? Math.round(n) : null;
};

async function readSettings(db: Db): Promise<Map<string, unknown>> {
  const { rows } = await db.query(`select key, value from control.settings where key = any($1::text[])`, [KEYS]);
  return new Map(rows.map((r) => [String(r.key), r.value]));
}

type Base = TutorCaps & { voiceSeconds: number };

function baseOf(s: Map<string, unknown>): Base {
  const at = (k: string) => whole(s.get(k));
  const minutes = at(VOICE_MINUTES_SETTING);
  const legacySeconds = at(LEGACY_VOICE_SECONDS);
  // Voice is metered in seconds: the new minutes setting, else the older seconds one exactly, else the built-in minutes.
  const voiceSeconds = minutes !== null ? minutes * 60 : legacySeconds ?? DEFAULT_VOICE_MINUTES * 60;
  return {
    textTurns: at(TEXT_TURNS_SETTING) ?? at(LEGACY_TEXT) ?? DEFAULT_TEXT_TURNS,
    voiceMinutes: Math.ceil(voiceSeconds / 60),
    voiceSeconds,
    photoDoubts: at(PHOTO_DOUBTS_SETTING) ?? at(LEGACY_PHOTO) ?? DEFAULT_PHOTO_DOUBTS,
  };
}

// The base numbers (before the Plus multiplier) as Control sets them: the new setting, else the older one, else built in.
export async function tutorBaseCaps(db: Db): Promise<TutorCaps> {
  const { textTurns, voiceMinutes, photoDoubts } = baseOf(await readSettings(db));
  return { textTurns, voiceMinutes, photoDoubts };
}

// The multiplier as set, from 1 to MULTIPLIER_MAX; anything else reads as the default.
function multiplierOf(s: Map<string, unknown>): number {
  const v = s.get(PLUS_MULTIPLIER_SETTING);
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= MULTIPLIER_MAX ? v : DEFAULT_PLUS_MULTIPLIER;
}
export async function plusMultiplier(db: Db): Promise<number> {
  return multiplierOf(await readSettings(db));
}

// This family's limits today: the base, times the multiplier on Plus.
export async function tutorLimits(db: Db, accountId: string): Promise<TutorLimits> {
  const s = await readSettings(db);
  const base = baseOf(s);
  const plus = await plusOpen(db, accountId);
  // Testing mode (C404): every cap is lifted; the counters still count.
  if (await testingModeOn(db as never)) return { textTurns: UNCAPPED_LEFT, voiceMinutes: UNCAPPED_LEFT, photoDoubts: 1000, voiceSeconds: UNCAPPED_LEFT, plus, multiplier: plus ? multiplierOf(s) : 1 };
  const multiplier = plus ? multiplierOf(s) : 1;
  const voiceSeconds = Math.round(base.voiceSeconds * multiplier);
  return {
    textTurns: Math.round(base.textTurns * multiplier),
    voiceMinutes: Math.round(voiceSeconds / 60),
    photoDoubts: Math.round(base.photoDoubts * multiplier),
    voiceSeconds,
    plus,
    multiplier,
  };
}

export async function tutorUse(db: Db, accountId: string, childId: string, day: string): Promise<TutorUse> {
  const { rows } = await db.query(`select text_turns, voice_seconds, photo_questions from family.day_counts where account_id = $1 and child_id = $2 and day = $3`, [accountId, childId, day]);
  return { textTurns: Number(rows[0]?.text_turns ?? 0), voiceSeconds: Number(rows[0]?.voice_seconds ?? 0), photoDoubts: Number(rows[0]?.photo_questions ?? 0) };
}

// One child's day for the parent area ("7 of 40 questions, 3 of 20 voice minutes, 1 of 5 photos").
export async function tutorDay(db: Db, accountId: string, childId: string, day: string): Promise<TutorDay> {
  const [limits, used] = await Promise.all([tutorLimits(db, accountId), tutorUse(db, accountId, childId, day)]);
  return { limits, used, voiceMinutesUsed: Math.floor(used.voiceSeconds / 60) };
}

// One more text turn for this child today, if under the limit (one statement, so two questions at once cannot both take
// the last place). Testing mode counts without a limit.
export async function takeTextTurn(db: Db, accountId: string, childId: string, day: string, limit: number | null): Promise<boolean> {
  if (limit === null) {
    await db.query(
      `insert into family.day_counts as d (account_id, child_id, day, text_turns) values ($1, $2, $3, 1)
       on conflict (child_id, day) do update set text_turns = least(d.text_turns + 1, 100000)`,
      [accountId, childId, day]
    );
    return true;
  }
  const { rows } = await db.query(
    `insert into family.day_counts as d (account_id, child_id, day, text_turns) select $1, $2, $3, 1 where $4::int > 0
     on conflict (child_id, day) do update set text_turns = d.text_turns + 1 where d.text_turns < $4::int
     returning text_turns`,
    [accountId, childId, day, limit]
  );
  return rows.length === 1;
}

// The photo place and the voice seconds are taken where they always were (src/lib/family/tutor-read.ts, voice.ts); this is
// the limit they take against.
export async function photoDoubtLimit(db: Db, accountId: string): Promise<number> {
  return (await tutorLimits(db, accountId)).photoDoubts;
}
