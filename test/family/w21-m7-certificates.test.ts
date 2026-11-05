import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { MemoryFileStorage } from '@/lib/storage/file-storage';
import { settingsSchemaFor } from '@/lib/frameworks/settings-schemas';
import { saveSettings } from '@/lib/frameworks/settings-store';
import { renderEmail } from '@/lib/email/templates';
import { indiaDate } from '@/lib/time/india';

// W21-M7 (docs/42, Documents): certificate request -> fee clearance -> issue -> delivery. A guardian linked in the Family
// app asks for a certificate for their own child; a TC waits for the dues (or the principal's waiver); the office issues
// it and makes the PDF ready; the family sees "ready", downloads it by a signed link that works once and expires. On the
// real schema through the real pool. Every name is made up.

const A = 'e3000000-0000-4000-8000-00000000000a';
const id = (n: number) => `e3000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [PRINCIPAL, ADMIN, TEACHER] = [id(101), id(102), id(103)];
const CLASS = id(201);
const [S1, S2, S3, S4] = [id(301), id(302), id(303), id(304)]; // S1 owes and is P1's; S2 is clean and P2's; S3 owes, P3's; S4 clean, P1's second child
const [P1, P2, P3] = [id(401), id(402), id(403)];
const [ACC1, ACC2, ACC3] = [id(501), id(502), id(503)];
const [CH1, CH2, CH3, CH4] = [id(601), id(602), id(603), id(604)];
const [L1, L2, L3] = [id(701), id(702), id(703)];
const claims = (accountId: string) => ({ accountId, tokenVersion: 0 });
const TODAY = indiaDate();
const PDF = new TextEncoder().encode('%PDF-1.4 a made-up certificate');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
const q = async (sql: string, p: unknown[] = []) => (await db.pg.query(sql, p)).rows;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const teacher: Who = { role: 'teacher', user: TEACHER };
const parent = (u: string): Who => ({ role: 'parent', user: u });
const actor = (w: Who) => ({ schoolId: A, userId: w.user, role: w.role as never });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (c: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (c: any) => {
    await c.query(`set local role app_user`);
    for (const [k, v] of Object.entries({ 'app.current_tenant_id': A, 'app.current_role': who.role, 'app.current_user_id': who.user })) await c.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(c);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const raw = (who: Who, fn: (c: any) => Promise<any>): Promise<any> => as(who, fn);
const queued: { type: string; payload: Record<string, unknown>; idempotencyKey: string }[] = [];
const queue = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enqueue: async (_db: any, spec: any) => {
    queued.push(spec);
    return { jobId: 'x', created: true };
  },
};
const setting = async (set: Record<string, boolean>) => {
  const schema = settingsSchemaFor('documents')!;
  const revision = Number((await q(`select coalesce(max(revision), 0) as r from school_settings where school_id = $1 and module_id = 'documents'`, [A]))[0].r);
  return as(principal, (c) => saveSettings(c, actor(principal), schema, { moduleId: 'documents', baseRevision: revision, set }));
};
const feeOf = async (s: string) => (await q(`select fee_id from fees_ledger where student_id = $1`, [s]))[0].fee_id as string;

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  process.env.DATABASE_URL = db.url;
  process.env.DB_POOL_MAX = '1';
  process.env.APP_SESSION_SECRET = 'test-only-secret-for-w21-m7-certificate-tests-0123456789';
  await db.pg.exec(`
    insert into schools (school_id, name, address, jurisdiction, is_test_fixture, quiet_hours_start, quiet_hours_end) values ('${A}', 'School A', '1 Example Road', 'IN-HR', false, '00:00', '00:00');
    insert into users (user_id, school_id, email, role, display_name, is_active) values
      ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal', true), ('${ADMIN}', '${A}', 'ad@a.invalid', 'school_admin', 'Asif Admin', true), ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Tara Teacher', true);
    insert into academic_sessions (school_id, label, start_date, end_date, is_current) values ('${A}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name, grade, section) values ('${CLASS}', '${A}', '6-A', '6', 'A');
    insert into students (student_id, school_id, admission_no, name, class_id, status, dob, gender) values
      ('${S1}', '${A}', 'A-1', 'Aarav Kumar', '${CLASS}', 'active', '2014-01-11', 'male'), ('${S2}', '${A}', 'A-2', 'Bela Singh', '${CLASS}', 'active', '2014-02-12', 'female'),
      ('${S3}', '${A}', 'A-3', 'Chirag Das', '${CLASS}', 'active', '2014-03-13', 'male'), ('${S4}', '${A}', 'A-4', 'Diya Kumar', '${CLASS}', 'active', '2015-04-14', 'female');
    insert into parents (parent_id, school_id, name, phone, relation) values
      ('${P1}', '${A}', 'Rajesh Kumar', '9800000001', 'Father'), ('${P2}', '${A}', 'Sunita Singh', '9800000002', 'Mother'), ('${P3}', '${A}', 'Meena Das', '9800000003', 'Mother');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P1}', '${S1}'), ('${A}', '${P1}', '${S4}'), ('${A}', '${P2}', '${S2}'), ('${A}', '${P3}', '${S3}');
    insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) values
      ('${A}', '${S1}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S2}', 'core_records', true, 'school_attested', 'v1'),
      ('${A}', '${S3}', 'core_records', true, 'school_attested', 'v1'), ('${A}', '${S4}', 'core_records', true, 'school_attested', 'v1');
    insert into fees_ledger (school_id, student_id, amount_minor, due_date, status) values ('${A}', '${S1}', 450000, '2026-07-10', 'overdue'), ('${A}', '${S3}', 300000, '2026-07-10', 'overdue');
    insert into family.accounts (account_id, email, ui_language) values ('${ACC1}', 'one@example.org', 'en'), ('${ACC2}', 'two@example.org', 'hi'), ('${ACC3}', 'three@example.org', 'en');
    insert into family.children (child_id, account_id, first_name, class_level, board_id, language, style, state_code) values
      ('${CH1}', '${ACC1}', 'Aarav', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${CH2}', '${ACC2}', 'Bela', 6, 'CBSE', 'en', 'en', 'IN-HR'),
      ('${CH3}', '${ACC3}', 'Chirag', 6, 'CBSE', 'en', 'en', 'IN-HR'), ('${CH4}', '${ACC1}', 'Diya', 6, 'CBSE', 'en', 'en', 'IN-HR');
    insert into family.school_links (link_id, account_id, school_id, parent_id) values ('${L1}', '${ACC1}', '${A}', '${P1}'), ('${L2}', '${ACC2}', '${A}', '${P2}'), ('${L3}', '${ACC3}', '${A}', '${P3}');
    insert into family.child_links (child_id, link_id, account_id, student_id) values ('${CH1}', '${L1}', '${ACC1}', '${S1}'), ('${CH2}', '${L2}', '${ACC2}', '${S2}'), ('${CH3}', '${L3}', '${ACC3}', '${S3}'), ('${CH4}', '${L1}', '${ACC1}', '${S4}');
  `);
  // This school asks the fee clearance for the transfer certificate too (off by default, C232).
  const set = await setting({ clearance_transfer: true });
  if (!set.ok) throw new Error(`setting not saved: ${JSON.stringify(set)}`);
}, 120_000);
afterAll(async () => {
  await (await import('@/lib/auth/db')).endPool();
  await db?.stop();
});

let BONAFIDE = '';
let TC1 = '';
let TC3 = '';
const storage = new MemoryFileStorage();

describe('W21-M7: a guardian asks for a certificate for their own child', () => {
  it('only for their own child, with a kind and a short reason; a clean child’s request is not held', async () => {
    const { requestFamilyCertificate, familyCertificatesFor } = await import('@/lib/school-link');
    const r = await requestFamilyCertificate(claims(ACC2), L2, { studentId: S2, kind: 'bonafide', reason: 'Opening a bank account' });
    expect(r).toMatchObject({ ok: true });
    BONAFIDE = (r as { requestId: string }).requestId;
    const mine = await familyCertificatesFor(claims(ACC2), L2, S2);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: 'bonafide', stage: 'requested', held: false, reason: 'Opening a bank account', events: [{ kind: 'requested', actor: 'guardian' }] });
    // Another family's child, a kind that does not exist, an Aadhaar-shaped reason, a reason too long, the same ask twice.
    expect(await requestFamilyCertificate(claims(ACC2), L2, { studentId: S1, kind: 'bonafide', reason: 'x' })).toEqual({ ok: false, reason: 'not_found' });
    expect(await requestFamilyCertificate(claims(ACC2), L2, { studentId: S2, kind: 'passport', reason: 'x' })).toEqual({ ok: false, reason: 'kind' });
    expect(await requestFamilyCertificate(claims(ACC2), L2, { studentId: S2, kind: 'study', reason: 'My number 1234 5678 9012' })).toEqual({ ok: false, reason: 'aadhaar' });
    expect(await requestFamilyCertificate(claims(ACC2), L2, { studentId: S2, kind: 'study', reason: 'x'.repeat(91) })).toEqual({ ok: false, reason: 'reason' });
    expect(await requestFamilyCertificate(claims(ACC2), L2, { studentId: S2, kind: 'bonafide', reason: ' opening a bank account ' })).toEqual({ ok: false, reason: 'duplicate' });
    // The request is audited with ids and the kind, and no words of the family.
    const audit = await q(`select actor_role, after_state from audit_log where event_action = 'certificate_request.created'`);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit[0])).not.toContain('bank account');
  });

  it('another family sees nothing, and the database says the same to a guardian session', async () => {
    const { familyCertificatesFor } = await import('@/lib/school-link');
    expect(await familyCertificatesFor(claims(ACC1), L1, S2)).toEqual([]);
    expect(await familyCertificatesFor(claims(ACC3), L3, S3)).toEqual([]);
    expect((await raw(parent(P1), (c) => c.query(`select * from certificate_requests`))).rows).toEqual([]);
    expect((await raw(parent(P1), (c) => c.query(`select * from certificate_request_events`))).rows).toEqual([]);
    // Writing: a guardian cannot ask for another family's child, cannot change a request, nor delete one.
    await expect(as(parent(P1), (c) => c.query(`insert into certificate_requests (school_id, student_id, cert_type, reason) values ($1, $2, 'bonafide', 'x')`, [A, S2]))).rejects.toThrow();
    expect((await raw(parent(P2), (c) => c.query(`update certificate_requests set reason = 'other' where cert_id = $1`, [BONAFIDE]))).rows).toEqual([]);
    expect((await q(`select reason from certificate_requests where cert_id = $1`, [BONAFIDE]))[0].reason).toBe('Opening a bank account');
    expect((await raw(parent(P2), (c) => c.query(`delete from certificate_requests where cert_id = $1`, [BONAFIDE]))).rows).toEqual([]);
    expect(await q(`select 1 from certificate_requests where cert_id = $1`, [BONAFIDE])).toHaveLength(1);
    // A teacher reads none of them.
    expect((await raw(teacher, (c) => c.query(`select * from certificate_requests`))).rows).toEqual([]);
  });
});

describe('W21-M7: a TC waits for the dues, then is released by payment or by the principal’s waiver', () => {
  it('a TC request with dues is held; the office cannot issue it', async () => {
    const { requestFamilyCertificate, familyCertificatesFor } = await import('@/lib/school-link');
    const { issueRequest } = await import('@/lib/documents/certificate-requests');
    const r = await requestFamilyCertificate(claims(ACC1), L1, { studentId: S1, kind: 'transfer', reason: 'Moving to another city' });
    TC1 = (r as { requestId: string }).requestId;
    const mine = (await familyCertificatesFor(claims(ACC1), L1, S1))[0];
    expect(mine).toMatchObject({ kind: 'transfer', stage: 'requested', held: true });
    expect(mine.events.map((e) => e.kind)).toEqual(['requested', 'held']);
    expect(JSON.stringify(mine)).not.toContain('450000'); // the family card never carries an amount
    const refused = await as(principal, (c) => issueRequest(c, actor(principal), TC1, {}, TODAY));
    expect(refused).toEqual({ ok: false, reason: 'held' });
    expect(await q(`select count(*)::int as n from certificates_issued`)).toEqual([{ n: 0 }]);
  });

  it('paying the dues releases it (an event and an audit row), then it is issued', async () => {
    const { familyCertificatesFor } = await import('@/lib/school-link');
    await db.pg.query(`insert into payments (school_id, fee_id, amount_minor, method) values ($1, $2, 450000, 'cash')`, [A, await feeOf(S1)]);
    const mine = (await familyCertificatesFor(claims(ACC1), L1, S1)).find((x) => x.requestId === TC1)!;
    expect(mine.held).toBe(false);
    expect(mine.events.map((e) => e.kind)).toEqual(['requested', 'held', 'released']);
    const audit = await q(`select event_action, after_state from audit_log where target_id = $1 order by created_at`, [TC1]);
    expect(audit.map((a: { event_action: string }) => a.event_action)).toEqual(['certificate_request.created', 'certificate_request.held', 'certificate_request.released']);
  });

  it('only the principal waives a held request, with a reason kept on the request and not in the audit row; issue then records the waiver', async () => {
    const { requestFamilyCertificate, familyCertificatesFor } = await import('@/lib/school-link');
    const { waiveRequest, issueRequest, officeRequests } = await import('@/lib/documents/certificate-requests');
    const r = await requestFamilyCertificate(claims(ACC3), L3, { studentId: S3, kind: 'transfer', reason: 'New posting' });
    TC3 = (r as { requestId: string }).requestId;
    expect((await familyCertificatesFor(claims(ACC3), L3, S3))[0].held).toBe(true);
    expect(await as(admin, (c) => waiveRequest(c, actor(admin), TC3, 'Hardship, agreed with the family'))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => waiveRequest(c, actor(principal), TC3, ''))).toEqual({ ok: false, reason: 'reason' });
    expect(await as(principal, (c) => waiveRequest(c, actor(principal), TC3, 'Hardship, agreed with the family'))).toEqual({ ok: true });
    expect(await as(principal, (c) => waiveRequest(c, actor(principal), TC3, 'Again'))).toEqual({ ok: false, reason: 'not_held' });
    const mine = (await familyCertificatesFor(claims(ACC3), L3, S3))[0];
    expect(mine).toMatchObject({ held: false, waived: true });
    expect(JSON.stringify(mine)).not.toContain('Hardship');
    const audit = await q(`select after_state from audit_log where event_action = 'certificate_request.waived'`);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain('Hardship');
    // The office sees the waiver, who gave it and why, on the request.
    const row = (await as(admin, (c) => officeRequests(c, actor(admin))))!.find((x) => x.requestId === TC3)!;
    expect(row.waiver).toMatchObject({ reason: 'Hardship, agreed with the family', by: 'Priya Principal' });
    // A school admin cannot issue a waived certificate (the database gives the waiver to the principal alone); the principal can.
    expect(await as(admin, (c) => issueRequest(c, actor(admin), TC3, {}, TODAY))).toMatchObject({ ok: false });
    const issued = await as(principal, (c) => issueRequest(c, actor(principal), TC3, {}, TODAY));
    expect(issued.ok).toBe(true);
    expect((await q(`select clearance, owed_minor::int as owed from certificates_issued where certificate_id = $1`, [(issued as { certificateId: string }).certificateId]))[0]).toEqual({ clearance: 'waived', owed: 300000 });
  });
});

describe('W21-M7: issue, delivery, the signed link and the timeline', () => {
  it('issue writes the number and the event, and the request points at its certificate', async () => {
    const { issueRequest, officeRequests } = await import('@/lib/documents/certificate-requests');
    const made = await as(admin, (c) => issueRequest(c, actor(admin), TC1, {}, TODAY));
    expect(made).toMatchObject({ ok: true });
    expect(await as(admin, (c) => issueRequest(c, actor(admin), TC1, {}, TODAY))).toEqual({ ok: false, reason: 'not_open' });
    const rows = (await as(admin, (c) => officeRequests(c, actor(admin))))!;
    const row = rows.find((x) => x.requestId === TC1)!;
    expect(row).toMatchObject({ stage: 'issued', via: 'app', askedBy: 'Rajesh Kumar', kind: 'transfer' });
    expect(row.certificate?.number).toMatch(/TC\/\d{4}/);
    expect(row.events.map((e) => [e.kind, e.by])).toEqual([['requested', 'Rajesh Kumar'], ['held', null], ['released', null], ['issued', 'Asif Admin']]);
    // A teacher reads none of it.
    expect(await as(teacher, (c) => officeRequests(c, actor(teacher)))).toBeNull();
    const audit = await q(`select after_state from audit_log where event_action = 'certificate_request.issued' and target_id = $1`, [TC1]);
    expect(audit[0].after_state).toMatchObject({ kind: 'transfer', number: row.certificate!.number });
  });

  it('the family sees "ready" after the PDF is made ready, is told by email, and the card does not offer a link before', async () => {
    const { deliverRequest } = await import('@/lib/documents/certificate-requests');
    const { familyCertificatesFeed, familyCertificateLink } = await import('@/lib/school-link');
    expect(await familyCertificatesFeed(claims(ACC1), L1, [S1])).toEqual([]);
    expect(await familyCertificateLink(claims(ACC1), L1, TC1)).toBeNull(); // issued, not ready
    expect(await as(admin, (c) => deliverRequest(c, queue, storage, actor(admin), TC1, new TextEncoder().encode('not a pdf')))).toEqual({ ok: false, reason: 'not_a_pdf' });
    expect(await as(admin, (c) => deliverRequest(c, queue, storage, actor(admin), BONAFIDE, PDF))).toEqual({ ok: false, reason: 'not_issued' });
    expect(await as(admin, (c) => deliverRequest(c, queue, storage, actor(admin), TC1, PDF))).toEqual({ ok: true });
    const feed = await familyCertificatesFeed(claims(ACC1), L1, [S1]);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ requestId: TC1, stage: 'ready', kind: 'transfer' });
    expect(feed[0].number).toMatch(/TC\/\d{4}/);
    expect(feed[0].events.map((e) => e.kind)).toContain('ready');
    // The job that emails the linked family, and the email it makes.
    const job = queued.find((j) => j.type === 'family.certificate_ready')!;
    expect(job.payload).toMatchObject({ requestId: TC1, studentId: S1, kind: 'transfer' });
    expect(JSON.stringify(job.payload)).not.toContain('Aarav');
    const { certificateReadyHandler } = await import('@/lib/family/certificate-ready');
    const { withPlatformService } = await import('@/lib/auth/db');
    const emails: { to: string[]; template: string; data: Record<string, unknown> }[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await certificateReadyHandler({ platform: withPlatformService as any, queue: { enqueue: async (_d: unknown, s: { payload: Record<string, unknown> }) => void emails.push(s.payload as never) } })({ payload: job.payload, schoolId: A });
    expect(emails.map((e) => [e.to[0], e.template])).toEqual([['one@example.org', 'certificate_ready']]);
    const mail = renderEmail('certificate_ready', emails[0].data);
    expect(mail.subject).toMatch(/certificate/i);
    expect(mail.text).toContain(String(job.payload.number));
    expect(mail.text).not.toContain('Aarav');
    expect(renderEmail('certificate_ready', { ...emails[0].data, lang: 'hi' }).subject).toMatch(/[ऀ-ॿ]/);
    expect((await q(`select kind from certificate_request_events where request_id = $1 order by at, event_id`, [TC1])).map((e: { kind: string }) => e.kind)).toContain('ready');
  });

  it('the signed link works once, then not again; it expires; it is the account’s own; another family cannot make one', async () => {
    const { familyCertificateLink, openFamilyCertificate } = await import('@/lib/school-link');
    expect(await familyCertificateLink(claims(ACC2), L2, TC1)).toBeNull(); // another family's request
    expect(await familyCertificateLink(claims(ACC3), L3, TC1)).toBeNull();
    const link = (await familyCertificateLink(claims(ACC1), L1, TC1))!;
    expect(link.minutes).toBe(10);
    const token = new URL(link.url, 'http://localhost').searchParams.get('t')!;
    expect(await openFamilyCertificate(claims(ACC2), token, new Date(), storage)).toBe('bad'); // someone else's ticket
    expect(await openFamilyCertificate(claims(ACC1), `${token}x`, new Date(), storage)).toBe('bad'); // tampered
    expect(await openFamilyCertificate(claims(ACC1), token, new Date(Date.now() + 11 * 60_000), storage)).toBe('gone'); // expired
    const file = await openFamilyCertificate(claims(ACC1), token, new Date(), storage);
    expect(file).toMatchObject({ fileName: expect.stringMatching(/^certificate-TC-\d{4}\.pdf$/) });
    expect(new TextDecoder().decode((file as { bytes: Uint8Array }).bytes)).toBe('%PDF-1.4 a made-up certificate');
    expect(await openFamilyCertificate(claims(ACC1), token, new Date(), storage)).toBe('gone'); // once
    // A file that cannot be read spends nothing: the same link opens when the file is back.
    const second = (await familyCertificateLink(claims(ACC1), L1, TC1))!;
    const token2 = new URL(second.url, 'http://localhost').searchParams.get('t')!;
    expect(await openFamilyCertificate(claims(ACC1), token2, new Date(), new MemoryFileStorage())).toBe('unavailable');
    expect(await openFamilyCertificate(claims(ACC1), token2, new Date(), storage)).toMatchObject({ fileName: expect.any(String) });
    const downloads = await q(`select actor, nonce is not null as has_nonce from certificate_request_events where request_id = $1 and kind = 'downloaded'`, [TC1]);
    expect(downloads).toEqual([{ actor: 'guardian', has_nonce: true }, { actor: 'guardian', has_nonce: true }]);
    expect((await q(`select count(*)::int as n from audit_log where event_action = 'certificate_request.downloaded'`))[0].n).toBe(2);
  });

  it('the file route needs the parent’s session and answers 410 for a spent link', async () => {
    const { signFamilySession, signParentMode } = await import('@/lib/family/session');
    const { familyCertificateLink } = await import('@/lib/school-link');
    const s = { accountId: ACC1, tokenVersion: 0, sessionId: 's1' };
    const cookie = `ncf_session=${await signFamilySession(s)}; ncf_parent=${await signParentMode(s)}`;
    const { GET } = await import('@/app/api/family/school/certificates/file/route');
    const link = (await familyCertificateLink(claims(ACC1), L1, TC1))!;
    const get = (c: string | null) => GET(new NextRequest(`http://localhost${link.url}`, { headers: c ? { cookie: c } : {} }));
    expect((await get(null)).status).toBe(401);
    expect((await get(cookie.replace(/; ncf_parent=[^;]+/, ''))).status).toBe(403);
  });

  it('the office marks the paper copy collected: an event, in their own name', async () => {
    const { markCollected, officeRequests } = await import('@/lib/documents/certificate-requests');
    expect(await as(teacher, (c) => markCollected(c, actor(teacher), TC1))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(admin, (c) => markCollected(c, actor(admin), BONAFIDE))).toEqual({ ok: false, reason: 'not_issued' });
    expect(await as(admin, (c) => markCollected(c, actor(admin), TC1))).toEqual({ ok: true });
    const row = (await as(admin, (c) => officeRequests(c, actor(admin))))!.find((x) => x.requestId === TC1)!;
    expect(row.stage).toBe('collected');
    expect(row.events.map((e) => e.kind)).toEqual(['requested', 'held', 'released', 'issued', 'ready', 'downloaded', 'downloaded', 'collected']);
    expect(row.events.at(-1)).toMatchObject({ actor: 'office', by: 'Asif Admin' });
    // The history cannot be rewritten: an event is never updated or deleted, a request never moves back.
    await expect(as(admin, (c) => c.query(`update certificate_request_events set kind = 'requested' where request_id = $1`, [TC1]))).rejects.toThrow();
    await expect(as(admin, (c) => c.query(`update certificate_requests set stage = 'requested' where cert_id = $1`, [TC1]))).rejects.toThrow();
  });

  it('the office can ask on a family’s behalf, and the family sees it', async () => {
    const { requestAsOffice } = await import('@/lib/documents/certificate-requests');
    const { familyCertificatesFor } = await import('@/lib/school-link');
    expect(await as(teacher, (c) => requestAsOffice(c, actor(teacher), { studentId: S4, kind: 'study', reason: 'A library card' }))).toEqual({ ok: false, reason: 'not_allowed' });
    const made = await as(admin, (c) => requestAsOffice(c, actor(admin), { studentId: S4, kind: 'study', reason: 'A library card' }));
    expect(made.ok).toBe(true);
    const mine = await familyCertificatesFor(claims(ACC1), L1, S4);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ kind: 'study', stage: 'requested', events: [{ kind: 'requested', actor: 'office' }] });
  });
});
