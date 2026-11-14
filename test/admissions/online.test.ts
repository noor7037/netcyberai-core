import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// W21-M1: the online enquiry form (the one unauthenticated write into Admissions), the pipeline board's moves and
// the conversion numbers, with the principal's tile. Each person in their own session; the public route as the
// platform role, as withPlatformService runs it. Every name and number is made up.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const session = vi.hoisted(() => ({ claims: null as any, run: null as any, db: null as any }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => session.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => session.claims }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }), usePathname: () => '/app/admissions' }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withTenantContext: (claims: any, fn: any) => session.run(claims, fn),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  withPlatformService: (fn: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session.db.pg.transaction(async (tx: any) => {
      await tx.query('set local role nca_super');
      return fn(tx);
    }),
}));

import EnquirePage from '@/app/enquire/[key]/page';
import { POST as publicRoute } from '@/app/api/public/admissions/[key]/route';
import { GET as listRoute } from '@/app/api/app/admissions/route';
import { GET as stepsRoute, POST as stepRoute } from '@/app/api/app/admissions/[enquiryId]/route';
import { AdmissionsBoard } from '@/components/admissions/AdmissionsBoard';
import { AdmissionsConversion } from '@/components/admissions/AdmissionsConversion';
import { OnlineEnquiryForm } from '@/components/admissions/OnlineEnquiryForm';
import { conversion } from '@/lib/admissions/conversion';
import { formKeyFor, schoolForKey } from '@/lib/admissions/online';
import { FACTS } from '@/lib/insights/facts';
import { indiaDate } from '@/lib/time/india';

const A = 'af000000-0000-4000-8000-000000000001';
const B = 'af000000-0000-4000-8000-000000000002';
const OFF = 'af000000-0000-4000-8000-000000000003';
const u = (n: number) => `af000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const [PRINCIPAL, TARA, PRINCIPAL_B, PRINCIPAL_OFF] = [u(11), u(12), u(13), u(14)];
const [C1A, C1B, C2A, CB1, CB2, COFF] = [u(51), u(52), u(53), u(54), u(55), u(56)];
const TODAY = indiaDate();
const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const noon = (n: number) => `${day(n)}T12:00:00+05:30`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };
const signIn = (w: Who) => {
  session.claims = { sub: w.user, role: w.role, schoolId: w.school, membershipId: null, tv: 0 };
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
const send = async (key: string, body: unknown, ip = '203.0.113.7', raw?: string) => {
  const res = await publicRoute(new NextRequest(`http://school.example/api/public/admissions/${key}`, { method: 'POST', body: raw ?? JSON.stringify(body), headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip } }), { params: { key } });
  return { status: res.status, body: await res.json() };
};
const family = { childName: 'Ira', classId: C1A, guardianName: 'Meera Example', phone: '98000 00301', website: '' };
const count = async (sql: string, params: unknown[] = []) => Number((await db.pg.query(sql, params)).rows[0].n);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plain = (el: any) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

beforeAll(async () => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-w21-m1-admissions-0123456789';
  db = await startHarnessDb({ port: 0 });
  session.db = db;
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-HR', false), ('${OFF}', 'School Off', 'IN-HR', false);
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard'), ('${B}', 'standard'), ('${OFF}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values
      ('${A}', 'admissions', true, 'plan'), ('${A}', 'students', true, 'plan'), ('${B}', 'admissions', true, 'plan'), ('${B}', 'students', true, 'plan'), ('${OFF}', 'students', true, 'plan')
      on conflict (school_id, module_id) do update set enabled = excluded.enabled;
    update school_module_entitlements set enabled = false where school_id = '${OFF}' and module_id = 'admissions';
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'),
      ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher'),
      ('${PRINCIPAL_B}', '${B}', 'principal@school-b.example', 'principal', 'Bina Principal'),
      ('${PRINCIPAL_OFF}', '${OFF}', 'principal@school-off.example', 'principal', 'Omar Principal');
    insert into classes (class_id, school_id, name, grade, section) values
      ('${C1A}', '${A}', '1-A', '1', 'A'), ('${C1B}', '${A}', '1-B', '1', 'B'), ('${C2A}', '${A}', '2-A', '2', 'A'),
      ('${CB1}', '${B}', '1-A', '1', 'A'), ('${CB2}', '${B}', '2-A', '2', 'A'), ('${COFF}', '${OFF}', '1-A', '1', 'A');
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('the online enquiry form (W21-M1)', () => {
  let IRA = '';
  it('a school’s link opens its own form, one class per grade; a link the app did not make, or a school with Admissions off, opens nothing', async () => {
    expect(schoolForKey(formKeyFor(A))).toBe(A);
    const forged = formKeyFor(A).slice(0, 22) + formKeyFor(B).slice(22);
    expect(schoolForKey(forged)).toBeNull();
    expect(schoolForKey('not-a-key')).toBeNull();
    const page = await EnquirePage({ params: { key: formKeyFor(A) }, searchParams: {} });
    const html = renderToStaticMarkup(page);
    expect(html).toContain('data-enquire-state="open"');
    expect(html).toContain('School A');
    const form = (page.props.children as unknown[]).flat().find((c: unknown) => (c as { type?: unknown })?.type === OnlineEnquiryForm) as { props: { classes: { classId: string; grade: string }[] } };
    expect(form.props.classes).toEqual([{ classId: C1A, grade: '1', name: '1-A' }, { classId: C2A, grade: '2', name: '2-A' }]);
    expect(renderToStaticMarkup(h(OnlineEnquiryForm, { lang: 'hi', formKey: formKeyFor(A), classes: form.props.classes as never }))).toContain('कक्षा 1');
    for (const key of [forged, formKeyFor(OFF)]) expect(renderToStaticMarkup(await EnquirePage({ params: { key }, searchParams: {} }))).toContain('data-enquire-state="closed"');
    expect((await send(formKeyFor(OFF), { ...family, classId: COFF })).status).toBe(404);
    expect((await send(forged, family)).status).toBe(404);
  });

  it('a family’s enquiry lands as an open enquiry from the online form, given to the office, due today, its step recorded by nobody of the school, audited without a name or a phone', async () => {
    const sent = await send(formKeyFor(A), family);
    expect(sent).toEqual({ status: 201, body: { status: 'received' } });
    const row = (await db.pg.query(`select * from admission_enquiries where school_id = $1`, [A])).rows;
    expect(row).toHaveLength(1);
    IRA = row[0].enquiry_id;
    expect(row[0]).toMatchObject({ child_name: 'Ira', guardian_name: 'Meera Example', phone: '+919800000301', class_id: C1A, source: 'online', stage: 'enquiry', owner_id: PRINCIPAL, created_by: null });
    expect((await db.pg.query(`select next_follow_up::text as d from admission_enquiries where enquiry_id = $1`, [IRA])).rows[0].d).toBe(TODAY);
    const events = (await db.pg.query(`select kind, stage_to, by_user from admission_events where enquiry_id = $1 order by n`, [IRA])).rows;
    expect(events).toEqual([{ kind: 'recorded', stage_to: 'enquiry', by_user: null }]);
    const audit = (await db.pg.query(`select actor_user_id, actor_role, target_id, after_state from audit_log where event_action = 'admissions.enquiry_online'`)).rows;
    expect(audit).toEqual([{ actor_user_id: null, actor_role: null, target_id: IRA, after_state: { classId: C1A, source: 'online' } }]);
    expect(JSON.stringify(audit)).not.toMatch(/Ira|Meera|9800000301/);
    // The rate limits keep a keyed hash, never the address.
    expect(await count(`select count(*) as n from intake_rate_events where key_hash like '%203.0.113.7%'`)).toBe(0);
    // The office sees it, follows it up today, and its steps say the family sent it.
    const list = await call(principal, listRoute, '/api/app/admissions');
    expect(list.body.enquiries.map((e: { child_name: string; source: string }) => [e.child_name, e.source])).toEqual([['Ira', 'online']]);
    expect(list.body.lists.due.map((d: { enquiryId: string }) => d.enquiryId)).toEqual([IRA]);
    expect(list.body.formUrl).toMatch(new RegExp(`/enquire/${formKeyFor(A)}$`));
    const steps = await call(principal, stepsRoute, `/api/app/admissions/${IRA}`, undefined, IRA);
    expect(steps.body.steps.map((s: { kind: string; by: string | null }) => [s.kind, s.by])).toEqual([['recorded', null]]);
    // Correcting its details keeps it the family's own: it cannot be turned into another source.
    expect((await call(principal, stepRoute, `/api/app/admissions/${IRA}`, { action: 'details', childName: 'Ira', guardianName: 'Meera Example', phone: '9800000301', classId: C1B, source: 'walk_in' }, IRA)).body.code).toBe('source');
    expect((await call(principal, stepRoute, `/api/app/admissions/${IRA}`, { action: 'details', childName: 'Ira', guardianName: 'Meera Example', phone: '9800000301', classId: C1B, source: 'online' }, IRA)).status).toBe(200);
    await call(principal, stepRoute, `/api/app/admissions/${IRA}`, { action: 'details', childName: 'Ira', guardianName: 'Meera Example', phone: '9800000301', classId: C1A, source: 'online' }, IRA);
  });

  it('the same enquiry sent again is not a second; a filled or missing honeypot, a large body and bad fields are refused; a fourth from one address within the hour is refused', async () => {
    expect(await send(formKeyFor(A), family)).toEqual({ status: 200, body: { status: 'already_received' } });
    expect(await count(`select count(*) as n from admission_enquiries where school_id = $1`, [A])).toBe(1);
    const before = await count(`select count(*) as n from intake_rate_events`);
    expect((await send(formKeyFor(A), { ...family, childName: 'Bot', website: 'http://spam.example' })).body).toEqual({ error: 'rejected' });
    const { website: _, ...noHoneypot } = family;
    expect((await send(formKeyFor(A), { ...noHoneypot, childName: 'Bot' })).body).toEqual({ error: 'rejected' });
    expect((await send(formKeyFor(A), null, undefined, JSON.stringify({ ...family, childName: 'x'.repeat(3000) }))).status).toBe(413);
    expect((await send(formKeyFor(A), { ...family, phone: '12345' })).body.code).toBe('phone');
    expect((await send(formKeyFor(A), { ...family, childName: 'Ira 2345 6789 0124' })).body.code).toBe('aadhaar');
    expect((await send(formKeyFor(A), { ...family, childName: 'A name far too long for the first name field of the form' })).body.code).toBe('child_name');
    expect((await send(formKeyFor(A), { ...family, classId: C1A.replace(/1$/, '9') })).status).toBe(404);
    // Refused before the limits: none of those counted against the family.
    expect(await count(`select count(*) as n from intake_rate_events`)).toBe(before + 2); // the unknown class reached the limits (both of them)
    expect(await count(`select count(*) as n from admission_enquiries where school_id = $1`, [A])).toBe(1);
    // Limit 3 an hour from one address to one school: Ira (1), Ira again (2), the unknown class (3), so the next is refused.
    expect((await send(formKeyFor(A), { ...family, childName: 'Kabir', phone: '9800000302' })).status).toBe(429);
    // Another address is answered.
    expect((await send(formKeyFor(A), { ...family, childName: 'Kabir', phone: '9800000302' }, '198.51.100.4')).status).toBe(201);
    expect(await count(`select count(*) as n from admission_enquiries where school_id = $1 and source = 'online'`, [A])).toBe(2);
  });

  it('the board: each move is a step with who and when; lost asks why; admitted is never a move', async () => {
    const move = (stage: string, reason = '') => call(principal, stepRoute, `/api/app/admissions/${IRA}`, { action: 'outcome', note: '', stage, nextStep: '', followUp: '', reason }, IRA);
    expect((await move('visit_booked')).status).toBe(200);
    expect((await move('form_taken')).status).toBe(200);
    expect((await move('not_joining')).body.code).toBe('reason');
    expect((await move('admitted')).body.code).toBe('stage');
    expect((await move('not_joining', 'Chose a school nearer home')).status).toBe(200);
    const steps = (await db.pg.query(`select kind, stage_from, stage_to, note, by_user, at from admission_events where enquiry_id = $1 and kind = 'stage' order by n`, [IRA])).rows;
    expect(steps.map((s: { stage_from: string; stage_to: string; note: string | null; by_user: string }) => [s.stage_from, s.stage_to, s.note, s.by_user])).toEqual([
      ['enquiry', 'visit_booked', null, PRINCIPAL],
      ['visit_booked', 'form_taken', null, PRINCIPAL],
      ['form_taken', 'not_joining', 'Chose a school nearer home', PRINCIPAL],
    ]);
    expect(steps.every((s: { at: unknown }) => s.at)).toBe(true);
    const list = await call(principal, listRoute, '/api/app/admissions');
    const board = renderToStaticMarkup(h(AdmissionsBoard, { rows: list.body.enquiries, busy: false, onMove: async () => true }));
    expect(board).toMatch(/data-adm-column="enquiry" data-count="1"/);
    expect(board).toMatch(/data-adm-column="lost" data-count="1"/);
    expect(board).toMatch(/data-adm-column="admitted" data-count="0"/);
  });
});

describe('the conversion numbers and the principal’s tile (W21-M1)', () => {
  // School B, this session (started 200 days ago): five enquiries, one recorded before the session.
  //   E1 walk-in, 1-A: recorded -30, visit booked -28, form taken -20, admitted -10
  //   E2 walk-in, 1-A: recorded -25, visited -21, not joining -15
  //   E3 online,  2-A: recorded -12, form submitted -6 (straight from enquiry: visit and form the same day)
  //   E4 online,  2-A: recorded -5, still an enquiry
  //   E5 phone call, 1-A: recorded -300, before the session: not counted
  const [E1, E2, E3, E4, E5, STUDENT] = [u(61), u(62), u(63), u(64), u(65), u(66)];
  beforeAll(async () => {
    await db.pg.exec(`
      insert into academic_sessions (session_id, school_id, label, start_date, end_date, is_current) values ('${u(70)}', '${B}', 'This session', '${day(-200)}', '${day(165)}', true);
      insert into students (student_id, school_id, admission_no, name, status, class_id) values ('${STUDENT}', '${B}', 'B-1', 'Admitted One', 'pending_consent', '${CB1}');
      set session_replication_role = replica;
      insert into admission_enquiries (enquiry_id, school_id, child_name, guardian_name, phone, class_id, source, stage, owner_id, closed_reason, student_id, created_by, created_at) values
        ('${E1}', '${B}', 'One', 'Guardian One', '+919800000401', '${CB1}', 'walk_in', 'admitted', '${PRINCIPAL_B}', null, '${STUDENT}', '${PRINCIPAL_B}', '${noon(-30)}'),
        ('${E2}', '${B}', 'Two', 'Guardian Two', '+919800000402', '${CB1}', 'walk_in', 'not_joining', '${PRINCIPAL_B}', 'Moved city', null, '${PRINCIPAL_B}', '${noon(-25)}'),
        ('${E3}', '${B}', 'Three', 'Guardian Three', '+919800000403', '${CB2}', 'online', 'form_submitted', '${PRINCIPAL_B}', null, null, null, '${noon(-12)}'),
        ('${E4}', '${B}', 'Four', 'Guardian Four', '+919800000404', '${CB2}', 'online', 'enquiry', '${PRINCIPAL_B}', null, null, null, '${noon(-5)}'),
        ('${E5}', '${B}', 'Five', 'Guardian Five', '+919800000405', '${CB1}', 'phone_call', 'visited', '${PRINCIPAL_B}', null, null, '${PRINCIPAL_B}', '${noon(-300)}');
      insert into admission_events (school_id, enquiry_id, kind, stage_from, stage_to, note, student_id, by_user, at, n) values
        ('${B}', '${E1}', 'recorded', null, 'enquiry', null, null, '${PRINCIPAL_B}', '${noon(-30)}', 1),
        ('${B}', '${E1}', 'stage', 'enquiry', 'visit_booked', null, null, '${PRINCIPAL_B}', '${noon(-28)}', 2),
        ('${B}', '${E1}', 'stage', 'visit_booked', 'form_taken', null, null, '${PRINCIPAL_B}', '${noon(-20)}', 3),
        ('${B}', '${E1}', 'stage', 'form_taken', 'admitted', null, '${STUDENT}', '${PRINCIPAL_B}', '${noon(-10)}', 4),
        ('${B}', '${E2}', 'recorded', null, 'enquiry', null, null, '${PRINCIPAL_B}', '${noon(-25)}', 1),
        ('${B}', '${E2}', 'stage', 'enquiry', 'visited', null, null, '${PRINCIPAL_B}', '${noon(-21)}', 2),
        ('${B}', '${E2}', 'stage', 'visited', 'not_joining', 'Moved city', null, '${PRINCIPAL_B}', '${noon(-15)}', 3),
        ('${B}', '${E3}', 'recorded', null, 'enquiry', null, null, null, '${noon(-12)}', 1),
        ('${B}', '${E3}', 'stage', 'enquiry', 'form_submitted', null, null, '${PRINCIPAL_B}', '${noon(-6)}', 2),
        ('${B}', '${E4}', 'recorded', null, 'enquiry', null, null, null, '${noon(-5)}', 1),
        ('${B}', '${E5}', 'recorded', null, 'enquiry', null, null, '${PRINCIPAL_B}', '${noon(-300)}', 1),
        ('${B}', '${E5}', 'stage', 'enquiry', 'visited', null, null, '${PRINCIPAL_B}', '${noon(-299)}', 2);
      set session_replication_role = origin;
    `);
  });

  it('per source and per class sought: enquiries, visits, forms, admitted, and the average days between, this session', async () => {
    signIn(principalB);
    const c = await session.run(session.claims, (tx: never) => conversion(tx, B, TODAY));
    expect(c.from).toBe(day(-200));
    expect(c.total).toEqual({ enquiries: 4, visits: 3, forms: 2, admitted: 1, days: { toVisit: 4, toForm: 4, toAdmitted: 10 } });
    expect(c.rate).toBe(25);
    expect(c.bySource).toEqual([
      { key: 'online', label: null, enquiries: 2, visits: 1, forms: 1, admitted: 0, days: { toVisit: 6, toForm: 0, toAdmitted: null } },
      { key: 'walk_in', label: null, enquiries: 2, visits: 2, forms: 1, admitted: 1, days: { toVisit: 3, toForm: 8, toAdmitted: 10 } },
    ]);
    expect(c.byClass.map((r: { label: string; enquiries: number; admitted: number }) => [r.label, r.enquiries, r.admitted])).toEqual([['1-A', 2, 1], ['2-A', 2, 0]]);
    // With no current session, every enquiry is counted, and the screen says so.
    await db.pg.exec(`update academic_sessions set is_current = false where school_id = '${B}'`);
    const all = await session.run(session.claims, (tx: never) => conversion(tx, B, TODAY));
    expect([all.from, all.total.enquiries, all.total.visits]).toEqual([null, 5, 4]);
    expect(plain(h(AdmissionsConversion, { data: all }))).toContain('No current session is set, so every enquiry is counted.');
    await db.pg.exec(`update academic_sessions set is_current = true where school_id = '${B}'`);
    // A teacher of the school reads no enquiry: the database answers nothing.
    signIn({ role: 'teacher', user: TARA, school: A });
    expect((await session.run(session.claims, (tx: never) => conversion(tx, A, TODAY))).total.enquiries).toBe(0);
  });

  it('the principal’s tile equals the Admissions screen’s table, and opens it', async () => {
    const list = await call(principalB, listRoute, '/api/app/admissions');
    expect(list.status).toBe(200);
    const table = list.body.conversion;
    expect([table.rate, table.total.enquiries, table.total.admitted]).toEqual([25, 4, 1]);
    const def = FACTS.find((f) => f.id === 'admissions.conversion')!;
    signIn(principalB);
    const ctx = { schoolId: B, userId: PRINCIPAL_B, role: 'principal' as const, today: TODAY, range: { from: TODAY, to: TODAY }, sunday: false, once: <T,>(_k: string, f: () => Promise<T>) => f() };
    const tile = await session.run(session.claims, (tx: never) => def.load(tx, ctx));
    expect(tile).toEqual({ value: table.rate, total: table.total.enquiries, href: '/app/admissions?show=conversion', parts: [{ key: 'admitted', value: table.total.admitted }] });
    const drawn = plain(h(AdmissionsConversion, { data: table }));
    expect(drawn).toContain('25% admitted: 1 of 4 enquiries.');
    expect(drawn).toMatch(/Online form 2 1 \(50%\) 1 \(50%\) 0 \(0%\) 6 days 0 days –/);
    // Anyone but the office: not counted.
    const teacher = await session.run(session.claims, (tx: never) => def.load(tx, { ...ctx, role: 'teacher' as const }));
    expect(teacher.state).toBe('not_set_up');
  });
});
