import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import { loadControlDashboard } from '@/lib/control/dashboard';

// C132 (rule C64): the Control dashboard's platform totals count live
// schools only. One live school and one test-fixture school, each with
// students, staff, fees, messages and tickets: the fixture's rows are
// listed with the school but never added to a total. Real Postgres (PGlite).

let db: TestDb;
const LIVE = randomUUID();
const FIXTURE = randomUUID();

async function seed(school: string, n: { active: number; pending: number; staff: number; paid: number; due: number; delivered: number; blocked: number; open: number; inProgress: number }) {
  await db.query(`insert into students (school_id, name, status) select $1, 'S' || g, 'active' from generate_series(1, $2::int) g`, [school, n.active]);
  await db.query(`insert into students (school_id, name, status) select $1, 'P' || g, 'pending_consent' from generate_series(1, $2::int) g`, [school, n.pending]);
  await db.query(`insert into teachers (school_id, user_id, name) select $1, gen_random_uuid(), 'T' || g from generate_series(1, $2::int) g`, [school, n.staff]);
  await db.query(`insert into fees_ledger (school_id, student_id, amount_minor, status) values ($1, gen_random_uuid(), $2, 'paid'), ($1, gen_random_uuid(), $3, 'overdue')`, [school, n.paid, n.due]);
  await db.query(`insert into communication_log (school_id, status) select $1, 'delivered' from generate_series(1, $2::int)`, [school, n.delivered]);
  await db.query(`insert into communication_log (school_id, status) select $1, 'blocked_consent' from generate_series(1, $2::int)`, [school, n.blocked]);
  const user = randomUUID();
  for (const [status, count] of [['open', n.open], ['in_progress', n.inProgress]] as const) {
    await db.query(`insert into support_tickets (school_id, raised_by, raised_role, category, subject, body, status) select $1, $2, 'teacher', 'other', 'subject', 'a long enough body', $3 from generate_series(1, $4::int)`, [school, user, status, count]);
  }
}

beforeAll(async () => {
  db = await createTestDb();
  await db.query(`insert into schools (school_id, name, jurisdiction, is_test_fixture) values ($1, 'Live School', 'IN-HR', false), ($2, 'Fixture School', 'IN-DL', true)`, [LIVE, FIXTURE]);
  await seed(LIVE, { active: 3, pending: 1, staff: 2, paid: 1000_00, due: 250_00, delivered: 4, blocked: 1, open: 1, inProgress: 2 });
  await seed(FIXTURE, { active: 50, pending: 20, staff: 9, paid: 99_000_00, due: 77_000_00, delivered: 300, blocked: 40, open: 6, inProgress: 5 });
}, 60000);

describe('Control dashboard totals', () => {
  it('count the live school only, in every total', async () => {
    const d = await db.platform((q) => loadControlDashboard(q));
    expect(d.liveSchools).toBe(1);
    expect([d.activeStudents, d.totalStudents, d.totalStaff]).toEqual([3, 4, 2]);
    expect([d.consentActive, d.consentPending]).toEqual([3, 1]);
    expect([d.feesCollectedMinor, d.feesDueMinor]).toEqual([1000_00, 250_00]);
    expect([d.totalComms, d.blocked, d.deliveryRate]).toEqual([5, 1, 80]);
    expect(d.dailySends).toEqual([{ day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), sent: 5, delivered: 4 }]);
    expect([d.ticketsOpen, d.ticketsInProgress]).toEqual([1, 2]);
  });

  it('still list every school, the fixture with its own student count and its badge flag', async () => {
    const d = await db.platform((q) => loadControlDashboard(q));
    expect(d.schools.map((s) => [s.name, s.students, s.isFixture]).sort()).toEqual([['Fixture School', 70, true], ['Live School', 4, false]]);
  });

  it('with only fixture schools, every total is empty, not the fixture’s numbers', async () => {
    await db.query(`update schools set is_test_fixture = true where school_id = $1`, [LIVE]);
    const d = await db.platform((q) => loadControlDashboard(q));
    expect(d.liveSchools).toBe(0);
    expect([d.activeStudents, d.totalStudents, d.totalStaff, d.consentActive, d.consentPending, d.feesCollectedMinor, d.feesDueMinor, d.totalComms, d.blocked, d.ticketsOpen, d.ticketsInProgress]).toEqual(Array(11).fill(0));
    expect(d.deliveryRate).toBeNull();
    expect(d.dailySends).toEqual([]);
    expect(d.schools).toHaveLength(2);
    await db.query(`update schools set is_test_fixture = false where school_id = $1`, [LIVE]);
  });
});
