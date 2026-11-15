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
  await writeAuditLog(db, { schoolId: null, actorUserId: actorId, actorRole: 'super_admin', eventAction: action === 'approve' ? 'content.career_approved' : 'content.career_rejected', targetType: 'content.careers', targetId: slug, beforeState: before, afterState: { review_state: state } });
  return { ok: true };
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
  await writeAuditLog(db, { schoolId: null, actorUserId: actorId, actorRole: 'super_admin', eventAction: 'content.career_edited', targetType: 'content.careers', targetId: slug, beforeState: before, afterState: { title_en: titleEn, review_due: patch.reviewDue } });
  return { ok: true };
}

async function one(db: Sql, slug: string) {
  const r = (await db.query(`select ${COLS} from content.careers where slug=$1`, [slug])).rows[0];
  return r ? queueOf(r) : null;
}
