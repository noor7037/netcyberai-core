// Where a child stopped listening to a chapter (S1, C374): family.chapter_reading, one row per child per chapter, on
// the family's own transaction (family_app role; the table's policies keep every row to its own account). Each query
// runs under a savepoint, so a database that does not have the table yet (its migration not applied) answers "no
// place" instead of failing the page.

type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> };

export type ReadingPlace = { blockId: string; sentence: number };

const MISSING_TABLE = '42P01';

async function guarded<T>(db: Db, fn: () => Promise<T>, fallback: T): Promise<T> {
  await db.query('savepoint chapter_reading');
  try {
    const out = await fn();
    await db.query('release savepoint chapter_reading');
    return out;
  } catch (err) {
    if ((err as { code?: string }).code !== MISSING_TABLE) throw err;
    await db.query('rollback to savepoint chapter_reading');
    return fallback;
  }
}

export function readPlace(db: Db, accountId: string, childId: string, chapterKey: string): Promise<ReadingPlace | null> {
  return guarded(
    db,
    async () => {
      const row = (await db.query(`select block_id, sentence from family.chapter_reading where account_id = $1 and child_id = $2 and chapter_key = $3`, [accountId, childId, chapterKey])).rows[0] as
        | { block_id: string; sentence: number }
        | undefined;
      return row ? { blockId: row.block_id, sentence: Number(row.sentence) } : null;
    },
    null
  );
}

// true when kept; false when the table is not there yet.
export function savePlace(db: Db, accountId: string, childId: string, chapterKey: string, place: ReadingPlace): Promise<boolean> {
  return guarded(
    db,
    async () => {
      await db.query(
        `insert into family.chapter_reading as r (account_id, child_id, chapter_key, block_id, sentence) values ($1, $2, $3, $4, $5)
         on conflict (child_id, chapter_key) do update set block_id = excluded.block_id, sentence = excluded.sentence, updated_at = now()
          where r.account_id = excluded.account_id`,
        [accountId, childId, chapterKey, place.blockId, place.sentence]
      );
      return true;
    },
    false
  );
}
