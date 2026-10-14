import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { TEMPLATE_REGISTRY } from '@/lib/whatsapp/templates';

// The student data check's routes (10b, C222), as each person's own session (C224): the office reads and writes;
// the class teacher reads their own class and writes nothing; another teacher reads nothing of that class; the
// accountant is refused; another school reaches nothing of this one; bodies that are not what a route takes are
// refused before anything is read. Every name and number is made up; nothing reaches a phone.

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

import { GET as listRoute } from '@/app/api/app/students/data-check/route';
import { POST as childRoute } from '@/app/api/app/students/data-check/[studentId]/route';
import { POST as requestRoute } from '@/app/api/app/students/data-check/requests/[requestId]/route';

const A = 'dd240000-0000-4000-8000-000000000001';
const B = 'dd240000-0000-4000-8000-000000000002';
const u = (n: number) => `dd240000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TARA, TINA, ACCOUNTANT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16)];
const [C5A, C6B] = [u(51), u(52)];
const [ARIF, FARAH] = [u(31), u(32)];
const [G_ARIF, G_FARAH] = [u(41), u(42)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const tara: Who = { role: 'teacher', user: TARA }; // class teacher of 5-A (Arif)
const tina: Who = { role: 'teacher', user: TINA }; // class teacher of 6-B (Farah), not of 5-A
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const otherSchool: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
const signIn = (w: Who) => {
  session.claims = { sub: w.user, role: w.role, schoolId: w.school ?? A, membershipId: null, tv: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session.run = (claims: any, fn: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.pg.transaction(async (tx: any) => {
      await tx.query('set local role app_user');
      for (const [k, v] of [['app.current_tenant_id', claims.schoolId], ['app.current_role', claims.role], ['app.current_user_id', claims.sub]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
      return fn(tx);
    });
};
type Json = Record<string, unknown> & { code?: string };
const list = async (w: Who, query = '') => {
  signIn(w);
  const res = await listRoute(new NextRequest(`http://school.example/api/app/students/data-check${query}`));
  return { status: res.status, body: (await res.json()) as Json };
};
const post = async (w: Who, route: (req: NextRequest, ctx: { params: Record<string, string> }) => Promise<Response>, path: string, params: Record<string, string>, body: unknown) => {
  signIn(w);
  const res = await route(new NextRequest(`http://school.example${path}`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }), { params });
  return { status: res.status, body: (await res.json()) as Json };
};
const child = (w: Who, studentId: string, body: unknown) => post(w, childRoute as never, `/api/app/students/data-check/${studentId}`, { studentId }, body);
const request = (w: Who, requestId: string, body: unknown) => post(w, requestRoute as never, `/api/app/students/data-check/requests/${requestId}`, { requestId }, body);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const owner = async (sql: string, params: unknown[] = []) => (await db.pg.query(sql, params)).rows as any[];
let REQUEST = '';

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values
      ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '00:00', '00:00'), ('${B}', 'School B', 'IN-DL', false, false, true, 100000, '00:00', '00:00');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'students', true, 'plan'), ('${B}', 'students', true, 'plan') on conflict (school_id, module_id) do update set enabled = true;
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'principal@dr-a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'admin@dr-a.example', 'school_admin', 'Asif Admin'),
      ('${TARA}', '${A}', 'tara@dr-a.example', 'teacher', 'Tara Teacher'), ('${TINA}', '${A}', 'tina@dr-a.example', 'teacher', 'Tina Teacher'),
      ('${ACCOUNTANT}', '${A}', 'accounts@dr-a.example', 'accountant', 'Anil Accountant'), ('${B_PRINCIPAL}', '${B}', 'principal@dr-b.example', 'principal', 'Bela Principal');
    insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5A}', '${A}', '5-A', '${TARA}'), ('${C6B}', '${A}', '6-B', '${TINA}');
    insert into students (student_id, school_id, admission_no, name, status, class_id, dob) values
      ('${ARIF}', '${A}', 'A-1', 'Md Arif Khan', 'active', '${C5A}', '2015-03-05'), ('${FARAH}', '${A}', 'A-2', 'Farah Ali', 'active', '${C6B}', '2013-02-11');
    insert into parents (parent_id, school_id, name, phone) values ('${G_ARIF}', '${A}', 'Rahim Khan', '9000000101'), ('${G_FARAH}', '${A}', 'Salma Ali', '9000000102');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${G_ARIF}', '${ARIF}'), ('${A}', '${G_FARAH}', '${FARAH}');
  `);
  const words = TEMPLATE_REGISTRY.find((x) => x.name === 'data_check_request')!;
  await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, $1, 1, 'en', $2, $3, 'utility', $4, 'approved')`, [words.name, words.body.en, [...words.variables], words.staleAfterMinutes]);
  await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [A, ARIF]);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
}, 120_000);
afterAll(async () => db?.stop());

describe('GET /api/app/students/data-check', () => {
  it('the office reads every class; the class teacher their own; another teacher none of that class; the accountant is refused; another school none of this one', async () => {
    const office = await list(principal);
    expect(office.status).toBe(200);
    expect((office.body.children as { name: string }[]).map((c) => c.name).sort()).toEqual(['Farah Ali', 'Md Arif Khan']);
    expect(office.body.office).toBe(true);
    const hers = await list(tara);
    expect([hers.status, (hers.body.children as { name: string }[]).map((c) => c.name), hers.body.office]).toEqual([200, ['Md Arif Khan'], false]);
    const other = await list(tina);
    expect((other.body.children as { name: string }[]).map((c) => c.name)).toEqual(['Farah Ali']);
    expect((await list(tina, `?class=${C5A}`)).body.children).toEqual([]);
    expect((await list(accountant)).status).toBe(403);
    const b = await list(otherSchool);
    expect([b.status, b.body.children]).toEqual([200, []]);
  });

  it('refuses a class that is not an id', async () => {
    expect(await list(principal, '?class=5-A')).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
    expect((await list(principal, '?class=')).status).toBe(200);
  });
});

describe('POST /api/app/students/data-check/[studentId]', () => {
  it('only the office types what Aadhaar prints, drafts and asks; every other role and another school are refused', async () => {
    const printed = { action: 'printed', name: 'Mohammad Arif Khan', dob: '2015-05-03', gender: 'male' };
    for (const w of [tara, tina, accountant]) expect((await child(w, ARIF, printed)).status, w.role).toBe(403);
    expect((await child(otherSchool, ARIF, printed)).status).toBe(404);
    expect(await owner(`select 1 from student_id_as_printed where student_id = $1`, [ARIF])).toEqual([]);
    expect(await child(admin, ARIF, printed)).toEqual({ status: 200, body: {} });

    const ask = { parentId: G_ARIF, fields: ['name', 'dob'] };
    for (const w of [tara, tina, accountant]) {
      expect((await child(w, ARIF, { action: 'draft', ...ask })).status, w.role).toBe(403);
      expect((await child(w, ARIF, { action: 'ask', ...ask })).status, w.role).toBe(403);
    }
    expect((await child(otherSchool, ARIF, { action: 'ask', ...ask })).status).toBe(404);
    const draft = await child(principal, ARIF, { action: 'draft', ...ask });
    expect(draft.status).toBe(200);
    expect(draft.body).toMatchObject({ hasNumber: true });
    expect(String(draft.body.text)).toContain('Md Arif Khan');
    expect(await owner(`select 1 from data_check_requests where student_id = $1`, [ARIF])).toEqual([]);
    const asked = await child(principal, ARIF, { action: 'ask', ...ask });
    expect(asked.status).toBe(201);
    expect(asked.body).toMatchObject({ message: 'queued' });
    REQUEST = (asked.body.requestIds as string[])[0];
    expect(await child(principal, ARIF, { action: 'ask', ...ask })).toMatchObject({ status: 409, body: { code: 'already_open' } });
  });

  it('refuses bodies it does not take, before anything is read', async () => {
    const refused = [
      [ARIF, 'not json'],
      [ARIF, {}],
      [ARIF, { action: 'delete' }],
      [ARIF, { action: 'printed', name: 'Arif' }], // every printed value is sent, blank or not
      [ARIF, { action: 'printed', name: 'x'.repeat(201), dob: '', gender: '' }],
      [ARIF, { action: 'printed', name: 7, dob: '', gender: '' }],
      [ARIF, { action: 'draft', parentId: 'someone', fields: ['name'] }],
      [ARIF, { action: 'ask', parentId: G_ARIF, fields: ['name', 'dob', 'gender', 'name'] }],
      [ARIF, { action: 'ask', parentId: G_ARIF, fields: ['address'] }],
      [ARIF, { action: 'ask', parentId: G_ARIF, fields: 'name' }],
      ['not-an-id', { action: 'printed', name: 'Arif', dob: '', gender: '' }],
    ] as const;
    for (const [id, body] of refused) expect(await child(principal, id, body), JSON.stringify(body)).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
    // What the rules refuse is said by its own code.
    expect(await child(principal, FARAH, { action: 'printed', name: 'Farah 1234 5678 9012', dob: '', gender: '' })).toMatchObject({ status: 400, body: { code: 'aadhaar_number' } });
    expect(await child(principal, FARAH, { action: 'printed', name: '', dob: '2099-01-01', gender: '' })).toMatchObject({ status: 400, body: { code: 'dob' } });
    expect(await child(principal, FARAH, { action: 'printed', name: '', dob: '', gender: 'other' })).toMatchObject({ status: 400, body: { code: 'gender' } });
    expect(await child(principal, FARAH, { action: 'ask', parentId: G_FARAH, fields: ['name'] })).toMatchObject({ status: 409, body: { code: 'not_typed' } });
    expect(await child(principal, FARAH, { action: 'ask', parentId: G_ARIF, fields: ['name'] })).toMatchObject({ status: 409, body: { code: 'not_typed' } });
    expect((await child(principal, u(99), { action: 'printed', name: 'Nobody', dob: '', gender: '' })).status).toBe(404);
    expect(await owner(`select 1 from student_id_as_printed where student_id = $1`, [FARAH])).toEqual([]);
  });
});

describe('POST /api/app/students/data-check/requests/[requestId]', () => {
  it('only the office attaches an answer, corrects or closes; every other role and another school are refused', async () => {
    for (const w of [tara, tina, accountant]) {
      expect((await request(w, REQUEST, { action: 'note', text: 'The father came in.' })).status, w.role).toBe(403);
      expect((await request(w, REQUEST, { action: 'correct', value: 'Mohammad Arif Khan' })).status, w.role).toBe(403);
      expect((await request(w, REQUEST, { action: 'close', text: 'Nothing to change.' })).status, w.role).toBe(403);
    }
    expect((await request(otherSchool, REQUEST, { action: 'correct', value: 'Mohammad Arif Khan' })).status).toBe(404);
    expect((await owner(`select outcome, office_note from data_check_requests where request_id = $1`, [REQUEST]))[0]).toEqual({ outcome: null, office_note: null });
    expect(await request(admin, REQUEST, { action: 'note', text: 'The father came in with Aadhaar.' })).toEqual({ status: 200, body: { done: true } });
    expect(await request(admin, REQUEST, { action: 'note', text: 'Again.' })).toMatchObject({ status: 409, body: { code: 'noted_already' } });
    expect(await request(principal, REQUEST, { action: 'correct', value: 'Mohammad Arif Khan' })).toEqual({ status: 200, body: { done: true } });
    expect(await request(principal, REQUEST, { action: 'close', text: 'Late.' })).toMatchObject({ status: 409, body: { code: 'decided' } });
    expect((await owner(`select name from students where student_id = $1`, [ARIF]))[0].name).toBe('Mohammad Arif Khan');
    // Audited by the detail and the request, never the value (C224).
    const [audit] = await owner(`select before_state, after_state from audit_log where event_action = 'student.data_check_corrected'`);
    expect(audit).toEqual({ before_state: null, after_state: { field: 'name', requestId: REQUEST } });
  });

  it('refuses bodies it does not take', async () => {
    const open = (await owner(`select request_id from data_check_requests where student_id = $1 and outcome is null limit 1`, [ARIF]))[0].request_id as string;
    const refused = [
      [open, 'not json'],
      [open, { action: 'note' }],
      [open, { action: 'note', text: 'x'.repeat(2001) }],
      [open, { action: 'correct', value: 'x'.repeat(201) }],
      [open, { action: 'correct', value: 2015 }],
      [open, { action: 'close', text: null }],
      [open, { action: 'reopen' }],
      ['not-an-id', { action: 'close', text: 'x' }],
    ] as const;
    for (const [id, body] of refused) expect(await request(principal, id, body), JSON.stringify(body)).toMatchObject({ status: 400, body: { code: 'not_sent_properly' } });
    expect(await request(principal, open, { action: 'note', text: 'Number 1234 5678 9012' })).toMatchObject({ status: 400, body: { code: 'aadhaar_number' } });
    expect(await request(principal, open, { action: 'correct', value: '2099-01-01' })).toMatchObject({ status: 400, body: { code: 'value' } });
    expect((await request(principal, u(98), { action: 'close', text: 'x' })).status).toBe(404);
    expect((await owner(`select outcome from data_check_requests where request_id = $1`, [open]))[0].outcome).toBeNull();
  });
});
