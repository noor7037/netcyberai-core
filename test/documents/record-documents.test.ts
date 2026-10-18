import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { inflateRawSync } from 'node:zlib';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// The papers on a staff or student record (C235-D), and the office's list exports, through their real routes on the
// real migrations (PGlite), as each person's own session: who may add, replace, open and remove a paper (the routes AND
// the database's own rules, each checked on its own); what a file may be (by its first bytes, at most 10 MB, never an
// Aadhaar card or number); versions kept, latest first; every upload, new version, link and removal audited by ids
// only; the exports' visibility, files and audit rows; a child's erasure taking the papers with it. Made-up names only.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const session = vi.hoisted(() => ({ claims: null as any, run: null as any }));
const files = vi.hoisted(() => ({ store: null as unknown }));
const ocr = vi.hoisted(() => ({ text: 'A certificate of the school' }));
const erased = vi.hoisted(() => ({ keys: [] as string[] }));
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
vi.mock('@/lib/capture/ocr', async (original) => ({ ...(await original<typeof import('@/lib/capture/ocr')>()), runOcr: async () => ({ rawText: ocr.text, words: [] }) }));
vi.mock('@/lib/capture/storage', async (original) => ({
  ...(await original<typeof import('@/lib/capture/storage')>()),
  deleteDocument: async (key: string) => {
    erased.keys.push(key);
  },
}));

import { GET as staffList, POST as staffAdd } from '@/app/api/app/staff/[staffId]/record-documents/route';
import { POST as staffVersion, DELETE as staffRemove } from '@/app/api/app/staff/[staffId]/record-documents/[documentId]/route';
import { GET as staffLink } from '@/app/api/app/staff/[staffId]/record-documents/[documentId]/versions/[versionId]/route';
import { GET as studentList, POST as studentAdd } from '@/app/api/app/students/[studentId]/record-documents/route';
import { POST as studentVersion, DELETE as studentRemove } from '@/app/api/app/students/[studentId]/record-documents/[documentId]/route';
import { GET as studentLink } from '@/app/api/app/students/[studentId]/record-documents/[documentId]/versions/[versionId]/route';
import { GET as exportStudents } from '@/app/api/app/students/export/route';
import { GET as exportStaff } from '@/app/api/app/staff/export/route';
import { GET as exportClasses } from '@/app/api/app/classes/export/route';
import StaffProfilePage from '@/app/(school)/app/staff/[staffId]/page';
import { ToastProvider } from '@/components/ui/Toast';
import { ModuleComingPage } from '@/components/app-shell/ModuleComingPage';
import { pseudonymizeStudent } from '@/lib/consent/dsr';
import { sniffRecordFile } from '@/lib/documents/record-documents';
import type { MemoryFileStorage } from '@/lib/storage/file-storage';

const A = 'c235d000-0000-4000-8000-0000000000a1';
const B = 'c235d000-0000-4000-8000-0000000000b1';
const u = (n: number) => `c235d000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TEACHER, OTHER_TEACHER, ACCOUNTANT, COORDINATOR, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15), u(16), u(17)];
const [C5, C6, MATHS, T_ROW, T2_ROW, S5, S6, PARENT] = [u(51), u(52), u(61), u(71), u(72), u(81), u(82), u(91)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const store = () => files.store as MemoryFileStorage;

type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const teacher: Who = { role: 'teacher', user: TEACHER };
const otherTeacher: Who = { role: 'teacher', user: OTHER_TEACHER };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
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
const call = async (w: Who, route: Route, url: string, params: Record<string, string>, method: 'GET' | 'POST' | 'DELETE' = 'GET', body?: FormData, extraHeaders: Record<string, string> = {}) => {
  signIn(w);
  let init: RequestInit = { method };
  if (body) {
    // As a browser sends it: the multipart body with its declared length.
    const r = new Response(body);
    const bytes = new Uint8Array(await r.arrayBuffer());
    init = { method, body: bytes, headers: { 'Content-Type': r.headers.get('content-type') ?? '', 'Content-Length': String(bytes.length), ...extraHeaders } };
  }
  const res = await route(new NextRequest(`http://school.example${url}`, init as never), { params });
  const raw = new Uint8Array(await res.arrayBuffer());
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    json = {};
  }
  return { status: res.status, body: json, raw, headers: res.headers };
};

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3, 4]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20]);
const TEXT = new TextEncoder().encode('just some words, not a document');
const form = (bytes: Uint8Array, name: string, extra: Record<string, string> = {}) => {
  const f = new FormData();
  f.append('file', new Blob([bytes]), name);
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  return f;
};

const staffUrl = (id: string, rest = '') => `/api/app/staff/${id}/record-documents${rest}`;
const studentUrl = (id: string, rest = '') => `/api/app/students/${id}/record-documents${rest}`;
const audit = async (action: string) => (await db.pg.query(`select actor_user_id, target_id, after_state from audit_log where event_action = $1 order by audit_id`, [action])).rows;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-HR', false);
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard'), ('${B}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'students', true, 'plan'), ('${B}', 'students', true, 'plan') on conflict do nothing;
    insert into users (user_id, school_id, email, phone, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@school-a.example', null, 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'ad@school-a.example', null, 'school_admin', 'Asif Admin'),
      ('${TEACHER}', '${A}', 't@school-a.example', '+91 90000 00013', 'teacher', 'Tara Teacher'), ('${OTHER_TEACHER}', '${A}', 'o@school-a.example', null, 'teacher', 'Om Teacher'),
      ('${ACCOUNTANT}', '${A}', 'acc@school-a.example', null, 'accountant', 'Anil Accountant'), ('${COORDINATOR}', '${A}', 'co@school-a.example', null, 'academic_coordinator', 'Kiran Coordinator'),
      ('${B_PRINCIPAL}', '${B}', 'p@school-b.example', null, 'principal', 'Bina Principal'),
      ('${PARENT}', '${A}', 'rekha@login.netcyberai.com', null, 'parent', 'Rekha Parent');
    insert into memberships (user_id, school_id, role, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal', true), ('${ADMIN}', '${A}', 'school_admin', true), ('${TEACHER}', '${A}', 'teacher', true),
      ('${OTHER_TEACHER}', '${A}', 'teacher', true), ('${ACCOUNTANT}', '${A}', 'accountant', true), ('${COORDINATOR}', '${A}', 'academic_coordinator', true),
      ('${B_PRINCIPAL}', '${B}', 'principal', true), ('${PARENT}', '${A}', 'parent', true);
    insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5}', '${A}', '5-A', '${TEACHER}'), ('${C6}', '${A}', '6-A', null);
    insert into subjects (subject_id, school_id, name) values ('${MATHS}', '${A}', 'Maths');
    insert into teachers (teacher_id, school_id, user_id, name, joining_date) values ('${T_ROW}', '${A}', '${TEACHER}', 'Tara Teacher', '2024-06-01'), ('${T2_ROW}', '${A}', '${OTHER_TEACHER}', 'Om Teacher', null);
    insert into teacher_subjects (school_id, teacher_id, subject_id, class_id) values ('${A}', '${T_ROW}', '${MATHS}', '${C5}'), ('${A}', '${T2_ROW}', '${MATHS}', '${C6}');
    insert into students (student_id, school_id, admission_no, name, status, class_id, roll_no) values
      ('${S5}', '${A}', 'A-0012', 'Aarav Example', 'active', '${C5}', '7'), ('${S6}', '${A}', '=cmd|calc', 'Bela Example', 'active', '${C6}', '3');
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});
beforeEach(() => {
  ocr.text = 'A certificate of the school';
});

describe('a file on a record', () => {
  it('is a PDF, a JPEG or a PNG by its own first bytes, never by its name', () => {
    expect(sniffRecordFile(PDF)).toBe('application/pdf');
    expect(sniffRecordFile(JPEG)).toBe('image/jpeg');
    expect(sniffRecordFile(PNG)).toBe('image/png');
    expect(sniffRecordFile(WEBP)).toBeNull();
    expect(sniffRecordFile(TEXT)).toBeNull();
    expect(sniffRecordFile(new Uint8Array(0))).toBeNull();
  });

  it('is refused when it is not one of the three, is empty, or is larger than 10 MB, and nothing is stored', async () => {
    const before = store().files.size;
    const p = { staffId: TEACHER };
    const kindTitle = { kind: 'government_id', title: 'PAN card' };
    let r = await call(principal, staffAdd, staffUrl(TEACHER), p, 'POST', form(TEXT, 'scan.pdf', kindTitle));
    expect([r.status, r.body.code]).toEqual([400, 'file_type']);
    r = await call(principal, staffAdd, staffUrl(TEACHER), p, 'POST', form(WEBP, 'photo.png', kindTitle));
    expect([r.status, r.body.code]).toEqual([400, 'file_type']);
    r = await call(principal, staffAdd, staffUrl(TEACHER), p, 'POST', form(new Uint8Array(0), 'empty.pdf', kindTitle));
    expect([r.status, r.body.code]).toEqual([400, 'file_empty']);
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(PNG);
    r = await call(principal, staffAdd, staffUrl(TEACHER), p, 'POST', form(big, 'big.png', kindTitle));
    expect([r.status, r.body.code]).toEqual([413, 'file_too_large']);
    // Refused from its declared length, before it is read.
    r = await call(principal, staffAdd, staffUrl(TEACHER), p, 'POST', form(PNG, 'a.png', kindTitle), { 'Content-Length': String(11 * 1024 * 1024) });
    expect(r.status).toBe(413);
    expect(store().files.size).toBe(before);
    expect((await db.pg.query(`select count(*)::int as n from record_documents`)).rows[0].n).toBe(0);
  });

  it('is refused when it shows an Aadhaar card or number, and is never stored (C232 part A)', async () => {
    const before = store().files.size;
    ocr.text = 'Government of India  Aadhaar  1234 5678 9012';
    const r = await call(principal, studentAdd, studentUrl(S5), { studentId: S5 }, 'POST', form(JPEG, 'guardian.jpg', { kind: 'government_id', title: 'Guardian ID' }));
    expect([r.status, r.body.code]).toEqual([400, 'upload_aadhaar_number']);
    ocr.text = 'Unique Identification Authority of India  Government of India  Enrolment No';
    const card = await call(principal, studentAdd, studentUrl(S5), { studentId: S5 }, 'POST', form(PNG, 'id.png', { kind: 'government_id', title: 'Guardian ID' }));
    expect([card.status, card.body.code]).toEqual([400, 'upload_aadhaar_card']);
    expect(store().files.size).toBe(before);
    expect((await db.pg.query(`select count(*)::int as n from record_documents`)).rows[0].n).toBe(0);
  });

  it('needs a kind from the list and a name with no Aadhaar number, of at most 120 characters', async () => {
    const p = { staffId: TEACHER };
    let r = await call(principal, staffAdd, staffUrl(TEACHER), p, 'POST', form(PNG, 'a.png', { kind: 'passport', title: 'Passport' }));
    expect([r.status, r.body.code]).toEqual([400, 'choose_one']);
    r = await call(principal, staffAdd, staffUrl(TEACHER), p, 'POST', form(PNG, 'a.png', { kind: 'other', title: '   ' }));
    expect([r.status, r.body.code]).toEqual([400, 'required']);
    r = await call(principal, staffAdd, staffUrl(TEACHER), p, 'POST', form(PNG, 'a.png', { kind: 'other', title: 'ID 1234 5678 9012' }));
    expect([r.status, r.body.code]).toEqual([400, 'title_aadhaar']);
    r = await call(principal, staffAdd, staffUrl(TEACHER), p, 'POST', form(PNG, 'a.png', { kind: 'other', title: 'x'.repeat(121) }));
    expect([r.status, r.body.code]).toEqual([400, 'title_too_long']);
  });
});

describe('a paper on a member of staff’s record', () => {
  let documentId = '';
  let v1 = '';
  let v2 = '';

  it('is added by the office, stored under the school’s own prefix, and a new upload is a new version', async () => {
    const added = await call(principal, staffAdd, staffUrl(TEACHER), { staffId: TEACHER }, 'POST', form(PNG, 'tara-pan-card-front.pdf', { kind: 'government_id', title: 'PAN card' }));
    expect(added.status).toBe(201);
    expect(added.body.versionNo).toBe(1);
    documentId = String(added.body.documentId);
    v1 = String(added.body.versionId);
    const again = await call(admin, staffVersion, staffUrl(TEACHER, `/${documentId}`), { staffId: TEACHER, documentId }, 'POST', form(PDF, 'tara-pan-card-new.pdf'));
    expect(again.status).toBe(201);
    expect(again.body.versionNo).toBe(2);
    v2 = String(again.body.versionId);
    const keys = (await db.pg.query(`select storage_key, mime_type from record_document_versions where document_id = $1 order by version_no`, [documentId])).rows;
    // The kind comes from the bytes: a PNG sent under a .pdf name is kept as a PNG.
    expect(keys.map((k: { mime_type: string }) => k.mime_type)).toEqual(['image/png', 'application/pdf']);
    for (const k of keys) {
      expect(k.storage_key.startsWith(`${A}/record-documents/staff/${TEACHER}/${documentId}/`)).toBe(true);
      expect(k.storage_key).not.toContain('tara');
      expect(store().files.has(k.storage_key)).toBe(true);
    }
  });

  it('lists the paper once, with both versions, the latest first, and who uploaded each', async () => {
    const r = await call(principal, staffList, staffUrl(TEACHER), { staffId: TEACHER });
    expect(r.status).toBe(200);
    const docs = r.body.documents as { documentId: string; title: string; kind: string; versions: { versionNo: number; uploadedBy: string; mimeType: string }[] }[];
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ documentId, title: 'PAN card', kind: 'government_id' });
    expect(docs[0].versions.map((v) => [v.versionNo, v.uploadedBy, v.mimeType])).toEqual([
      [2, 'Asif Admin', 'application/pdf'],
      [1, 'Priya Principal', 'image/png'],
    ]);
    expect(r.body.mayUpload).toBe(true);
  });

  it('is opened by its own member of staff, through a short link, and by nobody else outside the office', async () => {
    const own = await call(teacher, staffList, staffUrl(TEACHER), { staffId: TEACHER });
    expect(own.status).toBe(200);
    expect(own.body.mayUpload).toBe(false);
    const link = await call(teacher, staffLink, staffUrl(TEACHER, `/${documentId}/versions/${v1}`), { staffId: TEACHER, documentId, versionId: v1 });
    expect(link.status).toBe(200);
    expect(String(link.body.url)).toMatch(/^memory:\/\/.+\?ttl=300$/);
    expect(link.headers.get('Cache-Control')).toBe('no-store');
    for (const w of [otherTeacher, accountant, coordinator]) {
      expect((await call(w, staffList, staffUrl(TEACHER), { staffId: TEACHER })).status, w.role).toBe(403);
      expect((await call(w, staffLink, staffUrl(TEACHER, `/${documentId}/versions/${v2}`), { staffId: TEACHER, documentId, versionId: v2 })).status, w.role).toBe(403);
    }
    // Another school's principal: not this school's record at all.
    expect((await call(bPrincipal, staffList, staffUrl(TEACHER), { staffId: TEACHER })).status).toBe(404);
    // A parent's login is listed among the school's accounts (C230-D) but is no staff record: no papers on it.
    expect((await call(principal, staffList, staffUrl(PARENT), { staffId: PARENT })).status).toBe(404);
    expect((await call(principal, staffAdd, staffUrl(PARENT), { staffId: PARENT }, 'POST', form(PNG, 'p.png', { kind: 'other', title: 'Letter' }))).status).toBe(404);
  });

  it('is never added to or replaced by anyone outside the office, its own member of staff included', async () => {
    for (const w of [teacher, otherTeacher, accountant, coordinator]) {
      expect((await call(w, staffAdd, staffUrl(TEACHER), { staffId: TEACHER }, 'POST', form(PNG, 'x.png', { kind: 'other', title: 'Letter' }))).status, w.role).toBe(403);
      expect((await call(w, staffVersion, staffUrl(TEACHER, `/${documentId}`), { staffId: TEACHER, documentId }, 'POST', form(PNG, 'x.png'))).status, w.role).toBe(403);
      expect((await call(w, staffRemove, staffUrl(TEACHER, `/${documentId}`), { staffId: TEACHER, documentId }, 'DELETE')).status, w.role).toBe(403);
    }
  });

  it('writes every upload, new version and link to the audit log by ids only', async () => {
    const added = await audit('record_document.added');
    const version = await audit('record_document.version_added');
    const links = await audit('record_document.link_issued');
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ actor_user_id: PRINCIPAL, target_id: documentId, after_state: { record: 'staff', recordId: TEACHER, kind: 'government_id', versionNo: 1, mime: 'image/png' } });
    expect(version[0]).toMatchObject({ actor_user_id: ADMIN, target_id: documentId, after_state: { versionId: v2, versionNo: 2, mime: 'application/pdf' } });
    expect(links[0]).toMatchObject({ actor_user_id: TEACHER, target_id: documentId, after_state: { versionId: v1, versionNo: 1, seconds: 300 } });
    // Neither the paper's name nor the file's name is in any audit row.
    const all = JSON.stringify((await db.pg.query(`select after_state from audit_log where event_action like 'record_document.%'`)).rows);
    expect(all).not.toMatch(/PAN|tara/i);
    // The audit rows are read by the office and the person who acted, nobody else.
    const seen = async (w: Who) => (await asDb(w, (tx) => tx.query(`select count(*)::int as n from audit_log where event_action like 'record_document.%'`))).rows[0].n;
    expect(await seen(principal)).toBe(3);
    expect(await seen(teacher)).toBe(1);
    expect(await seen(accountant)).toBe(0);
  });
});

describe('a paper on a student’s record', () => {
  let documentId = '';
  let versionId = '';

  it('is added by the office and read as the student’s record is: a teacher of the child’s class, the coordinator, the accountant', async () => {
    const added = await call(admin, studentAdd, studentUrl(S5), { studentId: S5 }, 'POST', form(JPEG, 'tc.jpg', { kind: 'academic_certificate', title: 'Transfer certificate' }));
    expect(added.status).toBe(201);
    documentId = String(added.body.documentId);
    versionId = String(added.body.versionId);
    for (const w of [principal, admin, teacher, coordinator, accountant]) {
      const r = await call(w, studentList, studentUrl(S5), { studentId: S5 });
      expect(r.status, w.role).toBe(200);
      expect((r.body.documents as unknown[]).length, w.role).toBe(1);
      expect(r.body.mayUpload, w.role).toBe(w === principal || w === admin);
    }
    const link = await call(coordinator, studentLink, studentUrl(S5, `/${documentId}/versions/${versionId}`), { studentId: S5, documentId, versionId });
    expect(link.status).toBe(200);
  });

  it('is not read by a teacher of another class, another school, or a parent', async () => {
    expect((await call(otherTeacher, studentList, studentUrl(S5), { studentId: S5 })).status).toBe(404);
    expect((await call(otherTeacher, studentLink, studentUrl(S5, `/${documentId}/versions/${versionId}`), { studentId: S5, documentId, versionId })).status).toBe(404);
    expect((await call(bPrincipal, studentList, studentUrl(S5), { studentId: S5 })).status).toBe(404);
    // A parent's session never passes the staff app's guard.
    expect((await call(parent, studentList, studentUrl(S5), { studentId: S5 })).status).toBe(401);
    expect((await call(parent, studentLink, studentUrl(S5, `/${documentId}/versions/${versionId}`), { studentId: S5, documentId, versionId })).status).toBe(401);
  });

  it('is not added to, replaced or removed by a teacher, the coordinator or the accountant', async () => {
    for (const w of [teacher, coordinator, accountant]) {
      expect((await call(w, studentAdd, studentUrl(S5), { studentId: S5 }, 'POST', form(PNG, 'x.png', { kind: 'other', title: 'Letter' }))).status, w.role).toBe(403);
      expect((await call(w, studentVersion, studentUrl(S5, `/${documentId}`), { studentId: S5, documentId }, 'POST', form(PNG, 'x.png'))).status, w.role).toBe(403);
      expect((await call(w, studentRemove, studentUrl(S5, `/${documentId}`), { studentId: S5, documentId }, 'DELETE')).status, w.role).toBe(403);
    }
    // A paper of one record is not reached through another record's address.
    expect((await call(principal, studentVersion, studentUrl(S6, `/${documentId}`), { studentId: S6, documentId }, 'POST', form(PNG, 'x.png'))).status).toBe(404);
  });

  it('is removed by the office with all its versions and files, audited', async () => {
    await call(principal, studentVersion, studentUrl(S5, `/${documentId}`), { studentId: S5, documentId }, 'POST', form(PDF, 'tc-2.pdf'));
    const keys = (await db.pg.query(`select storage_key from record_document_versions where document_id = $1`, [documentId])).rows.map((r: { storage_key: string }) => r.storage_key);
    expect(keys).toHaveLength(2);
    const r = await call(principal, studentRemove, studentUrl(S5, `/${documentId}`), { studentId: S5, documentId }, 'DELETE');
    expect([r.status, r.body.versionsRemoved]).toEqual([200, 2]);
    expect((await db.pg.query(`select count(*)::int as n from record_documents where document_id = $1`, [documentId])).rows[0].n).toBe(0);
    for (const k of keys) expect(store().files.has(k)).toBe(false);
    const removed = await audit('record_document.removed');
    expect(removed[0]).toMatchObject({ actor_user_id: PRINCIPAL, target_id: documentId, after_state: { record: 'student', recordId: S5, versionsRemoved: 2, filesNotRemoved: 0 } });
  });

  it('goes with the child’s erasure, rows and files', async () => {
    const added = await call(admin, studentAdd, studentUrl(S6), { studentId: S6 }, 'POST', form(PNG, 'r.png', { kind: 'transcript', title: 'Report card' }));
    expect(added.status).toBe(201);
    const key = (await db.pg.query(`select storage_key from record_document_versions where document_id = $1`, [added.body.documentId])).rows[0].storage_key;
    const done = await asDb(principal, (tx) => pseudonymizeStudent(tx, A, S6));
    expect(done.recordDocumentsRemoved).toBe(1);
    expect(erased.keys).toContain(key);
    expect((await db.pg.query(`select count(*)::int as n from record_documents where student_id = $1`, [S6])).rows[0].n).toBe(0);
  });
});

describe('the database’s own rules on the papers', () => {
  let staffDoc = '';
  let studentDoc = '';
  beforeAll(async () => {
    staffDoc = (await db.pg.query(`select document_id from record_documents where staff_user_id = $1`, [TEACHER])).rows[0].document_id;
    const made = await call(principal, studentAdd, studentUrl(S5), { studentId: S5 }, 'POST', form(PNG, 'b.png', { kind: 'other', title: 'Birth record' }));
    studentDoc = String(made.body.documentId);
  });
  const count = async (w: Who, where: string, params: unknown[]) => (await asDb(w, (tx) => tx.query(`select count(*)::int as n from record_documents where ${where}`, params))).rows[0].n;
  const versions = async (w: Who, documentId: string) => (await asDb(w, (tx) => tx.query(`select count(*)::int as n from record_document_versions where document_id = $1`, [documentId]))).rows[0].n;

  it('lets each role read only what the app lets it read', async () => {
    expect(await count(principal, 'document_id = $1', [staffDoc])).toBe(1);
    expect(await count(teacher, 'document_id = $1', [staffDoc])).toBe(1); // their own
    expect(await versions(teacher, staffDoc)).toBe(2);
    for (const w of [otherTeacher, accountant, coordinator]) {
      expect(await count(w, 'document_id = $1', [staffDoc]), w.role).toBe(0);
      expect(await versions(w, staffDoc), w.role).toBe(0);
    }
    for (const w of [teacher, accountant, coordinator, admin]) expect(await count(w, 'document_id = $1', [studentDoc]), w.role).toBe(1);
    expect(await count(otherTeacher, 'document_id = $1', [studentDoc])).toBe(0);
    expect(await versions(otherTeacher, studentDoc)).toBe(0);
    expect(await count(bPrincipal, 'true', [])).toBe(0);
    expect(await count(parent, 'true', [])).toBe(0);
  });

  it('refuses a write from anyone outside the office, a parent, or in another person’s name', async () => {
    const insertDoc = `insert into record_documents (school_id, student_id, kind, title, created_by) values ($1, $2, 'other', 'Letter', $3)`;
    for (const w of [teacher, accountant, coordinator, parent]) expect(await fails(w, insertDoc, [A, S5, w.user]), w.role).toMatch(/row-level security/);
    expect(await fails(principal, insertDoc, [A, S5, ADMIN])).toMatch(/row-level security/);
    expect(await fails(principal, insertDoc, [A, S5, PRINCIPAL])).toBeNull();
    const insertVersion = `insert into record_document_versions (school_id, document_id, version_no, storage_key, mime_type, size_bytes, uploaded_by) values ($1, $2, 1, $3, 'image/png', 10, $4)`;
    expect(await fails(teacher, insertVersion, [A, staffDoc, `${A}/record-documents/x.png`, TEACHER])).toMatch(/row-level security/);
    // Nothing is changed in place: no UPDATE right at all.
    expect(await fails(principal, `update record_documents set title = 'Changed' where document_id = $1`, [staffDoc])).toMatch(/permission denied/);
    expect(await fails(principal, `update record_document_versions set size_bytes = 1 where document_id = $1`, [staffDoc])).toMatch(/permission denied/);
    // A teacher deletes nothing (the row is not removed, whatever the database answers).
    await asDb(teacher, (tx) => tx.query(`delete from record_document_versions where document_id = $1`, [staffDoc]));
    expect((await db.pg.query(`select count(*)::int as n from record_document_versions where document_id = $1`, [staffDoc])).rows[0].n).toBe(2);
  });

  it('keeps an Aadhaar number out of a name, a file outside the school’s prefix out, and numbers the versions itself', async () => {
    expect(await fails(principal, `insert into record_documents (school_id, staff_user_id, kind, title, created_by) values ($1, $2, 'other', 'No 123456789012', $3)`, [A, TEACHER, PRINCIPAL])).toMatch(/check constraint/);
    expect(await fails(principal, `insert into record_document_versions (school_id, document_id, version_no, storage_key, mime_type, size_bytes, uploaded_by) values ($1, $2, 1, $3, 'image/png', 10, $4)`, [A, staffDoc, `${B}/record-documents/x.png`, PRINCIPAL])).toMatch(/check constraint/);
    expect(await fails(principal, `insert into record_document_versions (school_id, document_id, version_no, storage_key, mime_type, size_bytes, uploaded_by) values ($1, $2, 1, $3, 'image/webp', 10, $4)`, [A, staffDoc, `${A}/record-documents/y.webp`, PRINCIPAL])).toMatch(/check constraint/);
    expect(await fails(principal, `insert into record_document_versions (school_id, document_id, version_no, storage_key, mime_type, size_bytes, uploaded_by) values ($1, $2, 1, $3, 'image/png', 10485761, $4)`, [A, staffDoc, `${A}/record-documents/z.png`, PRINCIPAL])).toMatch(/check constraint/);
    const made = await asDb(principal, (tx) =>
      tx.query(`insert into record_document_versions (school_id, document_id, version_no, storage_key, mime_type, size_bytes, uploaded_by) values ($1, $2, 99, $3, 'image/png', 10, $4) returning version_no`, [A, staffDoc, `${A}/record-documents/n.png`, PRINCIPAL])
    );
    expect(made.rows[0].version_no).toBe(3);
  });
});

describe('the list exports', () => {
  const unzipSheet = (bytes: Uint8Array): string => {
    const b = Buffer.from(bytes);
    const name = Buffer.from('xl/worksheets/sheet1.xml');
    const at = b.indexOf(name);
    const local = at - 30;
    expect(b.readUInt32LE(local)).toBe(0x04034b50);
    const packed = b.readUInt32LE(local + 18);
    const start = at + name.length + b.readUInt16LE(local + 28);
    return inflateRawSync(b.subarray(start, start + packed)).toString('utf8');
  };

  it('gives the office the students as Excel: the screen’s rows, a formula written as text, audited', async () => {
    const r = await call(principal, exportStudents, '/api/app/students/export?format=xlsx', {});
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(r.headers.get('Content-Disposition')).toMatch(/^attachment; filename="students-\d{4}-\d{2}-\d{2}\.xlsx"$/);
    const sheet = unzipSheet(r.raw);
    expect(sheet).toContain('>Name</t>');
    expect(sheet).toContain('>Aarav Example</t>');
    expect(sheet).toContain('>A-0012</t>');
    expect(sheet).toContain('<v>7</v>'); // a roll number of digits is a number
    expect(sheet).toContain(">'=cmd|calc</t>");
    const rows = await audit('list_export.downloaded');
    expect(rows.at(-1)).toMatchObject({ actor_user_id: PRINCIPAL, target_id: 'students', after_state: { list: 'students', format: 'xlsx', rows: 2 } });
  });

  it('gives the staff and the classes as CSV and Excel, the same rows as their screens', async () => {
    const staff = await call(admin, exportStaff, '/api/app/staff/export?format=csv', {});
    expect(staff.status).toBe(200);
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(staff.raw); // keep the byte order mark
    expect(text.startsWith('﻿Name,Staff code,Designation,Role,Email,Mobile,Account,In this school since\r\n')).toBe(true);
    expect(text).toContain('Tara Teacher,,,Teacher,t@school-a.example,\'+91 90000 00013,Active,');
    expect(text).not.toContain('Bina Principal');
    expect(text).not.toContain('Rekha Parent');
    const classes = await call(principal, exportClasses, '/api/app/classes/export?format=xlsx', {});
    expect(classes.status).toBe(200);
    const sheet = unzipSheet(classes.raw);
    expect(sheet).toContain('>5-A</t>');
    expect(sheet).toContain('>Tara Teacher</t>');
    const rows = await audit('list_export.downloaded');
    expect(rows.slice(-2).map((x: { after_state: { list: string; format: string; rows: number } }) => [x.after_state.list, x.after_state.format, x.after_state.rows])).toEqual([
      ['staff', 'csv', 6],
      ['classes', 'xlsx', 2],
    ]);
  });

  it('refuses every other role, and a format it does not make', async () => {
    for (const w of [teacher, accountant, coordinator]) {
      expect((await call(w, exportStudents, '/api/app/students/export?format=xlsx', {})).status, w.role).toBe(403);
      expect((await call(w, exportStaff, '/api/app/staff/export?format=csv', {})).status, w.role).toBe(403);
      expect((await call(w, exportClasses, '/api/app/classes/export?format=csv', {})).status, w.role).toBe(403);
    }
    expect((await call(parent, exportStudents, '/api/app/students/export', {})).status).toBe(401);
    expect((await call(principal, exportStudents, '/api/app/students/export?format=pdf', {})).status).toBe(400);
    expect((await call(principal, exportStudents, '/api/app/students/export?status=gone', {})).status).toBe(400);
  });
});

describe('the staff profile page', () => {
  const render = async (w: Who, staffId: string, tab?: string) => {
    signIn(w);
    const page = await StaffProfilePage({ params: { staffId }, searchParams: tab ? { tab } : {} });
    return renderToStaticMarkup(createElement(ToastProvider, null, page));
  };

  it('shows the office a header and Overview from the record, and the Documents tab when asked', async () => {
    const html = await render(principal, TEACHER);
    expect(html).toContain('Tara Teacher');
    expect(html).toContain('data-staff-header');
    expect(html).toContain('+91 90000 00013');
    expect(html).toContain('5-A'); // class teacher of, and teaches
    expect(html).toContain('Maths, class 5-A');
    expect(html).toMatch(/aria-selected="true"[^>]*>Overview/);
    const docs = await render(admin, TEACHER, 'documents');
    expect(docs).toMatch(/aria-selected="true"[^>]*>Documents/);
    expect(docs).toContain('data-record-documents="staff"');
  });

  it('opens for a member of staff on their own profile only', async () => {
    expect(await render(teacher, TEACHER)).toContain('data-staff-overview');
    // Anyone else's: what the staff list gives a teacher (the shared Coming page), never the profile.
    for (const w of [teacher, accountant, coordinator]) {
      signIn(w);
      const page = await StaffProfilePage({ params: { staffId: OTHER_TEACHER }, searchParams: {} });
      expect(page.type, w.role).toBe(ModuleComingPage);
      expect(page.props).toEqual({ moduleId: 'staff' });
    }
    await expect(render(principal, B_PRINCIPAL)).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(render(principal, PARENT)).rejects.toThrow('NEXT_NOT_FOUND'); // a parent's login has no staff profile
  });
});
