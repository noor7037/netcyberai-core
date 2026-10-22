import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';
import type { ContentActor } from './library';

// Control → Content → Responses to review (M2-12, C286; docs/family-app/11 L1, 10 §4.3 and §6). The Concept Resolver
// keeps each complete topic response in content.responses as AI-made, and counts every serving of it from the library
// (content.count_response_ask, in src/lib/family/resolver.ts). Here a reviewer works through them, most asked first:
//   mark checked  status 'checked' with who and when; families then see "Checked by NetCyberAI"
//   withdraw      status 'withdrawn'; families stop seeing it, and the next ask makes a fresh one
// Run as the platform role in the request's own transaction, each change with its audit row. content.responses holds a
// syllabus topic's teaching blocks only: no child, no child's words (a typed question is never kept).

export type QueueStatus = 'ai_made' | 'checked';
export type QueueResponse = {
  responseId: string;
  board: string;
  classLevel: number;
  subject: string;
  topicKey: string;
  // The topic's (or chapter's) title in the newest published catalog version that has the key (else the newest); null when none has it.
  topicTitle: string | null;
  language: 'en' | 'hi';
  style: 'en' | 'hi' | 'hinglish';
  promptVersion: string;
  status: QueueStatus;
  asks: number;
  createdAt: string;
  ageDays: number;
  checkedAt: string | null;
  checkedByMe: boolean;
};
export type QueueResponseFull = QueueResponse & { blocks: unknown[]; provider: string; model: string };

export const QUEUE_LIMIT = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isResponseId = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v);

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

const SELECT = `
  select r.response_id, r.board_id, r.class_level, r.subject, r.topic_key, r.language, r.style, r.prompt_version, r.status, r.asks,
         r.created_at, r.checked_at, r.checked_by, r.provider, r.model,
         floor(extract(epoch from (now() - r.created_at)) / 86400)::int as age_days,
         coalesce(
           (select t.title_en from content.topics t join content.syllabus_versions v on v.version_id = t.version_id
             where t.topic_key = r.topic_key and v.board_id = r.board_id and v.class_level = r.class_level and v.subject = r.subject
             order by (v.status = 'published') desc, v.academic_year desc, v.version_no desc limit 1),
           (select c.title_en from content.chapters c join content.syllabus_versions v on v.version_id = c.version_id
             where c.chapter_key = r.topic_key and v.board_id = r.board_id and v.class_level = r.class_level and v.subject = r.subject
             order by (v.status = 'published') desc, v.academic_year desc, v.version_no desc limit 1)) as topic_title
    from content.responses r`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRow(r: any, actor: ContentActor): QueueResponse {
  return {
    responseId: r.response_id,
    board: r.board_id,
    classLevel: Number(r.class_level),
    subject: r.subject,
    topicKey: r.topic_key,
    topicTitle: r.topic_title ?? null,
    language: r.language,
    style: r.style,
    promptVersion: r.prompt_version,
    status: r.status,
    asks: Number(r.asks),
    createdAt: iso(r.created_at) ?? '',
    ageDays: Number(r.age_days),
    checkedAt: iso(r.checked_at),
    checkedByMe: r.checked_by != null && r.checked_by === actor.userId,
  };
}

// The queue: AI-made responses, most asked first, then the oldest. `checked` lists those already checked, newest
// check first, so one can still be withdrawn.
export async function listResponses(db: Sql, actor: ContentActor, status: QueueStatus = 'ai_made'): Promise<QueueResponse[]> {
  const order = status === 'ai_made' ? 'r.asks desc, r.created_at asc' : 'r.checked_at desc';
  const { rows } = await db.query(`${SELECT} where r.status = $1 order by ${order}, r.response_id limit ${QUEUE_LIMIT}`, [status]);
  return rows.map((r) => toRow(r, actor));
}

export async function getResponse(db: Sql, actor: ContentActor, responseId: string): Promise<QueueResponseFull | null> {
  const { rows } = await db.query(`${SELECT.replace('r.provider, r.model,', 'r.provider, r.model, r.blocks,')} where r.response_id = $1 and r.status <> 'withdrawn'`, [responseId]);
  const r = rows[0];
  if (!r) return null;
  return { ...toRow(r, actor), blocks: Array.isArray(r.blocks) ? r.blocks : [], provider: r.provider, model: r.model };
}

export type QueueRefusal = 'not_found' | 'not_ai_made' | 'withdrawn';
export type QueueResult = { ok: true; responseId: string } | { ok: false; reason: QueueRefusal };

async function lock(db: Sql, responseId: string): Promise<{ status: string; asks: number } | null> {
  const { rows } = await db.query(`select status, asks from content.responses where response_id = $1 for update`, [responseId]);
  return rows[0] ? { status: String(rows[0].status), asks: Number(rows[0].asks) } : null;
}

// Mark checked: a reviewer read it as the family sees it. Families' label becomes "Checked by NetCyberAI".
export async function markChecked(db: Sql, actor: ContentActor, responseId: string): Promise<QueueResult> {
  const r = await lock(db, responseId);
  if (!r) return { ok: false, reason: 'not_found' };
  if (r.status !== 'ai_made') return { ok: false, reason: r.status === 'withdrawn' ? 'withdrawn' : 'not_ai_made' };
  await db.query(`update content.responses set status = 'checked', checked_by = $2, checked_at = now() where response_id = $1`, [responseId, actor.userId]);
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: actor.userId,
    actorRole: 'super_admin',
    eventAction: 'content.response.checked',
    targetType: 'content_response',
    targetId: responseId,
    beforeState: { status: 'ai_made' },
    afterState: { status: 'checked', asks: r.asks },
  });
  return { ok: true, responseId };
}

// Withdraw: families stop seeing it at once (their read policy hides withdrawn responses), and the next ask for the
// topic makes a fresh one. A checked response can be withdrawn too; who checked it stays in the audit log (the table
// keeps checked_by only on a checked response).
export async function withdrawResponse(db: Sql, actor: ContentActor, responseId: string): Promise<QueueResult> {
  const r = await lock(db, responseId);
  if (!r) return { ok: false, reason: 'not_found' };
  if (r.status === 'withdrawn') return { ok: false, reason: 'withdrawn' };
  await db.query(`update content.responses set status = 'withdrawn', withdrawn_at = now(), checked_by = null, checked_at = null where response_id = $1`, [responseId]);
  await writeAuditLog(db, {
    schoolId: null,
    actorUserId: actor.userId,
    actorRole: 'super_admin',
    eventAction: 'content.response.withdrawn',
    targetType: 'content_response',
    targetId: responseId,
    beforeState: { status: r.status },
    afterState: { status: 'withdrawn', asks: r.asks },
  });
  return { ok: true, responseId };
}

// For Control's alerts (M2-11; 10 §6 "a review queue older than its target"): the age in days of the oldest AI-made
// response families have asked for at least once, against the target Control sets (control.alert.queue_days, 7 by
// default). `overdue` when it is older than the target.
export async function oldestQueueAgeDays(db: Sql): Promise<{ oldestDays: number | null; targetDays: number; overdue: boolean }> {
  const { rows } = await db.query(
    `select (select floor(extract(epoch from (now() - min(created_at))) / 86400)::int from content.responses where status = 'ai_made' and asks >= 1) as oldest,
            (select value from control.settings where key = 'control.alert.queue_days') as target`
  );
  const oldest = rows[0]?.oldest == null ? null : Number(rows[0].oldest);
  const raw = Number(rows[0]?.target);
  const targetDays = Number.isFinite(raw) && raw > 0 ? raw : 7;
  return { oldestDays: oldest, targetDays, overdue: oldest !== null && oldest > targetDays };
}
