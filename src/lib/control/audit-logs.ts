import type { Sql } from '@/lib/jobs/types';
import { isUuid } from '@/lib/frameworks/custom-fields';
import { isPersonalKey } from '@/lib/audit/personal-words';

// Control → Audit Logs: the platform-wide audit trail, read only, newest first, 50 a page. The founder's role reads
// every school's rows (the platform role bypasses row security); the filters narrow by school, who did it (a part of
// their name), the start of the action, and day (W21-M6). A row's detail and the CSV export follow the same rule as
// the list: a value under a personal key (audit-pii's words) is never shown, and the export carries no state at all.

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_EXPORT_MAX = 5000;
const PREVIEW_CHARS = 200; // how much of the after-state shows
const LONG_VALUE = 80; // a value longer than this is never shown in full: it may hold personal data
const HIDDEN = '•••';

export type AuditQuery = { page: number; schoolId: string | null; actor: string | null; action: string | null; from: string | null; to: string | null };
export type AuditRow = {
  id: string;
  at: string;
  actorName: string | null;
  schoolId: string | null;
  schoolName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  // The after-state as a short JSON preview; or, when any value in it is long, only its keys.
  afterPreview: string | null;
  keysOnly: boolean;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (v: string) => DAY.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

export function parseAuditQuery(params: URLSearchParams): { ok: true; query: AuditQuery } | { ok: false; code: 'page' | 'school' | 'actor' | 'action' | 'date' } {
  const rawPage = params.get('page');
  const page = rawPage === null || rawPage === '' ? 1 : Number(rawPage);
  if (!Number.isInteger(page) || page < 1 || page > 100_000) return { ok: false, code: 'page' };
  const schoolId = params.get('schoolId') || null;
  if (schoolId !== null && !isUuid(schoolId)) return { ok: false, code: 'school' };
  const actor = params.get('actor')?.trim() || null;
  if (actor !== null && actor.length > 80) return { ok: false, code: 'actor' };
  const action = params.get('action')?.trim() || null;
  if (action !== null && action.length > 120) return { ok: false, code: 'action' };
  const from = params.get('from') || null;
  const to = params.get('to') || null;
  try {
    if ((from !== null && !validDay(from)) || (to !== null && !validDay(to))) return { ok: false, code: 'date' };
  } catch {
    return { ok: false, code: 'date' };
  }
  return { ok: true, query: { page, schoolId, actor, action, from, to } };
}

// A value under a personal key (a name, a phone, a note, a reason: audit-pii's words) is replaced, at any depth.
export function maskPersonal(state: unknown): unknown {
  if (Array.isArray(state)) return state.map(maskPersonal);
  if (state === null || typeof state !== 'object') return state;
  return Object.fromEntries(Object.entries(state as Record<string, unknown>).map(([k, v]) => [k, isPersonalKey(k) ? HIDDEN : maskPersonal(v)]));
}

// The state, shortened. A state holding any value longer than 80 characters (a name, an address, a free-text note)
// shows its keys only, and a value under a personal key is hidden, so the trail never carries personal data here.
export function previewState(raw: unknown): { preview: string | null; keysOnly: boolean } {
  if (raw === null || raw === undefined) return { preview: null, keysOnly: false };
  const state = maskPersonal(raw);
  const isObject = typeof state === 'object' && state !== null;
  // Long is judged on the values as written, so a long personal value still turns the preview into field names.
  const values = isObject ? (Array.isArray(raw) ? raw : Object.values(raw as Record<string, unknown>)) : [raw];
  const long = values.some((v) => (typeof v === 'string' ? v : JSON.stringify(v) ?? '').length > LONG_VALUE);
  if (long) {
    const keys = isObject && !Array.isArray(state) ? Object.keys(state as Record<string, unknown>).join(', ') : '';
    return { preview: keys.slice(0, PREVIEW_CHARS), keysOnly: true };
  }
  return { preview: (JSON.stringify(state) ?? '').slice(0, PREVIEW_CHARS), keysOnly: false };
}

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

function whereOf(q: AuditQuery): { where: string; args: unknown[] } {
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    args.push(v);
    where.push(sql.replace('?', `$${args.length}`));
  };
  if (q.schoolId) add('a.school_id = ?::uuid', q.schoolId);
  if (q.actor) add('u.display_name ilike ?', `%${escapeLike(q.actor)}%`);
  if (q.action) add('a.event_action like ?', `${escapeLike(q.action)}%`);
  if (q.from) add('a.occurred_at >= ?::date', q.from);
  if (q.to) add('a.occurred_at < (?::date + 1)', q.to);
  return { where: where.length ? `where ${where.join(' and ')}` : '', args };
}

const FROM = `from audit_log a
       left join users u on u.user_id = a.actor_user_id
       left join schools s on s.school_id = a.school_id`;

export async function listAuditLogs(db: Sql, q: AuditQuery): Promise<{ rows: AuditRow[]; page: number; hasMore: boolean; schools: { id: string; name: string }[] }> {
  const { where, args } = whereOf(q);
  args.push(AUDIT_PAGE_SIZE + 1, (q.page - 1) * AUDIT_PAGE_SIZE);
  const { rows } = await db.query(
    `select a.audit_id::text as id, a.occurred_at, u.display_name as actor_name, a.school_id, s.name as school_name, a.event_action,
            a.target_type, a.target_id, a.after_state
       ${FROM}
      ${where}
      order by a.occurred_at desc, a.audit_id desc
      limit $${args.length - 1} offset $${args.length}`,
    args
  );
  const out: AuditRow[] = rows.slice(0, AUDIT_PAGE_SIZE).map((r: Record<string, unknown>) => {
    const { preview, keysOnly } = previewState(r.after_state);
    return {
      id: String(r.id),
      at: new Date(r.occurred_at as string | Date).toISOString(),
      actorName: (r.actor_name as string | null) ?? null,
      schoolId: (r.school_id as string | null) ?? null,
      schoolName: (r.school_name as string | null) ?? null,
      action: String(r.event_action),
      targetType: (r.target_type as string | null) ?? null,
      targetId: (r.target_id as string | null) ?? null,
      afterPreview: preview,
      keysOnly,
    };
  });
  // The schools for the filter's choices.
  const schools = (await db.query(`select school_id as id, name from schools order by name`)).rows as { id: string; name: string }[];
  return { rows: out, page: q.page, hasMore: rows.length > AUDIT_PAGE_SIZE, schools };
}

// One row for the detail drawer: who, where, what, the actor's role, and both states as the list shows the after
// state (personal values hidden, a long value as its field names only).
type Preview = { preview: string | null; keysOnly: boolean };
export type AuditDetail = Omit<AuditRow, 'afterPreview' | 'keysOnly'> & { actorRole: string | null; before: Preview; after: Preview };
export async function auditDetail(db: Sql, id: string): Promise<AuditDetail | null> {
  if (!/^\d{1,18}$/.test(id)) return null;
  const r = (
    await db.query(
      `select a.audit_id::text as id, a.occurred_at, u.display_name as actor_name, a.actor_role::text as actor_role, a.school_id, s.name as school_name,
              a.event_action, a.target_type, a.target_id, a.before_state, a.after_state
         ${FROM} where a.audit_id = $1::bigint`,
      [id]
    )
  ).rows[0];
  if (!r) return null;
  return {
    id: String(r.id),
    at: new Date(r.occurred_at).toISOString(),
    actorName: r.actor_name ?? null,
    actorRole: r.actor_role ?? null,
    schoolId: r.school_id ?? null,
    schoolName: r.school_name ?? null,
    action: String(r.event_action),
    targetType: r.target_type ?? null,
    targetId: r.target_id ?? null,
    before: previewState(r.before_state),
    after: previewState(r.after_state),
  };
}

// RFC 4180 quoting; a cell that starts like a formula is prefixed so a spreadsheet never runs it.
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const csvOf = (rows: readonly (readonly unknown[])[]) => `${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;

// The filtered rows as CSV, newest first, at most AUDIT_EXPORT_MAX: id, time, action, who, their role, school, target.
// No before or after state: what a row changed stays on screen, where personal values are hidden.
export async function exportAuditCsv(db: Sql, q: AuditQuery): Promise<{ csv: string; rows: number; capped: boolean }> {
  const { where, args } = whereOf(q);
  args.push(AUDIT_EXPORT_MAX + 1);
  const { rows } = await db.query(
    `select a.audit_id::text as id, a.occurred_at, a.event_action, u.display_name as actor_name, a.actor_role::text as actor_role, s.name as school_name,
            a.target_type, a.target_id
       ${FROM} ${where}
      order by a.occurred_at desc, a.audit_id desc
      limit $${args.length}`,
    args
  );
  const kept = rows.slice(0, AUDIT_EXPORT_MAX) as Record<string, unknown>[];
  const body = kept.map((r) => [r.id, new Date(r.occurred_at as string).toISOString(), r.event_action, r.actor_name, r.actor_role, r.school_name ?? 'platform', r.target_type, r.target_id]);
  return { csv: csvOf([['audit_id', 'occurred_at', 'action', 'actor', 'actor_role', 'school', 'target_type', 'target_id'], ...body]), rows: kept.length, capped: rows.length > AUDIT_EXPORT_MAX };
}
