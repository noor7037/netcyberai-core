import type { BulkActionDefinition } from '@/lib/contracts/bulk';
import type { Sql } from '@/lib/jobs/types';
import type { SchoolRole } from '@/lib/contracts/modules';
import { linkSiblings } from '@/lib/families/families';
import { isUuid } from './custom-fields';

// Every bulk action, in one registry (17 §1a, C112). An action works on
// ids already fixed at preview and always filters by school explicitly, so
// it is correct both inside a request (tenant context, RLS) and in the job
// runner (platform role, for large sets). A module adds its actions here
// when it is built. Students' "move to class" is the first.

export type BulkParams = Readonly<Record<string, string | number>>;
export type BulkActor = { userId: string; role: SchoolRole };
export type BulkApplyResult = { done: number; failures: { id: string; reason: string }[]; undo: unknown };

export type BulkAction = {
  def: BulkActionDefinition;
  checkParams(db: Sql, schoolId: string, params: unknown): Promise<{ ok: true; params: BulkParams } | { ok: false; error: string }>;
  preview(db: Sql, schoolId: string, ids: readonly string[], params: BulkParams): Promise<{ firstRows: { id: string; label: string; change: string }[]; warnings: string[] }>;
  // `actor`: who confirmed the run (also when a job runs it).
  apply(db: Sql, schoolId: string, ids: readonly string[], params: BulkParams, actor: BulkActor): Promise<BulkApplyResult>;
  // Restores what `apply` changed, only where nothing changed it since.
  undo?(db: Sql, schoolId: string, undo: unknown, params: BulkParams, actor: BulkActor): Promise<{ restored: number; skipped: number }>;
};

const PREVIEW_ROWS = 5;

const moveClass: BulkAction = {
  def: {
    actionId: 'students.move_class',
    moduleId: 'students',
    listId: 'students',
    label: 'Move to class',
    confirmTitle: 'Move students to another class',
    confirmBody: '{count} students will move to the class you chose. You can undo this for 10 minutes.',
    allowedRoles: ['principal', 'school_admin'],
    params: [{ key: 'classId', label: 'Class', type: 'select', optionsFrom: 'classes' }],
    destructive: false,
    undoWindowSeconds: 600,
    syncLimit: 200,
  },

  async checkParams(db, schoolId, params) {
    const classId = (params as Record<string, unknown> | null)?.classId;
    if (!isUuid(classId)) return { ok: false, error: 'choose a class' };
    const { rows } = await db.query(`select 1 from classes where school_id = $1 and class_id = $2`, [schoolId, classId]);
    return rows[0] ? { ok: true, params: { classId } } : { ok: false, error: 'class not found' };
  },

  async preview(db, schoolId, ids, params) {
    const { rows: target } = await db.query(`select name from classes where school_id = $1 and class_id = $2`, [schoolId, params.classId]);
    const { rows } = await db.query(
      `select s.student_id, s.name, c.name as class_name
       from students s left join classes c on c.school_id = s.school_id and c.class_id = s.class_id
       where s.school_id = $1 and s.student_id = any($2::uuid[]) and s.class_id is distinct from $3::uuid
       order by lower(s.name), s.student_id limit $4`,
      [schoolId, ids, params.classId, PREVIEW_ROWS]
    );
    const { rows: already } = await db.query(
      `select count(*)::int n from students where school_id = $1 and student_id = any($2::uuid[]) and class_id = $3`,
      [schoolId, ids, params.classId]
    );
    return {
      firstRows: rows.map((r) => ({ id: r.student_id, label: r.name, change: `${r.class_name ?? 'No class'} → ${target[0]?.name}` })),
      warnings: already[0].n ? [`${already[0].n} already in ${target[0]?.name}; they stay where they are.`] : [],
    };
  },

  async apply(db, schoolId, ids, params) {
    const { rows } = await db.query(
      `select student_id, class_id from students where school_id = $1 and student_id = any($2::uuid[]) for update`,
      [schoolId, ids]
    );
    const found = new Map(rows.map((r) => [r.student_id as string, r.class_id as string | null]));
    const failures = ids.filter((id) => !found.has(id)).map((id) => ({ id, reason: 'not found' }));
    const moving = [...found].filter(([, from]) => from !== params.classId);
    if (moving.length) {
      await db.query(`update students set class_id = $3, updated_at = now() where school_id = $1 and student_id = any($2::uuid[])`, [
        schoolId,
        moving.map(([id]) => id),
        params.classId,
      ]);
    }
    return { done: found.size, failures, undo: { ids: moving.map(([id]) => id), from: moving.map(([, from]) => from) } };
  },

  async undo(db, schoolId, undo, params) {
    const u = undo as { ids: string[]; from: (string | null)[] };
    if (!u?.ids?.length) return { restored: 0, skipped: 0 };
    const res = await db.query(
      `update students s set class_id = u.from_class, updated_at = now()
       from unnest($2::uuid[], $3::uuid[]) as u(id, from_class)
       where s.school_id = $1 and s.student_id = u.id and s.class_id = $4`,
      [schoolId, u.ids, u.from, params.classId]
    );
    const restored = res.rowCount ?? 0;
    return { restored, skipped: u.ids.length - restored };
  },
};

// "Link as siblings" (C116): the selected students become one family (the
// one some of them are already in, or a new one). Refused, for all of them,
// when they are already in different families. Undo puts each student back
// in the family they were in, where nobody changed it since.
const linkAsSiblings: BulkAction = {
  def: {
    actionId: 'students.link_siblings',
    moduleId: 'students',
    listId: 'students',
    label: 'Link as siblings',
    confirmTitle: 'Link these students as siblings',
    confirmBody: '{count} students will be one family. You can undo this for 10 minutes.',
    allowedRoles: ['principal', 'school_admin'],
    destructive: false,
    undoWindowSeconds: 600,
    syncLimit: 20,
    minRows: 2,
    maxRows: 20,
  },

  async checkParams() {
    return { ok: true, params: {} };
  },

  async preview(db, schoolId, ids) {
    const { rows } = await db.query(
      `select s.student_id, s.name, f.family_code from students s
       left join families f on f.school_id = s.school_id and f.family_id = s.family_id
       where s.school_id = $1 and s.student_id = any($2::uuid[]) order by lower(s.name), s.student_id`,
      [schoolId, ids]
    );
    const codes = [...new Set(rows.map((r) => r.family_code).filter(Boolean))];
    const joining = codes.length === 1 ? `family ${codes[0]}` : 'a new family';
    return {
      firstRows: rows.slice(0, PREVIEW_ROWS).map((r) => ({ id: r.student_id, label: r.name, change: r.family_code === codes[0] && codes.length === 1 ? `stays in ${codes[0]}` : `joins ${joining}` })),
      warnings: codes.length > 1 ? [`These students are in ${codes.length} different families (${codes.join(', ')}). Move them one at a time from the student page.`] : [],
    };
  },

  async apply(db, schoolId, ids, _params, actor) {
    const r = await linkSiblings(db, { schoolId, userId: actor.userId, role: actor.role }, [...ids]);
    if (!r.ok) return { done: 0, failures: ids.map((id) => ({ id, reason: r.error })), undo: null };
    return { done: ids.length, failures: [], undo: { familyId: r.familyId, ids: r.changed.map((c) => c.studentId), from: r.changed.map((c) => c.from) } };
  },

  async undo(db, schoolId, undo) {
    const u = undo as { familyId: string; ids: string[]; from: (string | null)[] } | null;
    if (!u?.ids?.length) return { restored: 0, skipped: 0 };
    const res = await db.query(
      `update students s set family_id = u.from_family, updated_at = now()
       from unnest($2::uuid[], $3::uuid[]) as u(id, from_family)
       where s.school_id = $1 and s.student_id = u.id and s.family_id = $4`,
      [schoolId, u.ids, u.from, u.familyId]
    );
    const restored = res.rowCount ?? 0;
    return { restored, skipped: u.ids.length - restored };
  },
};

export const BULK_ACTIONS: readonly BulkAction[] = [moveClass, linkAsSiblings];

export function bulkAction(actionId: unknown): BulkAction | null {
  return BULK_ACTIONS.find((a) => a.def.actionId === actionId) ?? null;
}
