import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import { writeAuditLog } from '@/lib/audit/log';
import { changeModuleEntitlement, changeSchoolAccess, entitlementHistory } from '@/lib/frameworks/entitlements';
import { applyPlan, DEFAULT_PLAN_ID } from '@/lib/frameworks/plans';

// C124: the founder's reason for an entitlement change is founder-only,
// enforced in the database. Every school-side read below runs as app_user
// with the school's own tenant and role, as a real request does.

let db: TestDb;
const A = randomUUID();
const B = randomUUID();
const founder = randomUUID();
const staff = randomUUID();
const actor = { userId: founder, role: 'super_admin' as const };
const SCHOOL_ROLES = ['principal', 'school_admin', 'teacher', 'accountant', 'academic_coordinator'] as const;
const OLD_REASON = 'older reason: fee waiver agreed on a call';
const NEW_REASONS = ['school created from application', 'pilot of fees', 'payment late'];

const as = (role: string, schoolId = A) => ({ role: role as any, sub: staff, schoolId });
const denied = /permission denied for table entitlement_change_reasons/;

beforeAll(async () => {
  // Two entitlement rows written the way they were before C124 (the reason
  // inside after_state), in place before the migration runs.
  db = await createTestDb({
    before: {
      migration: 'c124_founder_reasons',
      sql: `
        insert into schools (school_id, name, jurisdiction) values ('${A}', 'A', 'IN-HR'), ('${B}', 'B', 'IN-DL');
        insert into audit_log (school_id, event_action, target_type, target_id, after_state) values
          ('${A}', 'entitlement.plan_applied', 'school_entitlements', '${A}', '{"plan":"standard","modules":["fees"],"reason":"${OLD_REASON}"}'),
          ('${A}', 'student.updated', 'students', 'x', '{"reason":"a school''s own note"}');`,
    },
  });
  await db.platform(async (q) => {
    await q.query(`insert into users (user_id, role, display_name) values ($1, 'super_admin', 'Noor')`, [founder]);
    await applyPlan(q, A, DEFAULT_PLAN_ID, { userId: null, role: null }, NEW_REASONS[0]);
    await changeModuleEntitlement(q, { schoolId: A, moduleId: 'fees', enabled: true, reason: NEW_REASONS[1] }, actor);
    await changeSchoolAccess(q, { schoolId: A, accessMode: 'grace', graceEndsAt: '2030-01-31T23:59:59+05:30', reason: NEW_REASONS[2] }, actor);
    await changeModuleEntitlement(q, { schoolId: B, moduleId: 'fees', enabled: true, reason: 'other school' }, actor);
  });
}, 60000);

describe('founder reasons are founder-only (C124)', () => {
  it('no school role can read, write, change or delete the reasons table', async () => {
    for (const role of SCHOOL_ROLES) {
      await expect(db.tenant(as(role), (q) => q.query(`select reason from entitlement_change_reasons`))).rejects.toThrow(denied);
      await expect(db.tenant(as(role), (q) => q.query(`select count(*) from entitlement_change_reasons where school_id = $1`, [A]))).rejects.toThrow(denied);
    }
    const p = as('principal');
    await expect(db.tenant(p, (q) => q.query(`insert into entitlement_change_reasons (audit_id, school_id, reason) select max(audit_id), $1, 'x' from audit_log`, [A]))).rejects.toThrow(denied);
    await expect(db.tenant(p, (q) => q.query(`update entitlement_change_reasons set reason = 'x'`))).rejects.toThrow(denied);
    await expect(db.tenant(p, (q) => q.query(`delete from entitlement_change_reasons`))).rejects.toThrow(denied);
    // The history query joins that table, so it fails for a school role too.
    await expect(db.tenant(p, (q) => entitlementHistory(q, A))).rejects.toThrow(denied);
  });

  it('claiming the super_admin role as app_user opens nothing', async () => {
    const gucs = { tenant: A, role: 'super_admin', user: staff };
    await expect(db.asRole('app_user', gucs, (q) => q.query(`select reason from entitlement_change_reasons`))).rejects.toThrow(denied);
    const { rows } = await db.asRole('app_user', gucs, (q) => q.query(`select after_state, before_state from audit_log where event_action like 'entitlement.%'`));
    expect(rows.length).toBeGreaterThan(0);
    expect(JSON.stringify(rows)).not.toContain('reason');
  });

  it('anon, authenticated and app_backend cannot read it either', async () => {
    for (const role of ['anon', 'authenticated', 'app_backend'] as const) {
      await expect(db.asRole(role, { tenant: A, role: 'principal' }, (q) => q.query(`select reason from entitlement_change_reasons`))).rejects.toThrow(/permission denied/);
    }
  });

  it('a school reads its own entitlement audit rows, none of them with a reason', async () => {
    for (const role of SCHOOL_ROLES) {
      const { rows } = await db.tenant(as(role), (q) => q.query(`select event_action, before_state, after_state from audit_log where event_action like 'entitlement.%' order by audit_id`));
      // The three changes made after C124: what changed, never why.
      expect(rows.map((r) => r.event_action)).toEqual(['entitlement.plan_applied', 'entitlement.module_changed', 'entitlement.access_changed']);
      const text = JSON.stringify(rows);
      expect(text).not.toContain('reason');
      for (const reason of [...NEW_REASONS, OLD_REASON]) expect(text).not.toContain(reason);
      expect(rows[1].after_state).toMatchObject({ enabled: true, source: 'founder_override' });
    }
  });

  it('the older row that carries a reason is hidden from every school role, by any route', async () => {
    for (const role of SCHOOL_ROLES) {
      const all = await db.tenant(as(role), (q) => q.query(`select audit_id, after_state from audit_log`));
      expect(JSON.stringify(all.rows)).not.toContain(OLD_REASON);
      const n = await db.tenant(as(role), (q) => q.query(`select count(*)::int n from audit_log where after_state ->> 'reason' like 'older%'`));
      expect(n.rows[0].n).toBe(0);
    }
    // Only entitlement rows are hidden: the school's own row with a reason stays.
    const own = await db.tenant(as('principal'), (q) => q.query(`select after_state ->> 'reason' r from audit_log where event_action = 'student.updated'`));
    expect(own.rows).toEqual([{ r: "a school's own note" }]);
  });

  it('the founder reads every reason, the older one included, and only for the school asked', async () => {
    const h = await db.platform((q) => entitlementHistory(q, A));
    expect(h.map((e) => e.reason)).toEqual([NEW_REASONS[2], NEW_REASONS[1], NEW_REASONS[0], OLD_REASON]);
    expect((await db.platform((q) => entitlementHistory(q, B))).map((e) => e.reason)).toEqual(['other school']);
    expect((await db.tenant({ role: 'super_admin', sub: founder, schoolId: null }, (q) => entitlementHistory(q, A))).length).toBe(4);
  });

  it('a row written the old way (a deployment from before C124) is hidden from the school and kept for the founder', async () => {
    const entry = { schoolId: B, actorUserId: founder, actorRole: 'super_admin' as const, eventAction: 'entitlement.module_changed', targetId: 'fees' };
    await db.platform((q) => writeAuditLog(q, { ...entry, afterState: { enabled: false, reason: 'written the old way' } }));
    await db.platform((q) => writeAuditLog(q, { ...entry, beforeState: { reason: 'in before_state' }, afterState: { enabled: true } }));
    for (const role of SCHOOL_ROLES) {
      const { rows } = await db.tenant(as(role, B), (q) => q.query(`select before_state, after_state from audit_log`));
      expect(JSON.stringify(rows)).not.toMatch(/written the old way|in before_state/);
    }
    // Nested, in a list, or in another letter case: hidden all the same.
    await db.platform((q) => writeAuditLog(q, { ...entry, afterState: { meta: { Reason: 'nested why' } } }));
    await db.platform((q) => writeAuditLog(q, { ...entry, eventAction: 'Entitlement.Module_Changed', afterState: [{ REASON: 'listed why' }] }));
    // anon and authenticated hold SELECT on audit_log on the live database.
    await db.query(`grant select on audit_log to anon, authenticated`);
    const readers = [...SCHOOL_ROLES.map((role) => ['app_user', role] as const), ['anon', 'principal'] as const, ['authenticated', 'super_admin'] as const];
    for (const [dbRole, role] of readers) {
      const { rows } = await db.asRole(dbRole, { tenant: B, role, user: staff }, (q) => q.query(`select before_state, after_state from audit_log`));
      expect(JSON.stringify(rows)).not.toMatch(/written the old way|in before_state|nested why|listed why/);
    }
    const h = await db.platform((q) => entitlementHistory(q, B));
    expect(h.map((e) => e.reason)).toEqual([null, null, 'written the old way', 'other school']);
  });

  it('both tables stay append-only, for the founder too', async () => {
    await expect(db.platform((q) => q.query(`update entitlement_change_reasons set reason = 'rewritten'`))).rejects.toThrow(/permission denied/);
    await expect(db.platform((q) => q.query(`delete from entitlement_change_reasons`))).rejects.toThrow(/permission denied/);
    await expect(db.platform((q) => q.query(`update audit_log set after_state = after_state - 'reason'`))).rejects.toThrow(/permission denied/);
    await expect(db.tenant(as('principal'), (q) => q.query(`delete from audit_log`))).rejects.toThrow(/permission denied/);
    // One reason per audit row.
    await expect(db.platform((q) => q.query(`insert into entitlement_change_reasons (audit_id, school_id, reason) select audit_id, school_id, 'second' from entitlement_change_reasons limit 1`))).rejects.toThrow(/duplicate key/);
  });

  it('the hash chain is unbroken: a school role’s next row links to a row it cannot see', async () => {
    // A's newest row is hidden from the principal: an older-style entitlement row.
    await db.query(`insert into audit_log (school_id, event_action, target_id, after_state) values ($1, 'entitlement.access_changed', $2, '{"reason":"hidden tail"}')`, [A, A]);
    const p = as('principal');
    expect((await db.tenant(p, (q) => q.query(`select 1 from audit_log where after_state ->> 'reason' = 'hidden tail'`))).rows.length).toBe(0);
    await db.tenant(p, (q) => writeAuditLog(q, { schoolId: A, actorUserId: null, actorRole: 'principal', eventAction: 'student.updated', targetId: 'y' }));
    // A platform row written by a school role (no school): not readable by it either.
    await db.tenant(p, (q) => writeAuditLog(q, { schoolId: null, actorUserId: null, actorRole: 'principal', eventAction: 'login.ok', targetId: '1' }));
    await db.tenant(p, (q) => writeAuditLog(q, { schoolId: null, actorUserId: null, actorRole: 'principal', eventAction: 'login.ok', targetId: '2' }));

    for (const school of [A, B, null]) {
      const { rows } = await db.query(
        `select prev_hash, row_hash, event_action, target_id, occurred_at::text t,
                encode(extensions.digest(coalesce(prev_hash,'') || event_action || coalesce(target_id,'') || occurred_at::text, 'sha256'), 'hex') expected
         from audit_log where school_id is not distinct from $1 order by occurred_at`,
        [school]
      );
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((r, i) => {
        expect(r.prev_hash).toBe(i === 0 ? '0' : rows[i - 1].row_hash);
        expect(r.row_hash).toBe(r.expected);
      });
    }
  });
});
