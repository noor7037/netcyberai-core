import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';
import { validatePreset, type BoardPreset, type PresetProblem } from './scheme';

// Boards and their presets (docs/27 sections 3 and 5, C213). The presets are rows: CBSE and CISCE seeded from their
// official documents by the migration, a state board's added in Control from its circular. A preset is never
// changed; a new one replaces it. Each change is one person's, audited with who and when.
//
// A school's staff read boards and presets (row level security: every school role, read only). Control's functions
// run as the platform role.

export type Board = { boardId: string; name: string; presets: BoardPreset[] };
// Control sees every preset, the replaced ones too, and how many schools record each board.
export type ControlPreset = BoardPreset & { replacedBy: string | null; replacedAt: string | null };
export type ControlBoard = { boardId: string; name: string; addedBy: string | null; addedAt: string; schools: number; presets: ControlPreset[] };

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const day = (v: unknown): string => (v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}` : String(v).slice(0, 10));

const PRESET_COLUMNS = `p.preset_id, p.board_id, p.level, p.source_title, p.source_url, p.source_read_on::text as source_read_on, p.bands, p.pass_mark,
  p.components, p.co_scholastic, p.notes, p.replaces_preset_id, p.added_at, u.display_name as added_by_name`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function presetFromRow(r: any): BoardPreset {
  return {
    presetId: r.preset_id,
    boardId: r.board_id,
    level: r.level,
    sourceTitle: r.source_title,
    sourceUrl: r.source_url,
    sourceReadOn: day(r.source_read_on),
    bands: r.bands ?? [],
    passMark: num(r.pass_mark),
    components: r.components ?? [],
    coScholastic: r.co_scholastic ?? null,
    notes: r.notes ?? [],
    replacesPresetId: r.replaces_preset_id ?? null,
    addedBy: r.added_by_name ?? null,
    addedAt: iso(r.added_at),
  };
}

// The boards and the presets in use (not replaced), for the school's scheme screen.
export async function listBoards(db: Sql): Promise<Board[]> {
  const boards = (await db.query(`select board_id, name from boards order by lower(name), board_id`)).rows;
  const { rows } = await db.query(
    `select ${PRESET_COLUMNS}
       from board_presets p left join users u on u.user_id = p.added_by
      where not exists (select 1 from board_presets n where n.replaces_preset_id = p.preset_id)
      order by p.board_id, p.added_at, p.level`
  );
  const presets = rows.map(presetFromRow);
  return boards.map((b) => ({ boardId: b.board_id, name: b.name, presets: presets.filter((p) => p.boardId === b.board_id) }));
}

export async function loadPreset(db: Sql, presetId: string): Promise<BoardPreset | null> {
  const { rows } = await db.query(`select ${PRESET_COLUMNS} from board_presets p left join users u on u.user_id = p.added_by where p.preset_id = $1`, [presetId]);
  return rows[0] ? presetFromRow(rows[0]) : null;
}

// Control: every board, every preset with what replaced it, and how many schools record the board.
export async function controlBoards(db: Sql): Promise<ControlBoard[]> {
  const boards = (
    await db.query(
      `select b.board_id, b.name, b.added_at, u.display_name as added_by_name, (select count(*) from schools s where s.board_id = b.board_id) as schools
         from boards b left join users u on u.user_id = b.added_by order by lower(b.name), b.board_id`
    )
  ).rows;
  const { rows } = await db.query(
    `select ${PRESET_COLUMNS}, n.preset_id as replaced_by, n.added_at as replaced_at
       from board_presets p left join users u on u.user_id = p.added_by left join board_presets n on n.replaces_preset_id = p.preset_id
      order by p.board_id, p.added_at, p.level`
  );
  const presets = rows.map((r) => ({ ...presetFromRow(r), replacedBy: r.replaced_by ?? null, replacedAt: r.replaced_at ? iso(r.replaced_at) : null }));
  return boards.map((b) => ({ boardId: b.board_id, name: b.name, addedBy: b.added_by_name ?? null, addedAt: iso(b.added_at), schools: Number(b.schools), presets: presets.filter((p) => p.boardId === b.board_id) }));
}

type By = { userId: string };

// One insert inside a savepoint: a unique key the database refuses ('taken') leaves the transaction usable.
async function unlessTaken<T>(db: Sql, fn: () => Promise<T>): Promise<T | 'taken'> {
  await db.query('savepoint board_insert');
  try {
    const out = await fn();
    await db.query('release savepoint board_insert');
    return out;
  } catch (err) {
    await db.query('rollback to savepoint board_insert');
    if ((err as { code?: string }).code === '23505') return 'taken';
    throw err;
  }
}

export type BoardProblem = 'board_id' | 'name' | 'id_taken' | 'name_taken';
export async function addBoard(db: Sql, by: By, raw: { boardId: unknown; name: unknown }): Promise<{ ok: true; boardId: string } | { ok: false; reason: BoardProblem }> {
  const boardId = typeof raw.boardId === 'string' ? raw.boardId.trim() : '';
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(boardId)) return { ok: false, reason: 'board_id' };
  const name = typeof raw.name === 'string' ? raw.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 1 || name.length > 80) return { ok: false, reason: 'name' };
  if ((await db.query(`select 1 from boards where board_id = $1`, [boardId])).rows[0]) return { ok: false, reason: 'id_taken' };
  if ((await db.query(`select 1 from boards where lower(btrim(name)) = lower($1)`, [name])).rows[0]) return { ok: false, reason: 'name_taken' };
  // Someone adding the same board in the same moment: the database's unique keys refuse the second, said plainly.
  const added = await unlessTaken(db, () => db.query(`insert into boards (board_id, name, added_by) values ($1, $2, $3)`, [boardId, name, by.userId]));
  if (added === 'taken') return { ok: false, reason: (await db.query(`select 1 from boards where board_id = $1`, [boardId])).rows[0] ? 'id_taken' : 'name_taken' };
  await writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: 'board.added', targetType: 'boards', targetId: boardId, afterState: { board_id: boardId, name } });
  return { ok: true, boardId };
}

export type AddPresetProblem = PresetProblem | 'no_board' | 'replaced_already' | 'replaces_other_board';
// A new preset, or one that replaces a preset of the same board (which stays on record, marked replaced).
export async function addPreset(db: Sql, by: By, raw: Record<string, unknown>): Promise<{ ok: true; presetId: string } | { ok: false; reason: AddPresetProblem; at?: number }> {
  const v = validatePreset(raw);
  if (!v.ok) return { ok: false, reason: v.problem, ...(v.at === undefined ? {} : { at: v.at }) };
  const p = v.preset;
  if (!(await db.query(`select 1 from boards where board_id = $1`, [p.boardId])).rows[0]) return { ok: false, reason: 'no_board' };
  if (p.replacesPresetId) {
    // Two people replacing the same preset at once: the second insert is refused by the database (replaced once).
    const old = (await db.query(`select board_id, exists (select 1 from board_presets n where n.replaces_preset_id = p.preset_id) as replaced from board_presets p where p.preset_id = $1`, [p.replacesPresetId])).rows[0];
    if (!old) return { ok: false, reason: 'replaces' };
    if (old.board_id !== p.boardId) return { ok: false, reason: 'replaces_other_board' };
    if (old.replaced) return { ok: false, reason: 'replaced_already' };
  }
  const inserted = await unlessTaken(db, () =>
    db.query(
      `insert into board_presets (board_id, level, source_title, source_url, source_read_on, bands, pass_mark, components, co_scholastic, notes, replaces_preset_id, added_by)
       values ($1, $2, $3, $4, $5::date, $6::jsonb, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12)
       returning preset_id`,
      [p.boardId, p.level, p.sourceTitle, p.sourceUrl, p.sourceReadOn, JSON.stringify(p.bands), p.passMark, JSON.stringify(p.components), p.coScholastic ? JSON.stringify(p.coScholastic) : null, JSON.stringify(p.notes), p.replacesPresetId, by.userId]
    )
  );
  if (inserted === 'taken') return { ok: false, reason: 'replaced_already' }; // replaced by someone else in the same moment
  const presetId = inserted.rows[0].preset_id as string;
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: by.userId,
    actorRole: 'super_admin',
    eventAction: p.replacesPresetId ? 'board_preset.replaced' : 'board_preset.added',
    targetType: 'board_presets',
    targetId: presetId,
    beforeState: p.replacesPresetId ? { preset_id: p.replacesPresetId } : undefined,
    afterState: { board_id: p.boardId, level: p.level, source_title: p.sourceTitle, source_url: p.sourceUrl, source_read_on: p.sourceReadOn, bands: p.bands.length, pass_mark: p.passMark },
  });
  return { ok: true, presetId };
}

// The board a school records: NetCyberAI in Control (the platform role), or the school's principal or school admin
// on the scheme screen (their own school, by the session). The database refuses anyone else.
export async function setSchoolBoard(db: Sql, by: { userId: string; role: 'principal' | 'school_admin' | 'super_admin' }, schoolId: string, boardId: string | null): Promise<{ ok: true; changed: boolean } | { ok: false; reason: 'no_board' | 'not_found' }> {
  if (boardId !== null && !(await db.query(`select 1 from boards where board_id = $1`, [boardId])).rows[0]) return { ok: false, reason: 'no_board' };
  const before = (await db.query(`select board_id from schools where school_id = $1 for update`, [schoolId])).rows[0];
  if (!before) return { ok: false, reason: 'not_found' };
  if ((before.board_id ?? null) === boardId) return { ok: true, changed: false };
  await db.query(`update schools set board_id = $2 where school_id = $1`, [schoolId, boardId]);
  await writeAuditLog(db, { schoolId, actorUserId: by.userId, actorRole: by.role, eventAction: 'school.board_set', targetType: 'schools', targetId: schoolId, beforeState: { board_id: before.board_id ?? null }, afterState: { board_id: boardId } });
  return { ok: true, changed: true };
}

// A school's board as recorded, with who set it (a name the reader may see) and when.
export async function schoolBoard(db: Sql, schoolId: string): Promise<{ boardId: string | null; name: string | null; setBy: string | null; setAt: string | null } | null> {
  const { rows } = await db.query(
    `select s.board_id, b.name, u.display_name as set_by, s.board_set_at from schools s left join boards b on b.board_id = s.board_id left join users u on u.user_id = s.board_set_by where s.school_id = $1`,
    [schoolId]
  );
  const r = rows[0];
  return r ? { boardId: r.board_id ?? null, name: r.name ?? null, setBy: r.set_by ?? null, setAt: r.board_set_at ? iso(r.board_set_at) : null } : null;
}
