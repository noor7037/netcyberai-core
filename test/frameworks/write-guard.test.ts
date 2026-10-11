import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { changeModuleEntitlement, changeSchoolAccess } from '@/lib/frameworks/entitlements';
import { applyPlan, DEFAULT_PLAN_ID } from '@/lib/frameworks/plans';
import { WRITE_METHODS, WRITE_ROUTES, writeModuleFor, writeRefusal } from '@/lib/frameworks/write-guard';

// The write guard (docs/19 rule 7, C137): a change is refused when the
// school's account is paused or read-only, or the route's module is off.
// Proven three ways: the rule itself; every write route is in the table and
// goes through the guard; and the real student and attendance routes,
// against real Postgres (PGlite), refuse and leave nothing behind.

const state = vi.hoisted(() => ({ claims: null as any, db: null as any }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/db', async (original) => ({
  ...(await original<typeof import('@/lib/auth/db')>()),
  withTenantContext: (claims: any, fn: any) => state.db.tenant(claims, fn),
}));

import { POST as addStudent } from '@/app/api/app/students/route';
import { PATCH as editStudent } from '@/app/api/app/students/[studentId]/route';
import { POST as markAttendance } from '@/app/api/app/attendance/route';
import { POST as addClass } from '@/app/api/app/classes/route';
import { POST as raiseTicket } from '@/app/api/app/tickets/route';
import { GET as listStudents } from '@/app/api/app/students/route';

const API = path.join(__dirname, '../../src/app/api/app');
function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? routeFiles(p) : name === 'route.ts' ? [p] : [];
  });
}
const writeRoutes = routeFiles(API)
  .map((file) => ({ file, rel: path.relative(API, path.dirname(file)), text: readFileSync(file, 'utf8') }))
  .filter((r) => /export\s+(?:async\s+function|const)\s+(POST|PUT|PATCH|DELETE)\b/.test(r.text));
// Each exported handler of a file with its own code, so a guarded GET cannot stand in for an unguarded POST.
function handlers(text: string): { method: string; body: string }[] {
  const starts = [...text.matchAll(/export\s+(?:async\s+function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g)];
  return starts.map((m, i) => ({ method: m[1], body: text.slice(m.index!, i + 1 < starts.length ? starts[i + 1].index! : text.length) }));
}
const writeHandlers = writeRoutes.flatMap((r) => handlers(r.text).filter((h) => h.method !== 'GET').map((h) => ({ ...h, rel: r.rel })));
// A real-looking URL for a route folder: [param] becomes an id.
const urlOf = (rel: string) => `/api/app/${rel.replace(/\[[^\]]+\]/g, randomUUID())}`;

const ents = (accessMode: SchoolEntitlements['accessMode'], off: string[] = []): SchoolEntitlements => ({
  schoolId: 's',
  plan: 'standard',
  accessMode,
  modules: Object.fromEntries(MODULE_REGISTRY.map((m) => [m.id, { enabled: !off.includes(m.id), source: 'plan' as const }])),
});

describe('the rule', () => {
  it('a school in good standing may change what its modules allow', () => {
    for (const mode of ['full', 'grace'] as const) {
      expect(writeRefusal(ents(mode), 'students')).toBeNull();
      expect(writeRefusal(ents(mode), 'any-module')).toBeNull();
    }
  });

  it('read-only: nothing changes, except asking for help', () => {
    expect(writeRefusal(ents('read_only'), 'students')).toBe('read_only');
    expect(writeRefusal(ents('read_only'), 'attendance')).toBe('read_only');
    expect(writeRefusal(ents('read_only'), 'any-module')).toBe('read_only');
    expect(writeRefusal(ents('read_only'), 'raise-ticket')).toBeNull();
  });

  it('suspended: nothing changes, except asking for help', () => {
    expect(writeRefusal(ents('suspended'), 'students')).toBe('account_paused');
    expect(writeRefusal(ents('suspended'), 'any-module')).toBe('account_paused');
    expect(writeRefusal(ents('suspended'), 'raise-ticket')).toBeNull();
  });

  it('a module switched off: its routes change nothing; the others still work', () => {
    expect(writeRefusal(ents('full', ['attendance']), 'attendance')).toBe('module_off');
    expect(writeRefusal(ents('full', ['attendance']), 'students')).toBeNull();
    expect(writeRefusal({ ...ents('full'), modules: {} }, 'students')).toBe('module_off'); // never switched on
  });
});

describe('every write route is covered', () => {
  it('there are write routes to check', () => {
    expect(writeRoutes.length).toBeGreaterThanOrEqual(46);
  });

  it('every write route is in the table: a new one must say which module it belongs to', () => {
    for (const r of writeRoutes) expect(writeModuleFor(urlOf(r.rel)), r.rel).not.toBeNull();
  });

  it('every write route goes through the shared session guard, which is where the write guard runs', () => {
    expect(writeHandlers.length).toBeGreaterThanOrEqual(49);
    for (const h of writeHandlers) {
      // requireAppSession itself, or a wrapper that calls it (appRoute; schoolTickets wraps appRoute), in THIS handler.
      expect(/\b(requireAppSession|appRoute|schoolTickets)\(\s*req\b/.test(h.body), `${h.method} ${h.rel}`).toBe(true);
    }
    const guard = readFileSync(path.join(__dirname, '../../src/lib/auth/require-app-session.ts'), 'utf8');
    expect(guard).toMatch(/WRITE_METHODS\.includes\(req\.method\)[\s\S]{0,120}guardWrite\(/);
    expect(readFileSync(path.join(__dirname, '../../src/lib/frameworks/route.ts'), 'utf8')).toMatch(/export async function appRoute[\s\S]{0,300}requireAppSession\(req\)/);
    expect(readFileSync(path.join(__dirname, '../../src/lib/support/ticket-routes.ts'), 'utf8')).toMatch(/export function schoolTickets[\s\S]{0,200}appRoute\(req/);
  });

  it('a route that says it checks for itself really does, with write: true', () => {
    for (const h of writeHandlers) {
      if (writeModuleFor(urlOf(h.rel)) === 'checks-itself') expect(h.body, `${h.method} ${h.rel}`).toMatch(/checkModuleAccess\([\s\S]*?write:\s*true/);
    }
  });

  it('each kind of path belongs to the module it should: the order of the table cannot quietly change this', () => {
    const id = randomUUID();
    const expected: Record<string, string> = {
      students: 'students',
      [`students/${id}`]: 'students',
      'students/import': 'students',
      [`students/${id}/family`]: 'students',
      [`students/${id}/documents`]: 'students',
      [`students/${id}/qr-token`]: 'students',
      [`students/${id}/consent`]: 'parents',
      [`students/${id}/guardians`]: 'parents',
      [`students/${id}/dsr`]: 'parents',
      [`guardians/${id}`]: 'parents',
      'guardians/merge': 'parents',
      [`guardians/${id}/students/${id}/verification`]: 'parents',
      [`dsr/${id}/execute`]: 'parents',
      'families/link': 'students',
      [`documents/${id}/review`]: 'students',
      [`qr-tokens/${id}/revoke`]: 'students',
      scan: 'students',
      attendance: 'attendance',
      [`attendance/${id}`]: 'attendance',
      syllabus: 'academics',
      classes: 'setup',
      subjects: 'setup',
      'subjects/assignments': 'setup',
      'compliance/form6': 'compliance',
      'whatsapp-config': 'communication',
      tickets: 'raise-ticket',
      [`tickets/${id}/messages`]: 'raise-ticket',
      'staff/invitations': 'any-module',
      [`users/${id}/send-reset`]: 'any-module',
      views: 'any-module',
      'bulk/confirm': 'checks-itself',
      'custom-fields': 'checks-itself',
      'settings/attendance': 'checks-itself',
    };
    for (const [p, module] of Object.entries(expected)) {
      expect(writeModuleFor(`/api/app/${p}`), p).toBe(module);
      expect(writeModuleFor(`/api/app/${p}/`), `${p}/`).toBe(module); // a trailing slash changes nothing
    }
  });

  it('every module a route belongs to is in the standard plan, so no school loses a flow it has', () => {
    const inPlan = new Set(MODULE_REGISTRY.filter((m) => m.status === 'live' || m.status === 'partial').map((m) => m.id as string));
    for (const [pattern, module] of WRITE_ROUTES) {
      if (module !== 'checks-itself' && module !== 'any-module' && module !== 'raise-ticket') expect(inPlan.has(module), `${pattern} → ${module}`).toBe(true);
    }
  });

  it('no line of the table is dead, and an unknown path is not waved through', () => {
    for (const [pattern] of WRITE_ROUTES) expect(writeRoutes.some((r) => writeModuleFor(urlOf(r.rel)) !== null && matchesPattern(pattern, r.rel)), pattern).toBe(true);
    expect(writeModuleFor('/api/app/something-new')).toBeNull();
    expect(writeModuleFor('/api/app/students/1/something-new')).toBe('students');
    expect(writeModuleFor('/api/control/schools')).toBeNull();
    expect(WRITE_METHODS).toEqual(['POST', 'PUT', 'PATCH', 'DELETE']);
  });
});

// The same matching as the guard's, for the dead-line check only.
function matchesPattern(pattern: string, rel: string): boolean {
  const want = pattern.split('/');
  const have = rel.split('/');
  for (let i = 0; i < want.length; i++) {
    if (want[i] === '**') return have.length > i;
    if (i >= have.length) return false;
    if (want[i] !== '*' && want[i] !== have[i]) return false;
  }
  return want.length === have.length;
}

describe('the real routes, on real Postgres', () => {
  let db: TestDb;
  const A = randomUUID();
  const founder = randomUUID();
  const principal = randomUUID();
  const classId = randomUUID();
  const existing = randomUUID();
  const actor = { userId: founder, role: 'super_admin' as const };

  const req = (method: string, url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
  const count = async (table: string) => Number((await db.query(`select count(*) as c from ${table} where school_id = $1`, [A])).rows[0].c);
  const said = async (res: Response) => ({ status: res.status, code: (await res.json()).code });
  const tryEverything = async () => ({
    addStudent: await said(await addStudent(req('POST', '/api/app/students', { name: 'New Child', admissionNo: `N-${randomUUID().slice(0, 6)}` }))),
    editStudent: await said(await editStudent(req('PATCH', `/api/app/students/${existing}`, { name: 'Changed Name' }), { params: { studentId: existing } })),
    markAttendance: await said(await markAttendance(req('POST', '/api/app/attendance', { classId, entries: [{ studentId: existing, status: 'present' }] }))),
    addClass: await said(await addClass(req('POST', '/api/app/classes', { name: '9', section: 'A' }))),
  });

  beforeAll(async () => {
    db = await createTestDb();
    state.db = db;
    state.claims = { sub: principal, role: 'principal', schoolId: A, membershipId: randomUUID(), tokenVersion: 0, aal: 'aal1', sessionId: randomUUID() };
    await db.platform(async (q) => {
      await q.query(`insert into schools (school_id, name, jurisdiction) values ($1, 'A', 'IN-HR')`, [A]);
      await q.query(`insert into users (user_id, school_id, role, display_name) values ($1, $2, 'principal', 'P')`, [principal, A]);
      await q.query(`insert into classes (class_id, school_id, name, section) values ($1, $2, '5', 'A')`, [classId, A]);
      await q.query(`insert into students (student_id, school_id, admission_no, name, class_id, status) values ($1, $2, 'E-1', 'Existing Child', $3, 'active')`, [existing, A, classId]);
      await applyPlan(q, A, DEFAULT_PLAN_ID, actor, 'test setup');
    });
  }, 60000);

  const setAccess = (accessMode: 'full' | 'read_only' | 'suspended') => db.platform((q) => changeSchoolAccess(q, { schoolId: A, accessMode, reason: 'test' }, actor));
  const setModule = (moduleId: string, enabled: boolean) => db.platform((q) => changeModuleEntitlement(q, { schoolId: A, moduleId: moduleId as any, enabled, reason: 'test' }, actor));

  it('read-only: adding and editing a student, marking attendance and adding a class are refused, and nothing is written', async () => {
    await setAccess('read_only');
    const before = { students: await count('students'), attendance: await count('attendance'), classes: await count('classes') };
    const got = await tryEverything();
    for (const [what, r] of Object.entries(got)) expect(r, what).toEqual({ status: 403, code: 'read_only' });
    expect({ students: await count('students'), attendance: await count('attendance'), classes: await count('classes') }).toEqual(before);
    expect((await db.query(`select name from students where student_id = $1`, [existing])).rows[0].name).toBe('Existing Child');
  });

  it('suspended: the same, said as a paused account', async () => {
    await setAccess('suspended');
    const before = await count('students');
    const got = await tryEverything();
    for (const [what, r] of Object.entries(got)) expect(r, what).toEqual({ status: 403, code: 'account_paused' });
    expect(await count('students')).toBe(before);
  });

  it('read-only and suspended schools can still read, and can still raise a ticket', async () => {
    for (const mode of ['read_only', 'suspended'] as const) {
      await setAccess(mode);
      expect((await listStudents(req('GET', '/api/app/students'))).status, mode).toBe(200);
      const res = await raiseTicket(req('POST', '/api/app/tickets', { subject: 'We need help', body: 'Our account says it is paused and we need to ask why.', category: 'billing' }));
      expect(res.status, mode).toBe(201);
    }
  });

  it('a module switched off: its own writes are refused, the other modules still work', async () => {
    await setAccess('full');
    await setModule('attendance', false);
    const before = await count('attendance');
    const got = await tryEverything();
    expect(got.markAttendance).toEqual({ status: 403, code: 'module_off' });
    expect(await count('attendance')).toBe(before);
    expect(got.addStudent.status).toBe(201);
    expect(got.editStudent.status).toBe(200);
    await setModule('attendance', true);

    await setModule('students', false);
    const students = await count('students');
    const again = await tryEverything();
    expect(again.addStudent).toEqual({ status: 403, code: 'module_off' });
    expect(again.editStudent).toEqual({ status: 403, code: 'module_off' });
    expect(await count('students')).toBe(students);
    expect(again.markAttendance.status).toBe(201);
    await setModule('students', true);
  });

  it('a school in good standing is not held up', async () => {
    await setAccess('full');
    const got = await tryEverything();
    expect(got.addStudent.status).toBe(201);
    expect(got.editStudent.status).toBe(200);
    expect(got.addClass.status).toBe(201);
    expect([201, 200]).toContain(got.markAttendance.status);
  });

  it('the role is still each route’s own check: a teacher cannot add a student in a school in good standing', async () => {
    state.claims = { ...state.claims, role: 'teacher' };
    try {
      expect((await addStudent(req('POST', '/api/app/students', { name: 'New Child' }))).status).toBe(403);
    } finally {
      state.claims = { ...state.claims, role: 'principal' };
    }
  });
});
