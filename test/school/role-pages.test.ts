import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// W14-A, the founder's live test of 31 Oct: a teacher opened office-only pages. A module's page asks
// moduleOffReason, which now refuses a role the module is not for (17 §5) with 'role_not_allowed', the same rule
// the APIs keep; the APIs behind the fees and staff leave pages refuse a teacher too. As each person's own session
// on the whole schema (the harness database). Every school and person here is made up.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const session = vi.hoisted(() => ({ claims: null as any, run: null as any }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => session.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => session.claims }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => session.run(claims, fn),
}));

import { moduleOffReason } from '@/lib/frameworks/page-access';
import { GET as feesSummary } from '@/app/api/app/fees/summary/route';
import { POST as leaveStep } from '@/app/api/app/staff/leave/[leaveId]/route';

const u = (n: number) => `e14a0000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const A = u(1);
const [PRINCIPAL, TEACHER, OTHER_TEACHER] = [u(11), u(12), u(13)];
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const teacher: Who = { role: 'teacher', user: TEACHER };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const signIn = (w: Who) => {
  session.claims = { sub: w.user, role: w.role, schoolId: A, membershipId: u(100), tokenVersion: 0, aal: 'aal1', sessionId: u(200) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session.run = (claims: any, fn: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.pg.transaction(async (tx: any) => {
      await tx.query('set local role app_user');
      for (const [k, v] of [['app.current_tenant_id', claims.schoolId], ['app.current_role', claims.role], ['app.current_user_id', claims.sub]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
      return fn(tx);
    });
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Route = (req: NextRequest, ctx: any) => Promise<Response>;
const call = async (w: Who, route: Route, url: string, params: Record<string, string> = {}, json?: unknown) => {
  signIn(w);
  const init: RequestInit = json === undefined ? { method: 'GET' } : { method: 'POST', body: JSON.stringify(json), headers: { 'Content-Type': 'application/json' } };
  const res = await route(new NextRequest(`http://school.example${url}`, init as never), { params });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
let leaveId = '';

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'Example Role School', 'IN-HR', false);
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values
      ('${A}', 'fees', true, 'plan'), ('${A}', 'staff', true, 'plan'), ('${A}', 'reports', true, 'plan'), ('${A}', 'attendance', true, 'plan')
      on conflict (school_id, module_id) do update set enabled = true;
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@role-school.example', 'principal', 'Priya Principal'),
      ('${TEACHER}', '${A}', 't@role-school.example', 'teacher', 'Tara Teacher'),
      ('${OTHER_TEACHER}', '${A}', 'o@role-school.example', 'teacher', 'Om Teacher');
    insert into memberships (user_id, school_id, role, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal', true), ('${TEACHER}', '${A}', 'teacher', true), ('${OTHER_TEACHER}', '${A}', 'teacher', true);
    set session_replication_role = replica;
    insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, status, recorded_by) values
      ('${A}', '${OTHER_TEACHER}', current_date + 20, current_date + 20, 'casual', 'A wedding', 'waiting', '${OTHER_TEACHER}');
    set session_replication_role = origin;
  `);
  leaveId = (await db.pg.query(`select leave_id from staff_leave where user_id = $1`, [OTHER_TEACHER])).rows[0].leave_id;
}, 120_000);
afterAll(async () => db?.stop());

describe('office-only pages refuse other roles (W14-A)', () => {
  it('a teacher is told the fees page is not for their role; the principal is not', async () => {
    signIn(teacher);
    expect(await moduleOffReason('fees')).toBe('role_not_allowed');
    expect(await moduleOffReason('staff')).toBe('role_not_allowed');
    expect(await moduleOffReason('reports')).toBe('role_not_allowed');
    // A page that serves more roles than its module says so: leave on My account is everyone's.
    expect(await moduleOffReason('staff', { roles: ['principal', 'school_admin', 'teacher'] })).not.toBe('role_not_allowed');
    // The teacher's own modules still open.
    expect(await moduleOffReason('attendance')).not.toBe('role_not_allowed');
    signIn(principal);
    expect(await moduleOffReason('fees')).not.toBe('role_not_allowed');
    expect(await moduleOffReason('staff')).not.toBe('role_not_allowed');
  });

  it('a teacher gets 403 from the fees summary and the staff leave approval; the principal is answered', async () => {
    expect((await call(teacher, feesSummary, '/api/app/fees/summary')).status).toBe(403);
    expect((await call(principal, feesSummary, '/api/app/fees/summary')).status).toBe(200);

    const refused = await call(teacher, leaveStep, `/api/app/staff/leave/${leaveId}`, { leaveId }, { action: 'approve' });
    expect(refused.status).toBe(403);
    expect((await db.pg.query(`select status from staff_leave where leave_id = $1`, [leaveId])).rows[0].status).toBe('waiting');
    const approved = await call(principal, leaveStep, `/api/app/staff/leave/${leaveId}`, { leaveId }, { action: 'approve' });
    expect(approved.status).toBe(200);
    expect((await db.pg.query(`select status from staff_leave where leave_id = $1`, [leaveId])).rows[0].status).toBe('approved');
  });
});
