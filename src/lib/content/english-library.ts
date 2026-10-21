import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';
import type { ContentActor, ReviewResult, VersionAudience, VersionStatus } from './library';

// Control → Content for the English course (docs/family-app/12 §11, C274; slice E-7): the same review as syllabus
// versions (src/lib/content/library.ts), one course version per track. A version is loaded from the lesson files a pull
// request committed (scripts/content/english-sql.ts), approved by a super_admin to staff preview, then released to
// everyone; the version everyone had is superseded; one step rolls back. Run as the platform role in the request's own
// transaction, so every change and its audit row are written together. content.* holds the course only: no child.

export type EnglishControlVersion = {
  versionId: string;
  track: 'a' | 'b' | 'c' | 'd';
  versionNo: number;
  status: VersionStatus;
  audience: VersionAudience;
  importRef: string | null;
  importedAt: string;
  approvedAt: string | null;
  releasedAt: string | null;
  reviewNote: string | null;
  units: number;
  lessons: number;
  canRollBack: boolean;
};

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));
const AUDIT = (actor: ContentActor, eventAction: string, versionId: string, afterState: Record<string, unknown>) => ({
  schoolId: null,
  actorUserId: actor.userId,
  actorRole: 'super_admin' as const,
  eventAction,
  targetType: 'content_english_version',
  targetId: versionId,
  afterState,
});

export async function listEnglishVersions(db: Sql): Promise<EnglishControlVersion[]> {
  const { rows } = await db.query(
    `select v.version_id, v.track, v.version_no, v.status, v.audience, v.import_ref, v.imported_at, v.approved_at, v.released_at, v.review_note,
            (select count(*) from content.english_units u where u.version_id = v.version_id)::int as units,
            (select count(*) from content.english_lessons l where l.version_id = v.version_id)::int as lessons,
            (v.status = 'published' and v.audience = 'everyone' and exists (
               select 1 from content.english_versions p where p.track = v.track and p.status = 'superseded' and p.released_at is not null and p.version_id <> v.version_id)) as can_roll_back
       from content.english_versions v
      order by v.track, v.version_no desc`
  );
  return rows.map((r: Record<string, unknown>) => ({
    versionId: String(r.version_id),
    track: r.track as EnglishControlVersion['track'],
    versionNo: Number(r.version_no),
    status: r.status as VersionStatus,
    audience: (r.audience as VersionAudience) ?? null,
    importRef: (r.import_ref as string | null) ?? null,
    importedAt: iso(r.imported_at) as string,
    approvedAt: iso(r.approved_at),
    releasedAt: iso(r.released_at),
    reviewNote: (r.review_note as string | null) ?? null,
    units: Number(r.units),
    lessons: Number(r.lessons),
    canRollBack: r.can_roll_back === true,
  }));
}

// The staff preview: every unit with its can-do statement and every lesson's whole body, as the lesson file holds it.
export async function previewEnglishVersion(db: Sql, versionId: string) {
  const units = (
    await db.query(`select unit_key, position, title_en, title_hi, can_do_en, can_do_hi, pic from content.english_units where version_id = $1 order by position`, [versionId])
  ).rows as Record<string, unknown>[];
  if (!units.length) return null;
  const lessons = (await db.query(`select lesson_key, unit_key, position, body from content.english_lessons where version_id = $1 order by unit_key, position`, [versionId])).rows as Record<string, unknown>[];
  return units.map((u) => ({
    key: String(u.unit_key),
    position: Number(u.position),
    titleEn: String(u.title_en),
    titleHi: String(u.title_hi),
    canDoEn: String(u.can_do_en),
    canDoHi: String(u.can_do_hi),
    pic: String(u.pic),
    lessons: lessons.filter((l) => l.unit_key === u.unit_key).map((l) => l.body),
  }));
}

type Locked = { version_id: string; track: string; status: VersionStatus; audience: VersionAudience; imported_by: string | null };
async function lockVersion(db: Sql, versionId: string): Promise<Locked | null> {
  const head = (await db.query(`select track from content.english_versions where version_id = $1`, [versionId])).rows[0] as { track: string } | undefined;
  if (!head) return null;
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`content:english:${head.track}`]);
  return ((await db.query(`select version_id, track, status, audience, imported_by from content.english_versions where version_id = $1 for update`, [versionId])).rows[0] as Locked) ?? null;
}

export async function approveEnglishVersion(db: Sql, actor: ContentActor, versionId: string): Promise<ReviewResult> {
  const v = await lockVersion(db, versionId);
  if (!v) return { ok: false, reason: 'not_found' };
  if (v.status !== 'in_review') return { ok: false, reason: 'not_in_review' };
  if (v.imported_by !== null && v.imported_by === actor.userId) return { ok: false, reason: 'own_import' };
  await db.query(`update content.english_versions set status = 'superseded', audience = null, ended_at = now() where track = $1 and status = 'published' and audience = 'staff_preview'`, [v.track]);
  await db.query(`update content.english_versions set status = 'published', audience = 'staff_preview', approved_by = $2, approved_at = now() where version_id = $1`, [versionId, actor.userId]);
  await writeAuditLog(db, AUDIT(actor, 'content.english.approved', versionId, { audience: 'staff_preview' }));
  return { ok: true, versionId };
}

export async function rejectEnglishVersion(db: Sql, actor: ContentActor, versionId: string, note: string): Promise<ReviewResult> {
  const text = typeof note === 'string' ? note.trim() : '';
  if (text.length < 1 || text.length > 1000) return { ok: false, reason: 'note_needed' };
  const v = await lockVersion(db, versionId);
  if (!v) return { ok: false, reason: 'not_found' };
  if (v.status !== 'in_review') return { ok: false, reason: 'not_in_review' };
  await db.query(`update content.english_versions set status = 'rejected', review_note = $2, ended_at = now() where version_id = $1`, [versionId, text]);
  await writeAuditLog(db, AUDIT(actor, 'content.english.rejected', versionId, { note: true }));
  return { ok: true, versionId };
}

export async function releaseEnglishVersion(db: Sql, actor: ContentActor, versionId: string): Promise<ReviewResult> {
  const v = await lockVersion(db, versionId);
  if (!v) return { ok: false, reason: 'not_found' };
  if (v.status !== 'published' || v.audience !== 'staff_preview') return { ok: false, reason: 'not_in_preview' };
  const before = (
    await db.query(`update content.english_versions set status = 'superseded', audience = null, ended_at = now() where track = $1 and status = 'published' and audience = 'everyone' returning version_id`, [v.track])
  ).rows[0] as { version_id: string } | undefined;
  await db.query(`update content.english_versions set audience = 'everyone', released_at = now() where version_id = $1`, [versionId]);
  await writeAuditLog(db, AUDIT(actor, 'content.english.released', versionId, { audience: 'everyone', supersededVersionId: before?.version_id ?? null }));
  return { ok: true, versionId };
}

export async function rollBackEnglishVersion(db: Sql, actor: ContentActor, versionId: string): Promise<ReviewResult> {
  const v = await lockVersion(db, versionId);
  if (!v) return { ok: false, reason: 'not_found' };
  if (v.status !== 'published' || v.audience !== 'everyone') return { ok: false, reason: 'not_current' };
  const previous = (
    await db.query(
      `select version_id from content.english_versions where track = $1 and status = 'superseded' and released_at is not null and version_id <> $2
        order by ended_at desc nulls last, version_no desc limit 1 for update`,
      [v.track, versionId]
    )
  ).rows[0] as { version_id: string } | undefined;
  if (!previous) return { ok: false, reason: 'no_previous' };
  await db.query(`update content.english_versions set status = 'withdrawn', audience = null, ended_at = now() where version_id = $1`, [versionId]);
  await db.query(`update content.english_versions set status = 'published', audience = 'everyone', ended_at = null where version_id = $1`, [previous.version_id]);
  await writeAuditLog(db, AUDIT(actor, 'content.english.rolled_back', versionId, { restoredVersionId: previous.version_id }));
  return { ok: true, versionId, restoredVersionId: previous.version_id };
}
