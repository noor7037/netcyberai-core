import type { Sql } from '@/lib/jobs/types';

// Control → System Settings: a read-only register of the platform's own settings (control.settings), each with the
// Control screen that edits it. Nothing is edited here. A key that looks like a secret never leaves the database:
// its value is not read into the answer at all.

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
  'leads.auto_reply': '/control/leads',
  'content.pilot_scope': '/control/content',
};

const SECRET_LIKE = /key|secret|token|password/i;
export const looksSecret = (key: string) => SECRET_LIKE.test(key);
const VALUE_CHARS = 300;

export type SettingRow = { key: string; hidden: boolean; value: string | null; updatedAt: string | null; screen: string | null };

export async function listSystemSettings(db: Sql): Promise<SettingRow[]> {
  const { rows } = await db.query(`select key, value, updated_at from control.settings order by key`);
  return rows.map((r: Record<string, unknown>) => {
    const key = String(r.key);
    const hidden = looksSecret(key);
    return {
      key,
      hidden,
      value: hidden ? null : (JSON.stringify(r.value) ?? '').slice(0, VALUE_CHARS),
      updatedAt: r.updated_at ? new Date(r.updated_at as string | Date).toISOString() : null,
      screen: SETTING_SCREENS[key] ?? null,
    };
  });
}
