import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import { describeEntitlementChange } from '@/lib/contracts/entitlements';
import { changeModuleEntitlement, changeSchoolAccess, entitlementHistory } from '@/lib/frameworks/entitlements';
import { applyPlan, DEFAULT_PLAN_ID, planById } from '@/lib/frameworks/plans';

// Control's entitlement history (C123) is the audit log's own rows: every
// change writes one, and the founder reads them back with name and reason
// (the reason from the founder-only table, C124).

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
    await changeModuleEntitlement(q, { schoolId: A, moduleId: 'exams', enabled: true, reason: 'pilot of exams' }, actor);
    await changeModuleEntitlement(q, { schoolId: A, moduleId: 'exams', enabled: false, reason: 'pilot ended' }, actor);
    await changeSchoolAccess(q, { schoolId: A, accessMode: 'grace', graceEndsAt: '2030-01-31T23:59:59+05:30', reason: 'payment late' }, actor);
    await changeModuleEntitlement(q, { schoolId: B, moduleId: 'exams', enabled: true, reason: 'other school' }, actor);
  });
}, 60000);

// The module switched by hand here must be one the standard plan does not hold: Fees was, until it became partly live (C157).
describe('entitlement history', () => {
  it('lists every change of the school, newest first, with who, what, when and why', async () => {
    const h = await db.platform((q) => entitlementHistory(q, A));
    const label = (id: string) => ({ exams: 'Exams' })[id] ?? id;
    expect(h.map((e) => [describeEntitlementChange(e, label), e.actorName, e.reason])).toEqual([
      ['Access set to grace period (was full access)', 'Noor', 'payment late'],
      ['Exams switched off', 'Noor', 'pilot ended'],
      ['Exams switched on', 'Noor', 'pilot of exams'],
      [`Plan “standard” applied: ${planById(DEFAULT_PLAN_ID)!.modules.length} modules switched on`, null, 'school created from application'],
    ]);
    expect(h[1].enabled).toEqual({ from: true, to: false });
    expect(h[2].enabled).toEqual({ from: null, to: true });
    expect(h[0].graceEndsAt).toBe('2030-01-31T18:29:59.000Z');
    expect(h.every((e) => !Number.isNaN(Date.parse(e.at)))).toBe(true);
  });

  it('is the founder’s to read: a school role cannot read it, for its own school or another (C124)', async () => {
    const principal = { role: 'principal' as any, sub: randomUUID(), schoolId: B };
    const denied = /permission denied for table entitlement_change_reasons/;
    await expect(db.tenant(principal, (q) => entitlementHistory(q, A))).rejects.toThrow(denied);
    await expect(db.tenant(principal, (q) => entitlementHistory(q, B))).rejects.toThrow(denied);
  });
});
