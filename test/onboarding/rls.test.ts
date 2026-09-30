import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDb, type TestDb } from '../db/pglite-harness';

// C98: school roles cannot reach the platform tables, and staff
// invitations stay inside their school, for principals and school admins
// only. Real Postgres (PGlite) with the B2 migration applied verbatim.

let db: TestDb;
const schoolA = randomUUID();
const schoolB = randomUUID();
const principalA = { tenant: schoolA, role: 'principal', user: randomUUID() };
const teacherA = { tenant: schoolA, role: 'teacher', user: randomUUID() };

beforeAll(async () => {
  db = await createTestDb();
  await db.platform(async (q) => {
    await q.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'A', 'IN-HR'), ($2, 'B', 'IN-DL')`, [schoolA, schoolB]);
    await q.query(
      `insert into school_applications (school_name, school_name_key, city, state_code, board, principal_name, email, email_key, mobile)
       values ('A School', 'a school', 'Palwal', 'IN-HR', 'CBSE', 'Priya Sharma', 'p@a.test', 'p@a.test', '9876543210')`
    );
    await q.query(`insert into jobs (type, idempotency_key) values ('email.send', 'k1')`);
    await q.query(`insert into intake_rate_events (bucket, key_hash) values ('apply_ip', repeat('a', 64))`);
    await q.query(
      `insert into staff_invitations (school_id, email, email_key, display_name, role, source) values
         ($1, 'x@a.test', 'x@a.test', 'Xavier', 'teacher', 'staff'), ($2, 'y@b.test', 'y@b.test', 'Yamini', 'teacher', 'staff')`,
      [schoolA, schoolB]
    );
  });
}, 60000);

const denied = /permission denied/;

describe('platform tables: no school role can read or write them', () => {
  for (const table of ['school_applications', 'intake_rate_events', 'platform_settings']) {
    for (const role of ['app_user', 'app_backend', 'anon', 'authenticated'] as const) {
      it(`${role} cannot read or insert into ${table}`, async () => {
        await expect(db.asRole(role, principalA, (q) => q.query(`select count(*) from ${table}`))).rejects.toThrow(denied);
        await expect(db.asRole(role, principalA, (q) => q.query(`insert into ${table} default values`))).rejects.toThrow(denied);
      });
    }
  }

  it('no school role can read jobs', async () => {
    for (const role of ['app_user', 'app_backend', 'anon', 'authenticated'] as const) {
      await expect(db.asRole(role, principalA, (q) => q.query(`select count(*) from jobs`))).rejects.toThrow(denied);
    }
  });

  it('a school session may enqueue only its own school’s invite jobs', async () => {
    const ins = (type: string, school: string | null) =>
      db.asRole('app_user', principalA, (q) =>
        q.query(`insert into jobs (type, idempotency_key, school_id) values ($1, $2, $3)`, [type, randomUUID(), school])
      );
    await expect(ins('invite.send', schoolA)).resolves.toBeTruthy();
    await expect(ins('invite.send', schoolB)).rejects.toThrow(/row-level security/);
    await expect(ins('email.send', schoolA)).rejects.toThrow(/row-level security/);
    await expect(ins('invite.send', null)).rejects.toThrow(/row-level security/);
  });

  it('the platform service (nca_super) reads them', async () => {
    const n = await db.platform((q) => q.query(`select (select count(*) from school_applications)::int a, (select count(*) from jobs)::int j`));
    expect(n.rows[0]).toEqual({ a: 1, j: 2 });
  });
});

describe('staff invitations: own school, principal and school admin only', () => {
  it('a principal sees only their school’s invitations', async () => {
    const r = await db.asRole('app_user', principalA, (q) => q.query(`select email from staff_invitations`));
    expect(r.rows.map((x) => x.email)).toEqual(['x@a.test']);
  });

  it('a teacher sees none and cannot invite', async () => {
    const r = await db.asRole('app_user', teacherA, (q) => q.query(`select email from staff_invitations`));
    expect(r.rows).toEqual([]);
    await expect(
      db.asRole('app_user', teacherA, (q) =>
        q.query(`insert into staff_invitations (school_id, email, email_key, display_name, role, source) values ($1, 'z@a.test', 'z@a.test', 'Zoya', 'teacher', 'staff')`, [schoolA])
      )
    ).rejects.toThrow(/row-level security/);
  });

  it('a principal cannot write another school’s invitation', async () => {
    await expect(
      db.asRole('app_user', principalA, (q) =>
        q.query(`insert into staff_invitations (school_id, email, email_key, display_name, role, source) values ($1, 'z@b.test', 'z@b.test', 'Zoya', 'teacher', 'staff')`, [schoolB])
      )
    ).rejects.toThrow(/row-level security/);
    const u = await db.asRole('app_user', principalA, (q) => q.query(`update staff_invitations set display_name = 'hacked' where email = 'y@b.test'`));
    expect(u.rowCount).toBe(0);
  });

  it('no invitation can make a parent, a student or a platform admin', async () => {
    for (const role of ['parent', 'student', 'super_admin']) {
      await expect(
        db.platform((q) =>
          q.query(`insert into staff_invitations (school_id, email, email_key, display_name, role, source) values ($1, $2, $2, 'Nobody', $3, 'staff')`, [schoolA, `${role}@a.test`, role])
        )
      ).rejects.toThrow(/check constraint/);
    }
  });
});
