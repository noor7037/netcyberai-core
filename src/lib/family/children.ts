import { isIndianState } from '@/lib/contracts/indian-states';

// A family's children (docs/family-app/03 §5; M1-2, C248). A child is a first name, class 6–10, the board (CBSE),
// the app's language (English or Hindi), the explanation style (English, Hindi or Hinglish) and the state, which the
// parent chooses: there is no default. Never a surname, a photo, a phone number or an Aadhaar number. The database
// holds the same rules (C247); these give the parent a plain answer first.

export const CHILD_CLASSES = [6, 7, 8, 9, 10] as const;
export const CHILD_LANGUAGES = ['en', 'hi'] as const;
export const CHILD_STYLES = ['en', 'hi', 'hinglish'] as const;
export const CHILD_BOARD = 'CBSE';
export const MAX_CHILDREN = 8;

export type ChildLanguage = (typeof CHILD_LANGUAGES)[number];
export type ChildStyle = (typeof CHILD_STYLES)[number];
export type FamilyChild = {
  childId: string;
  firstName: string;
  classLevel: number;
  board: string;
  language: ChildLanguage;
  style: ChildStyle;
  stateCode: string;
  freeSubject: 'mathematics' | 'science' | null;
};
export type ChildInput = Omit<FamilyChild, 'childId' | 'board' | 'freeSubject'>;
export type ChildProblem = 'first_name' | 'class' | 'language' | 'style' | 'state';

// One word of letters (any script, with its marks): no spaces, digits or symbols, so a surname, a phone number or an
// email cannot be typed into it.
const FIRST_NAME = /^[\p{L}\p{M}]{1,30}$/u;

export function checkChild(raw: unknown): { ok: true; child: ChildInput } | { ok: false; problems: ChildProblem[] } {
  const b = (raw ?? {}) as Record<string, unknown>;
  const problems: ChildProblem[] = [];
  const firstName = typeof b.firstName === 'string' ? b.firstName.trim().normalize('NFC') : '';
  if (!FIRST_NAME.test(firstName)) problems.push('first_name');
  const classLevel = Number(b.classLevel);
  if (!(CHILD_CLASSES as readonly number[]).includes(classLevel)) problems.push('class');
  if (!(CHILD_LANGUAGES as readonly unknown[]).includes(b.language)) problems.push('language');
  if (!(CHILD_STYLES as readonly unknown[]).includes(b.style)) problems.push('style');
  if (!isIndianState(b.stateCode)) problems.push('state');
  if (problems.length) return { ok: false, problems };
  return { ok: true, child: { firstName, classLevel, language: b.language as ChildLanguage, style: b.style as ChildStyle, stateCode: String(b.stateCode) } };
}

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> };

const toChild = (r: Record<string, unknown>): FamilyChild => ({
  childId: String(r.child_id),
  firstName: String(r.first_name),
  classLevel: Number(r.class_level),
  board: String(r.board_id),
  language: r.language as ChildLanguage,
  style: r.style as ChildStyle,
  stateCode: String(r.state_code),
  freeSubject: (r.free_subject as FamilyChild['freeSubject']) ?? null,
});

export async function listChildren(db: Db, accountId: string): Promise<FamilyChild[]> {
  const { rows } = await db.query(
    `select child_id, first_name, class_level, board_id, language, style, state_code, free_subject from family.children where account_id = $1 order by created_at, child_id`,
    [accountId]
  );
  return rows.map(toChild);
}

export async function addChild(db: Db, accountId: string, c: ChildInput): Promise<FamilyChild | 'too_many'> {
  const { rows: n } = await db.query(`select count(*)::int as n from family.children where account_id = $1`, [accountId]);
  if (Number(n[0]?.n) >= MAX_CHILDREN) return 'too_many';
  const { rows } = await db.query(
    `insert into family.children (account_id, first_name, class_level, board_id, language, style, state_code)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning child_id, first_name, class_level, board_id, language, style, state_code, free_subject`,
    [accountId, c.firstName, c.classLevel, CHILD_BOARD, c.language, c.style, c.stateCode]
  );
  return toChild(rows[0]);
}

export async function updateChild(db: Db, accountId: string, childId: string, c: ChildInput): Promise<FamilyChild | null> {
  const { rows } = await db.query(
    `update family.children set first_name = $3, class_level = $4, language = $5, style = $6, state_code = $7
      where account_id = $1 and child_id = $2
      returning child_id, first_name, class_level, board_id, language, style, state_code, free_subject`,
    [accountId, childId, c.firstName, c.classLevel, c.language, c.style, c.stateCode]
  );
  return rows[0] ? toChild(rows[0]) : null;
}

// Removing a child removes its answers and progress with it (the database cascades on the composite key).
export async function removeChild(db: Db, accountId: string, childId: string): Promise<boolean> {
  const res = await db.query(`delete from family.children where account_id = $1 and child_id = $2`, [accountId, childId]);
  return (res.rowCount ?? 0) > 0;
}

// The child using the app now: the one the switcher chose, if it is still this account's; otherwise the first.
export function activeChild(children: FamilyChild[], chosen: string | undefined): FamilyChild | null {
  return children.find((c) => c.childId === chosen) ?? children[0] ?? null;
}
