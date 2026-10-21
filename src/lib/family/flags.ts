// Is a Family app module switched on (docs/family-app/10 §2; M1-5, C251)? Control's flag for the module and the whole
// app's kill switch (module '*') must both be on; a missing row is off. Read live on every request.
type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export async function familyModuleOn(db: Db, module: string): Promise<boolean> {
  const { rows } = await db.query(`select module, enabled, ends_at from control.app_flags where app = 'family' and module = any($1::text[])`, [['*', module]]);
  const on = (m: string) => rows.some((r) => r.module === m && r.enabled === true && (!r.ends_at || new Date(String(r.ends_at)) > new Date()));
  return on('*') && on(module);
}
