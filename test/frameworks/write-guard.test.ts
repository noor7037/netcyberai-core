import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb, type TestDb } from '../db/pglite-harness';
import type { SchoolEntitlements } from '@/lib/contracts/entitlements';
import { MODULE_REGISTRY } from '@/lib/contracts/modules';
import { changeModuleEntitlement, changeSchoolAccess } from '@/lib/frameworks/entitlements';
import { applyPlan } from '@/lib/frameworks/plans';
import { allowedWhenReadOnly, READ_ROUTES, readModuleFor, readRefusal, WRITE_METHODS, WRITE_ROUTES, writeModuleFor, writeRefusal } from '@/lib/frameworks/write-guard';

// The write guard (docs/19 rule 7, C137): a change is refused when the
// school's account is paused or read-only, or the route's module is off.
// Proven three ways: the rule itself; every write route is in the table and
// goes through the guard; and the real student and attendance routes,
// against real Postgres (PGlite), refuse and leave nothing behind.

const state = vi.hoisted(() => ({ claims: null as any, db: null as any }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => state.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => state.claims }));
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
import { GET as attendanceRoster } from '@/app/api/app/attendance/route';
import { GET as listClasses } from '@/app/api/app/classes/route';
import { POST as scanCard } from '@/app/api/app/scan/route';
import { POST as sendReset } from '@/app/api/app/users/[userId]/send-reset/route';
import AttendancePage from '@/app/(school)/app/attendance/page';
import { ModuleOffPage } from '@/components/app-shell/ModuleOffPage';
import { ModulePage } from '@/components/app-ui/ModulePage';

// The id of the plan the migration seeds; the code itself names no plan (C204).
const DEFAULT_PLAN_ID = 'standard';

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

describe('the rule for reads (C140)', () => {
  it('a module switched off is not readable; a read-only school reads as before; a paused school reads only help', () => {
    expect(readRefusal(ents('full', ['attendance']), 'attendance')).toBe('module_off');
    expect(readRefusal(ents('full', ['attendance']), 'students')).toBeNull();
    expect(readRefusal(ents('read_only'), 'students')).toBeNull();
    expect(readRefusal(ents('suspended'), 'students')).toBe('account_paused');
    expect(readRefusal(ents('suspended'), 'any-module')).toBe('account_paused');
    expect(readRefusal(ents('suspended'), 'raise-ticket')).toBeNull();
    // What several modules draw on stays readable when one of them is off.
    expect(readRefusal(ents('full', ['setup', 'students']), 'any-module')).toBeNull();
  });

  it('every read route is in the table', () => {
    const readRoutes = routeFiles(API)
      .map((file) => ({ rel: path.relative(API, path.dirname(file)), text: readFileSync(file, 'utf8') }))
      .filter((r) => /export\s+(?:async\s+function|const)\s+GET\b/.test(r.text));
    expect(readRoutes.length).toBeGreaterThanOrEqual(30);
    for (const r of readRoutes) expect(readModuleFor(urlOf(r.rel)), r.rel).not.toBeNull();
    for (const [pattern] of READ_ROUTES) expect(readRoutes.some((r) => matchesPattern(pattern, r.rel)), pattern).toBe(true);
  });

  it('each kind of read belongs to the module it should', () => {
    const id = randomUUID();
    const expected: Record<string, string> = {
      students: 'students', [`students/${id}`]: 'students', 'students/search': 'students', [`students/${id}/documents`]: 'students',
      [`students/${id}/guardians`]: 'parents', [`students/${id}/consent`]: 'parents', [`students/${id}/dsr`]: 'parents', [`guardians/${id}/merges`]: 'parents',
      attendance: 'attendance', syllabus: 'academics', 'compliance/retention': 'compliance', 'whatsapp-config': 'communication', 'pulse/today': 'checks-itself',
      tickets: 'raise-ticket', [`tickets/${id}`]: 'raise-ticket',
      classes: 'any-module', subjects: 'any-module', users: 'any-module', 'staff/invitations': 'any-module', views: 'any-module', entitlements: 'any-module',
      search: 'checks-itself', 'lists/students': 'checks-itself', 'custom-fields': 'checks-itself', 'settings/attendance': 'checks-itself',
    };
    for (const [p, module] of Object.entries(expected)) expect(readModuleFor(`/api/app/${p}`), p).toBe(module);
  });

  it('a read route that says it checks for itself really does', () => {
    for (const file of routeFiles(API)) {
      const rel = path.relative(API, path.dirname(file));
      const get = handlers(readFileSync(file, 'utf8')).find((h) => h.method === 'GET');
      if (get && readModuleFor(urlOf(rel)) === 'checks-itself') expect(get.body, rel).toMatch(/checkModuleAccess\(|searchableKinds\(|daily_pulse/);
    }
  });

  it('every read goes through the shared session guard, where the read guard runs', () => {
    // One documented exception: Daily Pulse has its own session check and its own switch.
    const own = new Set(['pulse/today']);
    let checked = 0;
    for (const file of routeFiles(API)) {
      const rel = path.relative(API, path.dirname(file));
      const get = handlers(readFileSync(file, 'utf8')).find((h) => h.method === 'GET');
      if (!get || own.has(rel)) continue;
      checked += 1;
      expect(/\b(requireAppSession|appRoute|schoolTickets)\(\s*req\b/.test(get.body), rel).toBe(true);
    }
    expect(checked).toBeGreaterThanOrEqual(30);
    expect(readFileSync(path.join(__dirname, '../../src/lib/auth/require-app-session.ts'), 'utf8')).toMatch(/guardRead\(/);
    // appRoute runs the same check inside its own transaction (C143), and never skips it.
    expect(readFileSync(path.join(__dirname, '../../src/lib/frameworks/route.ts'), 'utf8')).toMatch(/readGuard: 'in-transaction'[\s\S]{0,300}await guard\.readCheck\?\.\(db\)\) \?\? handler/);
  });

  it('every module a read belongs to is in the standard plan, so no school loses a screen it has', () => {
    const inPlan = new Set(MODULE_REGISTRY.filter((m) => m.status === 'live' || m.status === 'partial').map((m) => m.id as string));
    for (const [pattern, module] of READ_ROUTES) {
      if (module !== 'checks-itself' && module !== 'any-module' && module !== 'raise-ticket') expect(inPlan.has(module), `${pattern} → ${module}`).toBe(true);
    }
    // And the pages: each gate names a module of the plan.
    const pages = ['students/page.tsx', 'students/[studentId]/page.tsx', 'students/[studentId]/id-card/page.tsx', 'admissions/page.tsx', 'attendance/page.tsx', 'syllabus/page.tsx', 'compliance/page.tsx', 'dashboard/page.tsx'];
    for (const p of pages) {
      const gate = /moduleOffReason\('([a-z-]+)'\)/.exec(readFileSync(path.join(__dirname, '../../src/app/(school)/app', p), 'utf8'));
      expect(gate, p).not.toBeNull();
      expect(inPlan.has(gate![1]), `${p} → ${gate![1]}`).toBe(true);
    }
  });
});

describe('what a read-only school may still do (C140)', () => {
  it('reset a colleague’s password and look up an ID card, and nothing else', () => {
    const id = randomUUID();
    expect(allowedWhenReadOnly(`/api/app/users/${id}/send-reset`)).toBe(true);
    expect(allowedWhenReadOnly('/api/app/scan')).toBe(true);
    for (const p of ['students', `students/${id}`, 'attendance', 'staff/invitations', 'classes', `users/${id}`, 'views']) expect(allowedWhenReadOnly(`/api/app/${p}`), p).toBe(false);
    expect(writeRefusal(ents('read_only'), 'any-module', true)).toBeNull();
    expect(writeRefusal(ents('read_only'), 'students', true)).toBeNull();
    // A paused school stays blocked, and the ID card's module must still be on.
    expect(writeRefusal(ents('suspended'), 'any-module', true)).toBe('account_paused');
    expect(writeRefusal(ents('read_only', ['students']), 'students', true)).toBe('module_off');
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
      // requireAppSession itself, or a wrapper that calls it (appRoute and appRouteAfter; schoolTickets wraps appRoute),
      // in THIS handler.
      expect(/\b(requireAppSession|appRoute|appRouteAfter|schoolTickets)\(\s*req\b/.test(h.body), `${h.method} ${h.rel}`).toBe(true);
    }
    const guard = readFileSync(path.join(__dirname, '../../src/lib/auth/require-app-session.ts'), 'utf8');
    expect(guard).toMatch(/WRITE_METHODS\.includes\(req\.method\)[\s\S]{0,120}guardWrite\(/);
    const route = readFileSync(path.join(__dirname, '../../src/lib/frameworks/route.ts'), 'utf8');
    expect(route).toMatch(/export async function appRoute\([\s\S]{0,400}requireAppSession\(req\b/);
    // appRouteAfter (C232 part A): the session and its write guard first, then the step before the transaction.
    expect(route).toMatch(/export async function appRouteAfter<P>\([\s\S]{0,400}requireAppSession\(req\b[\s\S]{0,200}prepare\(claims\)/);
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
      // A test school: the plan with every module is for test schools only (C219).
      await q.query(`insert into schools (school_id, name, jurisdiction, is_test_fixture) values ($1, 'A', 'IN-HR', true)`, [A]);
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

  it('a read-only school still reads; a paused school does not; both can still raise a ticket', async () => {
    for (const mode of ['read_only', 'suspended'] as const) {
      await setAccess(mode);
      const read = await listStudents(req('GET', '/api/app/students'));
      if (mode === 'read_only') expect(read.status).toBe(200);
      else expect(await said(read)).toEqual({ status: 403, code: 'account_paused' });
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

  it('a module switched off cannot be read either: its API says module_off, the others answer (C140)', async () => {
    await setAccess('full');
    await setModule('attendance', false);
    try {
      expect(await said(await attendanceRoster(req('GET', `/api/app/attendance?classId=${classId}`)))).toEqual({ status: 403, code: 'module_off' });
      expect((await listStudents(req('GET', '/api/app/students'))).status).toBe(200);
      expect((await listClasses(req('GET', '/api/app/classes'))).status).toBe(200);
    } finally {
      await setModule('attendance', true);
    }
    expect((await attendanceRoster(req('GET', `/api/app/attendance?classId=${classId}`))).status).toBe(200);
    // Classes are drawn on by other modules' screens: readable with Setup off.
    await setModule('setup', false);
    try {
      expect((await listClasses(req('GET', '/api/app/classes'))).status).toBe(200);
    } finally {
      await setModule('setup', true);
    }
  });

  it('a module switched off: its page shows the "module off" state in place of the screen (C140)', async () => {
    await setAccess('full');
    const on: any = await AttendancePage({ searchParams: {} });
    expect(on.type).toBe(ModulePage);
    await setModule('attendance', false);
    try {
      const off: any = await AttendancePage({ searchParams: {} });
      expect(off.type).toBe(ModuleOffPage);
      expect(off.props).toEqual({ moduleId: 'attendance', reason: 'module_off' });
    } finally {
      await setModule('attendance', true);
    }
    await setAccess('suspended');
    try {
      const paused: any = await AttendancePage({ searchParams: {} });
      expect(paused.type).toBe(ModuleOffPage);
      expect(paused.props.reason).toBe('account_paused');
    } finally {
      await setAccess('full');
    }
  });

  it('read-only: a colleague’s password can still be reset and an ID card looked up; paused: neither (C140)', async () => {
    const reset = () => sendReset(req('POST', `/api/app/users/${principal}/send-reset`), { params: { userId: principal } });
    const scan = () => scanCard(req('POST', '/api/app/scan', { payload: 'not-a-card', purpose: 'lookup' }));
    await setAccess('read_only');
    // Not refused by the account's state: each goes on to its own work and gives its own answer.
    const outcome = async (call: () => Promise<Response>) => call().then(async (res) => (await res.json()).code ?? `answered ${res.status}`, () => 'went on to its own work');
    expect(['read_only', 'account_paused', 'module_off']).not.toContain(await outcome(reset));
    expect(await outcome(scan)).not.toBe('read_only');
    // The rest of a read-only school is still read-only.
    expect((await tryEverything()).addStudent).toEqual({ status: 403, code: 'read_only' });
    await setAccess('suspended');
    try {
      expect(await said(await reset())).toEqual({ status: 403, code: 'account_paused' });
      expect(await said(await scan())).toEqual({ status: 403, code: 'account_paused' });
    } finally {
      await setAccess('full');
    }
  });

  it('a route built on appRoute is guarded inside its own transaction: one transaction per read, same refusal (C143)', async () => {
    const { GET: listTickets } = await import('@/app/api/app/tickets/route');
    const { GET: searchStudents } = await import('@/app/api/app/students/search/route');
    let transactions = 0;
    const tenant = state.db.tenant.bind(state.db);
    state.db.tenant = (claims: any, fn: any) => {
      transactions += 1;
      return tenant(claims, fn);
    };
    try {
      await setAccess('full');
      transactions = 0;
      expect((await searchStudents(req('GET', '/api/app/students/search?q=exi'))).status).toBe(200);
      expect(transactions).toBe(1);
      await setModule('students', false);
      transactions = 0;
      expect(await said(await searchStudents(req('GET', '/api/app/students/search?q=exi')))).toEqual({ status: 403, code: 'module_off' });
      expect(transactions).toBe(1);
      await setModule('students', true);
      await setAccess('suspended');
      expect((await listTickets(req('GET', '/api/app/tickets'))).status).toBe(200); // help stays open
    } finally {
      state.db.tenant = tenant;
      await setModule('students', true);
      await setAccess('full');
    }
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
