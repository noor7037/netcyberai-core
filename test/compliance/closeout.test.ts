import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { indiaDate } from '@/lib/time/india';

// C232 part B, the compliance desk's close-out (the supervisor's answers in C230-A for 10d, and the founder's reason
// for viewing a school beside its audit row), on the whole schema as each person's own session:
//   B1  the office erases the qualification row of a person who has left, through a definer function; a member of the
//       teaching staff keeps theirs; another school's person is not found; audited with ids and a count;
//   B2  a teacher reads their own qualification row and nothing else of the desk, read-only, on their account page;
//       the accountant reads Form 6 on the Fees page, read-only, with no qualification data;
//   B3  the CPI and the filing deadline are entered on the desk by the principal or the school admin, each with an
//       https source and the day it was read; never a default number; who entered it is the database's;
//   B4  the school's Compliance page shows the reason for each viewing from the viewing's own row.
// Every name, address and number is made up.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const session = vi.hoisted(() => ({ claims: null as any, run: null as any }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => session.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => session.claims }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/app/compliance/desk' }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => session.run(claims, fn),
}));

import AccountPage from '@/app/(school)/app/account/page';
import CompliancePage from '@/app/(school)/app/compliance/page';
import FeesPage from '@/app/(school)/app/fees/page';
import { POST as figuresRoute } from '@/app/api/app/compliance/form6/figures/route';
import { DELETE as eraseRoute } from '@/app/api/app/compliance/qualifications/[userId]/route';
import { GET as mineRoute } from '@/app/api/app/compliance/qualifications/mine/route';
import { MyQualificationsPanel } from '@/components/account/MyQualificationsPanel';
import { Form6Panel } from '@/components/compliance/Form6Panel';
import { computeForm6Advisory, readFigure, readSource, saveForm6Figure, type Form6Advisory } from '@/lib/compliance/form6';
import { eraseQualification, loadOwnQualification, loadRegister, saveQualification } from '@/lib/compliance/qualifications';

const A = 'c2320000-0000-4000-8000-0000000000a1';
const B = 'c2320000-0000-4000-8000-0000000000b1';
const u = (n: number) => `c2320000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, ACCOUNTANT, TEACHER, TEACHER2, COORDINATOR, LEFT, MOVED, PRINCIPAL_B, FOUNDER] = [u(1), u(2), u(3), u(4), u(5), u(6), u(7), u(8), u(9), u(10)];
const TODAY = indiaDate();
const YESTERDAY = indiaDate(new Date(Date.now() - 86_400_000));
const TOMORROW = indiaDate(new Date(Date.now() + 86_400_000));
const SOURCE = 'https://statistics.example.invalid/cpi/annual-release';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const teacher: Who = { role: 'teacher', user: TEACHER };
const teacher2: Who = { role: 'teacher', user: TEACHER2 };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const actor = (w: Who) => ({ schoolId: w.school ?? A, userId: w.user, role: w.role as any });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T = any,>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
const signIn = (w: Who) => {
  session.claims = { sub: w.user, role: w.role, schoolId: w.school ?? A, membershipId: null, tv: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session.run = (claims: any, fn: any) => as({ role: claims.role, user: claims.sub, school: claims.schoolId }, fn);
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Route = (req: NextRequest, ctx: any) => Promise<Response>;
const call = async (w: Who, route: Route, url: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: unknown, params: Record<string, string> = {}) => {
  signIn(w);
  const init = method === 'GET' ? undefined : { method, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
  const res = await route(new NextRequest(`http://school.example${url}`, init as never), { params });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { text };
  }
  return { status: res.status, body: json };
};
const row = (over: Record<string, string> = {}) => ({ stage: '', subjects: '', degree: '', postgraduate_degree: '', professional_qualification: '', tet_type: '', tet_paper: '', tet_certificate_date: '', tet_valid_until: '', other_approval: '', other_valid_until: '', ...over });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const audits = async (action: string): Promise<any[]> => (await db.pg.query(`select actor_user_id, target_id, before_state, after_state from audit_log where school_id = $1 and event_action = $2 order by audit_id`, [A, action])).rows;
const planOff = () => db.pg.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'starter') on conflict (school_id) do update set plan_id = 'starter'`, [A]);
const planOn = () => db.pg.query(`delete from school_subscriptions where school_id = $1`, [A]);
const advisory = (w: Who = principal): Promise<Form6Advisory> => as(w, (c) => computeForm6Advisory(c, A, 'IN-HR'));

// Every element of a page's tree, server components already called by the page itself.
function elements(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const props = node.props as { children?: ReactNode };
  return [node, ...elements(props.children)];
}

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-DL', false);
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard'), ('${B}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source)
      select s, m, true, 'plan' from unnest(array['${A}', '${B}']::uuid[]) s, unnest(array['compliance', 'fees', 'staff']) m on conflict do nothing;
    insert into users (user_id, school_id, email, role, display_name) values
      ('${FOUNDER}', null, 'f@platform.example', 'super_admin', 'Founder'),
      ('${PRINCIPAL}', '${A}', 'p@a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'ad@a.example', 'school_admin', 'Asif Admin'),
      ('${ACCOUNTANT}', '${A}', 'acc@a.example', 'accountant', 'Anil Accountant'), ('${TEACHER}', '${A}', 't@a.example', 'teacher', 'Tara Teacher'),
      ('${TEACHER2}', '${A}', 't2@a.example', 'teacher', 'Tanvi Teacher'), ('${COORDINATOR}', '${A}', 'co@a.example', 'academic_coordinator', 'Kiran Coordinator'),
      ('${LEFT}', '${A}', 'left@a.example', 'teacher', 'Lata Left'), ('${MOVED}', '${A}', 'moved@a.example', 'teacher', 'Mohan Moved'),
      ('${PRINCIPAL_B}', '${B}', 'p@b.example', 'principal', 'Bela Principal');
    insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true);
  `);
  // The office records four rows; then one teacher leaves and another moves to the office's accounts.
  for (const [who, stage] of [[TEACHER, 'primary'], [COORDINATOR, 'secondary'], [LEFT, 'upper'], [MOVED, 'pre']] as const) {
    const saved = await as(principal, (c) => saveQualification(c, actor(principal), who, row({ stage, degree: 'B.A.', tet_type: 'CTET', tet_paper: 'I', tet_certificate_date: '2022-06-01' })));
    if (!saved.ok) throw new Error(`not saved: ${saved.reason}`);
  }
  await db.pg.exec(`update users set is_active = false where user_id = '${LEFT}'; update users set role = 'accountant' where user_id = '${MOVED}';`);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('B2: a staff member reads their own qualification row, read-only', () => {
  it('a teacher and the coordinator read their own row and no one else’s; the accountant reads none; another school none', async () => {
    expect((await as(teacher, (c) => c.query(`select user_id from staff_qualifications`))).rows).toEqual([{ user_id: TEACHER }]);
    expect((await as(coordinator, (c) => c.query(`select user_id from staff_qualifications`))).rows).toEqual([{ user_id: COORDINATOR }]);
    expect((await as(accountant, (c) => c.query(`select user_id from staff_qualifications`))).rows).toEqual([]);
    expect((await as(principalB, (c) => c.query(`select user_id from staff_qualifications`))).rows).toEqual([]);
    // The register and the rest of the desk stay the office's.
    expect(await as(teacher, (c) => loadRegister(c, actor(teacher)))).toBeNull();
    expect((await as(teacher, (c) => c.query(`select count(*)::int as n from disclosure_entries`))).rows[0].n).toBe(0);
  });

  it('read-only: a teacher changes, adds or removes nothing, not even their own row', async () => {
    expect((await as(teacher, (c) => c.query(`update staff_qualifications set degree = 'M.A.' where user_id = $1`, [TEACHER]))).affectedRows ?? 0).toBe(0);
    await expect(as(teacher, (c) => c.query(`insert into staff_qualifications (school_id, user_id, updated_by, stage) values ($1, $2, $2, 'pre')`, [A, TEACHER2]))).rejects.toThrow(/row-level security|policy/);
    await expect(as(teacher, (c) => c.query(`delete from staff_qualifications where user_id = $1`, [TEACHER]))).rejects.toThrow(/permission denied/);
    expect(await as(teacher, (c) => saveQualification(c, actor(teacher), TEACHER, row({ stage: 'pre' })))).toEqual({ ok: false, reason: 'not_allowed' });
  });

  it('the account page shows it to the teaching staff: their own row with who changed it; nothing for the accountant', async () => {
    const own = await as(teacher, (c) => loadOwnQualification(c, actor(teacher)));
    expect(own).toMatchObject({ applies: true, updated_by: 'Priya Principal', qualification: { stage: 'primary', degree: 'B.A.', tet_type: 'CTET', tet_paper: 'I', tet_certificate_date: '2022-06-01', tet_valid_until: null } });
    expect(await as(teacher2, (c) => loadOwnQualification(c, actor(teacher2)))).toEqual({ applies: true, qualification: null, updated_by: null, updated_at: null });
    expect(await as(accountant, (c) => loadOwnQualification(c, actor(accountant)))).toEqual({ applies: false, qualification: null, updated_by: null, updated_at: null });
    const r = await call(teacher, mineRoute, '/api/app/compliance/qualifications/mine');
    expect(r).toMatchObject({ status: 200, body: { applies: true, qualification: { stage: 'primary' } } });
    // A teacher with no row, in a school whose plan has no desk, is shown nothing.
    await planOff();
    expect(await as(teacher2, (c) => loadOwnQualification(c, actor(teacher2)))).toMatchObject({ applies: false });
    expect(await as(teacher, (c) => loadOwnQualification(c, actor(teacher)))).toMatchObject({ applies: true });
    await planOn();
    const panelOf = async (w: Who) => {
      signIn(w);
      return elements(await AccountPage()).some((e) => e.type === MyQualificationsPanel);
    };
    expect(await panelOf(teacher)).toBe(true);
    expect(await panelOf(coordinator)).toBe(true);
    expect(await panelOf(accountant)).toBe(false);
  });

  it('the accountant reads Form 6 on the Fees page, read-only and with no qualification data; nobody else gets it there', async () => {
    const formOf = async (w: Who) => {
      signIn(w);
      return elements(await FeesPage({ searchParams: {} })).find((e) => e.type === Form6Panel) as ReactElement<{ initial: Form6Advisory; place: string; canEnter?: boolean }> | undefined;
    };
    const panel = await formOf(accountant);
    expect(panel?.props).toMatchObject({ place: 'fees', initial: { jurisdictionApplies: true } });
    expect(panel?.props.canEnter).toBeUndefined();
    expect(JSON.stringify(panel?.props.initial)).not.toMatch(/qualification|tet|degree/i);
    const html = renderToStaticMarkup(createElement(Form6Panel, { initial: panel!.props.initial, place: 'fees' }));
    expect(html).toContain('data-cdk-form6="fees"');
    expect(html).toContain('Read only.');
    expect(html).not.toContain('data-cdk-f6-enter');
    expect(html).not.toContain('data-cdk-f6-form');
    for (const w of [principal, teacher]) expect(await formOf(w), w.role).toBeUndefined();
    // Where Form 6 does not apply, the Fees page shows nothing of it.
    expect(renderToStaticMarkup(createElement(Form6Panel, { initial: { ...panel!.props.initial, jurisdictionApplies: false }, place: 'fees' }))).toBe('');
  });
});

describe('B1: erasing the qualification row of a person who has left', () => {
  it('the desk lists the people with a row who are no longer on the register', async () => {
    const reg = (await as(principal, (c) => loadRegister(c, actor(principal))))!;
    expect(reg.former.map((f) => [f.name, f.active])).toEqual([['Lata Left', false], ['Mohan Moved', true]]);
    expect(reg.staff.map((s) => s.user_id)).not.toContain(LEFT);
  });

  it('the office erases it; a member of the teaching staff keeps theirs; anyone else, or another school, is refused', async () => {
    for (const w of [teacher, coordinator, accountant]) expect(await as(w, (c) => eraseQualification(c, actor(w), LEFT)), w.role).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => eraseQualification(c, actor(principal), TEACHER))).toEqual({ ok: false, reason: 'on_register' });
    expect(await as(principalB, (c) => eraseQualification(c, actor(principalB), LEFT))).toEqual({ ok: false, reason: 'not_found' });
    expect(await as(principal, (c) => eraseQualification(c, actor(principal), LEFT))).toEqual({ ok: true, erased: 1 });
    expect(await as(principal, (c) => eraseQualification(c, actor(principal), LEFT))).toEqual({ ok: false, reason: 'not_found' });
    expect((await db.pg.query(`select count(*)::int as n from staff_qualifications where user_id = $1`, [LEFT])).rows[0].n).toBe(0);
    expect((await as(principal, (c) => loadRegister(c, actor(principal))))!.former.map((f) => f.name)).toEqual(['Mohan Moved']);
  });

  it('the database holds the same rule: the office of the person’s own school only, never a member of the teaching staff; the app’s role still cannot delete', async () => {
    await expect(as(teacher, (c) => c.query(`select public.erase_staff_qualification($1)`, [MOVED]))).rejects.toThrow(/principal or the school admin/);
    await expect(as(principal, (c) => c.query(`select public.erase_staff_qualification($1)`, [TEACHER]))).rejects.toThrow(/changed, never erased/);
    expect((await as(principalB, (c) => c.query(`select public.erase_staff_qualification($1) as n`, [MOVED]))).rows[0].n).toBeNull();
    await expect(as(principal, (c) => c.query(`delete from staff_qualifications where user_id = $1`, [MOVED]))).rejects.toThrow(/permission denied/);
    expect((await db.pg.query(`select count(*)::int as n from staff_qualifications where user_id = $1`, [MOVED])).rows[0].n).toBe(1);
  });

  it('the route: the office erases, a teacher is refused, a member of the staff keeps theirs, and a school without the desk is refused', async () => {
    const url = `/api/app/compliance/qualifications/${MOVED}`;
    expect((await call(teacher, eraseRoute, url, 'DELETE', undefined, { userId: MOVED })).status).toBe(403);
    expect(await call(admin, eraseRoute, `/api/app/compliance/qualifications/${TEACHER}`, 'DELETE', undefined, { userId: TEACHER })).toMatchObject({ status: 409, body: { code: 'on_register' } });
    expect((await call(admin, eraseRoute, '/api/app/compliance/qualifications/x', 'DELETE', undefined, { userId: 'x' })).status).toBe(400);
    await planOff();
    expect((await call(admin, eraseRoute, url, 'DELETE', undefined, { userId: MOVED })).status).toBe(403);
    await planOn();
    expect(await call(admin, eraseRoute, url, 'DELETE', undefined, { userId: MOVED })).toMatchObject({ status: 200, body: { erased: 1 } });
    expect((await call(admin, eraseRoute, url, 'DELETE', undefined, { userId: MOVED })).status).toBe(404);
  });

  it('audited with the person’s id and a count, never a name or what the row said', async () => {
    const rows = await audits('compliance_desk.qualification_erased');
    expect(rows).toEqual([
      { actor_user_id: PRINCIPAL, target_id: LEFT, before_state: null, after_state: { rows: 1 } },
      { actor_user_id: ADMIN, target_id: MOVED, before_state: null, after_state: { rows: 1 } },
    ]);
  });
});

describe('B3: the CPI and the filing deadline, entered with their source and the day read', () => {
  it('what the office sends is read strictly: a percent with at most two places, an https address with a host, a real day that has come', () => {
    expect(readFigure({ figure: 'cpi', percent: '4.85', source: ` ${SOURCE} `, readOn: YESTERDAY }, TODAY)).toEqual({ ok: true, value: { figure: 'cpi', clear: false, percent: 4.85, source: SOURCE, readOn: YESTERDAY } });
    expect(readFigure({ figure: 'cpi', percent: -1.5, source: SOURCE, readOn: TODAY }, TODAY)).toMatchObject({ ok: true, value: { percent: -1.5 } });
    for (const percent of ['4.855', '100', '', 'abc', '5%', '1e1', null]) expect(readFigure({ figure: 'cpi', percent, source: SOURCE, readOn: TODAY }, TODAY), String(percent)).toEqual({ ok: false, reason: 'percent' });
    expect(readFigure({ figure: 'deadline', deadline: '2027-02-01', source: SOURCE, readOn: TODAY }, TODAY)).toMatchObject({ ok: true, value: { figure: 'deadline', deadline: '2027-02-01' } });
    expect(readFigure({ figure: 'deadline', deadline: '2027-02-30', source: SOURCE, readOn: TODAY }, TODAY)).toEqual({ ok: false, reason: 'deadline' });
    expect(readFigure({ figure: 'cpi', percent: '4', source: SOURCE, readOn: TOMORROW }, TODAY)).toEqual({ ok: false, reason: 'future' });
    expect(readFigure({ figure: 'cpi', percent: '4', source: SOURCE, readOn: '01-10-2026' }, TODAY)).toEqual({ ok: false, reason: 'read_on' });
    expect(readFigure({ figure: 'cpi', clear: true }, TODAY)).toEqual({ ok: true, value: { figure: 'cpi', clear: true } });
    expect(readFigure({ figure: 'fees', clear: true }, TODAY)).toEqual({ ok: false, reason: 'figure' });
    for (const source of ['http://statistics.example.invalid/cpi', 'https://localhost/cpi', 'statistics.example.invalid', 'https://a.example/ x', `https://a.example/${'x'.repeat(500)}`, '', 'javascript:alert(1)']) expect(readSource(source), source).toEqual({ ok: false, reason: 'source' });
    expect(readSource('https://a.example/notice?id=1234 5678 9012'.replace(/ /g, '-'))).toEqual({ ok: false, reason: 'aadhaar' });
    // A phone's capital letter at the start is kept in small letters, as the database's rule reads the scheme.
    expect(readSource('Https://statistics.example.invalid/CPI')).toEqual({ ok: true, source: 'https://statistics.example.invalid/CPI' });
  });

  it('never a default number: nothing is set until a person enters it', async () => {
    const before = await advisory();
    expect(before).toMatchObject({ cpiState: 'unknown', cpiPercent: null, cpiSource: null, cpiReadOn: null, cpiRecordedBy: null, deadlineState: 'unknown', filingDeadline: null, filingDeadlineReadOn: null });
  });

  it('the principal enters the CPI and the school admin the deadline; the advisory shows each with its source, the day read and who entered it', async () => {
    expect(await as(principal, (c) => saveForm6Figure(c, actor(principal), 'IN-HR', { figure: 'cpi', percent: '4.85', source: SOURCE, readOn: YESTERDAY }))).toEqual({ ok: true, figure: 'cpi', cleared: false });
    expect(await as(principal, (c) => saveForm6Figure(c, actor(principal), 'IN-HR', { figure: 'cpi', percent: '4.85', source: SOURCE, readOn: YESTERDAY }))).toEqual({ ok: false, reason: 'unchanged' });
    expect(await as(admin, (c) => saveForm6Figure(c, actor(admin), 'IN-HR', { figure: 'deadline', deadline: '2027-02-01', source: 'https://education.example.invalid/notice/form-6', readOn: TODAY }))).toEqual({ ok: true, figure: 'deadline', cleared: false });
    const a = await advisory(accountant);
    expect(a).toMatchObject({ cpiState: 'within_advisory', cpiPercent: 4.85, permissibleIncreasePercent: 9.85, cpiSource: SOURCE, cpiReadOn: YESTERDAY, cpiRecordedBy: 'Priya Principal', filingDeadline: '2027-02-01', filingDeadlineReadOn: TODAY, filingDeadlineRecordedBy: 'Asif Admin', deadlineState: 'before_deadline' });
    expect(a.cpiRecordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // The desk's panel shows the source's site as the link, the day read and who entered it.
    const html = renderToStaticMarkup(createElement(Form6Panel, { initial: a, canEnter: true }));
    expect(html).toContain(`href="${SOURCE}"`);
    expect(html).toContain('>statistics.example.invalid</a>');
    expect(html).toContain('entered by Priya Principal');
    expect(html).toContain('data-cdk-f6-enter="cpi"');
  });

  it('only the principal and the school admin enter a figure, and only where Form 6 applies; the accountant reads it, a teacher reads nothing of it', async () => {
    for (const w of [accountant, teacher, coordinator]) expect(await as(w, (c) => saveForm6Figure(c, actor(w), 'IN-HR', { figure: 'cpi', percent: '3', source: SOURCE, readOn: TODAY })), w.role).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principalB, (c) => saveForm6Figure(c, actor(principalB), 'IN-DL', { figure: 'cpi', percent: '3', source: SOURCE, readOn: TODAY }))).toEqual({ ok: false, reason: 'not_haryana' });
    // And the database: the accountant cannot write the row, a teacher cannot read it.
    expect((await as(accountant, (c) => c.query(`update compliance_config set cpi_percent = 1 where school_id = $1`, [A]))).affectedRows ?? 0).toBe(0);
    await expect(as(accountant, (c) => c.query(`insert into compliance_config (school_id, state) values ($1, 'HR') on conflict (school_id) do update set advisory_muted = true`, [A]))).rejects.toThrow(/row-level security|policy/);
    expect((await as(accountant, (c) => c.query(`select cpi_percent from compliance_config`))).rows).toHaveLength(1);
    expect((await as(teacher, (c) => c.query(`select cpi_percent from compliance_config`))).rows).toEqual([]);
    expect((await as(principalB, (c) => c.query(`select cpi_percent from compliance_config`))).rows).toEqual([]);
  });

  it('the database holds the rule whenever a figure changes, and records who entered it itself', async () => {
    const change = (sql: string, params: unknown[] = []) => as(principal, (c) => c.query(`update compliance_config set ${sql} where school_id = $1`, [A, ...params]));
    await expect(change(`cpi_source = 'http://statistics.example.invalid/cpi'`)).rejects.toThrow(/https address/);
    await expect(change(`cpi_source = 'https://a.example/1234-5678-9012'`)).rejects.toThrow(/https address/);
    await expect(change(`cpi_read_on = $2`, [TOMORROW])).rejects.toThrow(/a day that has come/);
    await expect(change(`cpi_percent = 4.855`)).rejects.toThrow(/two decimal places/);
    await expect(change(`cpi_percent = 100`)).rejects.toThrow(/below 100/);
    await expect(change(`cpi_source = null`)).rejects.toThrow(/entered with its source/);
    await expect(change(`filing_deadline_read_on = null`)).rejects.toThrow(/entered with its source/);
    // Who entered it is the session's person, whatever the statement says.
    await as(admin, (c) => c.query(`update compliance_config set cpi_percent = 4.9, cpi_recorded_by = $2 where school_id = $1`, [A, PRINCIPAL]));
    expect((await advisory()).cpiRecordedBy).toBe('Asif Admin');
    // A figure is entered by a person: the platform cannot enter one with no one named.
    await expect(db.pg.query(`update compliance_config set cpi_percent = 5 where school_id = $1`, [A])).rejects.toThrow(/in their own name/);
    // Hiding the advisory (the Compliance page's mute) changes no figure and no one's name on it.
    const recordedAt = (await advisory()).cpiRecordedAt;
    await as(principal, (c) => c.query(`update compliance_config set advisory_muted = true, muted_by = $2, muted_at = now() where school_id = $1`, [A, PRINCIPAL]));
    expect(await advisory()).toMatchObject({ advisoryMuted: true, cpiPercent: 4.9, cpiRecordedBy: 'Asif Admin', cpiRecordedAt: recordedAt });
    await as(principal, (c) => c.query(`update compliance_config set advisory_muted = false where school_id = $1`, [A]));
  });

  it('a figure is cleared with its source and day; the advisory says it is not set again', async () => {
    expect(await as(principal, (c) => saveForm6Figure(c, actor(principal), 'IN-HR', { figure: 'cpi', clear: true }))).toEqual({ ok: true, figure: 'cpi', cleared: true });
    expect(await as(principal, (c) => saveForm6Figure(c, actor(principal), 'IN-HR', { figure: 'cpi', clear: true }))).toEqual({ ok: false, reason: 'unchanged' });
    expect(await advisory()).toMatchObject({ cpiState: 'unknown', cpiPercent: null, cpiSource: null, cpiReadOn: null, cpiRecordedBy: null, cpiRecordedAt: null, filingDeadline: '2027-02-01' });
  });

  it('audited with the figure and the day read, never the address', async () => {
    const rows = await audits('compliance_desk.form6_figure_saved');
    expect(rows.map((r) => r.after_state)).toEqual([
      { figure: 'cpi', cleared: false, percent: 4.85, deadline: null, readOn: YESTERDAY },
      { figure: 'deadline', cleared: false, percent: null, deadline: '2027-02-01', readOn: TODAY },
      { figure: 'cpi', cleared: true, percent: null, deadline: null, readOn: null },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/https|example\.invalid/);
  });

  it('the route: the office enters a figure; the accountant and a teacher are refused; a body not sent properly, or a school without the desk, too', async () => {
    const url = '/api/app/compliance/form6/figures';
    expect(await call(principal, figuresRoute, url, 'POST', { figure: 'cpi', percent: '5.1', source: SOURCE, readOn: TODAY })).toMatchObject({ status: 200, body: { figure: 'cpi', cleared: false } });
    expect(await call(admin, figuresRoute, url, 'POST', { figure: 'cpi', percent: '5.123', source: SOURCE, readOn: TODAY })).toMatchObject({ status: 400, body: { code: 'percent' } });
    expect(await call(admin, figuresRoute, url, 'POST', { figure: 'cpi', percent: '5', source: 'http://x.example', readOn: TODAY })).toMatchObject({ status: 400, body: { code: 'source' } });
    expect((await call(admin, figuresRoute, url, 'POST', '[1]')).status).toBe(400);
    for (const w of [accountant, teacher]) expect((await call(w, figuresRoute, url, 'POST', { figure: 'cpi', clear: true })).status, w.role).toBe(403);
    await planOff();
    expect((await call(principal, figuresRoute, url, 'POST', { figure: 'cpi', clear: true })).status).toBe(403);
    await planOn();
  });
});

describe('B4: the school reads the reason for each viewing from the viewing’s own row', () => {
  it('the Compliance page lists each viewing with as whom, when, its end and the reason; the audit row holds none', async () => {
    await db.pg.query(
      `insert into impersonation_sessions (impersonation_id, actor_user_id, target_user_id, target_school_id, reason, started_at, expires_at, ended_at)
       values ('c2320000-0000-4000-8000-0000000000e1', $1, $2, $3, 'Helping the office with the fee import', now() - interval '1 hour', now() - interval '45 minutes', now() - interval '50 minutes')`,
      [FOUNDER, PRINCIPAL, A]
    );
    signIn(principal);
    const section = elements(await CompliancePage()).find((e) => (e.props as Record<string, unknown>)['data-support-access'] !== undefined)!;
    const html = renderToStaticMarkup(section);
    expect(html).toContain('Viewed as Priya Principal');
    expect(html).toContain('Reason: Helping the office with the fee import');
    expect(html).toContain('Ended ');
    expect(html.match(/data-support-viewing/g)).toHaveLength(1);
    // Another school sees nothing of it.
    signIn(principalB);
    const other = renderToStaticMarkup(elements(await CompliancePage()).find((e) => (e.props as Record<string, unknown>)['data-support-access'] !== undefined)!);
    expect(other).not.toContain('Helping the office');
  });
});
