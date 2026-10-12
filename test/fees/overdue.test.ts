import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import { OfficeDashboardView, type OfficeDashboardData } from '@/components/dashboards/OfficeDashboardView';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { loadFeesSummary } from '@/lib/fees/overdue';
import { loadMyDay } from '@/lib/today/cards';

// "Fees overdue" (C137, C163): an entry is overdue when its due date has
// passed, by the date in India, and something is still owed on it, part
// paid or not. What counts is the unpaid balance. One rule for the
// dashboard's tile, its attention item and chart, and My Day's card.

let db: TestDb;
const A = randomUUID();
const B = randomUUID();
const principal = randomUUID();
const TODAY = `(now() at time zone 'Asia/Kolkata')::date`;
const as = (school: string) => ({ role: 'principal' as any, sub: principal, schoolId: school });

beforeAll(async () => {
  db = await createTestDb();
  await db.platform(async (q) => {
    await q.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'A', 'IN-HR'), ($2, 'B', 'IN-DL')`, [A, B]);
    const s = randomUUID();
    await q.query(
      `insert into fees_ledger (school_id, student_id, amount_minor, due_date, status) values
         ($1, $2, 100000, ${TODAY} - 1,  'pending'),   -- due yesterday, still pending: OVERDUE
         ($1, $2, 200000, ${TODAY} - 40, 'pending'),   -- long past, never marked: OVERDUE
         ($1, $2, 400000, ${TODAY} - 5,  'overdue'),   -- already stored as overdue: OVERDUE
         ($1, $2, 800000, ${TODAY},      'pending'),   -- due today: not overdue until the day is over
         ($1, $2, 1600000, ${TODAY} + 7, 'pending'),   -- not yet due
         ($1, $2, 3200000, ${TODAY} - 9, 'paid'),      -- paid, though its date has passed
         ($1, $2, 6400000, ${TODAY} - 9, 'waived'),    -- waived
         ($3, $2, 99900000, ${TODAY} - 9, 'pending')   -- another school's
      `,
      [A, s, B]
    );
    // Part paid and past its date: OVERDUE on what is left (128,000 billed, 28,000 paid). Part paid and not yet due: owed, not overdue.
    const late = (await q.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date, status) values ($1, $2, 12800000, ${TODAY} - 9, 'partial') returning fee_id`, [A, s])).rows[0].fee_id;
    const early = (await q.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date, status) values ($1, $2, 500000, ${TODAY} + 3, 'partial') returning fee_id`, [A, s])).rows[0].fee_id;
    await q.query(`insert into payments (school_id, fee_id, amount_minor) values ($1, $2, 2800000), ($1, $3, 100000)`, [A, late, early]);
  });
}, 60000);

describe('the rule, counted in the school’s own rows', () => {
  it('overdue = past its date with money still owed, part paid or not, counted on the balance', async () => {
    const f = await db.tenant(as(A), (q) => loadFeesSummary(q));
    expect(f.overdueCount).toBe(4);
    expect(f.overdueMinor).toBe(100000 + 200000 + 400000 + (12800000 - 2800000));
  });

  it('due today is not overdue yet; paid and waived never are; received is the money that came in', async () => {
    const f = await db.tenant(as(A), (q) => loadFeesSummary(q));
    expect(f.pendingMinor).toBe(800000 + 1600000 + (500000 - 100000)); // still owed and not past its date
    expect(f.collectedMinor).toBe(3200000 + 2800000 + 100000);
    expect(f.waivedMinor).toBe(6400000);
  });

  it('nothing is counted twice: the parts add up to everything the school billed', async () => {
    const f = await db.tenant(as(A), (q) => loadFeesSummary(q));
    const total = Number((await db.query(`select sum(amount_minor) as s from fees_ledger where school_id = $1`, [A])).rows[0].s);
    expect(f.collectedMinor + f.pendingMinor + f.overdueMinor + f.waivedMinor).toBe(total);
  });

  it('another school’s fees are never counted', async () => {
    const f = await db.tenant(as(B), (q) => loadFeesSummary(q));
    expect(f).toMatchObject({ overdueCount: 1, overdueMinor: 99900000, collectedMinor: 0 });
  });

  it('a school with no fees has zeros, not an error', async () => {
    const f = await db.tenant(as(randomUUID()), (q) => loadFeesSummary(q));
    expect(f).toEqual({ collectedMinor: 0, pendingMinor: 0, overdueMinor: 0, overdueCount: 0, waivedMinor: 0 });
  });
});

describe('every place that says "overdue" agrees', () => {
  it('My Day’s card counts the same four entries as the dashboard', async () => {
    const ents: SchoolEntitlements = { schoolId: A, plan: 'standard', accessMode: 'full', modules: Object.fromEntries(MODULE_REGISTRY.map((m) => [m.id, { enabled: true, source: 'plan' as const }])) };
    const day = await db.tenant(as(A), (q) => loadMyDay(q, { schoolId: A, userId: principal, role: 'principal' }, ents, { sunday: false }));
    expect(day.cards.find((c) => c.type === 'fees-overdue')).toMatchObject({ count: 4 });
  });

  it('the dashboard’s tile, attention item, hero chip and chart all show the worked-out numbers', async () => {
    const f = await db.tenant(as(A), (q) => loadFeesSummary(q));
    const data: OfficeDashboardData = {
      schoolName: 'A', activeStudents: 10, totalStudents: 10, totalStaff: 1, presentToday: 0, absentToday: 0, markedToday: 0, attendanceTrend: [],
      feesCollectedMinor: f.collectedMinor, feesPendingMinor: f.pendingMinor, feesOverdueMinor: f.overdueMinor, feesWaivedMinor: f.waivedMinor, overdueCount: f.overdueCount,
      consentPending: 0, consentTotal: 10, blockedThisWeek: 0, recentActivity: [],
    };
    const html = renderToStaticMarkup(h(OfficeDashboardView, { data }));
    expect(html).toContain('₹1,07,000'); // the tile: 1,000 + 2,000 + 4,000 + the 1,00,000 left on the part-paid fee
    expect(html).toMatch(/<span[^>]*>4<\/span> fee entries are overdue/);
    expect(html).toContain('their due date has passed and money is still owed');
    expect(html).toContain('Owed, not yet due');
    expect(html).not.toContain('Part paid (full amount billed)');
  });

  it('with nothing overdue the dashboard does not raise it', () => {
    const data: OfficeDashboardData = {
      schoolName: 'A', activeStudents: 10, totalStudents: 10, totalStaff: 1, presentToday: 0, absentToday: 0, markedToday: 0, attendanceTrend: [],
      feesCollectedMinor: 0, feesPendingMinor: 500000, feesOverdueMinor: 0, feesWaivedMinor: 0, overdueCount: 0,
      consentPending: 0, consentTotal: 10, blockedThisWeek: 0, recentActivity: [],
    };
    expect(renderToStaticMarkup(h(OfficeDashboardView, { data }))).not.toMatch(/fee entr(y is|ies are) overdue/);
  });
});
