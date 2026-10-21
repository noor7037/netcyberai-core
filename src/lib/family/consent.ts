// The family's consent ledger (docs/family-app/03 §11; M1-2, C248), in the shape of the school's consent gate
// (src/lib/consent/gate.ts): append-only, a withdrawal is a new row, the latest row per purpose is its state, and no row
// means not granted. A purpose changes only by the parent's own tap: every caller is a route the parent posted to,
// and the route says so (`verification_method` 'parent_tap'). Nothing is processed before `study_core` is granted.

export const FAMILY_PURPOSES = ['study_core', 'school_link', 'opportunity_matching', 'photo_input', 'english_programme', 'voice_practice'] as const;
export type FamilyPurpose = (typeof FAMILY_PURPOSES)[number];
// The purposes the app asks for now: study_core (M1) and english_programme (the English course, C274). The others
// arrive with their milestones (voice_practice with E-9).
export const ASKED_PURPOSES: readonly FamilyPurpose[] = ['study_core', 'english_programme'];
// The notice the parent read when tapping (its words are the fam.consent.* messages of this version).
export const FAMILY_NOTICE_VERSION = 'fam-notice-1';

export const isFamilyPurpose = (v: unknown): v is FamilyPurpose => typeof v === 'string' && (FAMILY_PURPOSES as readonly string[]).includes(v);

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export async function consentState(db: Db, accountId: string): Promise<Record<FamilyPurpose, boolean>> {
  const { rows } = await db.query(
    `select distinct on (purpose) purpose, granted from family.consents where account_id = $1 order by purpose, created_at desc`,
    [accountId]
  );
  const state = Object.fromEntries(FAMILY_PURPOSES.map((p) => [p, false])) as Record<FamilyPurpose, boolean>;
  for (const r of rows) if (isFamilyPurpose(r.purpose)) state[r.purpose] = r.granted === true;
  return state;
}

export async function recordParentTap(db: Db, accountId: string, purpose: FamilyPurpose, granted: boolean): Promise<void> {
  await db.query(
    `insert into family.consents (account_id, purpose, granted, verification_method, notice_version) values ($1, $2, $3, 'parent_tap', $4)`,
    [accountId, purpose, granted, FAMILY_NOTICE_VERSION]
  );
}

export async function consentHistory(db: Db, accountId: string): Promise<{ purpose: FamilyPurpose; granted: boolean; at: string }[]> {
  const { rows } = await db.query(`select purpose, granted, created_at from family.consents where account_id = $1 order by created_at desc limit 50`, [accountId]);
  return rows.filter((r) => isFamilyPurpose(r.purpose)).map((r) => ({ purpose: r.purpose as FamilyPurpose, granted: r.granted === true, at: new Date(String(r.created_at)).toISOString() }));
}
