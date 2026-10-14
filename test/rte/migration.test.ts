import { afterAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// The C225 migration on rows that were already there (the test database holds real test rows): a claim paid the 10c
// way gets its one receipt of the whole amount; every existing claim keeps the class it was raised with ('current');
// a written-off claim keeps its note; and a row the one Aadhaar rule refuses stops the migration, naming the table
// and the column. Every name and figure is made up.

const A = 'c2250000-0000-4000-8000-0000000003a1';
const u = (n: number) => `c2250000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`;
const [P, ACC, Y, C5, KID1, KID2, KID3, RATE, PAID, RAISED, OFF] = [u(11), u(12), u(21), u(31), u(41), u(42), u(43), u(51), u(61), u(62), u(63)];

// The 10c rows, written straight into the tables (as they stand on the test database), just before C225.
const before = (reference: string) => `
  set session_replication_role = replica;
  insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR');
  insert into users (user_id, school_id, email, role, display_name) values ('${P}', '${A}', 'p@a.invalid', 'principal', 'Priya'), ('${ACC}', '${A}', 'acc@a.invalid', 'accountant', 'Anil');
  insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${Y}', '${A}', '2025-26', '2025-04-01', '2026-03-31', false);
  insert into classes (class_id, school_id, name) values ('${C5}', '${A}', '5-A');
  insert into students (student_id, school_id, admission_no, name, class_id, status, rte_admission, rte_entry_class, rte_admitted_on) values
    ('${KID1}', '${A}', 'M-1', 'One', '${C5}', 'active', true, '5-A', '2025-04-01'),
    ('${KID2}', '${A}', 'M-2', 'Two', '${C5}', 'active', true, '5-A', '2025-04-01'),
    ('${KID3}', '${A}', 'M-3', 'Three', '${C5}', 'active', true, '5-A', '2025-04-01');
  insert into rte_rates (rate_id, school_id, session_id, rate_minor, source, typed_by) values ('${RATE}', '${A}', '${Y}', 1300000, 'State notification of 2025', '${ACC}');
  insert into rte_claims (claim_id, school_id, student_id, session_id, class_id, rate_id, rate_minor, fee_minor, amount_minor, state, raised_on, raised_by, paid_on, reference, settled_by, settled_at) values
    ('${PAID}', '${A}', '${KID1}', '${Y}', '${C5}', '${RATE}', 1300000, 1680000, 1300000, 'paid', '2025-06-01', '${ACC}', '2025-09-01', '${reference}', '${ACC}', '2025-09-02 10:00+05:30');
  insert into rte_claims (claim_id, school_id, student_id, session_id, class_id, rate_id, rate_minor, fee_minor, amount_minor, raised_on, raised_by) values
    ('${RAISED}', '${A}', '${KID2}', '${Y}', '${C5}', '${RATE}', 1300000, 1680000, 1300000, '2025-06-01', '${ACC}');
  insert into rte_claims (claim_id, school_id, student_id, session_id, class_id, rate_id, rate_minor, fee_minor, amount_minor, state, raised_on, raised_by, write_off_note, settled_by, settled_at) values
    ('${OFF}', '${A}', '${KID3}', '${Y}', '${C5}', '${RATE}', 1300000, 1680000, 1300000, 'written_off', '2025-06-01', '${ACC}', 'The district refused it.', '${P}', '2025-10-01 10:00+05:30');
  set session_replication_role = origin;
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
afterAll(async () => db?.stop());

describe('the C225 migration on existing rows', () => {
  it('a paid claim gets its receipt; every claim keeps its class and its note; the new checks hold', async () => {
    db = await startHarnessDb({ port: 0, before: { migration: '_c225_rte_closeout.sql', sql: before('PFMS/HR/2025/0042') } });
    const receipts = (await db.pg.query(`select claim_id, amount_minor::int as amount, received_on::text as on, reference, recorded_by, reverses from rte_claim_receipts order by claim_id`)).rows;
    expect(receipts).toEqual([{ claim_id: PAID, amount: 1300000, on: '2025-09-01', reference: 'PFMS/HR/2025/0042', recorded_by: ACC, reverses: null }]);
    const claims = (await db.pg.query(`select claim_id, state, class_source, write_off_note, notes_erased_at, reopened_by from rte_claims order by claim_id`)).rows;
    expect(claims).toEqual([
      { claim_id: PAID, state: 'paid', class_source: 'current', write_off_note: null, notes_erased_at: null, reopened_by: null },
      { claim_id: RAISED, state: 'raised', class_source: 'current', write_off_note: null, notes_erased_at: null, reopened_by: null },
      { claim_id: OFF, state: 'written_off', class_source: 'current', write_off_note: 'The district refused it.', notes_erased_at: null, reopened_by: null },
    ]);
    // The 10c check on a written-off claim was replaced by the one that allows an erased note, and nothing else.
    const checks = (await db.pg.query(`select conname from pg_constraint where conrelid = 'rte_claims'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%written_off%' order by 1`)).rows.map((r: { conname: string }) => r.conname);
    expect(checks).toContain('rte_claims_written_off_check');
    expect(checks).not.toContain('rte_claims_check3');
  }, 120_000);

  it('a reference the one rule refuses stops the migration, naming the table and the column', async () => {
    await expect(startHarnessDb({ port: 0, before: { migration: '_c225_rte_closeout.sql', sql: before('NEFT 1234 5678 9012 3456') } })).rejects.toThrow(/c225_rte_closeout\.sql did not apply: C225: existing rows the one Aadhaar rule refuses: rte_claims\.reference \(1 rows\)/);
  }, 120_000);
});
