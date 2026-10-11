import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// What the app's database role may do to each table made in P2 and P3
// (C160). Both databases give that role every right on a new table by
// default, so a migration that only says `grant select, insert` narrows
// nothing: the rights must be taken away. This test pins the exact rights,
// on every migration replayed, so a new table cannot quietly be editable.
//
// A new table goes in this list with the rights it is meant to have, and its
// migration revokes the rest from app_user.

const EXPECTED: Record<string, string> = {
  // append-only records
  usage_events: 'INSERT,SELECT',
  ai_usage: 'INSERT,SELECT',
  teaching_notes: 'INSERT,SELECT',
  recovery_plans: 'INSERT,SELECT',
  homework_attachments: 'INSERT,SELECT',
  payments: 'INSERT,SELECT',
  // written once, then changed in a controlled way; never deleted
  client_operations: 'INSERT,SELECT,UPDATE',
  attendance_correction_requests: 'INSERT,SELECT,UPDATE',
  pulse_followups: 'INSERT,SELECT,UPDATE',
  homework: 'INSERT,SELECT,UPDATE',
  homework_targets: 'INSERT,SELECT,UPDATE',
  homework_status: 'INSERT,SELECT,UPDATE',
  receipts: 'INSERT,SELECT,UPDATE',
  fees_ledger: 'INSERT,SELECT,UPDATE',
  fee_concessions: 'INSERT,SELECT,UPDATE',
  fee_heads: 'INSERT,SELECT,UPDATE',
  // a fee rule is never overwritten
  fee_structures: 'INSERT,SELECT',
  fee_structure_items: 'INSERT,SELECT',
  // added and removed, not edited
  syllabus_units: 'DELETE,INSERT,SELECT',
  // fully editable by those its policies allow
  timetable_entries: 'DELETE,INSERT,SELECT,UPDATE',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('the app’s database role has exactly the rights each table is meant to have', () => {
  it('table by table', async () => {
    const { rows } = await db.pg.query(
      `select table_name, string_agg(privilege_type, ',' order by privilege_type) as rights
         from information_schema.role_table_grants
        where table_schema = 'public' and grantee = 'app_user' and table_name = any($1::text[]) and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
        group by table_name`,
      [Object.keys(EXPECTED)]
    );
    expect(Object.fromEntries(rows.map((r: { table_name: string; rights: string }) => [r.table_name, r.rights]))).toEqual(EXPECTED);
  });

  it('the roles Supabase gives to the public have no right on any of them', async () => {
    const { rows } = await db.pg.query(`select table_name, grantee from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC') and table_name = any($1::text[])`, [
      Object.keys(EXPECTED).filter((t) => !['payments', 'fees_ledger', 'fee_concessions', 'fee_heads', 'fee_structures', 'fee_structure_items'].includes(t)),
    ]);
    expect(rows).toEqual([]);
  });

  it('the harness gives new tables the same default rights the real databases do, so this test means something', async () => {
    await db.pg.exec(`create table grants_probe (id int)`);
    const { rows } = await db.pg.query(`select string_agg(privilege_type, ',' order by privilege_type) as rights from information_schema.role_table_grants where table_name = 'grants_probe' and grantee = 'app_user' and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')`);
    expect(rows[0].rights).toBe('DELETE,INSERT,SELECT,UPDATE');
    await db.pg.exec(`drop table grants_probe`);
  });
});
