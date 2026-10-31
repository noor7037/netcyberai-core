import type { Sql } from '@/lib/jobs/types';
import { isUuid } from '@/lib/frameworks/custom-fields';

// Control → Audit Logs: the platform-wide audit trail, read only, newest first, 50 a page. The founder's role reads
// every school's rows (the platform role bypasses row security); the filters narrow by school, event, and day.

export const AUDIT_PAGE_SIZE = 50;
const PREVIEW_CHARS = 200; // how much of the after-state shows
const LONG_VALUE = 80; // a value longer than this is never shown in full: it may hold personal data

export type AuditQuery = { page: number; schoolId: string | null; action: string | null; from: string | null; to: string | null };
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

export function parseAuditQuery(params: URLSearchParams): { ok: true; query: AuditQuery } | { ok: false; code: 'page' | 'school' | 'action' | 'date' } {
  const rawPage = params.get('page');
  const page = rawPage === null || rawPage === '' ? 1 : Number(rawPage);
  if (!Number.isInteger(page) || page < 1 || page > 100_000) return { ok: false, code: 'page' };
  const schoolId = params.get('schoolId') || null;
  if (schoolId !== null && !isUuid(schoolId)) return { ok: false, code: 'school' };
  const action = params.get('action') || null;
  if (action !== null && action.length > 120) return { ok: false, code: 'action' };
  const from = params.get('from') || null;
  const to = params.get('to') || null;
  try {
    if ((from !== null && !validDay(from)) || (to !== null && !validDay(to))) return { ok: false, code: 'date' };
  } catch {
    return { ok: false, code: 'date' };
  }
  return { ok: true, query: { page, schoolId, action, from, to } };
}

// The after-state, shortened. A state holding any value longer than 80 characters (a name, an address, a free-text
// note) shows its keys only, so the trail never carries personal data in full on this screen.
export function previewState(state: unknown): { preview: string | null; keysOnly: boolean } {
  if (state === null || state === undefined) return { preview: null, keysOnly: false };
  const isObject = typeof state === 'object';
  const values = isObject ? (Array.isArray(state) ? state : Object.values(state as Record<string, unknown>)) : [state];
  const long = values.some((v) => (typeof v === 'string' ? v : JSON.stringify(v) ?? '').length > LONG_VALUE);
  if (long) {
    const keys = isObject && !Array.isArray(state) ? Object.keys(state as Record<string, unknown>).join(', ') : '';
    return { preview: keys.slice(0, PREVIEW_CHARS), keysOnly: true };
  }
  return { preview: (JSON.stringify(state) ?? '').slice(0, PREVIEW_CHARS), keysOnly: false };
}

export async function listAuditLogs(db: Sql, q: AuditQuery): Promise<{ rows: AuditRow[]; page: number; hasMore: boolean; schools: { id: string; name: string }[] }> {
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    args.push(v);
    where.push(sql.replace('?', `$${args.length}`));
  };
  if (q.schoolId) add('a.school_id = ?::uuid', q.schoolId);
  if (q.action) add('a.event_action = ?', q.action);
  if (q.from) add('a.occurred_at >= ?::date', q.from);
  if (q.to) add('a.occurred_at < (?::date + 1)', q.to);
  args.push(AUDIT_PAGE_SIZE + 1, (q.page - 1) * AUDIT_PAGE_SIZE);
  const { rows } = await db.query(
    `select a.audit_id::text as id, a.occurred_at, u.display_name as actor_name, a.school_id, s.name as school_name, a.event_action,
            a.target_type, a.target_id, a.after_state
       from audit_log a
       left join users u on u.user_id = a.actor_user_id
       left join schools s on s.school_id = a.school_id
      ${where.length ? `where ${where.join(' and ')}` : ''}
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
