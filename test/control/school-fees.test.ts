import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// Control → a school → Fees (W13-D): the founder reads one school's fee totals, students with dues, and the last 30
// days of payments by day and by method. Everything here is made up. Sums are in paise and exact.

const hoisted = vi.hoisted(() => ({ claims: null as unknown, run: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => hoisted.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => (hoisted.run as any)(claims, fn),
}));

import { GET } from '@/app/api/control/schools/[schoolId]/fees/route';

const u = (n: number) => `c13d0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [A, B, EMPTY] = [u(1), u(2), u(3)];
const [PRINCIPAL, FOUNDER, S1, S2, S3, SB] = [u(11), u(91), u(21), u(22), u(23), u(24)];
const TODAY = `(now() at time zone 'Asia/Kolkata')::date`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const signIn = (role: string, user: string, school: string | null) => {
  hoisted.claims = { sub: user, role, schoolId: school, membershipId: school ? u(100) : null, tokenVersion: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hoisted.run = (claims: any, fn: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.pg.transaction(async (tx: any) => {
      await tx.query(claims.role === 'super_admin' ? 'set local role nca_super' : 'set local role app_user');
      for (const [k, v] of [['app.current_tenant_id', claims.schoolId ?? '00000000-0000-0000-0000-000000000000'], ['app.current_role', claims.role], ['app.current_user_id', claims.sub]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
      return fn(tx);
    });
};
const get = (id: string) => GET(new NextRequest(`http://control.example/api/control/schools/${id}/fees`), { params: { schoolId: id } });

describe('the Fees tab of a school, in Control', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL'), ('${EMPTY}', 'School Empty', 'IN-HR');
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${FOUNDER}', null, 'f@x.invalid', 'super_admin', 'Founder', true), ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true);
    `);
    await db.pg.exec(`
      insert into students (student_id, school_id, admission_no, name, status) values
        ('${S1}', '${A}', 'A-1', 'Asha', 'active'), ('${S2}', '${A}', 'A-2', 'Bela', 'active'), ('${S3}', '${A}', 'A-3', 'Esha', 'active'), ('${SB}', '${B}', 'B-1', 'Farah', 'active');
    `);
    const fee = async (school: string, student: string, minor: number, due: string, status: string) =>
      (await db.pg.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date, status) values ($1, $2, $3, ${due}, $4) returning fee_id`, [school, student, minor, status])).rows[0].fee_id as string;
    const pay = (school: string, feeId: string, minor: number, method: string, daysAgo: number) =>
      db.pg.query(`insert into payments (school_id, fee_id, amount_minor, method, received_at) values ($1, $2, $3, $4, now() - ($5 || ' days')::interval)`, [school, feeId, minor, method, String(daysAgo)]);
    // School A: S1 owes an overdue 10,001.37 and part paid 3,000.00 (a week ago, cash); S2 owes something not yet due (1,500.50);
    // S3 paid in full today by UPI and 40 days ago by cash (outside the 30 days).
    const f1 = await fee(A, S1, 1000137 + 300000, `${TODAY} - 9`, 'partial');
    await pay(A, f1, 300000, 'cash', 7);
    await fee(A, S2, 150050, `${TODAY} + 5`, 'pending');
    const f3 = await fee(A, S3, 250000, `${TODAY} - 60`, 'paid');
    await pay(A, f3, 100000, 'upi', 0);
    await pay(A, f3, 150000, 'cash', 40);
    // School B's money never counts for A.
    const fb = await fee(B, SB, 99999900, `${TODAY} - 3`, 'paid');
    await pay(B, fb, 99999900, 'upi', 1);
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('a principal is refused', async () => {
    signIn('principal', PRINCIPAL, A);
    expect((await get(A)).status).toBe(403);
  });

  it('a school id that is not a uuid is not found', async () => {
    signIn('super_admin', FOUNDER, null);
    expect((await get('not-a-uuid')).status).toBe(404);
  });

  it('the super admin gets this school’s totals, in exact paise, and nothing of another school', async () => {
    signIn('super_admin', FOUNDER, null);
    const res = await get(A);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasFees).toBe(true);
    expect(body.summary).toMatchObject({ collectedMinor: 300000 + 250000, pendingMinor: 150050, overdueMinor: 1000137, overdueCount: 1 });
    expect(body.studentsWithDues).toBe(2);
    // Last 30 days only: the 40-day-old cash payment and school B's UPI money are left out.
    expect(body.byMethod).toEqual([
      { method: 'cash', amountMinor: 300000, count: 1 },
      { method: 'upi', amountMinor: 100000, count: 1 },
    ]);
    expect(body.perDay.map((d: { amountMinor: number; count: number }) => [d.amountMinor, d.count])).toEqual([[300000, 1], [100000, 1]]);
    expect(body.perDay[0].day < body.perDay[1].day).toBe(true);
    // No names or bank details are in the answer.
    expect(JSON.stringify(body)).not.toMatch(/Priya|Asha|Bela|Esha|razorpay|account_no|ifsc/i);
  });

  it('the other school has its own answer, and a school with nothing set up says so', async () => {
    signIn('super_admin', FOUNDER, null);
    const b = await (await get(B)).json();
    expect(b.byMethod).toEqual([{ method: 'upi', amountMinor: 99999900, count: 1 }]);
    expect(b.summary.collectedMinor).toBe(99999900);
    const empty = await (await get(EMPTY)).json();
    expect(empty.hasFees).toBe(false);
    expect(empty.summary).toMatchObject({ collectedMinor: 0, pendingMinor: 0, overdueMinor: 0 });
    expect(empty.byMethod).toEqual([]);
  });
});
