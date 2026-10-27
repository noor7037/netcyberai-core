import { INDIAN_STATES, isIndianState } from '@/lib/contracts/indian-states';
import { isStream, STREAM_FROM_CLASS, stageSubjects, type Stream, type Subject } from './subjects';

// A family's children (docs/family-app/03 §5; M1-2, C248). A child is a first name, the class, the board, the app's
// language (English or Hindi), the explanation style (English, Hindi or Hinglish) and the state, which the parent
// chooses: there is no default. Never a surname, a photo, a phone number or an Aadhaar number. The database holds the
// same rules (C247, C263); these give the parent a plain answer first.
//
// Wave A (C263): every class from Nursery to Class 12, and every board. Nursery, LKG and UKG are -2, -1 and 0.
// "Our state's board" (STATE) is read with the child's state: its syllabus is the state board's own (ST-<state>),
// loaded from that board's official documents; until it is, the child sees that the chapters are not in the app yet.

export const CHILD_CLASSES = [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export const PRE_PRIMARY_UPTO = 0;
export const CHILD_BOARDS = ['CBSE', 'CISCE', 'STATE', 'NIOS', 'IB', 'CAIE'] as const;
export const CHILD_LANGUAGES = ['en', 'hi'] as const;
export const CHILD_STYLES = ['en', 'hi', 'hinglish'] as const;
export const MAX_CHILDREN = 8;

export type ChildBoard = (typeof CHILD_BOARDS)[number];
export const isPrePrimary = (classLevel: number) => classLevel <= PRE_PRIMARY_UPTO;

// The board whose syllabus the child follows: the board itself, or for "our state's board" that state's own board.
export function syllabusBoardOf(child: { board: string; stateCode: string }): string {
  return child.board === 'STATE' ? `ST-${child.stateCode.slice(3)}` : child.board;
}

// The board as the AI request names it (English, never the child's details).
const BOARD_NAMES: Record<string, string> = { CBSE: 'CBSE', CISCE: 'CISCE (ICSE/ISC)', NIOS: 'NIOS', IB: 'IB', CAIE: 'Cambridge International' };
export function boardNameOf(child: { board: string; stateCode: string }): string {
  if (child.board === 'STATE') return `${INDIAN_STATES.find((s) => s.code === child.stateCode)?.name ?? 'the state'} state board`;
  return BOARD_NAMES[child.board] ?? child.board;
}

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
  freeSubject: Subject | null;
  // Classes 11 and 12 only (S4, C377); null while none is chosen.
  stream?: Stream | null;
};
export type ChildInput = Omit<FamilyChild, 'childId' | 'freeSubject'>;
export type ChildProblem = 'first_name' | 'class' | 'board' | 'language' | 'style' | 'state' | 'stream';

// A board the parent can pick: a row of content.boards (the table a child's board points at), never a state board's own
// syllabus row ('ST-…': that one is reached through "our state's board"). The list is read, not written here (S4).
export type BoardOption = { boardId: string; name: string };
export async function listFamilyBoards(db: Db, lang: 'en' | 'hi'): Promise<BoardOption[]> {
  const { rows } = await db.query(`select board_id, name_en, name_hi from content.boards where board_id !~ '^ST-' order by board_id`);
  return rows.map((r) => ({ boardId: String(r.board_id), name: lang === 'hi' && r.name_hi ? String(r.name_hi) : String(r.name_en) }));
}

// One word of letters (any script, with its marks): no spaces, digits or symbols, so a surname, a phone number or an
// email cannot be typed into it.
const FIRST_NAME = /^[\p{L}\p{M}]{1,30}$/u;

export async function boardIsOffered(db: Db, boardId: string): Promise<boolean> {
  return (await db.query(`select 1 from content.boards where board_id = $1 and board_id !~ '^ST-'`, [boardId])).rows.length > 0;
}

export function checkChild(raw: unknown, boards: readonly string[] | 'shape' = CHILD_BOARDS): { ok: true; child: ChildInput } | { ok: false; problems: ChildProblem[] } {
  const b = (raw ?? {}) as Record<string, unknown>;
  const problems: ChildProblem[] = [];
  const firstName = typeof b.firstName === 'string' ? b.firstName.trim().normalize('NFC') : '';
  if (!FIRST_NAME.test(firstName)) problems.push('first_name');
  // A class must be sent: an empty or missing value is not UKG (Number(null) and Number('') are both 0).
  const classLevel = typeof b.classLevel === 'number' || (typeof b.classLevel === 'string' && b.classLevel.trim() !== '') ? Number(b.classLevel) : NaN;
  if (!(CHILD_CLASSES as readonly number[]).includes(classLevel)) problems.push('class');
  // 'shape': the board is checked against the database's list by the caller (boardIsOffered), here only that it is an id.
  if (boards === 'shape' ? typeof b.board !== 'string' || !/^[A-Z][A-Z0-9-]{1,15}$/.test(b.board) : !(boards as readonly unknown[]).includes(b.board)) problems.push('board');
  if (!(CHILD_LANGUAGES as readonly unknown[]).includes(b.language)) problems.push('language');
  if (!(CHILD_STYLES as readonly unknown[]).includes(b.style)) problems.push('style');
  if (!isIndianState(b.stateCode)) problems.push('state');
  // A stream is for Classes 11 and 12 and optional there; below Class 11 any value sent is dropped.
  const hasStream = b.stream !== undefined && b.stream !== null && b.stream !== '';
  if (hasStream && classLevel >= STREAM_FROM_CLASS && !isStream(b.stream)) problems.push('stream');
  if (problems.length) return { ok: false, problems };
  const stream = hasStream && classLevel >= STREAM_FROM_CLASS ? (b.stream as Stream) : null;
  return { ok: true, child: { firstName, classLevel, board: String(b.board), language: b.language as ChildLanguage, style: b.style as ChildStyle, stateCode: String(b.stateCode), stream } };
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
  stream: isStream(r.stream) ? r.stream : null,
});

export async function listChildren(db: Db, accountId: string): Promise<FamilyChild[]> {
  const { rows } = await db.query(
    `select child_id, first_name, class_level, board_id, language, style, state_code, free_subject, stream from family.children where account_id = $1 order by created_at, child_id`,
    [accountId]
  );
  return rows.map(toChild);
}

export async function addChild(db: Db, accountId: string, c: ChildInput): Promise<FamilyChild | 'too_many'> {
  const { rows: n } = await db.query(`select count(*)::int as n from family.children where account_id = $1`, [accountId]);
  if (Number(n[0]?.n) >= MAX_CHILDREN) return 'too_many';
  const { rows } = await db.query(
    `insert into family.children (account_id, first_name, class_level, board_id, language, style, state_code, stream)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning child_id, first_name, class_level, board_id, language, style, state_code, free_subject, stream`,
    [accountId, c.firstName, c.classLevel, c.board, c.language, c.style, c.stateCode, c.stream ?? null]
  );
  return toChild(rows[0]);
}

export async function updateChild(db: Db, accountId: string, childId: string, c: ChildInput): Promise<FamilyChild | null> {
  const { rows } = await db.query(
    // A free subject the new class does not teach is let go (C264), so the child can claim one of their new subjects.
    `update family.children set first_name = $3, class_level = $4, language = $5, style = $6, state_code = $7, board_id = $8, stream = $10,
            free_subject = case when free_subject = any ($9::text[]) then free_subject end
      where account_id = $1 and child_id = $2
      returning child_id, first_name, class_level, board_id, language, style, state_code, free_subject, stream`,
    [accountId, childId, c.firstName, c.classLevel, c.language, c.style, c.stateCode, c.board, stageSubjects(c.classLevel, c.board, c.stream), c.stream ?? null]
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
