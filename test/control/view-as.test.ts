import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { writeAuditLog } from '@/lib/audit/log';
import { listSchoolPeople, membershipToViewAs } from '@/lib/control/people';

// The founder's "View as" (C165): which membership it opens, who is listed,
// and that the audit trail says who was really acting.

describe('which membership a "View as" opens', () => {
  const inA = { membershipId: 'm-a', schoolId: 'a', role: 'teacher' };
  const inB = { membershipId: 'm-b', schoolId: 'b', role: 'principal' };
  it('the one the founder chose on that school’s page, not the first', () => {
    expect(membershipToViewAs([inA, inB], 'm-b')).toBe(inB);
    expect(membershipToViewAs([inA, inB], 'm-a')).toBe(inA);
  });
  it('none when that membership is not this person’s (or no longer active, so not in the list)', () => {
    expect(membershipToViewAs([inA], 'm-b')).toBeNull();
    expect(membershipToViewAs([], 'm-a')).toBeNull();
  });
  it('with none named: the only membership, or nothing when there are several', () => {
    expect(membershipToViewAs([inA], null)).toBe(inA);
    expect(membershipToViewAs([inA, inB], null)).toBeNull();
  });
});

const A = 'c1000000-0000-4000-8000-000000000001';
const B = 'c1000000-0000-4000-8000-000000000002';
const FOUNDER = 'c1000000-0000-4000-8000-0000000000f1';
const PRINCIPAL = 'c1000000-0000-4000-8000-0000000000a1';
const TEACHER = 'c1000000-0000-4000-8000-0000000000a2';
const LEFT = 'c1000000-0000-4000-8000-0000000000a3';
const OTHER = 'c1000000-0000-4000-8000-0000000000b1';
const IMP = 'c1000000-0000-4000-8000-0000000000e1';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tx = (role: 'app_user' | 'nca_super', gucs: Record<string, string>, fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role ${role}`);
    for (const [k, v] of Object.entries(gucs)) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });
const asPrincipal = { 'app.current_tenant_id': A, 'app.current_role': 'principal', 'app.current_user_id': PRINCIPAL };

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name, is_active) values
        ('${FOUNDER}', null, 'f@x.invalid', 'super_admin', 'Founder', true),
        ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true), ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Tara Teacher', true),
        ('${LEFT}', '${A}', 'l@a.invalid', 'teacher', 'Left Teacher', false), ('${OTHER}', '${B}', 'o@b.invalid', 'principal', 'Other Principal', true);
      insert into memberships (user_id, school_id, role, is_active) values
        ('${PRINCIPAL}', '${A}', 'principal', true), ('${TEACHER}', '${A}', 'teacher', true), ('${LEFT}', '${A}', 'teacher', true), ('${OTHER}', '${B}', 'principal', true),
        ('${TEACHER}', '${B}', 'academic_coordinator', true);
      insert into impersonation_sessions (impersonation_id, actor_user_id, target_user_id, target_school_id, reason, expires_at) values ('${IMP}', '${FOUNDER}', '${PRINCIPAL}', '${A}', 'Founder review', now() + interval '15 minutes');
    `);
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  it('lists a school’s own people with role and status, active first; nobody from another school', async () => {
    const people = await tx('nca_super', {}, (c) => listSchoolPeople(c, A));
    expect(people.map((p: { name: string; role: string; status: string }) => [p.name, p.role, p.status])).toEqual([['Priya Principal', 'principal', 'active'], ['Tara Teacher', 'teacher', 'active'], ['Left Teacher', 'teacher', 'inactive']]);
    // The same person in another school is listed there in the role they hold there.
    expect((await tx('nca_super', {}, (c) => listSchoolPeople(c, B))).map((p: { name: string; role: string }) => [p.name, p.role])).toEqual([['Tara Teacher', 'academic_coordinator'], ['Other Principal', 'principal']]);
  });

  it('while viewing, the person’s session can read whose view it is and when it ends (the banner)', async () => {
    const row = (await tx('app_user', asPrincipal, (c) => c.query(`select i.expires_at, u.display_name from impersonation_sessions i join users u on u.user_id = i.target_user_id where i.impersonation_id = $1`, [IMP]))).rows[0];
    expect(row.display_name).toBe('Priya Principal');
    // Another school sees nothing of it.
    expect((await tx('app_user', { 'app.current_tenant_id': B, 'app.current_role': 'principal', 'app.current_user_id': OTHER }, (c) => c.query(`select 1 from impersonation_sessions`))).rows).toEqual([]);
  });

  it('an audit row written while the founder is viewing names the founder beside the person; otherwise it names nobody', async () => {
    const entry = (action: string) => ({ schoolId: A, actorUserId: PRINCIPAL, actorRole: 'principal' as const, eventAction: action, targetType: 'students', targetId: 'x', beforeState: undefined, afterState: {} });
    await tx('app_user', asPrincipal, (c) => writeAuditLog(c, entry('test.own_action')));
    await tx('app_user', { ...asPrincipal, 'app.impersonator_user_id': FOUNDER }, (c) => writeAuditLog(c, entry('test.viewed_action')));
    // The setting is for one transaction only: the next one is the person's own again.
    await tx('app_user', asPrincipal, (c) => writeAuditLog(c, entry('test.own_again')));
    const rows = (await db.pg.query(`select event_action, actor_user_id, impersonated_by from audit_log where event_action like 'test.%' order by audit_id`)).rows;
    expect(rows).toEqual([
      { event_action: 'test.own_action', actor_user_id: PRINCIPAL, impersonated_by: null },
      { event_action: 'test.viewed_action', actor_user_id: PRINCIPAL, impersonated_by: FOUNDER },
      { event_action: 'test.own_again', actor_user_id: PRINCIPAL, impersonated_by: null },
    ]);
    // The audit trail stays append-only: the mark cannot be removed afterwards.
    await expect(tx('app_user', asPrincipal, (c) => c.query(`update audit_log set impersonated_by = null where event_action = 'test.viewed_action'`))).rejects.toThrow();
  });
});
