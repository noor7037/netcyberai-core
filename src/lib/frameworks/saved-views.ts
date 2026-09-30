import { writeAuditLog } from '@/lib/audit/log';
import type { ListQuery, SavedView } from '@/lib/contracts/filters';
import { SCHOOL_ROLES, type SchoolRole } from '@/lib/contracts/modules';
import type { Sql } from '@/lib/jobs/types';
import { listDefinitions } from './custom-fields';
import { compileListQuery, type ListSpec } from './filter-engine';

// Saved views (17 §1a, C112): personal, or shared with the school (the
// principal and school admin manage those and may make one the default
// for some roles). A view's query is validated by the filter engine when
// saved, and again every time it runs. RLS enforces who sees and manages
// which view; these functions add the validation.

const MAX_PERSONAL_VIEWS_PER_LIST = 50;
const OFFICE: readonly SchoolRole[] = ['principal', 'school_admin'];

type Actor = { schoolId: string; userId: string; role: SchoolRole };
type Result<T> = { ok: true; value: T } | { ok: false; status: 400 | 403 | 404 | 409; error: string; errors?: unknown };

function toView(r: Record<string, any>): SavedView {
  return {
    viewId: r.view_id,
    listId: r.list_id,
    name: r.name,
    scope: r.scope,
    ownerUserId: r.owner_user_id,
    query: r.query,
    ...(r.default_for_roles?.length ? { defaultForRoles: r.default_for_roles } : {}),
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

async function validQuery(db: Sql, spec: ListSpec, schoolId: string, query: unknown): Promise<Result<ListQuery>> {
  const customFields = spec.customEntity ? await listDefinitions(db, schoolId, spec.customEntity) : [];
  const compiled = compileListQuery(spec, query, { schoolId, customFields });
  if (!compiled.ok) return { ok: false, status: 400, error: 'invalid list query', errors: compiled.errors };
  // A view stores the query, not a position in it.
  return { ok: true, value: compiled.compiled.query };
}

function validRoles(v: unknown): v is SchoolRole[] {
  return Array.isArray(v) && v.length <= SCHOOL_ROLES.length && v.every((r) => (SCHOOL_ROLES as readonly unknown[]).includes(r)) && new Set(v).size === v.length;
}

const COLUMNS = `view_id, list_id, name, scope, owner_user_id, query, default_for_roles, created_at, updated_at`;

export async function listViews(db: Sql, schoolId: string, listId: string): Promise<SavedView[]> {
  const { rows } = await db.query(
    `select ${COLUMNS} from saved_views where school_id = $1 and list_id = $2 order by scope desc, lower(name)`,
    [schoolId, listId]
  );
  return rows.map(toView);
}

export async function createView(db: Sql, actor: Actor, spec: ListSpec, body: Record<string, unknown>): Promise<Result<SavedView>> {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 80) return { ok: false, status: 400, error: 'name of 1 to 80 characters is required' };
  const scope = body.scope === 'school' ? 'school' : body.scope === 'personal' || body.scope === undefined ? 'personal' : null;
  if (!scope) return { ok: false, status: 400, error: 'scope must be personal or school' };
  if (scope === 'school' && !OFFICE.includes(actor.role)) return { ok: false, status: 403, error: 'only the principal and school admin share views with the school' };
  const roles = body.defaultForRoles ?? [];
  if (!validRoles(roles)) return { ok: false, status: 400, error: 'defaultForRoles must be school roles' };
  if (roles.length && scope !== 'school') return { ok: false, status: 400, error: 'only a school view can be a role default' };
  const q = await validQuery(db, spec, actor.schoolId, body.query ?? {});
  if (!q.ok) return q;

  if (scope === 'personal') {
    const { rows } = await db.query(
      `select count(*)::int n from saved_views where school_id = $1 and list_id = $2 and scope = 'personal' and owner_user_id = $3`,
      [actor.schoolId, spec.definition.listId, actor.userId]
    );
    if (rows[0].n >= MAX_PERSONAL_VIEWS_PER_LIST) return { ok: false, status: 400, error: `at most ${MAX_PERSONAL_VIEWS_PER_LIST} personal views per list` };
  }
  if (roles.length) await clearRoleDefaults(db, actor.schoolId, spec.definition.listId, roles);
  const { rows } = await db.query(
    `insert into saved_views (school_id, list_id, name, scope, owner_user_id, query, default_for_roles)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (school_id, list_id, scope, owner_user_id, lower(btrim(name))) do nothing
     returning ${COLUMNS}`,
    [actor.schoolId, spec.definition.listId, name, scope, actor.userId, JSON.stringify(q.value), roles]
  );
  if (!rows[0]) return { ok: false, status: 409, error: 'you already have a view with this name' };
  if (scope === 'school') await audit(db, actor, 'saved_view.created', rows[0].view_id);
  return { ok: true, value: toView(rows[0]) };
}

// One default view per role and list: making a view the default for a role
// takes it off any other view.
async function clearRoleDefaults(db: Sql, schoolId: string, listId: string, roles: SchoolRole[]) {
  await db.query(
    `update saved_views set default_for_roles = array(select unnest(default_for_roles) except select unnest($3::text[])), updated_at = now()
     where school_id = $1 and list_id = $2 and scope = 'school' and default_for_roles && $3::text[]`,
    [schoolId, listId, roles]
  );
}

export async function updateView(db: Sql, actor: Actor, spec: ListSpec, viewId: string, body: Record<string, unknown>): Promise<Result<SavedView>> {
  const allowed = new Set(['name', 'query', 'defaultForRoles']);
  if (Object.keys(body).some((k) => !allowed.has(k))) return { ok: false, status: 400, error: 'only name, query and defaultForRoles can change' };
  const { rows: cur } = await db.query(`select ${COLUMNS} from saved_views where school_id = $1 and view_id = $2`, [actor.schoolId, viewId]);
  if (!cur[0] || cur[0].list_id !== spec.definition.listId) return { ok: false, status: 404, error: 'view not found' };
  const view = cur[0];
  const mayManage = view.scope === 'personal' ? view.owner_user_id === actor.userId : OFFICE.includes(actor.role);
  if (!mayManage) return { ok: false, status: 403, error: 'you cannot change this view' };

  let name: string | null = null;
  if (body.name !== undefined) {
    name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 1 || name.length > 80) return { ok: false, status: 400, error: 'name of 1 to 80 characters' };
  }
  if (name !== null && name.toLowerCase() !== String(view.name).trim().toLowerCase()) {
    const { rows: dup } = await db.query(
      `select 1 from saved_views where school_id = $1 and list_id = $2 and scope = $3 and owner_user_id = $4 and lower(btrim(name)) = lower($5) and view_id <> $6`,
      [actor.schoolId, view.list_id, view.scope, view.owner_user_id, name, viewId]
    );
    if (dup[0]) return { ok: false, status: 409, error: 'a view with this name already exists' };
  }
  let query: ListQuery | null = null;
  if (body.query !== undefined) {
    const q = await validQuery(db, spec, actor.schoolId, body.query);
    if (!q.ok) return q;
    query = q.value;
  }
  let roles: SchoolRole[] | null = null;
  if (body.defaultForRoles !== undefined) {
    if (!validRoles(body.defaultForRoles)) return { ok: false, status: 400, error: 'defaultForRoles must be school roles' };
    if (body.defaultForRoles.length && view.scope !== 'school') return { ok: false, status: 400, error: 'only a school view can be a role default' };
    roles = body.defaultForRoles;
    if (roles.length) await clearRoleDefaults(db, actor.schoolId, spec.definition.listId, roles);
  }
  const { rows } = await db.query(
    `update saved_views set name = coalesce($3, name), query = coalesce($4::jsonb, query),
            default_for_roles = coalesce($5::text[], default_for_roles), updated_at = now()
     where school_id = $1 and view_id = $2 returning ${COLUMNS}`,
    [actor.schoolId, viewId, name, query ? JSON.stringify(query) : null, roles]
  );
  if (!rows[0]) return { ok: false, status: 404, error: 'view not found' };
  if (view.scope === 'school') await audit(db, actor, 'saved_view.changed', viewId);
  return { ok: true, value: toView(rows[0]) };
}

export async function deleteView(db: Sql, actor: Actor, viewId: string): Promise<Result<null>> {
  const { rows } = await db.query(`delete from saved_views where school_id = $1 and view_id = $2 returning scope`, [actor.schoolId, viewId]);
  if (!rows[0]) return { ok: false, status: 404, error: 'view not found' };
  if (rows[0].scope === 'school') await audit(db, actor, 'saved_view.deleted', viewId);
  return { ok: true, value: null };
}

async function audit(db: Sql, actor: Actor, eventAction: string, viewId: string) {
  await writeAuditLog(db, { schoolId: actor.schoolId, actorUserId: actor.userId, actorRole: actor.role, eventAction, targetType: 'saved_views', targetId: viewId });
}
