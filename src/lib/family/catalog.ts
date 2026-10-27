import { indiaDate } from '@/lib/time/india';
import { subjectsOfClass, type Stream, type Subject } from './subjects';

// The family's read of NetCyberAI's syllabus catalog (M1-4, docs/family-app/10 §4.3): for a standalone family, the
// version of a board, class and subject that is released to everyone for the current academic year, as plain data.
// Runs on the family's own database client (withFamilyContext or withFamilyGate, role family_app), whose row level
// security shows only versions published to everyone: a staff preview, a draft or a withdrawn version is never seen,
// whatever this query asks. Titles in the asked language, English where no Hindi title was printed. content.* only.

type FamilyDb = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

export type CatalogLang = 'en' | 'hi';
export type FamilyCatalogTopic = { key: string; title: string };
export type FamilyCatalogChapter = { key: string; title: string; unitKey: string | null; unitTitle: string | null; topics: FamilyCatalogTopic[] };
export type FamilyCatalog = { versionId: string; board: string; classLevel: number; subject: string; academicYear: string; versionNo: number; chapters: FamilyCatalogChapter[] };

// India's academic year starts on 1 April: 2026-10-21 is in 2026-27, 2027-03-31 still in 2026-27, 2027-04-01 in 2027-28.
export function academicYearOf(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

const pick = (lang: CatalogLang, en: string, hi: string | null) => (lang === 'hi' && hi ? hi : en);

export async function readFamilyCatalog(
  db: FamilyDb,
  q: { board: string; classLevel: number; subject: string; lang: CatalogLang; today?: string }
): Promise<FamilyCatalog | null> {
  const academicYear = academicYearOf(q.today ?? indiaDate());
  const version = (
    await db.query(
      `select version_id, version_no from content.syllabus_versions
        where board_id = $1 and class_level = $2 and subject = $3 and academic_year = $4 and status = 'published' and audience = 'everyone'`,
      [q.board, q.classLevel, q.subject, academicYear]
    )
  ).rows[0] as { version_id: string; version_no: number } | undefined;
  if (!version) return null;
  const chapters = (
    await db.query(
      `select c.chapter_id, c.chapter_key, c.title_en, c.title_hi, u.unit_key, u.title_en as unit_title_en, u.title_hi as unit_title_hi
         from content.chapters c left join content.units u on u.unit_id = c.unit_id
        where c.version_id = $1
        order by u.position nulls last, c.position, c.chapter_key`,
      [version.version_id]
    )
  ).rows as { chapter_id: string; chapter_key: string; title_en: string; title_hi: string | null; unit_key: string | null; unit_title_en: string | null; unit_title_hi: string | null }[];
  const topics = (
    await db.query(`select chapter_id, topic_key, title_en, title_hi from content.topics where version_id = $1 order by position, topic_key`, [version.version_id])
  ).rows as { chapter_id: string; topic_key: string; title_en: string; title_hi: string | null }[];
  return {
    versionId: version.version_id,
    board: q.board,
    classLevel: q.classLevel,
    subject: q.subject,
    academicYear,
    versionNo: Number(version.version_no),
    chapters: chapters.map((c) => ({
      key: c.chapter_key,
      title: pick(q.lang, c.title_en, c.title_hi),
      unitKey: c.unit_key,
      unitTitle: c.unit_title_en === null ? null : pick(q.lang, c.unit_title_en, c.unit_title_hi),
      topics: topics.filter((t) => t.chapter_id === c.chapter_id).map((t) => ({ key: t.topic_key, title: pick(q.lang, t.title_en, t.title_hi) })),
    })),
  };
}

// The subjects with a version released to everyone for this board and class this year: the ones whose chapters are
// really in the app, which the Study page marks Published (S4, C377).
export async function publishedSubjects(db: FamilyDb, q: { board: string; classLevel: number; today?: string }): Promise<string[]> {
  if (q.classLevel <= 0) return [];
  const { rows } = await db.query(
    `select distinct subject from content.syllabus_versions
      where board_id = $1 and class_level = $2 and academic_year = $3 and status = 'published' and audience = 'everyone'`,
    [q.board, q.classLevel, academicYearOf(q.today ?? indiaDate())]
  );
  return (rows as { subject: string }[]).map((r) => r.subject);
}

// The subjects a child of this board and class studies (C264): the stage's school subjects, then any other subject the
// catalog released to everyone holds for this class this year. A Class 11 or 12 child with a stream (S4) gets that
// stream's subjects.
export async function classSubjects(db: FamilyDb, q: { board: string; classLevel: number; stream?: Stream | null; today?: string }): Promise<Subject[]> {
  if (q.classLevel <= 0) return [];
  return subjectsOfClass(q.classLevel, await publishedSubjects(db, q), q.board, q.stream);
}
