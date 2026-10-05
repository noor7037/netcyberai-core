import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import { describeEntitlementChange } from '@/lib/contracts/entitlements';
import { changeModuleEntitlement, changeSchoolAccess, entitlementHistory } from '@/lib/frameworks/entitlements';
import { applyPlan, DEFAULT_PLAN_ID, planById } from '@/lib/frameworks/plans';

// Control's entitlement history (C123) is the audit log's own rows: every
// change writes one, and the founder reads them back with name and reason.

let db: TestDb;
const A = randomUUID();
const B = randomUUID();
const founder = randomUUID();
const actor = { userId: founder, role: 'super_admin' as const };

beforeAll(async () => {
  db = await createTestDb();
  await db.platform(async (q) => {
    await q.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'A', 'IN-HR'), ($2, 'B', 'IN-DL')`, [A, B]);
    await q.query(`insert into users (user_id, role, display_name) values ($1, 'super_admin', 'Noor')`, [founder]);
    await applyPlan(q, A, DEFAULT_PLAN_ID, { userId: null, role: null }, 'school created from application');
    await changeModuleEntitlement(q, { schoolId: A, moduleId: 'fees', enabled: true, reason: 'pilot of fees' }, actor);
    await changeModuleEntitlement(q, { schoolId: A, moduleId: 'fees', enabled: false, reason: 'pilot ended' }, actor);
    await changeSchoolAccess(q, { schoolId: A, accessMode: 'grace', graceEndsAt: '2030-01-31T23:59:59+05:30', reason: 'payment late' }, actor);
    await changeModuleEntitlement(q, { schoolId: B, moduleId: 'fees', enabled: true, reason: 'other school' }, actor);
  });
}, 60000);

describe('entitlement history', () => {
  it('lists every change of the school, newest first, with who, what, when and why', async () => {
    const h = await db.platform((q) => entitlementHistory(q, A));
    const label = (id: string) => ({ fees: 'Fees' })[id] ?? id;
    expect(h.map((e) => [describeEntitlementChange(e, label), e.actorName, e.reason])).toEqual([
      ['Access set to grace period (was full access)', 'Noor', 'payment late'],
      ['Fees switched off', 'Noor', 'pilot ended'],
      ['Fees switched on', 'Noor', 'pilot of fees'],
      [`Plan “standard” applied: ${planById(DEFAULT_PLAN_ID)!.modules.length} modules switched on`, null, 'school created from application'],
    ]);
    expect(h[1].enabled).toEqual({ from: true, to: false });
    expect(h[2].enabled).toEqual({ from: null, to: true });
    expect(h[0].graceEndsAt).toBe('2030-01-31T18:29:59.000Z');
    expect(h.every((e) => !Number.isNaN(Date.parse(e.at)))).toBe(true);
  });

  it('is the founder’s to read: a school role cannot read another school’s, and sees only its own audit rows', async () => {
    const principal = { role: 'principal' as any, sub: randomUUID(), schoolId: B };
    expect((await db.tenant(principal, (q) => entitlementHistory(q, A))).length).toBe(0);
    expect((await db.tenant(principal, (q) => entitlementHistory(q, B))).map((e) => e.reason)).toEqual(['other school']);
  });
});
