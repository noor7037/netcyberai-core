import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// A member of staff's profile (C238), through its real routes and page on the real migrations (PGlite), as each
// person's own session: the office (principal and school admin) edits; a teacher reads only their own profile and
// changes nothing; another school and a parent read nothing; a staff code is unique in a school (and the same code in
// two schools is fine); the photo's key is held by the database to "<school>/staff-photos/<person>-<uuid>.<ext>"; the
// photo route takes a PNG, JPEG or WebP of at most 5 MB and serves it as the logo is served; the staff export gains
// the staff code and designation; every audit row names fields, never values. Made-up names only.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const session = vi.hoisted(() => ({ claims: null as any, run: null as any }));
const files = vi.hoisted(() => ({ store: null as unknown }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => session.claims }));
vi.mock('@/lib/auth/server-session', () => ({ getServerSession: async () => session.claims }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/app/staff',
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
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

import { PUT as saveRoute } from '@/app/api/app/staff/[staffId]/profile/route';
import { DELETE as photoRemove, GET as photoGet, POST as photoSet } from '@/app/api/app/staff/[staffId]/photo/route';
import { GET as exportStaff } from '@/app/api/app/staff/export/route';
import StaffProfilePage from '@/app/(school)/app/staff/[staffId]/page';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { ToastProvider } from '@/components/ui/Toast';
import { checkProfileInput, checkStaffPhoto } from '@/lib/staff/profile-rules';
import type { MemoryFileStorage } from '@/lib/storage/file-storage';

const A = 'c2380000-0000-4000-8000-0000000000a1';
const B = 'c2380000-0000-4000-8000-0000000000b1';
const u = (n: number) => `c2380000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TEACHER, OTHER_TEACHER, ACCOUNTANT, PARENT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17)];
const [C5, MATHS, T_ROW] = [u(51), u(61), u(71)];
const UUID = '0b0b0b0b-1111-4222-8333-444455556666';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const store = () => files.store as MemoryFileStorage;

type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const teacher: Who = { role: 'teacher', user: TEACHER };
const otherTeacher: Who = { role: 'teacher', user: OTHER_TEACHER };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const parent: Who = { role: 'parent', user: PARENT };
const bPrincipal: Who = { role: 'principal', user: B_PRINCIPAL, school: B };

const gucs = async (tx: { query: (q: string, p?: unknown[]) => Promise<unknown> }, w: Who) => {
  await tx.query('set local role app_user');
  for (const [k, v] of [['app.current_tenant_id', w.school ?? A], ['app.current_role', w.role], ['app.current_user_id', w.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
};
const signIn = (w: Who) => {
  session.claims = { sub: w.user, role: w.role, schoolId: w.school ?? A, membershipId: null, tv: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session.run = (_claims: any, fn: any) => db.pg.transaction(async (tx: any) => (await gucs(tx, w), fn(tx)));
};
// As a person, straight on the database: the database's own rules, without the app's.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asDb = (w: Who, fn: (tx: any) => Promise<any>): Promise<any> => db.pg.transaction(async (tx: any) => (await gucs(tx, w), fn(tx)));
const fails = async (w: Who, sql: string, params: unknown[] = []) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await asDb(w, (tx: any) => tx.query(sql, params));
    return null;
  } catch (err) {
    return (err as Error).message;
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Route = (req: NextRequest, ctx: any) => Promise<Response>;
const call = async (w: Who, route: Route, url: string, params: Record<string, string>, init: { method?: string; json?: unknown; form?: FormData; headers?: Record<string, string> } = {}) => {
  signIn(w);
  let req: RequestInit = { method: init.method ?? 'GET' };
  if (init.json !== undefined) req = { ...req, body: JSON.stringify(init.json), headers: { 'Content-Type': 'application/json' } };
  if (init.form) {
    const r = new Response(init.form);
    const bytes = new Uint8Array(await r.arrayBuffer());
    req = { ...req, body: bytes, headers: { 'Content-Type': r.headers.get('content-type') ?? '', 'Content-Length': String(bytes.length), ...init.headers } };
  }
  const res = await route(new NextRequest(`http://school.example${url}`, req as never), { params });
  const raw = new Uint8Array(await res.arrayBuffer());
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    body = {};
  }
  return { status: res.status, body, raw, headers: res.headers };
};
const save = (w: Who, staffId: string, json: Record<string, unknown>) => call(w, saveRoute, `/api/app/staff/${staffId}/profile`, { staffId }, { method: 'PUT', json });
const audit = async (action: string) => (await db.pg.query(`select actor_user_id, target_id, after_state from audit_log where event_action = $1 order by audit_id`, [action])).rows;
const profileOf = async (school: string, user: string) => (await db.pg.query(`select * from staff_profiles where school_id = $1 and user_id = $2`, [school, user])).rows[0];

// A PNG whose header says 64 by 64 pixels (the server reads the size from the header).
const png = (w = 64, h = 64, size = 40) => {
  const b = new Uint8Array(size);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  b.set([(w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255, (h >>> 24) & 255, (h >>> 16) & 255, (h >>> 8) & 255, h & 255], 16);
  return b;
};
const photoForm = (bytes: Uint8Array) => {
  const f = new FormData();
  f.append('photo', new Blob([bytes]), 'photo.png');
  return f;
};

const FULL = {
  staff_code: 'T-014',
  designation: 'PGT Mathematics',
  employment_type: 'permanent',
  joining_date: '2024-06-01',
  date_of_birth: '1990-02-14',
  address: '12 Example Lane\nSector 4, Example Town',
  emergency_contact: 'Ravi Example +91 90000 11111',
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'Example Public School', 'IN-HR', false), ('${B}', 'School B', 'IN-HR', false);
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard'), ('${B}', 'standard');
    insert into users (user_id, school_id, email, phone, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@school-a.example', null, 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'ad@school-a.example', null, 'school_admin', 'Asif Admin'),
      ('${TEACHER}', '${A}', 't@school-a.example', '+91 90000 00013', 'teacher', 'Tara Teacher'), ('${OTHER_TEACHER}', '${A}', 'o@school-a.example', null, 'teacher', 'Om Teacher'),
      ('${ACCOUNTANT}', '${A}', 'acc@school-a.example', null, 'accountant', 'Anil Accountant'), ('${PARENT}', '${A}', 'rekha@login.netcyberai.com', null, 'parent', 'Rekha Parent'),
      ('${B_PRINCIPAL}', '${B}', 'p@school-b.example', null, 'principal', 'Bina Principal');
    insert into memberships (user_id, school_id, role, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal', true), ('${ADMIN}', '${A}', 'school_admin', true), ('${TEACHER}', '${A}', 'teacher', true),
      ('${OTHER_TEACHER}', '${A}', 'teacher', true), ('${ACCOUNTANT}', '${A}', 'accountant', true), ('${PARENT}', '${A}', 'parent', true),
      ('${B_PRINCIPAL}', '${B}', 'principal', true);
    insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5}', '${A}', '5-A', '${TEACHER}');
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths');
    insert into teachers (teacher_id, school_id, user_id, name, joining_date) values ('${T_ROW}', '${A}', '${TEACHER}', 'Tara Teacher', '2023-06-01');
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ('${A}', '${T_ROW}', '${MATHS}', '${C5}');
    insert into timetable_entries (school_id, class_id, weekday, period, subject_id, teacher_user_id) values
      ('${A}', '${C5}', 1, 1, '${MATHS}', '${TEACHER}'), ('${A}', '${C5}', 2, 1, '${MATHS}', '${TEACHER}'), ('${A}', '${C5}', 3, 2, '${MATHS}', '${TEACHER}');
    set session_replication_role = replica;
    insert into staff_leave (school_id, user_id, from_date, to_date, kind, reason, status, recorded_by, decided_by, decided_at) values
      ('${A}', '${TEACHER}', current_date - 10, current_date - 9, 'sick', 'Fever', 'approved', '${TEACHER}', '${PRINCIPAL}', now()),
      ('${A}', '${TEACHER}', current_date + 20, current_date + 20, 'casual', 'A wedding', 'waiting', '${TEACHER}', null, null);
    set session_replication_role = origin;
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});

describe('the profile’s fields', () => {
  it('are kept trimmed, an empty field as nothing; a wrong one is refused by name', () => {
    const ok = checkProfileInput({ ...FULL, staff_code: '  T-014 ', designation: '' }, '2026-10-18');
    expect(ok).toEqual({ ok: true, values: { ...FULL, designation: null } });
    expect(checkProfileInput({ staff_code: 'T 01 !' }, '2026-10-18')).toEqual({ ok: false, problem: { field: 'staff_code', reason: 'invalid' } });
    expect(checkProfileInput({ employment_type: 'forever' }, '2026-10-18')).toEqual({ ok: false, problem: { field: 'employment_type', reason: 'invalid' } });
    expect(checkProfileInput({ date_of_birth: '2027-01-01' }, '2026-10-18')).toEqual({ ok: false, problem: { field: 'date_of_birth', reason: 'date' } });
    expect(checkProfileInput({ address: 'House 2, 2345 6789 0123' }, '2026-10-18')).toEqual({ ok: false, problem: { field: 'address', reason: 'aadhaar' } });
  });
});

describe('who edits a profile', () => {
  it('the principal and the school admin save it, audited with the names of the fields and never their values', async () => {
    let r = await save(principal, TEACHER, FULL);
    expect([r.status, r.body]).toEqual([200, { created: true, changed: ['staff_code', 'designation', 'employment_type', 'joining_date', 'date_of_birth', 'address', 'emergency_contact'] }]);
    expect(await profileOf(A, TEACHER)).toMatchObject({ staff_code: 'T-014', designation: 'PGT Mathematics', employment_type: 'permanent', address: FULL.address, updated_by: PRINCIPAL });
    r = await save(admin, TEACHER, { ...FULL, designation: 'TGT Mathematics' });
    expect([r.status, r.body]).toEqual([200, { created: false, changed: ['designation'] }]);
    expect((await profileOf(A, TEACHER)).updated_by).toBe(ADMIN);
    r = await save(admin, TEACHER, { ...FULL, designation: 'TGT Mathematics' });
    expect(r.body).toEqual({ created: false, changed: [] });
    const rows = await audit('staff_profile.saved');
    expect(rows.map((x: { actor_user_id: string; target_id: string; after_state: unknown }) => [x.actor_user_id, x.target_id, x.after_state])).toEqual([
      [PRINCIPAL, TEACHER, { created: true, fields: ['staff_code', 'designation', 'employment_type', 'joining_date', 'date_of_birth', 'address', 'emergency_contact'] }],
      [ADMIN, TEACHER, { created: false, fields: ['designation'] }],
    ]);
  });

  it('a teacher, the accountant: refused by the route and by the database', async () => {
    for (const w of [teacher, accountant]) expect((await save(w, TEACHER, { ...FULL, designation: 'Head of Maths' })).status, w.role).toBe(403);
    expect(await fails(teacher, `insert into staff_profiles (school_id, user_id, designation, updated_by) values ($1, $2, 'Head', $2)`, [A, OTHER_TEACHER])).toMatch(/row-level security/);
    const changed = await asDb(teacher, (tx) => tx.query(`update staff_profiles set designation = 'Head of Maths', updated_by = $2 where school_id = $1 and user_id = $2`, [A, TEACHER]));
    expect(changed.affectedRows ?? changed.rowCount ?? 0).toBe(0);
    expect((await profileOf(A, TEACHER)).designation).toBe('TGT Mathematics');
    // Not in their own name: refused.
    expect(await fails(principal, `update staff_profiles set designation = 'X', updated_by = $2 where school_id = $1 and user_id = $3`, [A, ADMIN, TEACHER])).toMatch(/row-level security/);
  });

  it('refuses a field the database would refuse, an unknown person, and a parent', async () => {
    let r = await save(principal, TEACHER, { ...FULL, emergency_contact: 'Ravi 2345 6789 0123' });
    expect([r.status, r.body.code, r.body.field, r.body.problem]).toEqual([400, 'field', 'emergency_contact', 'aadhaar']);
    expect(await fails(principal, `update staff_profiles set address = 'House 234567890123', updated_by = $3 where school_id = $1 and user_id = $2`, [A, TEACHER, PRINCIPAL])).toMatch(/check constraint/);
    r = await save(principal, PARENT, FULL);
    expect([r.status, r.body.code]).toEqual([404, 'not_found']);
    expect(await fails(principal, `insert into staff_profiles (school_id, user_id, updated_by) values ($1, $2, $3)`, [A, PARENT, PRINCIPAL])).toMatch(/member of the school's staff/);
    expect((await save(parent, TEACHER, FULL)).status).toBe(401);
  });
});

describe('who reads a profile', () => {
  it('the office every row; a teacher their own row only; another school and a parent nothing', async () => {
    await save(principal, OTHER_TEACHER, { staff_code: 'T-015' });
    const seen = async (w: Who) => (await asDb(w, (tx) => tx.query(`select user_id from staff_profiles order by user_id`))).rows.map((r: { user_id: string }) => r.user_id);
    expect(await seen(principal)).toEqual([TEACHER, OTHER_TEACHER]);
    expect(await seen(admin)).toEqual([TEACHER, OTHER_TEACHER]);
    expect(await seen(teacher)).toEqual([TEACHER]);
    expect(await seen(otherTeacher)).toEqual([OTHER_TEACHER]);
    expect(await seen(accountant)).toEqual([]);
    expect(await seen(parent)).toEqual([]);
    expect(await seen(bPrincipal)).toEqual([]);
    // Another school's office cannot write into this school.
    expect(await fails(bPrincipal, `insert into staff_profiles (school_id, user_id, updated_by) values ($1, $2, $3)`, [A, ADMIN, B_PRINCIPAL])).toMatch(/row-level security|member of the school's staff/);
    expect((await save(bPrincipal, TEACHER, FULL)).status).toBe(404);
  });

  it('the page: the office sees every tab of anyone’s; a teacher their own, read-only; nobody else’s', async () => {
    const render = async (w: Who, staffId: string, tab?: string) => {
      signIn(w);
      const page = await StaffProfilePage({ params: { staffId }, searchParams: tab ? { tab } : {} });
      return renderToStaticMarkup(createElement(ToastProvider, null, page));
    };
    const html = await render(principal, TEACHER);
    for (const part of ['data-staff-header', 'T-014', 'TGT Mathematics', '+91 90000 00013', 'data-staff-edit', 'data-staff-biodata-button', 'data-staff-documents-button', 'data-staff-overview', 'data-staff-contact', 'data-staff-employment', 'data-staff-attendance', 'data-staff-teaching', 'data-staff-qualifications', 'data-record-documents="staff"', 'data-staff-id-card', 'data-staff-biodata'])
      expect(html, part).toContain(part);
    expect(html).toContain('Example Public School');
    expect(html).toContain('Maths, class 5-A');
    expect(html).toContain('The school keeps no daily attendance for staff.');
    // Counted from the record: two approved days that have come, one request waiting, three periods published.
    for (const tile of ['Leave days taken: 2', 'Leave requests waiting: 1', 'Periods a week: 3']) expect(html, tile).toContain(tile);
    expect(html).toMatch(/data-staff-leave="waiting"/);
    expect(html).toMatch(/data-staff-leave="approved"/);
    expect(html).not.toMatch(/Aadhaar number|PAN number|IFSC/);
    expect(await render(admin, TEACHER, 'id-card')).toMatch(/aria-selected="true"[^>]*>ID card/);
    const own = await render(teacher, TEACHER, 'biodata');
    expect(own).toMatch(/aria-selected="true"[^>]*>Biodata/);
    expect(own).toContain('T-014');
    expect(own).not.toContain('data-staff-edit');
    signIn(teacher);
    expect((await StaffProfilePage({ params: { staffId: OTHER_TEACHER }, searchParams: {} })).type).toBe(ModuleComingPage);
    await expect(render(bPrincipal, TEACHER)).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('a staff code', () => {
  it('is unique in a school, whatever its case; the same code in another school is fine', async () => {
    let r = await save(admin, OTHER_TEACHER, { staff_code: 't-014' });
    expect([r.status, r.body.code]).toEqual([409, 'code_taken']);
    expect((await profileOf(A, OTHER_TEACHER)).staff_code).toBe('T-015');
    r = await save(bPrincipal, B_PRINCIPAL, { staff_code: 'T-014', designation: 'Principal' });
    expect(r.status).toBe(200);
    expect((await profileOf(B, B_PRINCIPAL)).staff_code).toBe('T-014');
    expect(await fails(principal, `update staff_profiles set staff_code = 'T-014', updated_by = $3 where school_id = $1 and user_id = $2`, [A, OTHER_TEACHER, PRINCIPAL])).toMatch(/staff_profiles_code_per_school/);
  });
});

describe('the photo', () => {
  it('has its key held by the database to the school’s and the person’s own prefix', async () => {
    const set = (path: string) => fails(principal, `update staff_profiles set photo_path = $3, updated_by = $4 where school_id = $1 and user_id = $2`, [A, TEACHER, path, PRINCIPAL]);
    for (const wrong of [`${A}/branding/logo-${UUID}.png`, `${B}/staff-photos/${TEACHER}-${UUID}.jpg`, `${A}/staff-photos/${OTHER_TEACHER}-${UUID}.jpg`, `${A}/staff-photos/${TEACHER}-${UUID}.gif`, `${A}/staff-photos/../${TEACHER}-${UUID}.jpg`, `x/${A}/staff-photos/${TEACHER}-${UUID}.png`])
      expect(await set(wrong), wrong).toMatch(/staff_profiles_photo_path_shape/);
    expect(await set(`${A}/staff-photos/${TEACHER}-${UUID}.webp`)).toBeNull();
    await db.pg.query(`update staff_profiles set photo_path = null where school_id = $1 and user_id = $2`, [A, TEACHER]);
  });

  it('is a PNG, JPEG or WebP by its first bytes, of at most 5 MB, a size a photo can be; nothing else is stored', async () => {
    expect(checkStaffPhoto(png())).toMatchObject({ ok: true, type: 'image/png', width: 64, height: 64 });
    expect(checkStaffPhoto(png(8, 8))).toEqual({ ok: false, reason: 'photo_dimensions' });
    const url = `/api/app/staff/${TEACHER}/photo`;
    const p = { staffId: TEACHER };
    const before = store().files.size;
    let r = await call(principal, photoSet, url, p, { method: 'POST', form: photoForm(new TextEncoder().encode('%PDF-1.4 not a picture at all')) });
    expect([r.status, r.body.code]).toEqual([400, 'photo_not_image']);
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set(png());
    r = await call(principal, photoSet, url, p, { method: 'POST', form: photoForm(big) });
    expect([r.status, r.body.code]).toEqual([413, 'photo_too_large']);
    r = await call(principal, photoSet, url, p, { method: 'POST', form: photoForm(png()), headers: { 'Content-Length': String(6 * 1024 * 1024) } });
    expect([r.status, r.body.code]).toEqual([413, 'photo_too_large']);
    for (const w of [teacher, accountant]) expect((await call(w, photoSet, url, p, { method: 'POST', form: photoForm(png()) })).status, w.role).toBe(403);
    expect(store().files.size).toBe(before);
  });

  it('is set and replaced by the office (the old file removed), served from the app’s own address to the office and the person, and removed', async () => {
    const url = `/api/app/staff/${TEACHER}/photo`;
    const p = { staffId: TEACHER };
    let r = await call(admin, photoSet, url, p, { method: 'POST', form: photoForm(png()) });
    expect(r.status).toBe(200);
    const first = (await profileOf(A, TEACHER)).photo_path as string;
    expect(first).toMatch(new RegExp(`^${A}/staff-photos/${TEACHER}-[0-9a-f-]{36}\\.png$`));
    expect(store().files.has(first)).toBe(true);
    r = await call(principal, photoSet, url, p, { method: 'POST', form: photoForm(png(128, 160, 60)) });
    expect(r.status).toBe(200);
    const second = (await profileOf(A, TEACHER)).photo_path as string;
    expect(second).not.toBe(first);
    expect([store().files.has(first), store().files.has(second)]).toEqual([false, true]);
    for (const w of [principal, teacher]) {
      const got = await call(w, photoGet, `${url}?v=1`, p);
      expect(got.status, w.role).toBe(200);
      expect(got.headers.get('Content-Type')).toBe('image/png');
      expect(got.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(got.headers.get('Content-Security-Policy')).toBe("default-src 'none'; sandbox");
      expect(got.headers.get('Cache-Control')).toBe('private, max-age=86400');
      expect(got.raw.length).toBe(60);
    }
    expect((await call(otherTeacher, photoGet, url, p)).status).toBe(403);
    expect((await call(bPrincipal, photoGet, url, p)).status).toBe(404);
    expect((await call(parent, photoGet, url, p)).status).toBe(401);
    const sets = await audit('staff_profile.photo_set');
    expect(sets.map((x: { after_state: unknown }) => x.after_state)).toEqual([
      { created: false, replaced: false, photoType: 'image/png', photoBytes: 40, width: 64, height: 64 },
      { created: false, replaced: true, photoType: 'image/png', photoBytes: 60, width: 128, height: 160 },
    ]);
    expect((await call(teacher, photoRemove, url, p, { method: 'DELETE' })).status).toBe(403);
    r = await call(principal, photoRemove, url, p, { method: 'DELETE' });
    expect([r.status, (await profileOf(A, TEACHER)).photo_path, store().files.has(second)]).toEqual([200, null, false]);
    expect((await call(principal, photoGet, url, p)).status).toBe(404);
    expect((await audit('staff_profile.photo_removed')).map((x: { after_state: unknown }) => x.after_state)).toEqual([{ removed: true }]);
  });
});

describe('the staff export', () => {
  it('gains the staff code and the designation', async () => {
    const r = await call(admin, exportStaff, '/api/app/staff/export?format=csv', {});
    expect(r.status).toBe(200);
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(r.raw);
    expect(text.startsWith('﻿Name,Staff code,Designation,Role,Email,Mobile,Account,In this school since\r\n')).toBe(true);
    expect(text).toContain("Tara Teacher,T-014,TGT Mathematics,Teacher,t@school-a.example,'+91 90000 00013,Active,");
    expect(text).toContain('Om Teacher,T-015,,Teacher,');
    expect(text).not.toContain('Bina Principal');
  });
});

describe('the audit rows of a profile', () => {
  it('carry no value that was typed, and are read by the office or the person who acted', async () => {
    const rows = (await db.pg.query(`select after_state::text as s from audit_log where event_action like 'staff_profile.%'`)).rows.map((r: { s: string }) => r.s).join('\n');
    for (const value of ['T-014', 'T-015', 'Mathematics', 'Example Lane', 'Ravi', '1990-02-14', '2024-06-01', 'permanent', 'staff-photos']) expect(rows, value).not.toContain(value);
    const seen = async (w: Who) => (await asDb(w, (tx) => tx.query(`select count(*)::int as n from audit_log where event_action like 'staff_profile.%'`))).rows[0].n;
    expect(await seen(principal)).toBeGreaterThan(0);
    expect(await seen(teacher)).toBe(0);
    expect(await seen(accountant)).toBe(0);
  });
});
