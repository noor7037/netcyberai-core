import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// The routes of docs/28 slice 10g (C231), as each person's own session: who teaches what (the office writes it; a
// teacher reads their own and proposes for themselves; nobody decides their own proposal), the timetable's
// "not_assigned" answer, and the periods a week per teacher (the office, every teacher; a teacher, their own line;
// nobody else). Every name is made up.

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

import { DELETE as assignmentsDelete, GET as assignmentsGet, POST as assignmentsPost } from '@/app/api/app/subjects/assignments/route';
import { POST as requestsPost, PUT as requestsPut } from '@/app/api/app/subjects/assignments/requests/route';
import { GET as timetableGet, PUT as timetablePut } from '@/app/api/app/timetable/route';
import { readModuleFor, writeModuleFor } from '@/lib/frameworks/write-guard';

const A = 'c2310000-0000-4000-8000-0000000002a1';
const u = (n: number) => `c2310000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;
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
const teacher2: Who = { role: 'teacher', user: TEACHER_2 };
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
const AS = '/api/app/subjects/assignments';
const REQ = '/api/app/subjects/assignments/requests';
const TT = '/api/app/timetable';

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false);
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'timetable', true, 'plan'), ('${A}', 'setup', true, 'plan') on conflict do nothing;
    insert into users (user_id, school_id, email, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@school-a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'ad@school-a.example', 'school_admin', 'Asif Admin'),
      ('${COORD}', '${A}', 'co@school-a.example', 'academic_coordinator', 'Chitra Coordinator'), ('${ACCOUNTANT}', '${A}', 'acc@school-a.example', 'accountant', 'Anil Accountant'),
      ('${TEACHER}', '${A}', 't@school-a.example', 'teacher', 'Tara Teacher'), ('${TEACHER_2}', '${A}', 't2@school-a.example', 'teacher', 'Tarun Teacher');
    insert into classes (class_id, school_id, name) values ('${C5A}', '${A}', '5-A'), ('${C5B}', '${A}', '5-B');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths'), ('${ENGLISH}', '${A}', 'English');
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('who teaches what, by role', () => {
  it('the routes belong to Setup for changes, to no module for reading', () => {
    expect(writeModuleFor(AS)).toBe('setup');
    expect(writeModuleFor(REQ)).toBe('setup');
    expect(readModuleFor(AS)).toBe('any-module');
  });

  it('POST and DELETE: the principal and the school admin only; refused bodies; a teacher, the coordinator and the accountant refused', async () => {
    const a = { teacherUserId: TEACHER, classId: C5A, subjectId: MATHS };
    for (const w of [teacher, coord, accountant]) {
      expect((await call(w, assignmentsPost, AS, 'POST', a)).status, w.role).toBe(403);
      expect((await call(w, assignmentsDelete, AS, 'DELETE', a)).status, w.role).toBe(403);
    }
    for (const bad of [{}, { ...a, classId: 'x' }, { teacherId: TEACHER, classId: C5A, subjectId: MATHS }, 'not json']) expect((await call(principal, assignmentsPost, AS, 'POST', bad)).status, JSON.stringify(bad)).toBe(400);
    expect(await call(principal, assignmentsPost, AS, 'POST', { ...a, teacherUserId: ACCOUNTANT })).toMatchObject({ status: 400, body: { code: 'unknown_teacher' } });
    expect(await call(principal, assignmentsPost, AS, 'POST', a)).toMatchObject({ status: 201, body: { created: true } });
    expect(await call(admin, assignmentsPost, AS, 'POST', a)).toMatchObject({ status: 200, body: { created: false } });
    expect(await call(admin, assignmentsPost, AS, 'POST', { ...a, classId: C5B })).toMatchObject({ status: 201 });
    expect((await call(admin, assignmentsDelete, AS, 'DELETE', { ...a, classId: C5B })).status).toBe(200);
    expect((await call(admin, assignmentsDelete, AS, 'DELETE', { ...a, classId: C5B })).status).toBe(404);
  });

  it('a teacher proposes for themselves; only the office decides; nobody decides their own', async () => {
    for (const w of [principal, admin, coord, accountant]) expect((await call(w, requestsPost, REQ, 'POST', { classId: C5B, subjectId: ENGLISH })).status, w.role).toBe(403);
    expect((await call(teacher, requestsPost, REQ, 'POST', { classId: 'x', subjectId: ENGLISH })).status).toBe(400);
    const made = await call(teacher, requestsPost, REQ, 'POST', { classId: C5B, subjectId: ENGLISH });
    expect(made).toMatchObject({ status: 201, body: { ok: true } });
    expect(await call(teacher, requestsPost, REQ, 'POST', { classId: C5B, subjectId: ENGLISH })).toMatchObject({ status: 409, body: { code: 'already_requested' } });
    expect(await call(teacher, requestsPost, REQ, 'POST', { classId: C5A, subjectId: MATHS })).toMatchObject({ status: 409, body: { code: 'already_assigned' } });
    const requestId = made.body.requestId as string;
    for (const w of [teacher, teacher2, coord, accountant]) expect((await call(w, requestsPut, REQ, 'PUT', { requestId, decision: 'confirm' })).status, w.role).toBe(403);
    for (const bad of [{ requestId }, { requestId, decision: 'yes' }, { requestId: 'x', decision: 'confirm' }]) expect((await call(admin, requestsPut, REQ, 'PUT', bad)).status, JSON.stringify(bad)).toBe(400);
    expect((await call(admin, requestsPut, REQ, 'PUT', { requestId: u(99), decision: 'confirm' })).status).toBe(404);
    expect(await call(admin, requestsPut, REQ, 'PUT', { requestId, decision: 'confirm' })).toMatchObject({ status: 200, body: { ok: true, state: 'confirmed' } });
    expect((await call(principal, requestsPut, REQ, 'PUT', { requestId, decision: 'decline' })).status).toBe(404);
  });

  it('GET: the office reads every teacher’s, the proposals waiting and the choices; a teacher their own; others refused', async () => {
    const another = await call(teacher2, requestsPost, REQ, 'POST', { classId: C5A, subjectId: ENGLISH });
    expect(another.status).toBe(201);
    for (const w of [principal, admin]) {
      const r = await call(w, assignmentsGet, AS);
      expect(r.status, w.role).toBe(200);
      expect(r.body).toMatchObject({ mayAssign: true, assignments: [{ teacherUserId: TEACHER, classId: C5A, subjectId: MATHS }, { teacherUserId: TEACHER, classId: C5B, subjectId: ENGLISH }] });
      expect((r.body.teachers as { id: string }[]).map((x) => x.id).sort()).toEqual([TEACHER, TEACHER_2].sort());
      expect((r.body.requests as { teacherUserId: string }[]).map((x) => x.teacherUserId)).toEqual([TEACHER_2]);
    }
    const mine = await call(teacher2, assignmentsGet, AS);
    expect(mine.status).toBe(200);
    expect(mine.body).toMatchObject({ mayAssign: false, assignments: [], requests: [{ teacherUserId: TEACHER_2, classId: C5A, subjectId: ENGLISH, state: 'pending' }] });
    expect(mine.body.teachers).toBeUndefined();
    expect(((await call(teacher, assignmentsGet, AS)).body.requests as { state: string }[]).map((x) => x.state)).toEqual(['confirmed']);
    for (const w of [coord, accountant]) expect((await call(w, assignmentsGet, AS)).status, w.role).toBe(403);
  });
});

describe('the timetable route', () => {
  it('PUT: a teacher Setup does not give the class’s subject to is refused with "not_assigned", in words the screen can say', async () => {
    const slot = { classId: C5A, weekday: 1, period: 1, subjectId: MATHS };
    expect(await call(principal, timetablePut, TT, 'PUT', { ...slot, teacherUserId: TEACHER_2 })).toMatchObject({ status: 409, body: { code: 'not_assigned' } });
    expect((await call(coord, timetablePut, TT, 'PUT', { ...slot, teacherUserId: TEACHER })).status).toBe(200);
    expect((await call(coord, timetablePut, TT, 'PUT', { ...slot, classId: C5B, period: 2, subjectId: MATHS, teacherUserId: TEACHER_2 })).status).toBe(200);
  });

  it('GET ?workload=1: the office every teacher, the most first; a teacher their own line; the accountant refused', async () => {
    for (const w of [principal, admin, coord]) {
      const r = await call(w, timetableGet, `${TT}?workload=1`);
      expect(r.status, w.role).toBe(200);
      expect(r.body).toMatchObject({ days: [1, 2, 3, 4, 5, 6], periods: 8 });
      expect((r.body.teachers as { teacherUserId: string; periods: number }[]).map((l) => [l.teacherUserId, l.periods])).toEqual([[TEACHER, 1], [TEACHER_2, 1]]);
    }
    const own = await call(teacher2, timetableGet, `${TT}?workload=1`);
    expect(own.status).toBe(200);
    expect(own.body.teachers).toEqual([{ teacherUserId: TEACHER_2, name: 'Tarun Teacher', active: true, periods: 1 }]);
    expect((await call(accountant, timetableGet, `${TT}?workload=1`)).status).toBe(403);
  });
});
