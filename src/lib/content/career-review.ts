import { writeAuditLog } from '@/lib/audit/log';
import { contentHash } from '@/lib/family/careers/hash';
import type { Sql } from '@/lib/family/careers/sql';
import type { CareerLevel, ReviewState } from '@/lib/family/careers/types';
import { dueForReview } from '@/lib/family/careers/visibility';

// Control queue for Career Hub. Approve does not look for a fetched source. The founder is the gate.
// Nothing is deleted. Staff only: this file lives outside the family module so it can write the audit log.

export type CareerQueueRow = {
  slug: string;
  fieldId: string;
  level: CareerLevel;
  titleEn: string;
  titleHi: string;
  summaryEn: string;
  summaryHi: string;
  officialUrl: string | null;
  reviewState: ReviewState;
  reviewDue: string;
  rejectReason: string | null;
};

const COLS = `slug, field_id, level, title_en, title_hi, summary_en, summary_hi, official_url, review_state, to_char(review_due, 'YYYY-MM-DD') as review_due, reject_reason`;

export async function listCareerQueue(db: Sql, filter: { state?: string; field?: string; level?: string; due?: boolean }, today: string): Promise<CareerQueueRow[]> {
  const { rows } = await db.query(`select ${COLS} from content.careers order by review_due, title_en`);
  let list = rows.map(queueOf);
  if (filter.state === 'pending' || filter.state === 'approved' || filter.state === 'rejected') list = list.filter((r) => r.reviewState === filter.state);
  if (filter.field) list = list.filter((r) => r.fieldId === filter.field);
  if (filter.level) list = list.filter((r) => r.level === filter.level);
  if (filter.due) {
    const due = new Set(dueForReview(list, today).map((r) => r.slug));
    list = list.filter((r) => due.has(r.slug));
  }
  return list;
}

function queueOf(r: Record<string, unknown>): CareerQueueRow {
  return {
    slug: String(r.slug),
    fieldId: String(r.field_id),
    level: r.level as CareerLevel,
    titleEn: String(r.title_en),
    titleHi: String(r.title_hi),
    summaryEn: String(r.summary_en),
    summaryHi: String(r.summary_hi),
    officialUrl: r.official_url ? String(r.official_url) : null,
    reviewState: r.review_state as ReviewState,
    reviewDue: String(r.review_due),
    rejectReason: r.reject_reason ? String(r.reject_reason) : null,
  };
}

const SLUG = /^[a-z0-9-]{1,80}$/;
const URL_OK = /^https:\/\/[^\s<>"]+$/;

export async function setCareerReview(db: Sql, actorId: string, slug: string, action: 'approve' | 'reject', reason?: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!SLUG.test(slug)) return { ok: false, reason: 'missing' };
  if (action === 'reject' && (!reason || reason.trim().length < 3 || /[<>]/.test(reason))) return { ok: false, reason: 'reason' };
  const before = await one(db, slug);
  if (!before) return { ok: false, reason: 'missing' };
  const state = action === 'approve' ? 'approved' : 'rejected';
  await db.query(
    `update content.careers set review_state=$2, reviewed_by=$3, reviewed_at=now(), reject_reason=$4, updated_by=$3, updated_at=now() where slug=$1`,
    [slug, state, actorId, action === 'reject' ? reason!.trim() : null],
  );
  const cascaded = action === 'approve' ? await cascadeCareer(db, actorId, slug, before.fieldId) : 0;
  await writeAuditLog(db, { schoolId: null, actorUserId: actorId, actorRole: 'super_admin', eventAction: action === 'approve' ? 'content.career_approved' : 'content.career_rejected', targetType: 'content.careers', targetId: slug, beforeState: { review_state: before.reviewState }, afterState: { review_state: state, rows: cascaded } });
  return { ok: true };
}

export type PendingCounts = {
  careers: number;
  fields: number;
  steps: number;
  actions: number;
  courses: number;
  crosses: number;
  laterals: number;
};

export async function countPending(db: Sql): Promise<PendingCounts> {
  const { rows } = await db.query(`select
    (select count(*)::int from content.careers where review_state='pending') as careers,
    (select count(*)::int from content.career_fields where review_state='pending') as fields,
    (select count(*)::int from content.career_steps where review_state='pending') as steps,
    (select count(*)::int from content.career_parallel_actions where review_state='pending' and type<>'certification') as actions,
    (select count(*)::int from content.career_parallel_actions where review_state='pending' and type='certification') as courses,
    (select count(*)::int from content.career_cross_pathways where review_state='pending') as crosses,
    (select count(*)::int from content.career_lateral_routes where review_state='pending') as laterals`);
  const r = rows[0] ?? {};
  return {
    careers: Number(r.careers ?? 0),
    fields: Number(r.fields ?? 0),
    steps: Number(r.steps ?? 0),
    actions: Number(r.actions ?? 0),
    courses: Number(r.courses ?? 0),
    crosses: Number(r.crosses ?? 0),
    laterals: Number(r.laterals ?? 0),
  };
}

async function approveWhere(db: Sql, actorId: string, sql: string): Promise<number> {
  const res = await db.query(sql, [actorId]);
  return Number(res.rowCount ?? 0);
}

export async function approveAllPending(db: Sql, actorId: string): Promise<PendingCounts> {
  const before = await countPending(db);
  const approved: PendingCounts = {
    fields: await approveWhere(db, actorId, `update content.career_fields set review_state='approved', reviewed_by=$1, reviewed_at=now(), updated_by=$1, updated_at=now() where review_state='pending'`),
    careers: await approveWhere(db, actorId, `update content.careers set review_state='approved', reviewed_by=$1, reviewed_at=now(), updated_by=$1, updated_at=now() where review_state='pending'`),
    steps: await approveWhere(db, actorId, `update content.career_steps set review_state='approved', reviewed_by=$1, reviewed_at=now(), updated_by=$1, updated_at=now() where review_state='pending'`),
    actions: await approveWhere(db, actorId, `update content.career_parallel_actions set review_state='approved', reviewed_by=$1, reviewed_at=now(), updated_by=$1, updated_at=now() where review_state='pending' and type<>'certification'`),
    courses: await approveWhere(db, actorId, `update content.career_parallel_actions set review_state='approved', reviewed_by=$1, reviewed_at=now(), updated_by=$1, updated_at=now() where review_state='pending' and type='certification'`),
    crosses: await approveWhere(db, actorId, `update content.career_cross_pathways set review_state='approved', reviewed_by=$1, reviewed_at=now(), updated_by=$1, updated_at=now() where review_state='pending'`),
    laterals: await approveWhere(db, actorId, `update content.career_lateral_routes set review_state='approved', reviewed_by=$1, reviewed_at=now(), updated_by=$1, updated_at=now() where review_state='pending'`),
  };
  await writeAuditLog(db, {
    schoolId: null, actorUserId: actorId, actorRole: 'super_admin', eventAction: 'content.career_approve_all', targetType: 'content.careers',
    beforeState: { careers: before.careers, fields: before.fields, steps: before.steps, actions: before.actions, courses: before.courses, crosses: before.crosses, laterals: before.laterals },
    afterState: { careers: approved.careers, fields: approved.fields, steps: approved.steps, actions: approved.actions, courses: approved.courses, crosses: approved.crosses, laterals: approved.laterals },
  });
  return approved;
}

async function approveArgs(db: Sql, sql: string, args: string[]): Promise<number> {
  const res = await db.query(sql, args);
  return Number(res.rowCount ?? 0);
}

async function cascadeCareer(db: Sql, actorId: string, slug: string, fieldId: string): Promise<number> {
  const parts = await Promise.all([
    approveArgs(db, `update content.career_fields set review_state='approved', reviewed_by=$1, reviewed_at=now(), updated_by=$1, updated_at=now() where field_id=$2 and review_state='pending'`, [actorId, fieldId]),
    approveArgs(db, `update content.career_steps set review_state='approved', reviewed_by=$1, reviewed_at=now(), updated_by=$1, updated_at=now() where career_id=(select career_id from content.careers where slug=$2) and review_state='pending'`, [actorId, slug]),
    approveArgs(db, `update content.career_parallel_actions set review_state='approved', reviewed_by=$1, reviewed_at=now(), updated_by=$1, updated_at=now() where career_id=(select career_id from content.careers where slug=$2) and review_state='pending'`, [actorId, slug]),
    approveArgs(db, `update content.career_cross_pathways set review_state='approved', reviewed_by=$1, reviewed_at=now(), updated_by=$1, updated_at=now() where $2 = any(to_slugs) and review_state='pending'`, [actorId, slug]),
    approveArgs(db, `update content.career_lateral_routes set review_state='approved', reviewed_by=$1, reviewed_at=now(), updated_by=$1, updated_at=now() where to_slug=$2 and review_state='pending'`, [actorId, slug]),
  ]);
  return parts.reduce((n, x) => n + x, 0);
}

export async function editCareerText(db: Sql, actorId: string, slug: string, patch: { titleEn: string; titleHi: string; summaryEn: string; summaryHi: string; officialUrl: string; reviewDue: string }): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!SLUG.test(slug)) return { ok: false, reason: 'missing' };
  const before = await one(db, slug);
  if (!before) return { ok: false, reason: 'missing' };
  const titleEn = patch.titleEn.trim();
  const titleHi = patch.titleHi.trim();
  const summaryEn = patch.summaryEn.trim();
  const summaryHi = patch.summaryHi.trim();
  const url = patch.officialUrl.trim();
  if (titleEn.length < 1 || titleEn.length > 160 || titleHi.length < 1 || titleHi.length > 160) return { ok: false, reason: 'title' };
  if (summaryEn.length < 1 || summaryEn.length > 800 || summaryHi.length < 1 || summaryHi.length > 800) return { ok: false, reason: 'summary' };
  if (/[<>]/.test(titleEn + titleHi + summaryEn + summaryHi)) return { ok: false, reason: 'text' };
  if (url && (url.length > 500 || !URL_OK.test(url))) return { ok: false, reason: 'url' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.reviewDue)) return { ok: false, reason: 'date' };
  const hash = contentHash({ edited: { titleEn, titleHi, summaryEn, summaryHi, url, reviewDue: patch.reviewDue } });
  await db.query(
    `update content.careers set title_en=$2, title_hi=$3, summary_en=$4, summary_hi=$5, official_url=$6, review_due=$7, content_hash=$8, updated_by=$9, updated_at=now() where slug=$1`,
    [slug, titleEn, titleHi, summaryEn, summaryHi, url || null, patch.reviewDue, hash, actorId],
  );
  await writeAuditLog(db, { schoolId: null, actorUserId: actorId, actorRole: 'super_admin', eventAction: 'content.career_edited', targetType: 'content.careers', targetId: slug, beforeState: { review_due: before.reviewDue }, afterState: { review_due: patch.reviewDue } });
  return { ok: true };
}

async function one(db: Sql, slug: string) {
  const r = (await db.query(`select ${COLS} from content.careers where slug=$1`, [slug])).rows[0];
  return r ? queueOf(r) : null;
}
