// C557: the parent's Tech & AI Lab choices for a child: what may be stored, what the child then sees, and the table's
// own rules on the whole schema (the harness database).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { courseCatalog } from '@/lib/family/tech/catalog';
import { childPath } from '@/lib/family/tech/personal';
import { cleanSettings, courseClassOf, readTechSettings, saveTechSettings, visibleCatalog } from '@/lib/family/tech/settings';
import { EMPTY_PROGRESS } from '@/lib/family/tech/types';

describe('what a parent may choose', () => {
  it('a class from Nursery to 12 or the child’s own, and known topic areas only', () => {
    expect(cleanSettings({ courseClass: null, strandsOff: [] })).toEqual({ courseClass: null, strandsOff: [] });
    expect(cleanSettings({ courseClass: 6, strandsOff: ['ai', 'ai', 'cyber'] })).toEqual({ courseClass: 6, strandsOff: ['ai', 'cyber'] });
    expect(cleanSettings({ courseClass: 13, strandsOff: [] })).toBeNull();
    expect(cleanSettings({ courseClass: 'x', strandsOff: [] })).toBeNull();
    expect(cleanSettings({ courseClass: null, strandsOff: ['drop table'] })).toBeNull();
  });

  it('a switched-off area is hidden from the child, and the path follows the class the parent chose', () => {
    const catalog = courseCatalog();
    const seen = visibleCatalog(catalog, { courseClass: 4, strandsOff: ['ai', 'robo'] });
    expect(seen.units.some((unit) => unit.strand === 'ai' || unit.strand === 'robo')).toBe(false);
    expect(seen.units.length).toBeLessThan(catalog.units.length);
    expect(catalog.units.some((unit) => unit.strand === 'ai')).toBe(true); // nothing is deleted
    expect(courseClassOf({ courseClass: 4, strandsOff: [] }, 9)).toBe(4);
    expect(courseClassOf({ courseClass: null, strandsOff: [] }, 9)).toBe(9);
    const path = childPath(seen, 4, EMPTY_PROGRESS);
    expect(path.next).not.toBeNull();
    expect(seen.units.find((unit) => unit.lessons.some((lesson) => lesson.key === path.next!.key))?.strand).not.toBe('ai');
  });
});

describe('the table', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  const ACCOUNT = 'c5570000-0000-4000-8000-000000000001';
  const CHILD = 'c5570000-0000-4000-8000-00000000000c';
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.query(`insert into family.accounts (account_id, email) values ($1, 'c557@test.invalid')`, [ACCOUNT]);
    await db.pg.query(`insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values ($1, $2, 'Test', 7, 'CBSE', 'en', 'en', 'IN-DL')`, [CHILD, ACCOUNT]);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('has row level security on and forced, and keeps a child’s choices', async () => {
    const { rows } = await db.pg.query(`select relrowsecurity, relforcerowsecurity from pg_class where oid = 'family.tech_settings'::regclass`);
    expect(rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const q = { query: (sql: string, params?: unknown[]) => db.pg.query(sql, params) };
    expect(await readTechSettings(q, CHILD)).toEqual({ courseClass: null, strandsOff: [] });
    await saveTechSettings(q, ACCOUNT, CHILD, { courseClass: 5, strandsOff: ['ai'] });
    await saveTechSettings(q, ACCOUNT, CHILD, { courseClass: null, strandsOff: ['cyber', 'robo'] });
    expect(await readTechSettings(q, CHILD)).toEqual({ courseClass: null, strandsOff: ['cyber', 'robo'] });
    await expect(db.pg.query(`insert into family.tech_settings (account_id, child_id, strands_off) values ($1, $2, '{nope}') on conflict (child_id) do update set strands_off = excluded.strands_off`, [ACCOUNT, CHILD])).rejects.toThrow();
  });
});
