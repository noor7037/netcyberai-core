import { writeAuditLog } from '@/lib/audit/log';
import type { SchoolRole } from '@/lib/contracts/modules';
import { isUuid } from '@/lib/frameworks/custom-fields';
import type { Sql } from '@/lib/jobs/types';
import { listBoards, loadPreset, schoolBoard, setSchoolBoard, type Board } from './boards';
import { validateScheme, type BoardPreset, type GradingScheme, type Problem } from './scheme';

// The school's grading scheme (docs/27 row 9a, C213). Saving makes a new version; the latest version is in force;
// nothing is overwritten. The principal and the school admin save it and record the school's board; the academic
// coordinator reads it. Runs in the caller's own tenant transaction: row level security holds the same rules.

export const SCHEME_EDITORS: readonly SchoolRole[] = ['principal', 'school_admin'];
export const SCHEME_READERS: readonly SchoolRole[] = ['principal', 'school_admin', 'academic_coordinator'];

export type Actor = { schoolId: string; userId: string; role: SchoolRole };

export type SchemeVersion = { version: number; scheme: GradingScheme; fromPresetId: string | null; madeBy: string | null; madeAt: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const versionFromRow = (r: any): SchemeVersion => ({ version: Number(r.version), scheme: r.scheme as GradingScheme, fromPresetId: r.from_preset_id ?? null, madeBy: r.made_by_name ?? null, madeAt: r.made_at instanceof Date ? r.made_at.toISOString() : String(r.made_at) });

// The scheme in force: the school's latest version, or null when it has none yet. What every grade is found by.
export async function schemeInForce(db: Sql, schoolId: string): Promise<SchemeVersion | null> {
  const { rows } = await db.query(
    `select g.version, g.scheme, g.from_preset_id, g.made_at, u.display_name as made_by_name
       from grading_schemes g left join users u on u.user_id = g.made_by
      where g.school_id = $1 order by g.version desc limit 1`,
    [schoolId]
  );
  return rows[0] ? versionFromRow(rows[0]) : null;
}

export type SchemeScreen = {
  board: { boardId: string | null; name: string | null; setBy: string | null; setAt: string | null };
  boards: Board[];
  current: (SchemeVersion & { fromPreset: (BoardPreset & { boardName: string | null; replaced: boolean }) | null }) | null;
  versions: { version: number; madeBy: string | null; madeAt: string; fromPresetId: string | null }[];
  mayEdit: boolean;
};

export async function schemeScreen(db: Sql, actor: Actor): Promise<SchemeScreen | null> {
  if (!SCHEME_READERS.includes(actor.role)) return null;
  const [board, boards, current, history] = [await schoolBoard(db, actor.schoolId), await listBoards(db), await schemeInForce(db, actor.schoolId), await db.query(
    `select g.version, g.from_preset_id, g.made_at, u.display_name as made_by_name
       from grading_schemes g left join users u on u.user_id = g.made_by
      where g.school_id = $1 order by g.version desc limit 50`,
    [actor.schoolId]
  )];
  // The preset a version started from, even if it has since been replaced: its notes still explain the gaps it copied.
  let fromPreset: NonNullable<SchemeScreen['current']>['fromPreset'] = null;
  if (current?.fromPresetId) {
    const p = await loadPreset(db, current.fromPresetId);
    if (p) {
      const replaced = (await db.query(`select 1 from board_presets where replaces_preset_id = $1`, [p.presetId])).rows.length > 0;
      fromPreset = { ...p, boardName: boards.find((b) => b.boardId === p.boardId)?.name ?? null, replaced };
    }
  }
  return {
    board: board ?? { boardId: null, name: null, setBy: null, setAt: null },
    boards,
    current: current ? { ...current, fromPreset } : null,
    versions: history.rows.map((r) => ({ version: Number(r.version), madeBy: r.made_by_name ?? null, madeAt: r.made_at instanceof Date ? r.made_at.toISOString() : String(r.made_at), fromPresetId: r.from_preset_id ?? null })),
    mayEdit: SCHEME_EDITORS.includes(actor.role),
  };
}

export type SaveProblem = 'not_allowed' | 'preset' | 'newer_version' | 'based_on' | Problem['code'];
export type SaveResult = { ok: true; version: number } | { ok: false; reason: SaveProblem; at?: number };

// Saves the scheme as the next version. `basedOn` is the version the person started from (0 for the first): if
// someone saved a newer one meanwhile, nothing is saved and the person is told, so no one's work is overwritten.
export async function saveScheme(db: Sql, actor: Actor, input: { scheme: unknown; fromPresetId: unknown; basedOn: unknown }): Promise<SaveResult> {
  if (!SCHEME_EDITORS.includes(actor.role)) return { ok: false, reason: 'not_allowed' };
  if (typeof input.basedOn !== 'number' || !Number.isInteger(input.basedOn) || input.basedOn < 0) return { ok: false, reason: 'based_on' };
  const checked = validateScheme(input.scheme);
  if (!checked.ok) return { ok: false, reason: checked.problem.code, ...(checked.problem.at === undefined ? {} : { at: checked.problem.at }) };
  const fromPresetId = input.fromPresetId === null || input.fromPresetId === undefined ? null : input.fromPresetId;
  if (fromPresetId !== null && (!isUuid(fromPresetId) || !(await db.query(`select 1 from board_presets where preset_id = $1`, [fromPresetId])).rows[0])) return { ok: false, reason: 'preset' };
  const latest = Number((await db.query(`select coalesce(max(version), 0) as v from grading_schemes where school_id = $1`, [actor.schoolId])).rows[0].v);
  if (latest !== input.basedOn) return { ok: false, reason: 'newer_version' };
  const version = latest + 1;
  // A savepoint, so a version saved by someone else in the same moment (the unique index) leaves this transaction usable.
  await db.query('savepoint grading_scheme_save');
  try {
    const { rows } = await db.query(
      `insert into grading_schemes (school_id, version, scheme, from_preset_id, made_by) values ($1, $2, $3::jsonb, $4, $5) returning scheme_id`,
      [actor.schoolId, version, JSON.stringify(checked.scheme), fromPresetId, actor.userId]
    );
    await db.query('release savepoint grading_scheme_save');
    await writeAuditLog(db, {
      schoolId: actor.schoolId,
      actorUserId: actor.userId,
      actorRole: actor.role,
      eventAction: 'grading_scheme.saved',
      targetType: 'grading_schemes',
      targetId: rows[0].scheme_id,
      afterState: { version, from_preset_id: fromPresetId, bands: checked.scheme.bands.length, pass_mark: checked.scheme.passMark, decimals: checked.scheme.decimals },
    });
    return { ok: true, version };
  } catch (err) {
    await db.query('rollback to savepoint grading_scheme_save');
    // Someone saved in the same moment: the unique index, or the trigger's "right after the latest one".
    const e = err as { code?: string; message?: string };
    if (e.code === '23505' || (e.code === '23514' && /right after the latest one/.test(e.message ?? ''))) return { ok: false, reason: 'newer_version' };
    throw err;
  }
}

// The principal or the school admin records the school's board from the scheme screen.
export async function setOwnBoard(db: Sql, actor: Actor, boardId: unknown) {
  if (actor.role !== 'principal' && actor.role !== 'school_admin') return { ok: false as const, reason: 'not_allowed' as const };
  if (boardId !== null && (typeof boardId !== 'string' || !/^[a-z][a-z0-9-]{1,39}$/.test(boardId))) return { ok: false as const, reason: 'no_board' as const };
  return setSchoolBoard(db, { userId: actor.userId, role: actor.role }, actor.schoolId, boardId);
}
