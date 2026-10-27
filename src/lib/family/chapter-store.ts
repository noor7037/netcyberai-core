import { checkChapter, showcaseChapter, showcaseChapters, type Chapter } from './chapters';

// Chapters from the database (S3, C376): the content studio's published versions (content.chapter_contents), read on the
// family's own transaction, whose row level security shows only a version published for every family or from this
// account's own upload. A chapter that is not there, or fails the checker, falls back to the showcase files (chapters.ts).
// Each query runs under a savepoint, so a database that does not have the table yet (its migration not applied) answers
// "none" instead of failing the page.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };
const MISSING_TABLE = '42P01';

export async function guarded<T>(db: Db, name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  await db.query(`savepoint ${name}`);
  try {
    const out = await fn();
    await db.query(`release savepoint ${name}`);
    return out;
  } catch (err) {
    if ((err as { code?: string }).code !== MISSING_TABLE) throw err;
    await db.query(`rollback to savepoint ${name}`);
    return fallback;
  }
}

export async function readPublishedChapter(db: Db, key: string): Promise<Chapter | null> {
  return guarded(
    db,
    'chapter_store',
    async () => {
      const r = (await db.query(`select chapter_key, subject, title_en, title_hi, blocks from content.chapter_contents where chapter_key = $1 and status = 'published'`, [key])).rows[0] as
        | { chapter_key: string; subject: string; title_en: string; title_hi: string; blocks: unknown }
        | undefined;
      return r ? checkChapter({ key: r.chapter_key, subject: r.subject, title: { en: r.title_en, hi: r.title_hi }, blocks: r.blocks }) : null;
    },
    null
  );
}

// The published chapter in the database, else the showcase file of that key.
export async function loadChapter(db: Db, key: string): Promise<Chapter | null> {
  return (await readPublishedChapter(db, key)) ?? showcaseChapter(key);
}

export type ReadableChapter = { key: string; subject: string; title: { en: string; hi: string }; own: boolean };

// The chapters a child can open for a subject: published for the child's board and class (or for any), or made from this
// child's own upload; then the showcase chapters of the subject that the database does not replace.
export async function readableChapters(db: Db, q: { board: string; classLevel: number; subject: string; childId: string }): Promise<ReadableChapter[]> {
  const rows = await guarded(
    db,
    'chapter_list',
    async () =>
      (
        await db.query(
          `select chapter_key, subject, title_en, title_hi, (child_id is not null) as own from content.chapter_contents
            where status = 'published' and subject = $1 and (board_id is null or board_id = $2) and (class_level is null or class_level = $3) and (child_id is null or child_id = $4)
            order by chapter_key`,
          [q.subject, q.board, q.classLevel, q.childId]
        )
      ).rows as { chapter_key: string; subject: string; title_en: string; title_hi: string; own: boolean }[],
    []
  );
  const fromDb: ReadableChapter[] = rows.map((r) => ({ key: r.chapter_key, subject: r.subject, title: { en: r.title_en, hi: r.title_hi }, own: r.own }));
  const have = new Set(fromDb.map((c) => c.key));
  const showcase = showcaseChapters()
    .filter((c) => c.subject === q.subject && !have.has(c.key))
    .map((c) => ({ key: c.key, subject: c.subject, title: c.title, own: false }));
  return [...fromDb, ...showcase];
}
