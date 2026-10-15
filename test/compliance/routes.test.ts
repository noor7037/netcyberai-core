import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { TEACHER_COLUMNS } from '@/lib/free-tools/teacher-register';
import { MemoryFileStorage } from '@/lib/storage/file-storage';

// Every /api/app/compliance route of the compliance desk, its pages and the Form 6 route it shows, as each person's
// own session (C227): the principal and the school admin are answered; a teacher, the academic coordinator and the
// accountant are refused by every route of the desk; Form 6 is fee data, read by the office and the accountant from
// the fee structures themselves (never a typed copy); a body not sent properly is refused; a school whose plan does
// not have the desk is refused by every route and told so plainly on the page. Every name and number is made up.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const session = vi.hoisted(() => ({ claims: null as any, run: null as any }));
const files = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => session.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => session.claims }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/app/compliance/desk' }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => session.run(claims, fn),
}));
vi.mock('@/lib/storage/supabase-file-storage', async () => {
  const { MemoryFileStorage: Memory } = await import('@/lib/storage/file-storage');
  files.store = new Memory();
  return { supabaseFileStorage: files.store };
});

import DeskPage from '@/app/(school)/app/compliance/desk/page';
import PrintPage from '@/app/(school)/app/compliance/desk/disclosure/page';
import { GET as deskRoute } from '@/app/api/app/compliance/desk/route';
import { POST as saveRoute } from '@/app/api/app/compliance/qualifications/[userId]/route';
import { POST as importRoute } from '@/app/api/app/compliance/qualifications/import/route';
import { GET as templateRoute } from '@/app/api/app/compliance/qualifications/template/route';
import { POST as disclosureRoute } from '@/app/api/app/compliance/disclosure/route';
import { DELETE as removeItemRoute } from '@/app/api/app/compliance/disclosure/[itemId]/route';
import { GET as exportRoute } from '@/app/api/app/compliance/disclosure/export/route';
import { POST as noteRoute } from '@/app/api/app/compliance/sqaaf/route';
import { POST as fileRoute } from '@/app/api/app/compliance/sqaaf/file/route';
import { DELETE as removeEvidenceRoute, GET as linkRoute } from '@/app/api/app/compliance/sqaaf/[evidenceId]/route';
import { GET as form6Route } from '@/app/api/app/compliance/form6/route';
import { ComplianceDeskView } from '@/components/compliance/ComplianceDeskView';

const A = 'c2270000-0000-4000-8000-0000000002a1';
const u = (n: number) => `c2270000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, ACCOUNTANT, TEACHER, COORDINATOR] = [u(11), u(12), u(13), u(14), u(15)];
const [C5, Y1, Y2, HEAD, S1, S2] = [u(51), u(61), u(62), u(81), u(82), u(83)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const teacher: Who = { role: 'teacher', user: TEACHER };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const OFFICE = [principal, admin];
const OUTSIDE = [teacher, coordinator, accountant];
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
  let init: RequestInit | undefined;
  if (body instanceof FormData) {
    // As a browser sends it: the multipart body with its declared length.
    const r = new Response(body);
    const bytes = new Uint8Array(await r.arrayBuffer());
    init = { method, body: bytes, headers: { 'Content-Type': r.headers.get('content-type') ?? '', 'Content-Length': String(bytes.length) } };
  }
  else if (method !== 'GET') init = { method, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
  const req = new NextRequest(`http://school.example${url}`, init as never);
  const res = await route(req, { params });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { text };
  }
  return { status: res.status, body: json, text };
};
const planOff = () => db.pg.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'starter') on conflict (school_id) do update set plan_id = 'starter'`, [A]);
const planOn = () => db.pg.query(`delete from school_subscriptions where school_id = $1`, [A]);
const blankRow = { stage: '', subjects: '', degree: '', postgraduate_degree: '', professional_qualification: '', tet_type: '', tet_paper: '', tet_certificate_date: '', tet_valid_until: '', other_approval: '', other_valid_until: '' };

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false);
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'compliance', true, 'plan'), ('${A}', 'fees', true, 'plan') on conflict do nothing;
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@school-a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'ad@school-a.example', 'school_admin', 'Asif Admin'),
      ('${ACCOUNTANT}', '${A}', 'acc@school-a.example', 'accountant', 'Anil Accountant'), ('${TEACHER}', '${A}', 't@school-a.example', 'teacher', 'Tara Teacher'),
      ('${COORDINATOR}', '${A}', 'co@school-a.example', 'academic_coordinator', 'Kiran Coordinator');
    insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values
      ('${Y1}', '${A}', '2025-26', '2025-04-01', '2026-03-31', false), ('${Y2}', '${A}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name) values ('${C5}', '${A}', '5-A');
    insert into fee_heads (head_id, school_id, name, is_mandatory) values ('${HEAD}', '${A}', 'Tuition', true);
    insert into fee_structures (structure_id, school_id, class_id, academic_year, session_id, effective_from, created_by) values
      ('${S1}', '${A}', '${C5}', '2025-26', '${Y1}', '2025-04-01', '${PRINCIPAL}'), ('${S2}', '${A}', '${C5}', '2026-27', '${Y2}', '2026-04-01', '${PRINCIPAL}');
    insert into fee_structure_items (school_id, structure_id, head_id, amount_minor, frequency) values ('${A}', '${S1}', '${HEAD}', 100000, 'monthly'), ('${A}', '${S2}', '${HEAD}', 105000, 'monthly');
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('the desk’s routes, as each person', () => {
  it('the office reads the desk; a teacher, the coordinator and the accountant are refused', async () => {
    for (const w of OFFICE) {
      const r = await call(w, deskRoute, '/api/app/compliance/desk');
      expect(r.status, w.role).toBe(200);
      expect(Object.keys(r.body)).toEqual(['register', 'disclosure', 'sqaaf']);
      expect((r.body.sqaaf as { totals: { standards: number } }).totals.standards).toBe(84);
    }
    for (const w of OUTSIDE) expect((await call(w, deskRoute, '/api/app/compliance/desk')).status, w.role).toBe(403);
  });

  it('saving a teacher’s row: the office only; a body not sent properly, an Aadhaar number or someone who is not teaching staff is refused', async () => {
    const ok = await call(principal, saveRoute, `/api/app/compliance/qualifications/${TEACHER}`, 'POST', { ...blankRow, stage: 'primary', tet_type: 'CTET', tet_paper: 'I', tet_certificate_date: '2022-01-10' }, { userId: TEACHER });
    expect(ok).toMatchObject({ status: 200, body: { changed: ['stage', 'tet_type', 'tet_paper', 'tet_certificate_date'] } });
    expect((await call(admin, saveRoute, '/api/app/compliance/qualifications/x', 'POST', blankRow, { userId: 'x' })).status).toBe(400);
    expect((await call(admin, saveRoute, `/api/app/compliance/qualifications/${TEACHER}`, 'POST', '[1]', { userId: TEACHER })).status).toBe(400);
    expect(await call(admin, saveRoute, `/api/app/compliance/qualifications/${TEACHER}`, 'POST', { ...blankRow, degree: 'B.A. 1234 5678 9012' }, { userId: TEACHER })).toMatchObject({ status: 400, body: { code: 'aadhaar', field: 'degree' } });
    expect((await call(admin, saveRoute, `/api/app/compliance/qualifications/${ACCOUNTANT}`, 'POST', blankRow, { userId: ACCOUNTANT })).status).toBe(404);
    for (const w of OUTSIDE) expect((await call(w, saveRoute, `/api/app/compliance/qualifications/${TEACHER}`, 'POST', blankRow, { userId: TEACHER })).status, w.role).toBe(403);
  });

  it('the CSV template is in the tool’s own columns; the import previews and saves', async () => {
    const t = await call(principal, templateRoute, '/api/app/compliance/qualifications/template');
    expect(t.status).toBe(200);
    expect(t.text.replace(/^﻿/, '').trim()).toBe(TEACHER_COLUMNS.join(','));
    const csv = `${TEACHER_COLUMNS.join(',')}\r\nKiran Coordinator,Secondary (IX–X),Science,B.Sc.,M.Sc.,B.Ed,None,,,,,\r\n`;
    const preview = await call(principal, importRoute, '/api/app/compliance/qualifications/import', 'POST', { csv, apply: false });
    expect(preview).toMatchObject({ status: 200, body: { saved: null, rows: [{ line: 1, name: 'Kiran Coordinator', status: 'ready', replaces: false }] } });
    expect(await call(admin, importRoute, '/api/app/compliance/qualifications/import', 'POST', { csv, apply: true })).toMatchObject({ status: 200, body: { saved: 1 } });
    expect((await call(admin, importRoute, '/api/app/compliance/qualifications/import', 'POST', { csv })).status).toBe(400);
    for (const w of OUTSIDE) {
      expect((await call(w, importRoute, '/api/app/compliance/qualifications/import', 'POST', { csv, apply: false })).status, w.role).toBe(403);
      expect((await call(w, templateRoute, '/api/app/compliance/qualifications/template')).status, w.role).toBe(403);
    }
  });

  it('the disclosure: add, change, remove, and a download that is exactly what is kept, audited with a count only', async () => {
    const added = await call(principal, disclosureRoute, '/api/app/compliance/disclosure', 'POST', { itemId: null, heading: 'Affiliation number', value: '530000', source: 'CBSE affiliation letter' });
    expect(added.status).toBe(201);
    const itemId = added.body.itemId as string;
    expect((await call(admin, disclosureRoute, '/api/app/compliance/disclosure', 'POST', { itemId, heading: 'Affiliation number', value: '530001', source: 'CBSE affiliation letter, corrected' })).status).toBe(200);
    const gone = await call(admin, disclosureRoute, '/api/app/compliance/disclosure', 'POST', { itemId: null, heading: 'Old item', value: 'x', source: 'y' });
    expect((await call(admin, removeItemRoute, `/api/app/compliance/disclosure/${gone.body.itemId}`, 'DELETE', undefined, { itemId: gone.body.itemId as string })).status).toBe(200);
    expect((await call(admin, removeItemRoute, `/api/app/compliance/disclosure/${gone.body.itemId}`, 'DELETE', undefined, { itemId: gone.body.itemId as string })).status).toBe(404);
    expect((await call(admin, disclosureRoute, '/api/app/compliance/disclosure', 'POST', { itemId: 'nope', heading: 'a', value: 'b', source: 'c' })).status).toBe(400);
    expect(await call(admin, disclosureRoute, '/api/app/compliance/disclosure', 'POST', { itemId: null, heading: 'a', value: '', source: 'c' })).toMatchObject({ status: 400, body: { code: 'value' } });
    const csv = await call(principal, exportRoute, '/api/app/compliance/disclosure/export');
    expect(csv.status).toBe(200);
    const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^1,Affiliation number,530001,"CBSE affiliation letter, corrected",Asif Admin,\d{4}-\d{2}-\d{2}$/);
    const audit = (await db.pg.query(`select after_state from audit_log where school_id = $1 and event_action = 'compliance_desk.disclosure_exported'`, [A])).rows;
    expect(audit).toEqual([{ after_state: { items: 1, language: 'en' } }]);
    for (const w of OUTSIDE) {
      expect((await call(w, exportRoute, '/api/app/compliance/disclosure/export')).status, w.role).toBe(403);
      expect((await call(w, disclosureRoute, '/api/app/compliance/disclosure', 'POST', { itemId: null, heading: 'a', value: 'b', source: 'c' })).status, w.role).toBe(403);
      expect((await call(w, removeItemRoute, `/api/app/compliance/disclosure/${itemId}`, 'DELETE', undefined, { itemId })).status, w.role).toBe(403);
    }
  });

  it('SQAAF evidence: a note and a PDF, each tagged to a standard; a short-lived link after the row is read; removal takes the file away', async () => {
    const note = await call(principal, noteRoute, '/api/app/compliance/sqaaf', 'POST', { standardCode: '5.7.1', note: 'Admission register and fee ledger kept in the app.' });
    expect(note.status).toBe(201);
    expect(await call(principal, noteRoute, '/api/app/compliance/sqaaf', 'POST', { standardCode: '5.7.1', note: 'Aadhaar 1234 5678 9012' })).toMatchObject({ status: 400, body: { code: 'aadhaar' } });
    expect(await call(principal, noteRoute, '/api/app/compliance/sqaaf', 'POST', { standardCode: '8.1.1', note: 'x' })).toMatchObject({ status: 400, body: { code: 'unknown_standard' } });
    const form = new FormData();
    form.set('file', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'record policy.pdf', { type: 'application/pdf' }));
    form.set('standardCode', '5.7.1');
    const file = await call(admin, fileRoute, '/api/app/compliance/sqaaf/file', 'POST', form);
    expect(file.status).toBe(201);
    const id = file.body.evidenceId as string;
    const store = files.store as MemoryFileStorage;
    expect([...store.files.keys()].every((k) => k.startsWith(`${A}/sqaaf/`))).toBe(true);
    expect(await call(principal, linkRoute, `/api/app/compliance/sqaaf/${id}`, 'GET', undefined, { evidenceId: id })).toMatchObject({ status: 200, body: { url: expect.stringMatching(/^memory:\/\//) } });
    for (const w of OUTSIDE) {
      expect((await call(w, linkRoute, `/api/app/compliance/sqaaf/${id}`, 'GET', undefined, { evidenceId: id })).status, w.role).toBe(403);
      expect((await call(w, noteRoute, '/api/app/compliance/sqaaf', 'POST', { standardCode: '5.7.1', note: 'x' })).status, w.role).toBe(403);
      expect((await call(w, fileRoute, '/api/app/compliance/sqaaf/file', 'POST', form)).status, w.role).toBe(403);
      expect((await call(w, removeEvidenceRoute, `/api/app/compliance/sqaaf/${id}`, 'DELETE', undefined, { evidenceId: id })).status, w.role).toBe(403);
    }
    expect((await call(admin, removeEvidenceRoute, `/api/app/compliance/sqaaf/${id}`, 'DELETE', undefined, { evidenceId: id })).status).toBe(200);
    expect(store.files.size).toBe(0);
    expect((await call(admin, linkRoute, `/api/app/compliance/sqaaf/${id}`, 'GET', undefined, { evidenceId: id })).status).toBe(404);
  });
});

describe('Form 6 on the desk', () => {
  it('reads the fee structures, never a typed copy: a change of fee is in the next read; the office and the accountant read it, nobody else', async () => {
    const read = async (w: Who) => call(w, form6Route, '/api/app/compliance/form6');
    for (const w of [...OFFICE, accountant]) expect(await read(w), w.role).toMatchObject({ status: 200, body: { jurisdictionApplies: true, lastYearTotalMinor: 1200000, thisYearTotalMinor: 1260000, proposedIncreasePercent: 5 } });
    await db.pg.query(`update fee_structure_items set amount_minor = 110000 where structure_id = $1`, [S2]);
    expect(await read(principal)).toMatchObject({ status: 200, body: { thisYearTotalMinor: 1320000, proposedIncreasePercent: 10 } });
    for (const w of [teacher, coordinator]) expect((await read(w)).status, w.role).toBe(403);
    // No table of the desk keeps a fee figure: Form 6 has nowhere to be typed.
    const cols = (await db.pg.query(`select column_name from information_schema.columns where table_name in ('staff_qualifications', 'disclosure_entries', 'sqaaf_standards', 'sqaaf_evidence') and column_name ~ 'minor|amount|fee'`)).rows;
    expect(cols).toEqual([]);
  });
});

describe('a school whose plan does not have the desk', () => {
  it('is refused by every route of the desk', async () => {
    await planOff();
    const asked: [Route, string, 'GET' | 'POST' | 'DELETE', unknown, Record<string, string>][] = [
      [deskRoute, '/api/app/compliance/desk', 'GET', undefined, {}],
      [saveRoute, `/api/app/compliance/qualifications/${TEACHER}`, 'POST', blankRow, { userId: TEACHER }],
      [importRoute, '/api/app/compliance/qualifications/import', 'POST', { csv: 'name\r\nx\r\n', apply: false }, {}],
      [templateRoute, '/api/app/compliance/qualifications/template', 'GET', undefined, {}],
      [disclosureRoute, '/api/app/compliance/disclosure', 'POST', { itemId: null, heading: 'a', value: 'b', source: 'c' }, {}],
      [removeItemRoute, `/api/app/compliance/disclosure/${u(99)}`, 'DELETE', undefined, { itemId: u(99) }],
      [exportRoute, '/api/app/compliance/disclosure/export', 'GET', undefined, {}],
      [noteRoute, '/api/app/compliance/sqaaf', 'POST', { standardCode: '1.1.1', note: 'x' }, {}],
      [linkRoute, `/api/app/compliance/sqaaf/${u(98)}`, 'GET', undefined, { evidenceId: u(98) }],
      [removeEvidenceRoute, `/api/app/compliance/sqaaf/${u(98)}`, 'DELETE', undefined, { evidenceId: u(98) }],
    ];
    for (const w of OFFICE) for (const [route, url, method, body, params] of asked) expect((await call(w, route, url, method, body, params)).status, `${w.role} ${method} ${url}`).toBe(403);
    // The Compliance page's own Form 6 advisory is not the desk's: it stays.
    expect((await call(principal, form6Route, '/api/app/compliance/form6')).status).toBe(200);
    await planOn();
  });

  it('the page says so plainly, with the way back to the Compliance page; with the desk in the plan it is the desk', async () => {
    signIn(principal);
    const on = (await DeskPage()) as { props: { children: { type: unknown } } };
    expect(on.props.children.type).toBe(ComplianceDeskView);
    await planOff();
    const off = (await DeskPage()) as { props: { children: React.ReactElement } };
    const html = renderToStaticMarkup(off.props.children);
    expect(html).toContain('data-cdk-not-in-plan');
    expect(html).toContain('Your school’s plan does not include the compliance desk.');
    expect(html).toContain('href="/app/compliance"');
    await planOn();
  });

  it('the printable disclosure is exactly what is kept, for the office; anyone else is told it is not theirs', async () => {
    signIn(principal);
    const page = (await PrintPage()) as { props: { children: React.ReactElement } };
    const html = renderToStaticMarkup(page.props.children);
    expect(html).toContain('School A');
    expect(html.match(/data-cdk-print-item/g)).toHaveLength(1);
    expect(html).toContain('530001');
    expect(html).toContain('CBSE affiliation letter, corrected');
    signIn(teacher);
    const refused = renderToStaticMarkup(((await PrintPage()) as { props: { children: React.ReactElement } }).props.children);
    expect(refused).toContain('data-cdk-print-refused');
    expect(refused).not.toContain('530001');
  });
});
