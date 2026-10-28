// The family's consent ledger (docs/family-app/03 §11; M1-2, C248), in the shape of the school's consent gate
// (src/lib/consent/gate.ts): append-only, a withdrawal is a new row, the latest row per purpose is its state, and no row
// means not granted. A purpose changes only by the parent's own tap: every caller is a route the parent posted to,
// and the route says so (`verification_method` 'parent_tap'). Nothing is processed before `study_core` is granted.

export const FAMILY_PURPOSES = ['study_core', 'school_link', 'opportunity_matching', 'photo_input', 'english_programme', 'voice_practice', 'offers'] as const;
export type FamilyPurpose = (typeof FAMILY_PURPOSES)[number];
// The purposes the app asks for now: study_core (M1), english_programme (the English course, C274), photo_input (the
// homework helper sends a child's photo to a provider, M2-6, C280; 03 §11) and voice_practice (a question spoken
// instead of typed, M2-7, C281; the English course's voice practice will use the same consent). The others arrive with
// their milestones. offers (C230-V): news and offers from NetCyberAI by email, optional, off until the parent turns it on;
// messages about the family's own account or plan need no consent, offers do.
export const ASKED_PURPOSES: readonly FamilyPurpose[] = ['study_core', 'english_programme', 'photo_input', 'voice_practice', 'offers'];
// The notice the parent read when tapping (its words are the fam.consent.* messages of this version). fam-notice-2
// (C230-V): the offers row joined the notice; a tap recorded with -1 was made before it existed. fam-notice-3 (C230-AP):
// photo_input no longer says "not kept", because files attached in the tutor stay until the parent clears them.
export const FAMILY_NOTICE_VERSION = 'fam-notice-3';
// A purpose whose words changed in a way that matters: a yes given on an older notice no longer counts, so the parent
// is asked again (the family.control_accounts function in the database holds the same rule).
export const PURPOSE_NOTICE_FROM: Partial<Record<FamilyPurpose, number>> = { photo_input: 3 };

const noticeNumber = (v: unknown): number => {
  const m = /^fam-notice-(\d+)$/.exec(String(v));
  return m ? Number(m[1]) : 0;
};
const yesStands = (purpose: FamilyPurpose, notice: unknown): boolean => noticeNumber(notice) >= (PURPOSE_NOTICE_FROM[purpose] ?? 0);

export const isFamilyPurpose = (v: unknown): v is FamilyPurpose => typeof v === 'string' && (FAMILY_PURPOSES as readonly string[]).includes(v);

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

const latestRows = (db: Db, accountId: string) =>
  db.query(`select distinct on (purpose) purpose, granted, notice_version from family.consents where account_id = $1 order by purpose, created_at desc`, [accountId]);

export async function consentState(db: Db, accountId: string): Promise<Record<FamilyPurpose, boolean>> {
  const { rows } = await latestRows(db, accountId);
  const state = Object.fromEntries(FAMILY_PURPOSES.map((p) => [p, false])) as Record<FamilyPurpose, boolean>;
  for (const r of rows) if (isFamilyPurpose(r.purpose)) state[r.purpose] = r.granted === true && yesStands(r.purpose, r.notice_version);
  return state;
}

// The purposes whose latest answer was yes on a notice that has since changed: off until the parent reads and agrees
// again, and the parent area says why.
export async function consentsToRenew(db: Db, accountId: string): Promise<FamilyPurpose[]> {
  const { rows } = await latestRows(db, accountId);
  return rows.filter((r) => isFamilyPurpose(r.purpose) && r.granted === true && !yesStands(r.purpose, r.notice_version)).map((r) => r.purpose as FamilyPurpose);
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
