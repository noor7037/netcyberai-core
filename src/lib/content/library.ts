import { writeAuditLog } from '@/lib/audit/log';
import type { Sql } from '@/lib/jobs/types';
import { indiaDate } from '@/lib/time/india';
import { readCatalogCsv, syllabusId, type CatalogLine, type CatalogProblem, type CatalogSyllabus } from './catalog-csv';
import { diffSyllabus, type DiffLine, type SyllabusDiff } from './diff';

// Control → Content (M1-4, docs/family-app/10 §4, §7, §8; docs/34 §10). NetCyberAI's syllabus library, run as the
// platform role (nca_super) inside the request's own transaction (withTenantContext), so every step of a change and its
// audit row are written together or not at all.
//
//   import     a checked CSV file becomes one syllabus version per board, class, subject and year, "in review"
//   approve    by a super_admin who did not import it (the database refuses it too); a version loaded from the
//              repository (import_source 'repository', import_ref = the PR) has no importing account. Published to
//              staff preview only: Control shows it, no family sees it.
//   reject     with a note
//   release    the staff preview goes to everyone; the version everyone had is superseded
//   roll back  the version everyone has is withdrawn and the one before it goes back to everyone, in one step
//
// content.* holds titles and structure only: no person, no child, no textbook text. Audit rows carry ids and counts.

export type ContentActor = { userId: string };

export type VersionStatus = 'draft' | 'in_review' | 'published' | 'superseded' | 'withdrawn' | 'rejected';
export type VersionAudience = 'staff_preview' | 'everyone' | null;

export type ControlVersion = {
  versionId: string;
  board: string;
  classLevel: number;
  subject: string;
  academicYear: string;
  versionNo: number;
  status: VersionStatus;
  audience: VersionAudience;
  importSource: 'control' | 'repository';
  importRef: string | null;
  importedByMe: boolean;
  importedAt: string;
  approved: boolean;
  approvedAt: string | null;
  releasedAt: string | null;
  endedAt: string | null;
  reviewNote: string | null;
  units: number;
  chapters: number;
  topics: number;
  // The version before this one of the same syllabus, to compare with; null for the first.
  previousVersionId: string | null;
  // "Roll back" is possible: this is the version everyone has, and an earlier one was released before it.
  canRollBack: boolean;
};

export type PreviewTopic = { key: string; titleEn: string; titleHi: string | null };
export type PreviewChapter = { key: string; titleEn: string; titleHi: string | null; topics: PreviewTopic[] };
export type PreviewUnit = { key: string | null; titleEn: string | null; titleHi: string | null; chapters: PreviewChapter[] };
export type VersionPreview = { version: ControlVersion; units: PreviewUnit[] };

const AUDIT = (actor: ContentActor, eventAction: string, versionId: string, afterState: Record<string, unknown>) => ({
  schoolId: null,
  actorUserId: actor.userId,
  actorRole: 'super_admin' as const,
  eventAction,
  targetType: 'content_syllabus_version',
  targetId: versionId,
  afterState,
});

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v == null ? null : String(v));

// ---- import --------------------------------------------------------------------------------------------------------

export type ImportedVersion = { versionId: string; board: string; classLevel: number; subject: string; academicYear: string; versionNo: number; units: number; chapters: number; topics: number };
export type CatalogImport = { preview: boolean; committed: boolean; rowCount: number; problems: CatalogProblem[]; versions: ImportedVersion[] };

const lineJson = (l: CatalogLine) => ({
  key: l.key,
  parent_key: l.parentKey,
  position: l.position,
  title_en: l.titleEn,
  title_hi: l.titleHi,
  source_url: l.sourceUrl,
  source_page: l.sourcePage,
  checked_on: l.checkedOn,
});
const RECORD = `x(key text, parent_key text, position integer, title_en text, title_hi text, source_url text, source_page text, checked_on date)`;

// Writes one syllabus version with its lines. Used by the Control import; scripts/content/catalog-sql.mjs writes the
// same rows as SQL for a version loaded from the repository.
async function insertVersion(db: Sql, s: CatalogSyllabus, importedBy: string): Promise<ImportedVersion> {
  const v = (
    await db.query(
      `insert into content.syllabus_versions (board_id, class_level, subject, academic_year, version_no, status, import_source, imported_by)
       select $1, $2, $3, $4, coalesce(max(version_no), 0) + 1, 'in_review', 'control', $5
         from content.syllabus_versions where board_id = $1 and class_level = $2 and subject = $3 and academic_year = $4
       returning version_id, version_no`,
      [s.board, s.classLevel, s.subject, s.academicYear, importedBy]
    )
  ).rows[0] as { version_id: string; version_no: number };
  await db.query(
    `insert into content.units (version_id, unit_key, position, title_en, title_hi, source_url, source_page, checked_on)
     select $1, x.key, x.position, x.title_en, x.title_hi, x.source_url, x.source_page, x.checked_on from jsonb_to_recordset($2::jsonb) as ${RECORD}`,
    [v.version_id, JSON.stringify(s.units.map(lineJson))]
  );
  await db.query(
    `insert into content.chapters (version_id, unit_id, chapter_key, position, title_en, title_hi, source_url, source_page, checked_on)
     select $1, u.unit_id, x.key, x.position, x.title_en, x.title_hi, x.source_url, x.source_page, x.checked_on
       from jsonb_to_recordset($2::jsonb) as ${RECORD}
       left join content.units u on u.version_id = $1 and u.unit_key = x.parent_key`,
    [v.version_id, JSON.stringify(s.chapters.map(lineJson))]
  );
  await db.query(
    `insert into content.topics (version_id, chapter_id, topic_key, position, title_en, title_hi, source_url, source_page, checked_on)
     select $1, c.chapter_id, x.key, x.position, x.title_en, x.title_hi, x.source_url, x.source_page, x.checked_on
       from jsonb_to_recordset($2::jsonb) as ${RECORD}
       join content.chapters c on c.version_id = $1 and c.chapter_key = x.parent_key`,
    [v.version_id, JSON.stringify(s.topics.map(lineJson))]
  );
  return {
    versionId: v.version_id,
    board: s.board,
    classLevel: s.classLevel,
    subject: s.subject,
    academicYear: s.academicYear,
    versionNo: Number(v.version_no),
    units: s.units.length,
    chapters: s.chapters.length,
    topics: s.topics.length,
  };
}

// `preview`: check every line and write nothing ("Check file"). Otherwise all or nothing ("Import as a draft"): any
// problem and no version is written.
export async function importCatalog(db: Sql, actor: ContentActor, text: string, opts: { preview: boolean; today?: string }): Promise<CatalogImport> {
  const read = readCatalogCsv(text, opts.today ?? indiaDate());
  const problems = [...read.problems];
  if (problems.length === 0) {
    const boards = [...new Set(read.syllabi.map((s) => s.board))];
    const known = new Set((await db.query(`select board_id from content.boards where board_id = any($1::text[])`, [boards])).rows.map((r: { board_id: string }) => r.board_id));
    for (const b of boards) {
      if (known.has(b)) continue;
      const first = read.lines.find((l) => l.board === b);
      problems.push({ line: first?.line ?? 1, code: 'board_unknown', value: b });
    }
  }
  if (problems.length > 0 || opts.preview) {
    return { preview: opts.preview, committed: false, rowCount: read.rowCount, problems, versions: [] };
  }
  // One import at a time: version numbers are counted, never guessed.
  await db.query(`select pg_advisory_xact_lock(hashtext('content.syllabus_versions'))`);
  const versions: ImportedVersion[] = [];
  for (const s of read.syllabi) {
    const v = await insertVersion(db, s, actor.userId);
    versions.push(v);
    await writeAuditLog(db, AUDIT(actor, 'content.syllabus.imported', v.versionId, { versionNo: v.versionNo, units: v.units, chapters: v.chapters, topics: v.topics }));
  }
  return { preview: false, committed: true, rowCount: read.rowCount, problems: [], versions };
}

// ---- reading -------------------------------------------------------------------------------------------------------

const VERSION_SELECT = `
  select v.version_id, v.board_id, v.class_level, v.subject, v.academic_year, v.version_no, v.status, v.audience, v.import_source, v.import_ref,
         v.imported_by, v.imported_at, v.approved_by, v.approved_at, v.released_at, v.ended_at, v.review_note,
         (select count(*) from content.units u where u.version_id = v.version_id)::int as units,
         (select count(*) from content.chapters c where c.version_id = v.version_id)::int as chapters,
         (select count(*) from content.topics t where t.version_id = v.version_id)::int as topics,
         (select p.version_id from content.syllabus_versions p
           where p.board_id = v.board_id and p.class_level = v.class_level and p.subject = v.subject and p.academic_year = v.academic_year
             and p.version_no < v.version_no order by p.version_no desc limit 1) as previous_version_id,
         (v.status = 'published' and v.audience = 'everyone' and exists (
           select 1 from content.syllabus_versions p
            where p.board_id = v.board_id and p.class_level = v.class_level and p.subject = v.subject and p.academic_year = v.academic_year
              and p.status = 'superseded' and p.released_at is not null and p.version_id <> v.version_id)) as can_roll_back
    from content.syllabus_versions v`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toVersion(r: any, actor: ContentActor): ControlVersion {
  return {
    versionId: r.version_id,
    board: r.board_id,
    classLevel: Number(r.class_level),
    subject: r.subject,
    academicYear: r.academic_year,
    versionNo: Number(r.version_no),
    status: r.status,
    audience: r.audience ?? null,
    importSource: r.import_source,
    importRef: r.import_ref ?? null,
    importedByMe: r.imported_by != null && r.imported_by === actor.userId,
    importedAt: iso(r.imported_at) ?? '',
    approved: r.approved_by != null,
    approvedAt: iso(r.approved_at),
    releasedAt: iso(r.released_at),
    endedAt: iso(r.ended_at),
    reviewNote: r.review_note ?? null,
    units: Number(r.units),
    chapters: Number(r.chapters),
    topics: Number(r.topics),
    previousVersionId: r.previous_version_id ?? null,
    canRollBack: r.can_roll_back === true,
  };
}

// Every version of every syllabus, newest first within each syllabus.
export async function listVersions(db: Sql, actor: ContentActor): Promise<ControlVersion[]> {
  const { rows } = await db.query(`${VERSION_SELECT} order by v.board_id, v.class_level, v.subject, v.academic_year desc, v.version_no desc`);
  return rows.map((r) => toVersion(r, actor));
}

export async function getVersion(db: Sql, actor: ContentActor, versionId: string): Promise<ControlVersion | null> {
  const { rows } = await db.query(`${VERSION_SELECT} where v.version_id = $1`, [versionId]);
  return rows[0] ? toVersion(rows[0], actor) : null;
}

// Every line of a version, as the diff matches them.
export async function versionLines(db: Sql, versionId: string): Promise<DiffLine[]> {
  const { rows } = await db.query(
    `select 'unit' as level, u.unit_key as key, null::text as parent_key, u.position, u.title_en, u.title_hi from content.units u where u.version_id = $1
     union all
     select 'chapter', c.chapter_key, u.unit_key, c.position, c.title_en, c.title_hi
       from content.chapters c left join content.units u on u.unit_id = c.unit_id where c.version_id = $1
     union all
     select 'topic', t.topic_key, c.chapter_key, t.position, t.title_en, t.title_hi
       from content.topics t join content.chapters c on c.chapter_id = t.chapter_id where t.version_id = $1`,
    [versionId]
  );
  return rows.map((r: { level: DiffLine['level']; key: string; parent_key: string | null; position: number; title_en: string; title_hi: string | null }) => ({
    level: r.level,
    key: r.key,
    parentKey: r.parent_key ?? null,
    position: Number(r.position),
    titleEn: r.title_en,
    titleHi: r.title_hi ?? null,
  }));
}

// The staff preview (10 §4.2 step 5): the version as a family will see it, units holding chapters holding topics, in
// order, with both titles. Shown only in Control.
export async function previewVersion(db: Sql, actor: ContentActor, versionId: string): Promise<VersionPreview | null> {
  const version = await getVersion(db, actor, versionId);
  if (!version) return null;
  const lines = await versionLines(db, versionId);
  const byPos = (a: DiffLine, b: DiffLine) => a.position - b.position || a.key.localeCompare(b.key);
  const chaptersOf = (unitKey: string | null) =>
    lines
      .filter((l) => l.level === 'chapter' && l.parentKey === unitKey)
      .sort(byPos)
      .map((c) => ({
        key: c.key,
        titleEn: c.titleEn,
        titleHi: c.titleHi,
        topics: lines
          .filter((t) => t.level === 'topic' && t.parentKey === c.key)
          .sort(byPos)
          .map((t) => ({ key: t.key, titleEn: t.titleEn, titleHi: t.titleHi })),
      }));
  const units: PreviewUnit[] = lines
    .filter((l) => l.level === 'unit')
    .sort(byPos)
    .map((u) => ({ key: u.key, titleEn: u.titleEn, titleHi: u.titleHi, chapters: chaptersOf(u.key) }));
  const loose = chaptersOf(null);
  if (loose.length > 0) units.push({ key: null, titleEn: null, titleHi: null, chapters: loose });
  return { version, units };
}

// Two versions of the same syllabus, the older first.
export async function diffVersions(
  db: Sql,
  actor: ContentActor,
  fromId: string,
  toId: string
): Promise<{ ok: true; from: ControlVersion; to: ControlVersion; diff: SyllabusDiff } | { ok: false; reason: 'not_found' | 'different_syllabus' }> {
  const from = await getVersion(db, actor, fromId);
  const to = await getVersion(db, actor, toId);
  if (!from || !to) return { ok: false, reason: 'not_found' };
  if (syllabusId(from) !== syllabusId(to)) return { ok: false, reason: 'different_syllabus' };
  return { ok: true, from, to, diff: diffSyllabus(await versionLines(db, fromId), await versionLines(db, toId)) };
}

// ---- review, release, roll back ------------------------------------------------------------------------------------

export type ReviewRefusal = 'not_found' | 'not_in_review' | 'own_import' | 'not_in_preview' | 'not_current' | 'no_previous' | 'note_needed';
export type ReviewResult = { ok: true; versionId: string; restoredVersionId?: string } | { ok: false; reason: ReviewRefusal };

type Locked = { version_id: string; board_id: string; class_level: number; subject: string; academic_year: string; status: VersionStatus; audience: VersionAudience; import_source: string; imported_by: string | null };

// The version, locked for this transaction, and its syllabus serialised: two changes to one syllabus never interleave.
async function lockVersion(db: Sql, versionId: string): Promise<Locked | null> {
  const head = (await db.query(`select board_id, class_level, subject, academic_year from content.syllabus_versions where version_id = $1`, [versionId])).rows[0];
  if (!head) return null;
  await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`content:${syllabusId({ board: head.board_id, classLevel: Number(head.class_level), subject: head.subject, academicYear: head.academic_year })}`]);
  return ((await db.query(`select version_id, board_id, class_level, subject, academic_year, status, audience, import_source, imported_by from content.syllabus_versions where version_id = $1 for update`, [versionId])).rows[0] as Locked) ?? null;
}
const SAME_SYLLABUS = `board_id = $1 and class_level = $2 and subject = $3 and academic_year = $4`;
const syllabusArgs = (v: Locked) => [v.board_id, v.class_level, v.subject, v.academic_year];

// Approve: two people. The importing account never approves its own import (the database's own check refuses it as
// well). Published to staff preview; a version that was in staff preview before is superseded (it never reached
// families).
export async function approveVersion(db: Sql, actor: ContentActor, versionId: string): Promise<ReviewResult> {
  const v = await lockVersion(db, versionId);
  if (!v) return { ok: false, reason: 'not_found' };
  if (v.status !== 'in_review') return { ok: false, reason: 'not_in_review' };
  if (v.imported_by !== null && v.imported_by === actor.userId) return { ok: false, reason: 'own_import' };
  await db.query(
    `update content.syllabus_versions set status = 'superseded', audience = null, ended_at = now()
      where ${SAME_SYLLABUS} and status = 'published' and audience = 'staff_preview'`,
    syllabusArgs(v)
  );
  await db.query(
    `update content.syllabus_versions set status = 'published', audience = 'staff_preview', approved_by = $2, approved_at = now() where version_id = $1`,
    [versionId, actor.userId]
  );
  await writeAuditLog(db, AUDIT(actor, 'content.syllabus.approved', versionId, { audience: 'staff_preview' }));
  return { ok: true, versionId };
}

export async function rejectVersion(db: Sql, actor: ContentActor, versionId: string, note: string): Promise<ReviewResult> {
  const text = typeof note === 'string' ? note.trim() : '';
  if (text.length < 1 || text.length > 1000) return { ok: false, reason: 'note_needed' };
  const v = await lockVersion(db, versionId);
  if (!v) return { ok: false, reason: 'not_found' };
  if (v.status !== 'in_review') return { ok: false, reason: 'not_in_review' };
  await db.query(`update content.syllabus_versions set status = 'rejected', review_note = $2, ended_at = now() where version_id = $1`, [versionId, text]);
  // The note is the reviewer's words about the content; the audit row carries only that there is one.
  await writeAuditLog(db, AUDIT(actor, 'content.syllabus.rejected', versionId, { note: true }));
  return { ok: true, versionId };
}

// Release to everyone: the staff preview becomes what families read; the version everyone had is superseded.
export async function releaseVersion(db: Sql, actor: ContentActor, versionId: string): Promise<ReviewResult> {
  const v = await lockVersion(db, versionId);
  if (!v) return { ok: false, reason: 'not_found' };
  if (v.status !== 'published' || v.audience !== 'staff_preview') return { ok: false, reason: 'not_in_preview' };
  const before = (
    await db.query(
      `update content.syllabus_versions set status = 'superseded', audience = null, ended_at = now()
        where ${SAME_SYLLABUS} and status = 'published' and audience = 'everyone' returning version_id`,
      syllabusArgs(v)
    )
  ).rows[0] as { version_id: string } | undefined;
  await db.query(`update content.syllabus_versions set audience = 'everyone', released_at = now() where version_id = $1`, [versionId]);
  await writeAuditLog(db, AUDIT(actor, 'content.syllabus.released', versionId, { audience: 'everyone', supersededVersionId: before?.version_id ?? null }));
  return { ok: true, versionId };
}

// One-step roll back (10 §7): the version everyone has is withdrawn and the last one released before it goes back to
// everyone, together.
export async function rollBackVersion(db: Sql, actor: ContentActor, versionId: string): Promise<ReviewResult> {
  const v = await lockVersion(db, versionId);
  if (!v) return { ok: false, reason: 'not_found' };
  if (v.status !== 'published' || v.audience !== 'everyone') return { ok: false, reason: 'not_current' };
  const previous = (
    await db.query(
      `select version_id from content.syllabus_versions
        where ${SAME_SYLLABUS} and status = 'superseded' and released_at is not null and version_id <> $5
        order by ended_at desc nulls last, version_no desc limit 1 for update`,
      [...syllabusArgs(v), versionId]
    )
  ).rows[0] as { version_id: string } | undefined;
  if (!previous) return { ok: false, reason: 'no_previous' };
  await db.query(`update content.syllabus_versions set status = 'withdrawn', audience = null, ended_at = now() where version_id = $1`, [versionId]);
  await db.query(`update content.syllabus_versions set status = 'published', audience = 'everyone', ended_at = null where version_id = $1`, [previous.version_id]);
  await writeAuditLog(db, AUDIT(actor, 'content.syllabus.rolled_back', versionId, { restoredVersionId: previous.version_id }));
  return { ok: true, versionId, restoredVersionId: previous.version_id };
}
