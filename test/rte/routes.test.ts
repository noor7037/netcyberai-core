import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { indiaDate } from '@/lib/time/india';

// Every /api/app/fees/rte route of the RTE claim desk, and its page, as each person's own session (C223, C225): the
// three finance roles are answered, a teacher and the academic coordinator are refused; reopening is the principal's
// and the school admin's; a body not sent properly is refused; a school whose plan does not have the desk is
// refused by every route of the desk and told so plainly on the page. Marking a child as RTE (POST /api/app/fees/rte,
// the Fees module's own, C159) is not held back by the plan. Every name and number is made up.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const session = vi.hoisted(() => ({ claims: null as any, run: null as any }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => session.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => session.claims }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/app/fees/rte' }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => session.run(claims, fn),
}));

import RteDeskPage from '@/app/(school)/app/fees/rte/page';
import { POST as tagRoute } from '@/app/api/app/fees/rte/route';
import { GET as deskRoute } from '@/app/api/app/fees/rte/desk/route';
import { POST as rateRoute } from '@/app/api/app/fees/rte/rates/route';
import { POST as raiseRoute } from '@/app/api/app/fees/rte/claims/route';
import { POST as claimRoute } from '@/app/api/app/fees/rte/claims/[claimId]/route';
import { POST as evidenceRoute } from '@/app/api/app/fees/rte/evidence/route';
import { DELETE as removeRoute } from '@/app/api/app/fees/rte/evidence/[evidenceId]/route';
import { GET as sheetRoute } from '@/app/api/app/fees/rte/sheet/route';
import { RteDeskView } from '@/components/rte/RteDeskView';

const TODAY = indiaDate();
const CY = Number(TODAY.slice(5, 7)) >= 4 ? Number(TODAY.slice(0, 4)) : Number(TODAY.slice(0, 4)) - 1;
const START = `${CY}-04-01`;
const A = 'c2250000-0000-4000-8000-0000000002a1';
const u = (n: number) => `c2250000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, ACCOUNTANT, TEACHER, COORDINATOR] = [u(11), u(12), u(13), u(14), u(15)];
const [C5, YEAR, ASHA, BINA] = [u(51), u(61), u(71), u(72)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const teacher: Who = { role: 'teacher', user: TEACHER };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const FINANCE = [principal, admin, accountant];
const OUTSIDE = [teacher, coordinator];
const signIn = (w: Who) => {
  session.claims = { sub: w.user, role: w.role, schoolId: A, membershipId: null, tv: 0 };
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
const call = async (w: Who, route: Route, url: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: unknown, params: Record<string, string> = {}) => {
  signIn(w);
  const init = method === 'GET' ? undefined : { method, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
  const res = await route(new NextRequest(`http://school.example${url}`, init), { params });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { text };
  }
  return { status: res.status, body: json };
};
const claimOf = async (studentId: string) => (await db.pg.query(`select claim_id from rte_claims where student_id = $1`, [studentId])).rows[0]?.claim_id as string;
const planOff = () => db.pg.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'starter') on conflict (school_id) do update set plan_id = 'starter'`, [A]);
const planOn = () => db.pg.query(`delete from school_subscriptions where school_id = $1`, [A]);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false);
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'fees', true, 'plan'), ('${A}', 'students', true, 'plan') on conflict do nothing;
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@school-a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'ad@school-a.example', 'school_admin', 'Asif Admin'),
      ('${ACCOUNTANT}', '${A}', 'acc@school-a.example', 'accountant', 'Anil Accountant'), ('${TEACHER}', '${A}', 't@school-a.example', 'teacher', 'Tara Teacher'),
      ('${COORDINATOR}', '${A}', 'co@school-a.example', 'academic_coordinator', 'Kiran Coordinator');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${YEAR}', '${A}', '${CY}-${String((CY + 1) % 100).padStart(2, '0')}', '${START}', '${CY + 1}-03-31', true);
    insert into classes (class_id, school_id, name) values ('${C5}', '${A}', '5-A');
    insert into students (student_id, school_id, admission_no, name, class_id, status, rte_admission, rte_entry_class, rte_admitted_on) values
      ('${ASHA}', '${A}', 'R-1', 'Asha Example', '${C5}', 'active', true, '5-A', '${START}'),
      ('${BINA}', '${A}', 'R-2', 'Bina Example', '${C5}', 'active', true, '5-A', '${START}');
    insert into fee_heads (head_id, school_id, name, is_mandatory) values ('${u(81)}', '${A}', 'Tuition', true);
    insert into fee_structures (structure_id, school_id, class_id, academic_year, session_id, effective_from, created_by) values ('${u(82)}', '${A}', '${C5}', '${CY}', '${YEAR}', '${START}', '${PRINCIPAL}');
    insert into fee_structure_items (school_id, structure_id, head_id, amount_minor, frequency) values ('${A}', '${u(82)}', '${u(81)}', 100000, 'monthly');
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('every route of the desk, by role', () => {
  it('GET desk: the three finance roles; a teacher and the coordinator are refused; reopening is offered to the office only', async () => {
    for (const w of FINANCE) {
      const r = await call(w, deskRoute, `/api/app/fees/rte/desk?session=${YEAR}`);
      expect(r.status, w.role).toBe(200);
      expect(r.body.mayDecide, w.role).toBe(w !== accountant);
    }
    for (const w of OUTSIDE) expect((await call(w, deskRoute, '/api/app/fees/rte/desk')).status, w.role).toBe(403);
  });

  it('POST rates: refused bodies, then the rate', async () => {
    for (const w of OUTSIDE) expect((await call(w, rateRoute, '/api/app/fees/rte/rates', 'POST', { sessionId: YEAR, rate: '12000', source: 'State notification' })).status, w.role).toBe(403);
    for (const bad of [{}, { sessionId: 'x', rate: '1', source: 'State notification' }, { sessionId: YEAR, rate: 12000, source: 'State notification' }, { sessionId: YEAR, rate: '1', source: 'x'.repeat(1001) }, 'not json'])
      expect((await call(accountant, rateRoute, '/api/app/fees/rte/rates', 'POST', bad)).status, JSON.stringify(bad)).toBe(400);
    expect(await call(accountant, rateRoute, '/api/app/fees/rte/rates', 'POST', { sessionId: YEAR, rate: '12000', source: 'Notice 1234 5678 9012' })).toMatchObject({ status: 400, body: { code: 'aadhaar' } });
    expect(await call(accountant, rateRoute, '/api/app/fees/rte/rates', 'POST', { sessionId: u(99), rate: '12000', source: 'State notification' })).toMatchObject({ status: 404 });
    expect((await call(accountant, rateRoute, '/api/app/fees/rte/rates', 'POST', { sessionId: YEAR, rate: '12000', source: 'State RTE notification for the year' })).status).toBe(201);
  });

  it('POST claims: refused bodies, then the claims; a class is chosen only by the office', async () => {
    for (const w of OUTSIDE) expect((await call(w, raiseRoute, '/api/app/fees/rte/claims', 'POST', { sessionId: YEAR, studentIds: [ASHA], raisedOn: START })).status, w.role).toBe(403);
    for (const bad of [{ sessionId: YEAR, studentIds: ASHA, raisedOn: START }, { sessionId: YEAR, studentIds: [], raisedOn: START }, { sessionId: YEAR, studentIds: ['x'], raisedOn: START }, { sessionId: YEAR, studentIds: [ASHA], raisedOn: 5 }, { sessionId: YEAR, studentIds: [ASHA], raisedOn: START, classId: 'x' }])
      expect((await call(accountant, raiseRoute, '/api/app/fees/rte/claims', 'POST', bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await call(accountant, raiseRoute, '/api/app/fees/rte/claims', 'POST', { sessionId: YEAR, studentIds: [ASHA], raisedOn: START, classId: C5 })).status).toBe(403);
    expect(await call(accountant, raiseRoute, '/api/app/fees/rte/claims', 'POST', { sessionId: YEAR, studentIds: [ASHA, BINA], raisedOn: START })).toMatchObject({ status: 201, body: { raised: 2, skipped: [] } });
    expect(await call(principal, raiseRoute, '/api/app/fees/rte/claims', 'POST', { sessionId: YEAR, studentIds: [ASHA], raisedOn: START })).toMatchObject({ status: 400, body: { code: 'claimed' } });
  });

  it('POST claims/[claimId]: payments, reversal, write-off and reopening, each by the right people; refused bodies', async () => {
    const asha = await claimOf(ASHA);
    const bina = await claimOf(BINA);
    const at = (id: string) => `/api/app/fees/rte/claims/${id}`;
    for (const w of OUTSIDE) expect((await call(w, claimRoute, at(asha), 'POST', { action: 'write_off', note: 'x' }, { claimId: asha })).status, w.role).toBe(403);
    for (const bad of [{ action: 'paid', paidOn: START, reference: 'x' }, { action: 'receipt', amount: 100, receivedOn: START, reference: 'x' }, { action: 'receipt', amount: '1', receivedOn: START }, { action: 'write_off' }, { action: 'reopen', reason: 5 }, { action: 'reverse', receiptId: 'x', reason: 'typed_wrong' }])
      expect((await call(accountant, claimRoute, at(asha), 'POST', bad, { claimId: asha })).status, JSON.stringify(bad)).toBe(400);
    expect((await call(accountant, claimRoute, at('x'), 'POST', { action: 'write_off', note: 'x' }, { claimId: 'x' })).status).toBe(400);
    expect((await call(accountant, claimRoute, at(u(98)), 'POST', { action: 'write_off', note: 'x' }, { claimId: u(98) })).status).toBe(404);
    expect(await call(accountant, claimRoute, at(asha), 'POST', { action: 'receipt', amount: '20000', receivedOn: START, reference: 'PFMS/1' }, { claimId: asha })).toMatchObject({ status: 400, body: { code: 'over' } });
    expect(await call(accountant, claimRoute, at(asha), 'POST', { action: 'receipt', amount: '2000', receivedOn: START, reference: 'PFMS/1' }, { claimId: asha })).toMatchObject({ status: 200, body: { state: 'raised', dueMinor: 1000000 } });
    const receipt = (await db.pg.query(`select receipt_id from rte_claim_receipts where claim_id = $1`, [asha])).rows[0].receipt_id;
    expect(await call(accountant, claimRoute, at(asha), 'POST', { action: 'reverse', receiptId: receipt, reason: 'recorded_twice' }, { claimId: asha })).toMatchObject({ status: 200, body: { dueMinor: 1200000 } });
    expect(await call(accountant, claimRoute, at(asha), 'POST', { action: 'receipt', amount: '12000', receivedOn: START, reference: 'PFMS/2' }, { claimId: asha })).toMatchObject({ status: 200, body: { state: 'paid' } });
    expect(await call(admin, claimRoute, at(bina), 'POST', { action: 'write_off', note: 'The state refused the claim.' }, { claimId: bina })).toMatchObject({ status: 200, body: { state: 'written_off' } });
    expect((await call(accountant, claimRoute, at(bina), 'POST', { action: 'reopen', reason: 'The state will pay.' }, { claimId: bina })).status).toBe(403);
    expect(await call(admin, claimRoute, at(asha), 'POST', { action: 'reopen', reason: 'Paid already.' }, { claimId: asha })).toMatchObject({ status: 400, body: { code: 'not_written_off' } });
    expect(await call(principal, claimRoute, at(bina), 'POST', { action: 'reopen', reason: 'The state will pay.' }, { claimId: bina })).toMatchObject({ status: 200, body: { state: 'raised', dueMinor: 1200000 } });
  });

  it('POST evidence and DELETE evidence/[evidenceId]', async () => {
    for (const w of OUTSIDE) expect((await call(w, evidenceRoute, '/api/app/fees/rte/evidence', 'POST', { studentId: ASHA, kind: 'lottery', note: 'List 3' })).status, w.role).toBe(403);
    for (const bad of [{ studentId: 'x', kind: 'lottery', note: 'List 3' }, { studentId: ASHA, kind: 5, note: 'x' }, { studentId: ASHA, kind: 'lottery', documentId: 'x' }, { studentId: ASHA, kind: 'lottery', note: 7 }])
      expect((await call(accountant, evidenceRoute, '/api/app/fees/rte/evidence', 'POST', bad)).status, JSON.stringify(bad)).toBe(400);
    expect(await call(accountant, evidenceRoute, '/api/app/fees/rte/evidence', 'POST', { studentId: ASHA, kind: 'lottery', note: 'Seen 1234-5678-9012' })).toMatchObject({ status: 400, body: { code: 'aadhaar' } });
    const made = await call(accountant, evidenceRoute, '/api/app/fees/rte/evidence', 'POST', { studentId: ASHA, kind: 'lottery', note: 'Lottery list 3' });
    expect(made.status).toBe(201);
    const id = made.body.evidenceId as string;
    for (const w of OUTSIDE) expect((await call(w, removeRoute, `/api/app/fees/rte/evidence/${id}`, 'DELETE', undefined, { evidenceId: id })).status, w.role).toBe(403);
    expect((await call(principal, removeRoute, '/api/app/fees/rte/evidence/x', 'DELETE', undefined, { evidenceId: 'x' })).status).toBe(400);
    expect((await call(principal, removeRoute, `/api/app/fees/rte/evidence/${id}`, 'DELETE', undefined, { evidenceId: id })).status).toBe(200);
    expect((await call(principal, removeRoute, `/api/app/fees/rte/evidence/${id}`, 'DELETE', undefined, { evidenceId: id })).status).toBe(404);
  });

  it('GET sheet: the CSV for the three roles, audited once without the rows', async () => {
    for (const w of OUTSIDE) expect((await call(w, sheetRoute, `/api/app/fees/rte/sheet?session=${YEAR}`)).status, w.role).toBe(403);
    const r = await call(admin, sheetRoute, `/api/app/fees/rte/sheet?session=${YEAR}`);
    expect(r.status).toBe(200);
    expect(String(r.body.text)).toContain('Asha Example');
    const rows = (await db.pg.query(`select after_state from audit_log where school_id = $1 and event_action = 'rte.sheet_exported'`, [A])).rows;
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('Asha');
  });
});

describe('a school whose plan does not have the desk', () => {
  it('every route of the desk refuses everyone; marking a child as RTE still works', async () => {
    await planOff();
    const claim = await claimOf(BINA);
    const asked: [Route, string, 'GET' | 'POST' | 'DELETE', unknown, Record<string, string>][] = [
      [deskRoute, '/api/app/fees/rte/desk', 'GET', undefined, {}],
      [rateRoute, '/api/app/fees/rte/rates', 'POST', { sessionId: YEAR, rate: '12000', source: 'State RTE notification' }, {}],
      [raiseRoute, '/api/app/fees/rte/claims', 'POST', { sessionId: YEAR, studentIds: [ASHA], raisedOn: START }, {}],
      [claimRoute, `/api/app/fees/rte/claims/${claim}`, 'POST', { action: 'write_off', note: 'x' }, { claimId: claim }],
      [evidenceRoute, '/api/app/fees/rte/evidence', 'POST', { studentId: ASHA, kind: 'lottery', note: 'List 3' }, {}],
      [removeRoute, `/api/app/fees/rte/evidence/${u(97)}`, 'DELETE', undefined, { evidenceId: u(97) }],
      [sheetRoute, `/api/app/fees/rte/sheet?session=${YEAR}`, 'GET', undefined, {}],
    ];
    for (const w of FINANCE) for (const [route, url, method, body, params] of asked) expect((await call(w, route, url, method, body, params)).status, `${w.role} ${method} ${url}`).toBe(403);
    expect((await call(principal, tagRoute, '/api/app/fees/rte', 'POST', { studentId: BINA, rte: true, entryClass: '5-A', admittedOn: START })).status).toBe(200);
    await planOn();
  });

  it('the page says so plainly, with the way back to the Fees page; with the desk in the plan it is the desk', async () => {
    signIn(principal);
    const on = (await RteDeskPage()) as { props: { children: { type: unknown } } };
    expect(on.props.children.type).toBe(RteDeskView);
    await planOff();
    const off = (await RteDeskPage()) as { props: { children: React.ReactElement } };
    const html = renderToStaticMarkup(off.props.children);
    expect(html).toContain('data-rte-not-in-plan');
    expect(html).toContain('Your school’s plan does not include the RTE claim desk.');
    expect(html).toContain('href="/app/fees"');
    await planOn();
  });
});
