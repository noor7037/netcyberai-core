import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';

// A paper on a record sent straight to the file store (C235-D2), through the real routes on the real migrations
// (PGlite), as each person's own session, with the file store in memory: the ask (the same checks as an upload, the
// declared size and type refused up front, nothing written), the browser's own send to the link, and the confirmation
// (the real size, the first bytes, the Aadhaar check, then the rows and one audit row, once). Every refusal of a
// person's own upload takes the file away and writes nothing; a ticket that is not theirs touches no file. Made-up
// names only.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const session = vi.hoisted(() => {
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-record-direct-upload-0123456789';
  return { claims: null as any, run: null as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
});
const files = vi.hoisted(() => ({ store: null as unknown }));
const ocr = vi.hoisted(() => ({ text: 'A certificate of the school' }));
vi.mock('@/lib/auth/require-session', () => ({ requireSession: async () => session.claims }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));
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

import { POST as staffAsk } from '@/app/api/app/staff/[staffId]/record-documents/upload/route';
import { POST as staffConfirm } from '@/app/api/app/staff/[staffId]/record-documents/confirm/route';
import { POST as studentAsk } from '@/app/api/app/students/[studentId]/record-documents/upload/route';
import { POST as studentConfirm } from '@/app/api/app/students/[studentId]/record-documents/confirm/route';
import { POST as staffMultipart } from '@/app/api/app/staff/[staffId]/record-documents/route';
import { sealTicket, openTicket } from '@/lib/documents/upload-ticket';
import type { MemoryFileStorage } from '@/lib/storage/file-storage';

const A = 'c235d200-0000-4000-8000-0000000000a1';
const B = 'c235d200-0000-4000-8000-0000000000b1';
const u = (n: number) => `c235d200-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TEACHER, ACCOUNTANT, COORDINATOR, B_PRINCIPAL, PARENT] = [u(11), u(12), u(13), u(15), u(16), u(17), u(91)];
const [C5, S5, S6] = [u(51), u(81), u(82)];
const MB = 1024 * 1024;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const store = () => files.store as MemoryFileStorage;

type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const teacher: Who = { role: 'teacher', user: TEACHER };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const coordinator: Who = { role: 'academic_coordinator', user: COORDINATOR };
const parent: Who = { role: 'parent', user: PARENT };
const bPrincipal: Who = { role: 'principal', user: B_PRINCIPAL, school: B };

const signIn = (w: Who) => {
  session.claims = { sub: w.user, role: w.role, schoolId: w.school ?? A, membershipId: null, tv: 0 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session.run = (_claims: any, fn: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db.pg.transaction(async (tx: any) => {
      await tx.query('set local role app_user');
      for (const [k, v] of [['app.current_tenant_id', w.school ?? A], ['app.current_role', w.role], ['app.current_user_id', w.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
      return fn(tx);
    });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Route = (req: NextRequest, ctx: any) => Promise<Response>;
const post = async (w: Who, route: Route, url: string, params: Record<string, string>, body: unknown) => {
  signIn(w);
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const res = await route(new NextRequest(`http://school.example${url}`, { method: 'POST', body: text, headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(text)) } }), { params });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body: json, headers: res.headers };
};

const staffBase = `/api/app/staff/${TEACHER}/record-documents`;
const studentBase = (id: string) => `/api/app/students/${id}/record-documents`;
const askStaff = (w: Who, body: unknown) => post(w, staffAsk, `${staffBase}/upload`, { staffId: TEACHER }, body);
const confirmStaff = (w: Who, pendingId: unknown) => post(w, staffConfirm, `${staffBase}/confirm`, { staffId: TEACHER }, { pendingId });
const askStudent = (w: Who, body: unknown, id = S5) => post(w, studentAsk, `${studentBase(id)}/upload`, { studentId: id }, body);
const confirmStudent = (w: Who, pendingId: unknown, id = S5) => post(w, studentConfirm, `${studentBase(id)}/confirm`, { studentId: id }, { pendingId });

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52];
const png = (size: number) => {
  const b = new Uint8Array(size);
  b.set(PNG_HEAD);
  return b;
};
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const TEXT = new TextEncoder().encode('<html><script>alert(1)</script></html>');

// What the browser does with an ask's answer: sends the bytes to the link, with the type it was told to send.
const send = (t: Record<string, unknown>, bytes: Uint8Array, type = String(t.contentType)) => store().receive(String(t.uploadUrl), bytes, type);
const keyOf = (pendingId: unknown) => openTicket(pendingId)?.key as string;
const count = async (sql: string, params: unknown[] = []) => (await db.pg.query(`select count(*)::int as n from ${sql}`, params)).rows[0].n as number;
const audit = async (action: string) => (await db.pg.query(`select actor_user_id, target_id, after_state from audit_log where event_action = $1 order by audit_id`, [action])).rows;
const newPaper = (extra: Record<string, unknown> = {}) => ({ kind: 'academic_certificate', title: 'Transfer certificate', fileName: 'tc.png', sizeBytes: 2000, mimeType: 'image/png', ...extra });

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', false), ('${B}', 'School B', 'IN-HR', false);
    insert into school_entitlements (school_id, plan) values ('${A}', 'standard'), ('${B}', 'standard');
    insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'students', true, 'plan'), ('${B}', 'students', true, 'plan') on conflict do nothing;
    insert into users (user_id, school_id, email, phone, role, display_name) values
      ('${PRINCIPAL}', '${A}', 'p@school-a.example', null, 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'ad@school-a.example', null, 'school_admin', 'Asif Admin'),
      ('${TEACHER}', '${A}', 't@school-a.example', null, 'teacher', 'Tara Teacher'), ('${ACCOUNTANT}', '${A}', 'acc@school-a.example', null, 'accountant', 'Anil Accountant'),
      ('${COORDINATOR}', '${A}', 'co@school-a.example', null, 'academic_coordinator', 'Kiran Coordinator'),
      ('${B_PRINCIPAL}', '${B}', 'p@school-b.example', null, 'principal', 'Bina Principal'), ('${PARENT}', '${A}', 'rekha@login.netcyberai.com', null, 'parent', 'Rekha Parent');
    insert into memberships (user_id, school_id, role, is_active) values
      ('${PRINCIPAL}', '${A}', 'principal', true), ('${ADMIN}', '${A}', 'school_admin', true), ('${TEACHER}', '${A}', 'teacher', true),
      ('${ACCOUNTANT}', '${A}', 'accountant', true), ('${COORDINATOR}', '${A}', 'academic_coordinator', true),
      ('${B_PRINCIPAL}', '${B}', 'principal', true), ('${PARENT}', '${A}', 'parent', true);
    insert into classes (class_id, school_id, name, class_teacher_id) values ('${C5}', '${A}', '5-A', '${TEACHER}');
    insert into students (student_id, school_id, admission_no, name, status, class_id, roll_no) values
      ('${S5}', '${A}', 'A-0012', 'Aarav Example', 'active', '${C5}', '7'), ('${S6}', '${A}', 'A-0013', 'Bela Example', 'active', '${C5}', '8');
  `);
}, 120_000);
afterAll(async () => {
  await db?.stop();
});
beforeEach(() => {
  ocr.text = 'A certificate of the school';
});

describe('a paper sent straight to the file store', () => {
  let documentId = '';

  it('of 9.5 MB: the ask gives a link and a ticket and writes nothing; the confirmation writes the paper, audited once', async () => {
    const size = Math.round(9.5 * MB);
    const asked = await askStaff(principal, newPaper({ title: 'B.Ed. degree certificate', fileName: 'tara-bed-certificate.png', sizeBytes: size }));
    expect(asked.status).toBe(201);
    expect(asked.headers.get('Cache-Control')).toBe('no-store');
    expect(asked.body).toMatchObject({ contentType: 'image/png', maxBytes: 10 * MB });
    expect(String(asked.body.uploadUrl)).toMatch(/^memory-upload:\/\//);
    const minutes = (Date.parse(String(asked.body.expiresAt)) - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(9);
    expect(minutes).toBeLessThanOrEqual(10);
    // The server chose the key: the school's own prefix, the record, a new paper's id; the file's name never.
    const key = keyOf(asked.body.pendingId);
    expect(key).toMatch(new RegExp(`^${A}/record-documents/staff/${TEACHER}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.png$`));
    expect(key).not.toContain('tara');
    // Nothing yet: no file, no rows, no audit.
    expect(store().files.has(key)).toBe(false);
    expect(await count('record_documents')).toBe(0);
    expect(await audit('record_document.added')).toHaveLength(0);

    await send(asked.body, png(size));
    const done = await confirmStaff(principal, asked.body.pendingId);
    expect(done.status).toBe(201);
    expect(done.body.versionNo).toBe(1);
    documentId = String(done.body.documentId);
    expect(key.split('/')[4]).toBe(documentId);
    const rows = (await db.pg.query(`select v.storage_key, v.mime_type, v.size_bytes, v.uploaded_by, d.title, d.kind from record_document_versions v join record_documents d using (document_id) where d.document_id = $1`, [documentId])).rows;
    expect(rows).toEqual([{ storage_key: key, mime_type: 'image/png', size_bytes: size, uploaded_by: PRINCIPAL, title: 'B.Ed. degree certificate', kind: 'academic_certificate' }]);
    expect(store().files.has(key)).toBe(true);
    const added = await audit('record_document.added');
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ actor_user_id: PRINCIPAL, target_id: documentId, after_state: { record: 'staff', recordId: TEACHER, kind: 'academic_certificate', versionNo: 1, mime: 'image/png', sizeBytes: size, uploadCheck: 'image_text' } });
    expect(JSON.stringify(added)).not.toMatch(/tara|B\.Ed/i);

    // Only once: the same ticket again is refused, and the file it wrote stays.
    const again = await confirmStaff(principal, asked.body.pendingId);
    expect([again.status, again.body.code]).toEqual([409, 'upload_done']);
    expect(store().files.has(key)).toBe(true);
    expect(await audit('record_document.added')).toHaveLength(1);
    expect(await count('record_document_versions where document_id = $1', [documentId])).toBe(1);
  });

  it('as a new version of a paper: kept beside the earlier one, audited as a version', async () => {
    const asked = await askStaff(admin, { documentId, fileName: 'bed-2.pdf', sizeBytes: PDF.length, mimeType: 'application/pdf' });
    expect(asked.status).toBe(201);
    expect(keyOf(asked.body.pendingId).startsWith(`${A}/record-documents/staff/${TEACHER}/${documentId}/`)).toBe(true);
    await send(asked.body, PDF);
    const done = await confirmStaff(admin, asked.body.pendingId);
    expect([done.status, done.body.versionNo, done.body.documentId]).toEqual([201, 2, documentId]);
    const version = await audit('record_document.version_added');
    expect(version).toHaveLength(1);
    expect(version[0]).toMatchObject({ actor_user_id: ADMIN, target_id: documentId, after_state: { versionNo: 2, mime: 'application/pdf', sizeBytes: PDF.length } });
    // A paper of another record is not reached through this one.
    const elsewhere = await askStudent(principal, { documentId, fileName: 'x.pdf', sizeBytes: 10, mimeType: 'application/pdf' });
    expect([elsewhere.status, elsewhere.body.code]).toEqual([404, 'not_found']);
  });

  it('when the file did not arrive: refused, nothing written, and the same ticket still works once it has', async () => {
    const asked = await askStudent(principal, newPaper());
    const early = await confirmStudent(principal, asked.body.pendingId);
    expect([early.status, early.body.code]).toEqual([409, 'upload_missing']);
    expect(await count('record_documents where student_id = $1', [S5])).toBe(0);
    await send(asked.body, png(2000));
    const done = await confirmStudent(principal, asked.body.pendingId);
    expect(done.status).toBe(201);
    await db.pg.query(`delete from record_document_versions where document_id = $1`, [done.body.documentId]);
    await db.pg.query(`delete from record_documents where document_id = $1`, [done.body.documentId]);
  });
});

describe('the ask', () => {
  it('refuses a file over 10 MB, of another type, empty, or named with an Aadhaar number, and gives no link', async () => {
    const links = store().uploadLinks.size;
    const refused = async (body: unknown) => {
      const r = await askStudent(principal, body);
      return [r.status, r.body.code];
    };
    expect(await refused(newPaper({ sizeBytes: 10 * MB + 1 }))).toEqual([413, 'file_too_large']);
    expect(await refused(newPaper({ mimeType: 'image/webp' }))).toEqual([400, 'file_type']);
    expect(await refused(newPaper({ mimeType: 'text/html' }))).toEqual([400, 'file_type']);
    expect(await refused(newPaper({ sizeBytes: 0 }))).toEqual([400, 'file_empty']);
    expect(await refused(newPaper({ sizeBytes: '2000' }))).toEqual([400, 'not_sent_properly']);
    expect(await refused(newPaper({ fileName: '' }))).toEqual([400, 'not_sent_properly']);
    expect(await refused(newPaper({ fileName: 'scan 1234 5678 9012.png' }))).toEqual([400, 'upload_aadhaar_number']);
    expect(await refused(newPaper({ kind: 'passport' }))).toEqual([400, 'choose_one']);
    expect(await refused(newPaper({ title: 'ID 1234 5678 9012' }))).toEqual([400, 'title_aadhaar']);
    expect(await refused(newPaper({ documentId: 'not-a-paper' }))).toEqual([400, 'not_sent_properly']);
    expect(await refused('not json')).toEqual([400, 'not_sent_properly']);
    expect(store().uploadLinks.size).toBe(links);
  });

  it('is the office’s only: a teacher, the accountant, the coordinator are refused; another school finds no record; a parent never reaches it', async () => {
    for (const w of [teacher, accountant, coordinator]) {
      expect((await askStudent(w, newPaper())).status, w.role).toBe(403);
      expect((await askStaff(w, newPaper())).status, w.role).toBe(403);
    }
    expect((await askStudent(bPrincipal, newPaper())).status).toBe(404);
    expect((await askStaff(bPrincipal, newPaper())).status).toBe(404);
    expect((await askStudent(parent, newPaper())).status).toBe(401);
  });
});

describe('the confirmation', () => {
  // Each case: the person's own ticket, a file sent to its link, the confirmation refused; the file is taken away and
  // nothing is written.
  const refusedAndGone = async (ask: Record<string, unknown>, bytes: Uint8Array, type?: string) => {
    const before = { docs: await count('record_documents'), audits: await count(`audit_log where event_action like 'record_document.%'`) };
    const asked = await askStudent(principal, newPaper(ask));
    expect(asked.status).toBe(201);
    const key = keyOf(asked.body.pendingId);
    await send(asked.body, bytes, type);
    expect(store().files.has(key)).toBe(true);
    const r = await confirmStudent(principal, asked.body.pendingId);
    expect(store().files.has(key)).toBe(false);
    expect(await count('record_documents')).toBe(before.docs);
    expect(await count(`audit_log where event_action like 'record_document.%'`)).toBe(before.audits);
    return [r.status, r.body.code];
  };

  it('refuses a file larger than 10 MB that was declared small', async () => {
    expect(await refusedAndGone({ sizeBytes: 1000 }, png(10 * MB + 1))).toEqual([413, 'file_too_large']);
  });

  it('refuses first bytes that are not a PDF, JPEG or PNG, or not the type declared, or a type the store recorded otherwise', async () => {
    expect(await refusedAndGone({ fileName: 'page.png' }, TEXT)).toEqual([400, 'file_type']);
    expect(await refusedAndGone({ fileName: 'scan.pdf', mimeType: 'application/pdf' }, png(2000))).toEqual([400, 'file_type']);
    expect(await refusedAndGone({}, png(2000), 'text/html')).toEqual([400, 'file_type']);
    expect(await refusedAndGone({}, new Uint8Array(0))).toEqual([400, 'file_empty']);
  });

  it('refuses a file that shows an Aadhaar number or card (C232 part A)', async () => {
    ocr.text = 'Government of India  Aadhaar  1234 5678 9012';
    expect(await refusedAndGone({ fileName: 'guardian.jpg', mimeType: 'image/jpeg', sizeBytes: JPEG.length }, JPEG)).toEqual([400, 'upload_aadhaar_number']);
    ocr.text = 'Unique Identification Authority of India  Government of India  Enrolment No';
    expect(await refusedAndGone({}, png(2000))).toEqual([400, 'upload_aadhaar_card']);
  });

  it('refuses a ticket after its ten minutes, and takes its file away', async () => {
    const asked = await askStudent(principal, newPaper());
    const key = keyOf(asked.body.pendingId);
    await send(asked.body, png(2000));
    const later = Date.now() + 11 * 60_000;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(later);
    try {
      const r = await confirmStudent(principal, asked.body.pendingId);
      expect([r.status, r.body.code]).toEqual([410, 'upload_expired']);
    } finally {
      clock.mockRestore();
    }
    expect(store().files.has(key)).toBe(false);
    expect(await count('record_documents where student_id = $1', [S5])).toBe(0);
  });

  it('refuses another school’s, another person’s, another record’s, a changed or a made-up ticket, touching no file', async () => {
    const asked = await askStudent(principal, newPaper());
    const key = keyOf(asked.body.pendingId);
    await send(asked.body, png(2000));
    const id = String(asked.body.pendingId);
    const [body, mac] = id.split('.');
    const ticket = openTicket(id)!;
    const changed = `${Buffer.from(JSON.stringify({ ...ticket, schoolId: B })).toString('base64url')}.${mac}`;
    const madeUp = sealTicket({ ...ticket, userId: ADMIN }).replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
    const cases: [Who, unknown, string, number, string | undefined][] = [
      [bPrincipal, id, S5, 403, 'not_allowed'],
      [admin, id, S5, 403, 'not_allowed'],
      [principal, id, S6, 400, 'upload_unknown'],
      [principal, changed, S5, 400, 'upload_unknown'],
      [principal, `${body}.${mac.slice(0, -2)}`, S5, 400, 'upload_unknown'],
      [admin, madeUp, S5, 400, 'upload_unknown'],
      [principal, 'not a ticket', S5, 400, 'upload_unknown'],
      [principal, undefined, S5, 400, 'upload_unknown'],
    ];
    for (const [w, pendingId, record, status, code] of cases) {
      const r = await confirmStudent(w, pendingId, record);
      expect([r.status, r.body.code], `${w.role} ${record}`).toEqual([status, code]);
      expect(store().files.has(key)).toBe(true);
    }
    // A teacher (who may not upload) holding the office's ticket: refused, the file untouched.
    expect((await confirmStudent(teacher, id)).status).toBe(403);
    expect(store().files.has(key)).toBe(true);
    expect(await count('record_documents where student_id = $1', [S5])).toBe(0);
    // Its own person still confirms it.
    const done = await confirmStudent(principal, id);
    expect(done.status).toBe(201);
  });
});

describe('the multipart upload', () => {
  const form = (bytes: Uint8Array) => {
    const f = new FormData();
    f.append('file', new Blob([bytes]), 'letter.png');
    f.append('kind', 'experience_letter');
    f.append('title', 'Experience letter');
    return f;
  };
  const multipart = async (bytes: Uint8Array) => {
    signIn(principal);
    const r = new Response(form(bytes));
    const body = new Uint8Array(await r.arrayBuffer());
    const res = await staffMultipart(new NextRequest(`http://school.example${staffBase}`, { method: 'POST', body, headers: { 'Content-Type': r.headers.get('content-type') ?? '', 'Content-Length': String(body.length) } }), { params: { staffId: TEACHER } });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  it('still takes a file of up to 4 MB, and says a larger one is for the direct path', async () => {
    expect((await multipart(png(3 * MB))).status).toBe(201);
    const big = await multipart(png(4 * MB + 1));
    expect([big.status, big.body.code, (big.body.params as Record<string, unknown>)?.maxMb]).toEqual([413, 'file_too_large', 4]);
  });
});
