// Whether NetCyberAI Focus is on the Play Store for everyone yet (C541). Until Control's setting family.focus_on_play is
// true, the parent area does not send parents to a Play page that does not exist; it says the app is coming soon. A
// phone that already has the app (a test install) still connects as before.
type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export const FOCUS_ON_PLAY_SETTING = 'family.focus_on_play';

export async function focusOnPlay(db: Db): Promise<boolean> {
  const { rows } = await db.query(`select value = 'true'::jsonb as on from control.settings where key = $1`, [FOCUS_ON_PLAY_SETTING]);
  return rows[0]?.on === true;
}
