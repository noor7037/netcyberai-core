import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// The admissions screen and its routes (C221), as each person's own session: the office is answered; a teacher
// and an accountant are refused by the routes and shown no enquiry by the page; the module switched off answers
// nobody. Every name and number is made up.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const session = vi.hoisted(() => ({ claims: null as any, run: null as any }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => session.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => session.claims }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/app/admissions' }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => session.run(claims, fn),
}));

import AdmissionsPage from '@/app/(school)/app/admissions/page';
import AdmissionsWaitingPage from '@/app/(school)/app/admissions/waiting/page';
import { GET as listRoute, POST as recordRoute } from '@/app/api/app/admissions/route';
import { GET as stepsRoute, POST as stepRoute } from '@/app/api/app/admissions/[enquiryId]/route';
import { AdmissionsView } from '@/components/admissions/AdmissionsView';
import { AdmissionsWaiting } from '@/components/admissions/AdmissionsWaiting';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { StudentsView } from '@/components/students/StudentsView';

const A = 'ae000000-0000-4000-8000-000000000001';
const u = (n: number) => `ae000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, TARA, ACCOUNTANT] = [u(11), u(13), u(14)];
const [C5A, C6A] = [u(51), u(52)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const tara: Who = { role: 'teacher', user: TARA };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
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
const call = async (w: Who, route: (req: NextRequest, ctx: { params: { enquiryId: string } }) => Promise<Response>, path: string, body?: unknown, enquiryId = '') => {
  signIn(w);
  const res = await route(new NextRequest(`http://school.example${path}`, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), { params: { enquiryId } });
  return { status: res.status, body: await res.json() };
};
const enquiry = { childName: 'Zoya Example', guardianName: 'Nadia Example', phone: '9800000201', classId: C5A, source: 'whatsapp', ownerId: PRINCIPAL, followUp: null, nextStep: null, note: 'Asked on WhatsApp about class 5.' };

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false);
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'admissions', true, 'plan'), ('${A}', 'students', true, 'plan') on conflict do nothing;
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'),
      ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher'),
      ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant');
    insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5A}', '${A}', '5-A', '${TARA}'), ('${C6A}', '${A}', '6-A', null);
    insert into students (school_id, admission_no, name, status, class_id) values ('${A}', 'W-1', 'Waiting In 6-A', 'pending_consent', '${C6A}');
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('the routes', () => {
  let ZOYA = '';
  it('the office records, reads and admits; a teacher and an accountant are refused every one of them', async () => {
    for (const w of [tara, accountant]) {
      expect((await call(w, listRoute, '/api/app/admissions')).status, w.role).toBe(403);
      expect((await call(w, recordRoute, '/api/app/admissions', enquiry)).status, w.role).toBe(403);
    }
    const made = await call(principal, recordRoute, '/api/app/admissions', enquiry);
    expect(made.status).toBe(201);
    ZOYA = made.body.enquiryId;
    const list = await call(principal, listRoute, '/api/app/admissions');
    expect(list.status).toBe(200);
    expect(list.body.enquiries.map((e: { child_name: string; source: string; phone: string }) => [e.child_name, e.source, e.phone])).toEqual([['Zoya Example', 'whatsapp', '+919800000201']]);
    expect(list.body).toMatchObject({ quietDays: 14, me: PRINCIPAL, owners: [{ user_id: PRINCIPAL, name: 'Priya Principal' }] });
    for (const w of [tara, accountant]) {
      expect((await call(w, stepsRoute, `/api/app/admissions/${ZOYA}`, undefined, ZOYA)).status, w.role).toBe(403);
      expect((await call(w, stepRoute, `/api/app/admissions/${ZOYA}`, { action: 'admit', admissionNo: null, dob: null }, ZOYA)).status, w.role).toBe(403);
    }
    expect((await call(principal, stepRoute, `/api/app/admissions/${ZOYA}`, { action: 'outcome', note: '', stage: 'visited', nextStep: '', followUp: '', reason: '' }, ZOYA)).status).toBe(200);
    const admitted = await call(principal, stepRoute, `/api/app/admissions/${ZOYA}`, { action: 'admit', admissionNo: 'Z-1', dob: null }, ZOYA);
    expect(admitted).toMatchObject({ status: 200, body: { className: '5-A', fees: null, monthRaised: false } });
    expect(await call(principal, stepRoute, `/api/app/admissions/${ZOYA}`, { action: 'admit', admissionNo: null, dob: null }, ZOYA)).toMatchObject({ status: 409, body: { code: 'admitted' } });
    const steps = await call(principal, stepsRoute, `/api/app/admissions/${ZOYA}`, undefined, ZOYA);
    expect(steps.body.steps.map((s: { kind: string }) => s.kind)).toEqual(['recorded', 'note', 'stage', 'stage']);
    expect((await db.pg.query(`select count(*)::int as n from students where school_id = $1 and name = 'Zoya Example' and status = 'pending_consent'`, [A])).rows[0].n).toBe(1);
    expect((await call(principal, stepRoute, `/api/app/admissions/${u(99)}`, { action: 'give', ownerId: PRINCIPAL }, u(99))).status).toBe(404);
    expect((await call(principal, stepRoute, `/api/app/admissions/not-an-id`, { action: 'give', ownerId: PRINCIPAL }, 'not-an-id')).status).toBe(400);
  });

  it('switched off, Admissions answers nobody; its page keeps the children waiting for consent, a Students screen, until Students is off too', async () => {
    const turn = (module: string, enabled: boolean) =>
      db.pg.query(
        `insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, $2, $3, 'plan')
         on conflict (school_id, module_id) do update set enabled = excluded.enabled`,
        [A, module, enabled]
      );
    await turn('admissions', false);
    expect((await call(principal, listRoute, '/api/app/admissions')).status).toBe(403);
    expect((await call(principal, recordRoute, '/api/app/admissions', enquiry)).status).toBe(403);
    signIn(principal);
    // A plan without Admissions (C212 puts it in none yet) keeps the waiting list, "+ Add student" and "Import CSV".
    const kept = (await AdmissionsPage()) as { type: unknown; props: { statusFilter: string } };
    expect([kept.type, kept.props.statusFilter]).toEqual([StudentsView, 'pending_consent']);
    expect(((await AdmissionsWaitingPage()) as { type: unknown }).type).toBe(StudentsView);
    await turn('students', false);
    expect(await AdmissionsPage()).toMatchObject({ type: ModuleOffPage, props: { moduleId: 'students' } });
    expect(await AdmissionsWaitingPage()).toMatchObject({ type: ModuleOffPage, props: { moduleId: 'students' } });
    await turn('students', true);
    await turn('admissions', true);
  });
});

describe('the page', () => {
  it('the office gets the pipeline; a teacher is told enquiries are the office’s; both get the children waiting for consent they may see', async () => {
    signIn(principal);
    const page = (await AdmissionsPage()) as { type: unknown; props: { office: boolean; children: { type: unknown } } };
    expect([page.type, page.props.office, page.props.children.type]).toEqual([AdmissionsView, true, AdmissionsWaiting]);
    const office = renderToStaticMarkup((await AdmissionsWaiting())!);
    expect(office).toContain('Waiting for consent: 2');
    expect((office.match(/data-shown-row/g) ?? []).length).toBe(2);
    expect(office).toContain('Zoya Example');
    expect(office).toContain('href="/app/admissions/waiting"');
    signIn(tara);
    expect(((await AdmissionsPage()) as { props: { office: boolean } }).props.office).toBe(false);
    // A teacher: the children of her own classes (5-A), not the one waiting in 6-A, and no way to add or import.
    const hers = renderToStaticMarkup((await AdmissionsWaiting())!);
    expect(hers).toContain('Zoya Example');
    expect(hers).not.toContain('Waiting In 6-A');
    expect(hers).not.toContain('/app/admissions/waiting');
  });

  it('every student waiting for consent, with “Import CSV”, is a screen of its own under Admissions', async () => {
    signIn(principal);
    const page = (await AdmissionsWaitingPage()) as { type: unknown; props: { statusFilter: string; title: string } };
    expect([page.type, page.props.statusFilter, page.props.title]).toEqual([StudentsView, 'pending_consent', 'Waiting for consent']);
  });
});
