import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';

// The pilot scope (W12-D): which board, classes and subjects the first real school will use, kept as one platform
// setting (`content.pilot_scope` in control.settings) so Control → Content → Library coverage can show a unit as Pilot
// and filter to "Pilot only". It changes no behaviour of the library, the Family app or the AI: it only marks units.
// Empty by default (no board, no class, no subject): then nothing is in the pilot. Each part left empty means "any".
// Read and written the way `ai.testing_mode` is (src/lib/ai/control.ts): an upsert on control.settings by the platform
// role and one platform audit row per change, action `content.pilot_scope_changed`, with the before and after.

export const PILOT_SCOPE_SETTING = 'content.pilot_scope';
export const PILOT_SCOPE_ACTION = 'content.pilot_scope_changed';

export type PilotScope = { boardId: string | null; classLevels: number[]; subjects: string[] };
export const EMPTY_PILOT_SCOPE: PilotScope = { boardId: null, classLevels: [], subjects: [] };

const BOARD = /^[A-Z][A-Z0-9-]{1,15}$/;
const SUBJECT = /^[a-z][a-z_]{1,39}$/;
const MAX_SUBJECTS = 40;

export const pilotScopeIsEmpty = (s: PilotScope): boolean => s.boardId === null && s.classLevels.length === 0 && s.subjects.length === 0;

// Checks and tidies a value from the database or a request: classes 1–12 once each in order, subjects once each in order.
// Anything else is refused (null), never repaired into something the founder did not choose.
export function parsePilotScope(raw: unknown): PilotScope | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const board = o.boardId === undefined || o.boardId === null || o.boardId === '' ? null : o.boardId;
  if (board !== null && (typeof board !== 'string' || !BOARD.test(board))) return null;
  const classes = o.classLevels ?? [];
  const subjects = o.subjects ?? [];
  if (!Array.isArray(classes) || !Array.isArray(subjects) || classes.length > 12 || subjects.length > MAX_SUBJECTS) return null;
  if (!classes.every((c) => typeof c === 'number' && Number.isInteger(c) && c >= 1 && c <= 12)) return null;
  if (!subjects.every((s) => typeof s === 'string' && SUBJECT.test(s))) return null;
  return {
    boardId: board as string | null,
    classLevels: Array.from(new Set(classes as number[])).sort((a, b) => a - b),
    subjects: Array.from(new Set(subjects as string[])).sort(),
  };
}

// Is a unit inside the pilot? Never when no scope is set; otherwise every part that is set must match.
export function inPilot(scope: PilotScope, u: { boardId: string; classLevel: number; subject: string }): boolean {
  if (pilotScopeIsEmpty(scope)) return false;
  return (scope.boardId === null || scope.boardId === u.boardId) && (scope.classLevels.length === 0 || scope.classLevels.includes(u.classLevel)) && (scope.subjects.length === 0 || scope.subjects.includes(u.subject));
}

// "Pilot only": the units inside the scope. With no scope set it keeps none, so the filter cannot pass for "everything".
export const pilotOnly = <T extends { boardId: string; classLevel: number; subject: string }>(scope: PilotScope, units: T[]): T[] => units.filter((u) => inPilot(scope, u));

export async function readPilotScope(db: Sql): Promise<PilotScope> {
  const { rows } = await db.query(`select value from control.settings where key = $1`, [PILOT_SCOPE_SETTING]);
  return parsePilotScope(rows[0]?.value) ?? EMPTY_PILOT_SCOPE;
}

export async function writePilotScope(db: Sql, by: { userId: string }, scope: PilotScope): Promise<void> {
  const before = await readPilotScope(db);
  await db.query(
    `insert into control.settings (key, value, updated_by) values ($1, $2::jsonb, $3)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [PILOT_SCOPE_SETTING, JSON.stringify(scope), by.userId]
  );
  await writeAuditLog(db, { schoolId: null, actorUserId: by.userId, actorRole: 'super_admin', eventAction: PILOT_SCOPE_ACTION, targetType: 'content_pilot_scope', targetId: PILOT_SCOPE_SETTING, beforeState: { key: PILOT_SCOPE_SETTING, value: before }, afterState: { key: PILOT_SCOPE_SETTING, value: scope } });
}
