import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';

// Control → Boards, the family app's boards (C230-AP): the rows of content.boards a parent picks a child's board from
// and a syllabus is loaded under. They stay apart from the school exam boards (lib/exams/boards.ts), which carry grading
// presets; a family board carries none. NetCyberAI staff add one or correct its names; a board is never deleted, since
// children and syllabus versions point at it. A state board's own row is 'ST-' and the state's code, with its official
// name from its official documents. Each change is audited with who, when and the names before and after.

type By = { userId: string };

export type FamilyBoard = { boardId: string; nameEn: string; nameHi: string | null; versions: number };
export type FamilyBoardProblem = 'board_id' | 'name_en' | 'name_hi' | 'id_taken' | 'not_found';

export const FAMILY_BOARD_ID = /^[A-Z][A-Z0-9-]{1,15}$/;
const DEVANAGARI = /[ऀ-ॿ]/;

export async function listFamilyBoardsForControl(db: Sql): Promise<FamilyBoard[]> {
  const { rows } = await db.query(
    `select b.board_id, b.name_en, b.name_hi, (select count(*) from content.syllabus_versions v where v.board_id = b.board_id)::int as versions
       from content.boards b order by b.board_id`
  );
  return rows.map((r) => ({ boardId: String(r.board_id), nameEn: String(r.name_en), nameHi: r.name_hi === null ? null : String(r.name_hi), versions: Number(r.versions) }));
}

const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

function names(raw: { nameEn: unknown; nameHi: unknown }): { ok: true; nameEn: string; nameHi: string | null } | { ok: false; reason: FamilyBoardProblem } {
  const nameEn = clean(raw.nameEn);
  if (nameEn.length < 1 || nameEn.length > 120) return { ok: false, reason: 'name_en' };
  const hi = clean(raw.nameHi);
  // The Hindi name is optional (the app then shows the English one); when given it is written in Devanagari.
  if (hi && (hi.length > 120 || !DEVANAGARI.test(hi))) return { ok: false, reason: 'name_hi' };
  return { ok: true, nameEn, nameHi: hi || null };
}

export async function addFamilyBoard(db: Sql, by: By, raw: { boardId: unknown; nameEn: unknown; nameHi: unknown }): Promise<{ ok: true; boardId: string } | { ok: false; reason: FamilyBoardProblem }> {
  const boardId = clean(raw.boardId).toUpperCase();
  if (!FAMILY_BOARD_ID.test(boardId)) return { ok: false, reason: 'board_id' };
  const n = names(raw);
  if (!n.ok) return n;
  // Someone adding the same board in the same moment: on conflict nothing is written, and the second is told.
  const { rows } = await db.query(`insert into content.boards (board_id, name_en, name_hi) values ($1, $2, $3) on conflict (board_id) do nothing returning board_id`, [boardId, n.nameEn, n.nameHi]);
  if (!rows[0]) return { ok: false, reason: 'id_taken' };
  await writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: 'content.board_added', targetType: 'content.boards', targetId: boardId, afterState: { board_id: boardId, name_en: n.nameEn, name_hi: n.nameHi } });
  return { ok: true, boardId };
}

export async function renameFamilyBoard(db: Sql, by: By, raw: { boardId: unknown; nameEn: unknown; nameHi: unknown }): Promise<{ ok: true; changed: boolean } | { ok: false; reason: FamilyBoardProblem }> {
  const boardId = clean(raw.boardId);
  if (!FAMILY_BOARD_ID.test(boardId)) return { ok: false, reason: 'not_found' };
  const n = names(raw);
  if (!n.ok) return n;
  const before = (await db.query(`select name_en, name_hi from content.boards where board_id = $1 for update`, [boardId])).rows[0];
  if (!before) return { ok: false, reason: 'not_found' };
  if (before.name_en === n.nameEn && before.name_hi === n.nameHi) return { ok: true, changed: false };
  await db.query(`update content.boards set name_en = $2, name_hi = $3 where board_id = $1`, [boardId, n.nameEn, n.nameHi]);
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: 'content.board_renamed',
    targetType: 'content.boards',
    targetId: boardId,
    beforeState: { name_en: before.name_en, name_hi: before.name_hi },
    afterState: { name_en: n.nameEn, name_hi: n.nameHi },
  });
  return { ok: true, changed: true };
}
