import type { Sql } from '@/lib/jobs/types';
import { writeAuditLog } from '@/lib/audit/log';
import { SPEND_ALERT_MAX_USD } from '@/lib/ai/gateway/upkeep';
import { TUTOR_CAP_MAX as CAP_MAX, TUTOR_MULTIPLIER_MAX as MULTIPLIER_MAX, VOICE_CHARS_MAX } from '@/lib/control/family-settings';

// Control → System Settings: the register of the platform's own settings (control.settings), each with the Control
// screen that owns it. W21-M6: the plain settings the code reads (a switch, a word or a number) are edited here as a
// form, each with its meaning and its range as the code that reads it accepts it; a value outside the range is
// refused, and every save needs a reason and writes one platform audit row with the value before and after. A list
// setting (subjects, the pilot scope) stays on its own screen. A key that looks like a secret never leaves the
// database: its value is not read into the answer at all, and it cannot be edited here.

// The screen that owns each key, found by following every `control.settings` read and write in src/lib. A key not
// listed here has no screen: it is set when the platform is set up, and read by the code that uses it.
export const SETTING_SCREENS: Readonly<Record<string, string>> = {
  'ai.testing_mode': '/control/ai',
  'ai.spend_alert_usd_per_day': '/control/ai',
  'family.ai.daily_requests': '/control/ai',
  'family.voice.daily_characters': '/control/family',
  'family.open_subjects': '/control/family',
  'family.reviewed_only_subjects': '/control/family',
  'family.plus_open': '/control/family',
  'family.tutor.text_turns_per_day': '/control/family',
  'family.tutor.voice_minutes_per_day': '/control/family',
  'family.tutor.photo_doubts_per_day': '/control/family',
  'family.plus.multiplier': '/control/family',
  'leads.auto_reply': '/control/leads',
  'content.pilot_scope': '/control/content',
};
// The email templates' own words (W21-M6) are edited on Control → Templates.
const screenOf = (key: string) => SETTING_SCREENS[key] ?? (key.startsWith('email.template.') ? '/control/templates' : null);

// What can be edited here: each key's kind and range, exactly as the code that reads it accepts a value (a value the
// reader would not take is refused here, so a save never silently does nothing).
export type EditableSetting =
  | { key: string; kind: 'switch'; on: unknown; off: unknown }
  | { key: string; kind: 'number'; min: number; max: number; whole: boolean };
export const EDITABLE_SETTINGS: readonly EditableSetting[] = [
  { key: 'ai.testing_mode', kind: 'switch', on: 'on', off: 'off' }, // src/lib/ai/daily-cap.ts
  { key: 'ai.spend_alert_usd_per_day', kind: 'number', min: 0, max: SPEND_ALERT_MAX_USD, whole: false }, // 0: off (upkeep.ts)
  { key: 'family.ai.daily_requests', kind: 'number', min: 0, max: 1000, whole: true }, // src/lib/ai/control.ts writeCap
  { key: 'family.voice.daily_characters', kind: 'number', min: 0, max: VOICE_CHARS_MAX, whole: true },
  { key: 'family.plus_open', kind: 'switch', on: true, off: false },
  { key: 'family.tutor.text_turns_per_day', kind: 'number', min: 0, max: CAP_MAX, whole: true },
  { key: 'family.tutor.voice_minutes_per_day', kind: 'number', min: 0, max: CAP_MAX, whole: true },
  { key: 'family.tutor.photo_doubts_per_day', kind: 'number', min: 0, max: CAP_MAX, whole: true },
  { key: 'family.plus.multiplier', kind: 'number', min: 1, max: MULTIPLIER_MAX, whole: false },
  { key: 'family.video_searches_per_day', kind: 'number', min: 0, max: 10_000, whole: true }, // src/lib/control/health.ts
  { key: 'leads.auto_reply', kind: 'switch', on: 'on', off: 'off' },
  { key: 'control.alert.queue_days', kind: 'number', min: 1, max: 365, whole: true }, // src/lib/content/response-queue.ts
  { key: 'control.alert.ai_failure_share', kind: 'number', min: 0, max: 1, whole: false },
  { key: 'control.alert.ai_min_requests', kind: 'number', min: 0, max: 100_000, whole: true },
  { key: 'control.alert.video_quota_share', kind: 'number', min: 0, max: 1, whole: false },
];
const editableByKey = new Map(EDITABLE_SETTINGS.map((s) => [s.key, s]));

const HIDDEN_WORDS = /key|secret|token|password/i;
export const looksSecret = (key: string) => HIDDEN_WORDS.test(key);
const VALUE_CHARS = 300;
export const SETTING_REASON_MIN = 3;
export const SETTING_REASON_MAX = 200;

export type SettingRow = {
  key: string;
  hidden: boolean;
  value: string | null;
  updatedAt: string | null;
  screen: string | null;
  // Set when the key can be edited here: its kind, its range, and the stored value in the form's shape.
  edit: { kind: 'switch'; current: boolean | null } | { kind: 'number'; min: number; max: number; whole: boolean; current: number | null } | null;
};

function editOf(spec: EditableSetting | undefined, stored: unknown, present: boolean): SettingRow['edit'] {
  if (!spec) return null;
  if (spec.kind === 'switch') return { kind: 'switch', current: !present ? null : stored === spec.on ? true : stored === spec.off ? false : null };
  // Some readers take a number written as a string ("7"), so the form reads it the same way.
  const n = typeof stored === 'number' ? stored : typeof stored === 'string' && /^\d+(\.\d+)?$/.test(stored) ? Number(stored) : NaN;
  return { kind: 'number', min: spec.min, max: spec.max, whole: spec.whole, current: present && Number.isFinite(n) ? n : null };
}

export async function listSystemSettings(db: Sql): Promise<SettingRow[]> {
  const { rows } = await db.query(`select key, value, updated_at from control.settings order by key`);
  const stored = new Map(rows.map((r: Record<string, unknown>) => [String(r.key), r]));
  const out: SettingRow[] = rows.map((r: Record<string, unknown>) => {
    const key = String(r.key);
    const hidden = looksSecret(key);
    return {
      key,
      hidden,
      value: hidden ? null : (JSON.stringify(r.value) ?? '').slice(0, VALUE_CHARS),
      updatedAt: r.updated_at ? new Date(r.updated_at as string | Date).toISOString() : null,
      screen: screenOf(key),
      edit: hidden ? null : editOf(editableByKey.get(key), r.value, true),
    };
  });
  // An editable key never set yet: the code uses its built-in value until it is.
  for (const spec of EDITABLE_SETTINGS) if (!stored.has(spec.key)) out.push({ key: spec.key, hidden: false, value: null, updatedAt: null, screen: screenOf(spec.key), edit: editOf(spec, null, false) });
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export type SaveSettingResult = { ok: true } | { ok: false; code: 'unknown_key' | 'bad_value' | 'reason_required' };

// One setting saved, with a reason: refused when the key is not editable here or the value is outside its range.
// One platform audit row, the value before and after, the founder's reason beside them (as Control → Apps does).
export async function saveSystemSetting(db: Sql, by: { userId: string }, raw: { key?: unknown; value?: unknown; reason?: unknown }): Promise<SaveSettingResult> {
  const spec = typeof raw.key === 'string' ? editableByKey.get(raw.key) : undefined;
  if (!spec || looksSecret(spec.key)) return { ok: false, code: 'unknown_key' };
  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  if (reason.length < SETTING_REASON_MIN || reason.length > SETTING_REASON_MAX) return { ok: false, code: 'reason_required' };
  let value: unknown;
  if (spec.kind === 'switch') {
    if (typeof raw.value !== 'boolean') return { ok: false, code: 'bad_value' };
    value = raw.value ? spec.on : spec.off;
  } else {
    const n = raw.value;
    if (typeof n !== 'number' || !Number.isFinite(n) || n < spec.min || n > spec.max || (spec.whole && !Number.isInteger(n))) return { ok: false, code: 'bad_value' };
    value = spec.whole ? n : Math.round(n * 100) / 100;
  }
  const before = (await db.query(`select value from control.settings where key = $1`, [spec.key])).rows[0]?.value ?? null;
  await db.query(
    `insert into control.settings (key, value, updated_by) values ($1, $2::jsonb, $3) on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [spec.key, JSON.stringify(value), by.userId]
  );
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: 'control.setting_changed',
    targetType: 'control.settings',
    targetId: spec.key,
    beforeState: { key: spec.key, value: before },
    afterState: { key: spec.key, value, change_reason: reason },
  });
  return { ok: true };
}
