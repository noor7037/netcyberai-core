import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDb, type TestDb } from '../db/pglite-harness';

// users.ui_language (C134) on real Postgres (PGlite) with the migration
// applied: one nullable column that holds only 'en' or 'hi'.

let db: TestDb;
const user = randomUUID();

beforeAll(async () => {
  db = await createTestDb();
  await db.platform((q) => q.query(`insert into users (user_id, role, display_name) values ($1, 'super_admin', 'Someone')`, [user]));
}, 60000);

const read = async () => (await db.platform((q) => q.query(`select ui_language from users where user_id = $1`, [user]))).rows[0].ui_language;
const write = (lang: string | null) => db.platform((q) => q.query(`update users set ui_language = $2 where user_id = $1`, [user, lang]));

describe('users.ui_language', () => {
  it('is empty until the person chooses', async () => {
    expect(await read()).toBeNull();
  });

  it('holds en or hi, and can be cleared', async () => {
    await write('hi');
    expect(await read()).toBe('hi');
    await write('en');
    expect(await read()).toBe('en');
    await write(null);
    expect(await read()).toBeNull();
  });

  it('refuses anything else', async () => {
    for (const bad of ['fr', 'HI', '', 'en; drop table users']) await expect(write(bad)).rejects.toThrow(/users_ui_language_known/);
    expect(await read()).toBeNull();
  });

  it('adding it changed no one else’s access: a school session still cannot read another school’s user', async () => {
    const school = randomUUID();
    const other = randomUUID();
    const staff = randomUUID();
    await db.platform(async (q) => {
      await q.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'A', 'IN-HR'), ($2, 'B', 'IN-DL')`, [school, other]);
      await q.query(`insert into users (user_id, school_id, role, display_name, ui_language) values ($1, $2, 'principal', 'Other school', 'hi')`, [staff, other]);
      await q.query(`insert into memberships (user_id, school_id, role) values ($1, $2, 'principal')`, [staff, other]);
    });
    const seen = await db.tenant({ role: 'principal' as any, sub: randomUUID(), schoolId: school }, (q) => q.query(`select ui_language from users where user_id = $1`, [staff]));
    expect(seen.rows).toEqual([]);
  });
});
