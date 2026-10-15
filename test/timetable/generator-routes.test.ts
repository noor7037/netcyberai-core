import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// Every route of the timetable generator and its page, as each person's own session (docs/28 slice 10f, C229): the
// office (principal, school admin, academic coordinator) is answered; a teacher and an accountant are refused; a body
// not sent properly is refused; a school whose plan does not have the generator is refused by every route and told so
// plainly on the page, and the timetable page offers the generator only when the plan has it. Every name is made up.

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

import TimetablePage from '@/app/(school)/app/timetable/page';
import GeneratorPage from '@/app/(school)/app/timetable/generator/page';
import { DELETE as constraintsDelete, PUT as constraintsPut } from '@/app/api/app/timetable/generator/constraints/route';
import { GET as generatorGet, POST as generatorPost } from '@/app/api/app/timetable/generator/route';
import { GET as historyGet } from '@/app/api/app/timetable/history/route';
import { GeneratorView } from '@/components/timetable/GeneratorView';
import { readModuleFor, writeModuleFor } from '@/lib/frameworks/write-guard';

const A = 'c2290000-0000-4000-8000-0000000003a1';
const u = (n: number) => `c2290000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, COORD, ACCOUNTANT, TEACHER, TEACHER_2] = [u(11), u(12), u(13), u(14), u(21), u(22)];
const [C5A, C5B, MATHS, ENGLISH] = [u(51), u(52), u(61), u(62)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const coord: Who = { role: 'academic_coordinator', user: COORD };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const teacher: Who = { role: 'teacher', user: TEACHER };
const OFFICE = [principal, admin, coord];
const OUTSIDE = [teacher, accountant];
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
type Route = (req: NextRequest) => Promise<Response>;
const call = async (w: Who, route: Route, url: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: unknown) => {
  signIn(w);
  const init = method === 'GET' ? undefined : { method, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } };
  const res = await route(new NextRequest(`http://school.example${url}`, init));
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { text };
  }
  return { status: res.status, body: json };
};
const GEN = '/api/app/timetable/generator';
const CONS = '/api/app/timetable/generator/constraints';
const HIST = '/api/app/timetable/history';
const planOff = () => db.pg.query(`insert into school_subscriptions (school_id, plan_id) values ($1, 'starter') on conflict (school_id) do update set plan_id = 'starter'`, [A]);
const planOn = () => db.pg.query(`delete from school_subscriptions where school_id = $1`, [A]);

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false);
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'timetable', true, 'plan') on conflict do nothing;
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@school-a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'ad@school-a.example', 'school_admin', 'Asif Admin'),
      ('${COORD}', '${A}', 'co@school-a.example', 'academic_coordinator', 'Chitra Coordinator'), ('${ACCOUNTANT}', '${A}', 'acc@school-a.example', 'accountant', 'Anil Accountant'),
      ('${TEACHER}', '${A}', 't@school-a.example', 'teacher', 'Tara Teacher'), ('${TEACHER_2}', '${A}', 't2@school-a.example', 'teacher', 'Tarun Teacher');
    insert into classes (class_id, school_id, name) values ('${C5A}', '${A}', '5-A'), ('${C5B}', '${A}', '5-B');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths'), ('${ENGLISH}', '${A}', 'English');
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('every route of the generator, by role', () => {
  it('the routes belong to Timetable: switched off with it', () => {
    expect(readModuleFor(GEN)).toBe('timetable');
    expect(readModuleFor(HIST)).toBe('timetable');
    expect(writeModuleFor(GEN)).toBe('timetable');
    expect(writeModuleFor(CONS)).toBe('timetable');
  });

  it('POST propose with nothing to plan says so; PUT constraints: refused bodies and people, then the loads', async () => {
    expect(await call(principal, generatorPost, GEN, 'POST', { action: 'propose' })).toMatchObject({ status: 400, body: { code: 'nothing_to_plan' } });
    const load = { kind: 'load', classId: C5A, subjectId: MATHS, periods: 3, teacherUserId: TEACHER };
    for (const w of OUTSIDE) expect((await call(w, constraintsPut, CONS, 'PUT', load)).status, w.role).toBe(403);
    for (const bad of [{}, { ...load, kind: 'other' }, { ...load, classId: 'x' }, { ...load, periods: '3' }, { ...load, periods: 2.5 }, { kind: 'unavailable', teacherUserId: TEACHER, slots: 'x' }, { kind: 'unavailable', teacherUserId: 'x', slots: [] }, 'not json'])
      expect((await call(principal, constraintsPut, CONS, 'PUT', bad)).status, JSON.stringify(bad)).toBe(400);
    expect(await call(principal, constraintsPut, CONS, 'PUT', { ...load, teacherUserId: PRINCIPAL })).toMatchObject({ status: 400, body: { code: 'unknown_teacher' } });
    expect(await call(principal, constraintsPut, CONS, 'PUT', { ...load, periods: 0 })).toMatchObject({ status: 400, body: { code: 'bad_periods' } });
    expect(await call(principal, constraintsPut, CONS, 'PUT', { kind: 'unavailable', teacherUserId: TEACHER, slots: [{ weekday: 9, period: 1 }] })).toMatchObject({ status: 400, body: { code: 'bad_period' } });
    for (const [w, body] of [
      [principal, load],
      [admin, { ...load, subjectId: ENGLISH, teacherUserId: TEACHER_2, periods: 2 }],
      [coord, { ...load, classId: C5B, periods: 2 }],
    ] as const)
      expect(await call(w, constraintsPut, CONS, 'PUT', body), w.role).toMatchObject({ status: 200, body: { saved: true } });
    expect(await call(coord, constraintsPut, CONS, 'PUT', { kind: 'unavailable', teacherUserId: TEACHER, slots: [{ weekday: 1, period: null }, { weekday: 2, period: 1 }] })).toMatchObject({ status: 200, body: { saved: true, periods: 2 } });
  });

  it('DELETE constraints: refused people and bodies, a load taken away, then not found', async () => {
    const at = { kind: 'load', classId: C5B, subjectId: MATHS };
    for (const w of OUTSIDE) expect((await call(w, constraintsDelete, CONS, 'DELETE', at)).status, w.role).toBe(403);
    expect((await call(admin, constraintsDelete, CONS, 'DELETE', { ...at, subjectId: 'x' })).status).toBe(400);
    expect((await call(admin, constraintsDelete, CONS, 'DELETE', at)).status).toBe(200);
    expect((await call(admin, constraintsDelete, CONS, 'DELETE', at)).status).toBe(404);
  });

  it('GET: the office reads the constraints, the names and the draft; nobody else does', async () => {
    for (const w of OFFICE) {
      const r = await call(w, generatorGet, GEN);
      expect(r.status, w.role).toBe(200);
      expect(r.body.mayEditSettings, w.role).toBe(w !== coord);
      expect((r.body.loads as unknown[]).length).toBe(2);
      expect(r.body.draft).toBeNull();
    }
    for (const w of OUTSIDE) expect((await call(w, generatorGet, GEN)).status, w.role).toBe(403);
  });

  it('POST: propose, swap, publish and discard, with refused bodies and the answers a screen needs', async () => {
    for (const w of OUTSIDE) expect((await call(w, generatorPost, GEN, 'POST', { action: 'propose' })).status, w.role).toBe(403);
    const made = await call(coord, generatorPost, GEN, 'POST', { action: 'propose' });
    expect(made).toMatchObject({ status: 201, body: { ok: true, placed: 5, notPlaced: 0 } });
    const proposalId = made.body.proposalId as string;
    const draft = (await call(principal, generatorGet, GEN)).body.draft as { entries: { classId: string; subjectId: string; weekday: number; period: number }[]; changes: unknown[]; stale: boolean };
    expect(draft.entries).toHaveLength(5);
    expect(draft.changes).toHaveLength(5);
    expect(draft.stale).toBe(false);
    for (const bad of [{ action: 'swap', proposalId }, { action: 'swap', proposalId, classId: C5A, a: { weekday: 1, period: 1 }, b: { weekday: 8, period: 1 } }, { action: 'publish', proposalId: 'x' }, { action: 'publish', proposalId, withMissing: 'yes' }, { action: 'other', proposalId }, 'not json'])
      expect((await call(principal, generatorPost, GEN, 'POST', bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await call(principal, generatorPost, GEN, 'POST', { action: 'swap', proposalId: u(99), classId: C5A, a: { weekday: 3, period: 1 }, b: { weekday: 3, period: 2 } })).status).toBe(404);
    // Tara cannot teach on Monday: a Maths period of 5-A moved to Monday is refused, in words the screen can say.
    const maths = draft.entries.find((e) => e.classId === C5A && e.subjectId === MATHS)!;
    expect(maths.weekday).not.toBe(1);
    expect(await call(principal, generatorPost, GEN, 'POST', { action: 'swap', proposalId, classId: C5A, a: { weekday: maths.weekday, period: maths.period }, b: { weekday: 1, period: 4 } })).toMatchObject({ status: 409, body: { code: 'unavailable' } });
    for (const w of OUTSIDE) expect((await call(w, generatorPost, GEN, 'POST', { action: 'publish', proposalId })).status, w.role).toBe(403);
    const published = await call(admin, generatorPost, GEN, 'POST', { action: 'publish', proposalId });
    expect(published).toMatchObject({ status: 200, body: { ok: true, added: 5, removed: 0, changed: 0 } });
    expect((await call(admin, generatorPost, GEN, 'POST', { action: 'publish', proposalId })).status).toBe(404);
    expect((await call(admin, generatorPost, GEN, 'POST', { action: 'discard', proposalId })).status).toBe(404);
    // A draft that could not place everything (5-B asks for 50 periods of a 48-period week) is published only when the
    // person says so.
    expect((await call(principal, constraintsPut, CONS, 'PUT', { kind: 'load', classId: C5B, subjectId: MATHS, periods: 50, teacherUserId: TEACHER_2 })).status).toBe(200);
    const short = await call(principal, generatorPost, GEN, 'POST', { action: 'propose' });
    expect(short.status).toBe(201);
    expect(await call(principal, generatorPost, GEN, 'POST', { action: 'publish', proposalId: short.body.proposalId })).toMatchObject({ status: 409, body: { code: 'missing_not_accepted' } });
    expect(await call(principal, generatorPost, GEN, 'POST', { action: 'discard', proposalId: short.body.proposalId })).toMatchObject({ status: 200, body: { discarded: true } });
  });

  it('GET history: the publishes and one read back; refused for others and for a bad id', async () => {
    const list = await call(coord, historyGet, HIST);
    expect(list.status).toBe(200);
    const versions = list.body.versions as { versionId: string; publishedByName: string; added: number }[];
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ publishedByName: 'Asif Admin', added: 5 });
    const one = await call(principal, historyGet, `${HIST}?versionId=${versions[0].versionId}`);
    expect(one.status).toBe(200);
    expect((one.body.version as { before: unknown[]; after: unknown[] }).before).toEqual([]);
    expect((one.body.version as { after: unknown[] }).after).toHaveLength(5);
    expect((one.body.names as { classes: unknown[] }).classes).toHaveLength(2);
    expect((await call(principal, historyGet, `${HIST}?versionId=x`)).status).toBe(400);
    expect((await call(principal, historyGet, `${HIST}?versionId=${u(98)}`)).status).toBe(404);
    for (const w of OUTSIDE) expect((await call(w, historyGet, HIST)).status, w.role).toBe(403);
  });

  it('a plan without the generator: every route refuses, the page says so plainly, and the timetable page does not offer it', async () => {
    await planOff();
    for (const [route, url, method, body] of [
      [generatorGet, GEN, 'GET', undefined],
      [generatorPost, GEN, 'POST', { action: 'propose' }],
      [constraintsPut, CONS, 'PUT', { kind: 'load', classId: C5A, subjectId: MATHS, periods: 3, teacherUserId: TEACHER }],
      [constraintsDelete, CONS, 'DELETE', { kind: 'load', classId: C5A, subjectId: MATHS }],
      [historyGet, HIST, 'GET', undefined],
    ] as const)
      expect((await call(principal, route as Route, url, method, body)).status, `${method} ${url}`).toBe(403);
    signIn(principal);
    const off = (await GeneratorPage()) as { props: { children: React.ReactElement } };
    const html = renderToStaticMarkup(off.props.children);
    expect(html).toContain('data-ttg-not-in-plan');
    expect(html).toContain('The timetable generator is not part of your school’s plan.');
    expect(html).toContain('href="/app/timetable"');
    const page = (await TimetablePage()) as { props: { children: { props: { generator: boolean } } } };
    expect(page.props.children.props.generator).toBe(false);
    await planOn();
    const on = (await GeneratorPage()) as { props: { children: { type: unknown } } };
    expect(on.props.children.type).toBe(GeneratorView);
    expect(((await TimetablePage()) as { props: { children: { props: { generator: boolean } } } }).props.children.props.generator).toBe(true);
    // A teacher is sent to the timetable itself, and is not offered the generator there.
    signIn(teacher);
    await expect(GeneratorPage()).rejects.toThrow(/NEXT_REDIRECT/);
    expect(((await TimetablePage()) as { props: { children: { props: { generator: boolean } } } }).props.children.props.generator).toBe(false);
  });
});
