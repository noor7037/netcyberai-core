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
import { DELETE as deleteRoute, GET as stepsRoute, POST as stepRoute } from '@/app/api/app/admissions/[enquiryId]/route';
import { POST as familyRoute } from '@/app/api/app/admissions/family/route';
import { POST as logDsrRoute } from '@/app/api/app/students/[studentId]/dsr/route';
import { POST as authorizeRoute } from '@/app/api/app/dsr/[requestId]/authorize/route';
import { POST as executeRoute } from '@/app/api/app/dsr/[requestId]/execute/route';
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

  it('C224: the office deletes an enquiry and a family’s enquiries; a teacher and an accountant are refused; an admitted one is never deleted', async () => {
    const del = async (w: Who, id: string) => {
      signIn(w);
      const res = await deleteRoute(new NextRequest(`http://school.example/api/app/admissions/${id}`, { method: 'DELETE' }), { params: { enquiryId: id } });
      return { status: res.status, body: await res.json() };
    };
    const made = await call(principal, recordRoute, '/api/app/admissions', { ...enquiry, childName: 'Ira Example', phone: '9800000210' });
    const IRA = made.body.enquiryId as string;
    for (const w of [tara, accountant]) expect((await del(w, IRA)).status, w.role).toBe(403);
    expect((await del(principal, 'not-an-id')).status).toBe(400);
    expect((await del(principal, u(98))).status).toBe(404);
    expect(await del(principal, IRA)).toMatchObject({ status: 200, body: { deleted: IRA, steps: 2 } }); // recorded, and its note
    expect((await del(principal, IRA)).status).toBe(404);
    // Zoya was admitted above: her enquiry is the child's record.
    const zoya = (await call(principal, listRoute, '/api/app/admissions')).body.enquiries.find((e: { child_name: string }) => e.child_name === 'Zoya Example');
    expect(await del(principal, zoya.enquiry_id)).toMatchObject({ status: 409, body: { code: 'admitted' } });

    // A family that never joined: found by the phone in the body (never in the address), deleted as shown.
    const family = (action: string, extra: Record<string, unknown>) => ({ action, ...extra });
    const one = (await call(principal, recordRoute, '/api/app/admissions', { ...enquiry, childName: 'Om Example', phone: '9800000211' })).body.enquiryId;
    const two = (await call(principal, recordRoute, '/api/app/admissions', { ...enquiry, childName: 'Uma Example', phone: '+91 98000 00211', classId: C6A })).body.enquiryId;
    for (const w of [tara, accountant]) {
      expect((await call(w, familyRoute, '/api/app/admissions/family', family('find', { phone: '9800000211' }))).status, w.role).toBe(403);
      expect((await call(w, familyRoute, '/api/app/admissions/family', family('delete', { phone: '9800000211', enquiryIds: [one, two] }))).status, w.role).toBe(403);
    }
    expect((await call(principal, familyRoute, '/api/app/admissions/family', { action: 'everything' })).status).toBe(400);
    expect(await call(principal, familyRoute, '/api/app/admissions/family', family('find', { phone: '123' }))).toMatchObject({ status: 400, body: { code: 'phone' } });
    const found = await call(principal, familyRoute, '/api/app/admissions/family', family('find', { phone: '98000 00211' }));
    expect(found.status).toBe(200);
    expect(found.body.phone).toBe('+919800000211');
    expect(found.body.enquiries.map((e: { child_name: string }) => e.child_name).sort()).toEqual(['Om Example', 'Uma Example']);
    expect(await call(principal, familyRoute, '/api/app/admissions/family', family('delete', { phone: '98000 00211', enquiryIds: [one] }))).toMatchObject({ status: 409, body: { code: 'changed' } });
    expect(await call(principal, familyRoute, '/api/app/admissions/family', family('delete', { phone: '98000 00211', enquiryIds: [one, two] }))).toMatchObject({ status: 200, body: { deleted: 2 } });
    expect((await db.pg.query(`select count(*)::int as n from admission_enquiries where phone = '+919800000211'`)).rows[0].n).toBe(0);
    const audit = JSON.stringify((await db.pg.query(`select before_state, after_state from audit_log where event_action in ('admissions.deleted', 'admissions.family_deleted')`)).rows);
    for (const word of ['Example', '98000', '+91']) expect(audit, word).not.toContain(word);
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

// Last: it erases a child the page tests above still list by name.
describe('the erasure of a data request', () => {
  it('C224: the erasure of a data request blanks the admitted child’s enquiry, and its audit row holds counts only', async () => {
    const zoya = (await call(principal, listRoute, '/api/app/admissions')).body.enquiries.find((e: { child_name: string }) => e.child_name === 'Zoya Example');
    signIn(principal);
    await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'parents', true, 'plan') on conflict (school_id, module_id) do update set enabled = true`, [A]);
    const post = async (route: (req: NextRequest, ctx: { params: Record<string, string> }) => Promise<Response>, path: string, params: Record<string, string>, body: unknown) => {
      const res = await route(new NextRequest(`http://school.example${path}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), { params });
      return { status: res.status, body: await res.json() };
    };
    const logged = await post(logDsrRoute as never, `/api/app/students/${zoya.student_id}/dsr`, { studentId: zoya.student_id }, { requestType: 'deletion', requestedByDescription: 'The mother, in person' });
    expect(logged.status).toBe(201);
    const id = logged.body.request_id as string;
    expect((await post(authorizeRoute as never, `/api/app/dsr/${id}/authorize`, { requestId: id }, {})).status).toBe(200);
    const done = await post(executeRoute as never, `/api/app/dsr/${id}/execute`, { requestId: id }, {});
    expect(done.status).toBe(200);
    expect(done.body.result).toMatchObject({ admissionEnquiriesErased: 1 });
    const after = (await call(principal, listRoute, '/api/app/admissions')).body.enquiries.find((e: { enquiry_id: string }) => e.enquiry_id === zoya.enquiry_id);
    expect([after.child_name, after.guardian_name, after.phone, after.stage]).toEqual([null, null, null, 'admitted']);
    const [row] = (await db.pg.query(`select after_state from audit_log where event_action = 'dsr.deletion_executed' and target_id = $1`, [zoya.student_id])).rows;
    expect(row.after_state).toMatchObject({ admissionEnquiriesErased: 1, admissionStepsErased: expect.any(Number) });
    expect(JSON.stringify(row.after_state)).not.toMatch(/Zoya|Nadia|98000/);
  });
});
