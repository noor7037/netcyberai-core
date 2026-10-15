import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { pseudonymizeStudent } from '@/lib/consent/dsr';
import { certificateSvg, certDocFor, qrMarkup, verifyUrl } from '@/lib/documents/cert-doc';
import { certificateFileName, certificateNumber, composePrinted, readReason, readTyped, type ChildRecord } from '@/lib/documents/certificate-rules';
import {
  certificateHome,
  certificateRegister,
  certificateRoster,
  certificatesToPrint,
  eraseCertificatesOf,
  familyCopy,
  issueCertificates,
  markImages,
  removeMark,
  saveMark,
  sendCertificate,
  storedReader,
  verifyCertificate,
  withdrawCertificate,
} from '@/lib/documents/certificates';
import { feeClearance } from '@/lib/fees/clearance';
import { loadEntitlements } from '@/lib/frameworks/entitlements';
import { readModuleFor, readRefusal, writeModuleFor, writeRefusal } from '@/lib/frameworks/write-guard';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { MemoryFileStorage } from '@/lib/storage/file-storage';
import { indiaDate } from '@/lib/time/india';
import { TEMPLATE_REGISTRY, definitionProblem } from '@/lib/whatsapp/templates';

// Documents and certificates (docs/28 row 10e, C228). The acceptance test: a child with dues gets no certificate
// without a recorded waiver; numbers are unbroken and never reused; the QR page shows no personal data beyond what the
// certificate prints and says "withdrawn" once withdrawn. Every name and number is made up.

const TODAY = indiaDate();

describe('the words and the rules', () => {
  it('the family’s message names the school first, carries the link, and nothing more about the child than the name', () => {
    const tpl = TEMPLATE_REGISTRY.find((x) => x.name === 'certificate_issued');
    expect(tpl).toBeDefined();
    expect(definitionProblem(tpl!)).toBeNull();
    expect([...tpl!.variables].sort()).toEqual(['certificate', 'child', 'link', 'number', 'school']);
  });

  it('the batch’s typed words are checked against the studio’s own fields and the one Aadhaar rule', () => {
    expect(readTyped('transfer', {}, TODAY)).toEqual({ ok: false, reason: 'missing', field: 'reason' });
    expect(readTyped('transfer', { reason: 'Moving to Pune', conduct: 'Brilliant' }, TODAY)).toEqual({ ok: false, reason: 'option', field: 'conduct' });
    expect(readTyped('transfer', { reason: 'Moving to Pune', lastAttendance: '2999-01-01' }, TODAY)).toEqual({ ok: false, reason: 'date', field: 'lastAttendance' });
    expect(readTyped('transfer', { reason: 'Aadhaar 1234 5678 9012 given' }, TODAY)).toEqual({ ok: false, reason: 'aadhaar', field: 'reason' });
    expect(readTyped('transfer', { reason: 'x'.repeat(91) }, TODAY)).toEqual({ ok: false, reason: 'too_long', field: 'reason' });
    expect(readTyped('transfer', { reason: '  Moving   to Pune ', conduct: 'Good', ignored: 'x' }, TODAY)).toEqual({ ok: true, values: { reason: 'Moving to Pune', conduct: 'Good' } });
    expect(readTyped('bonafide', {}, TODAY)).toEqual({ ok: false, reason: 'missing', field: 'purpose' });
    expect(readTyped('character', { period: '2019-20 to 2025-26' }, TODAY)).toEqual({ ok: false, reason: 'missing', field: 'conduct' });
    expect(readReason('  ')).toEqual({ ok: false, reason: 'reason' });
    expect(readReason('Card 1234-5678-9012')).toEqual({ ok: false, reason: 'aadhaar' });
    expect(certificateNumber('transfer', 7)).toBe('TC/0007');
    expect(certificateFileName('TC/0007')).toBe('certificate-TC-0007.pdf');
  });

  it('what a certificate prints comes from the record; a field the studio requires and the record lacks stops it', () => {
    const child: ChildRecord = { name: 'Riya Sharma', admissionNo: 'A-7', dob: '2015-06-02', gender: 'female', status: 'active', className: '5-A', guardians: [{ name: 'Sunita Sharma', relation: 'Mother' }, { name: 'Raj Sharma', relation: 'Father' }] };
    const ctx = { schoolName: 'School A', address: null, year: '2026-27', signName: 'Priya Principal', owesNothing: false };
    const tc = composePrinted('transfer', child, { reason: 'Moving to Pune' }, ctx);
    expect(tc).toEqual({ ok: true, printed: { schoolName: 'School A', studentName: 'Riya Sharma', admissionNo: 'A-7', signName: 'Priya Principal', signTitle: 'Principal', fatherName: 'Raj Sharma', motherName: 'Sunita Sharma', dob: '2015-06-02', gender: 'Female', lastClass: '5-A', dues: 'No', reason: 'Moving to Pune' } });
    const bona = composePrinted('bonafide', { ...child, status: 'transferred' }, { purpose: 'Opening a bank account' }, ctx);
    expect(bona.ok && bona.printed).toMatchObject({ parentName: 'Raj Sharma', relation: 'daughter', className: '5-A', year: '2026-27', status: 'was a bonafide student', purpose: 'Opening a bank account' });
    expect(composePrinted('transfer', { ...child, dob: null }, { reason: 'Moving' }, ctx)).toEqual({ ok: false, reason: 'incomplete', fields: ['dob'] });
    expect(composePrinted('bonafide', { ...child, guardians: [] }, { purpose: 'Bank' }, { ...ctx, year: null })).toEqual({ ok: false, reason: 'incomplete', fields: ['parentName', 'year'] });
    // A record that holds an Aadhaar-shaped number (an admission number written as one) is never printed or kept.
    expect(composePrinted('transfer', { ...child, admissionNo: '1234 5678 9012' }, { reason: 'Moving' }, ctx)).toEqual({ ok: false, reason: 'aadhaar' });
  });

  it('the PDF is the studio’s own drawing, with the number, the day, and a QR code of the verification address only', () => {
    const token = 'abcdefghijABCDEFGHIJ0123456789_-';
    const c = { certificateId: 'c', type: 'bonafide' as const, number: 'BC/0003', issuedOn: '2026-10-15', token, printed: { schoolName: 'School A', studentName: 'Riya Sharma', admissionNo: 'A-7', parentName: 'Raj Sharma', className: '5-A', year: '2026-27', purpose: 'Bank' } };
    expect(certDocFor(c, {}).values).toMatchObject({ number: 'BC/0003', issueDate: '2026-10-15' });
    expect(certDocFor(c, {}).options).toEqual({ stampBox: true, qr: false });
    const svg = certificateSvg(c, {});
    expect(svg).toContain('No.: BC/0003');
    expect(svg).toContain(qrMarkup(verifyUrl(token), 22, 243, 24));
    expect(verifyUrl(token)).toBe(`https://netcyberai.com/verify/${token}`);
    expect(svg).not.toContain(token); // the token is in the QR code's squares, not written out
  });
});

// ---- On the whole schema, as the app's role ------------------------------------------------------------------------

const A = 'ce000000-0000-4000-8000-000000000001';
const B = 'ce000000-0000-4000-8000-000000000002';
const u = (n: number) => `ce000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TARA, ACCOUNTANT, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15)];
const [CLASS_5A, CLASS_B] = [u(51), u(52)];
const [ASHA, BINA, CHETAN, DEV, EKTA, FARAH, B_KID, GITA] = [u(31), u(32), u(33), u(34), u(35), u(36), u(37), u(38)];
const [G_ASHA, G_BINA, G_B] = [u(41), u(42), u(43)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const tara: Who = { role: 'teacher', user: TARA };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
const bPrincipal: Who = { role: 'principal', user: B_PRINCIPAL, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school ?? A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const queue = createPgJobQueue(platform);
type Out = { rows: { n: number }[]; rowCount: number };
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });
const TC = { reason: 'Family moving to another city' };
const issue = (who: Who, type: 'transfer' | 'bonafide' | 'character' | 'study', ids: string[], typed: Record<string, string> = TC, waivers: Record<string, string> = {}) => as(who, (c) => issueCertificates(c, actor(who), { type, studentIds: ids, typed, waivers }, TODAY));
const row = async (id: string) => (await db.pg.query(`select * from certificates_issued where certificate_id = $1`, [id])).rows[0];
const PDF = new TextEncoder().encode('%PDF-1.4\n% a made-up certificate\n%%EOF\n');
const png = (w: number, h: number) => {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};
const ids: Record<string, string> = {};

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, address, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values
        ('${A}', 'School A', '1 Example Road', 'IN-HR', false, false, true, 100000, '00:00', '00:00'), ('${B}', 'School B', null, 'IN-HR', false, false, true, 100000, '00:00', '00:00');
      insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${A}', 'p@a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'ad@a.example', 'school_admin', 'Asif Admin'),
        ('${TARA}', '${A}', 't@a.example', 'teacher', 'Tara Teacher'), ('${ACCOUNTANT}', '${A}', 'ac@a.example', 'accountant', 'Anil Accountant'), ('${B_PRINCIPAL}', '${B}', 'p@b.example', 'principal', 'Bela Principal');
      insert into academic_sessions (school_id, label, start_date, end_date, is_current) values ('${A}', '2026-27', '2026-04-01', '2027-03-31', true);
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${CLASS_5A}', '${A}', '5-A', '${TARA}'), ('${CLASS_B}', '${B}', '7-C', null);
      insert into students (student_id, school_id, admission_no, name, status, class_id, roll_no, dob, gender) values
        ('${ASHA}', '${A}', 'A-1', 'Asha Singh', 'active', '${CLASS_5A}', '1', '2015-01-11', 'female'),
        ('${BINA}', '${A}', 'A-2', 'Bina Rao', 'active', '${CLASS_5A}', '2', '2015-02-12', 'female'),
        ('${CHETAN}', '${A}', 'A-3', 'Chetan Das', 'active', '${CLASS_5A}', '3', '2015-03-13', 'male'),
        ('${DEV}', '${A}', 'A-4', 'Dev Mehta', 'active', '${CLASS_5A}', '4', '2015-04-14', 'male'),
        ('${EKTA}', '${A}', 'A-5', 'Ekta Jain', 'active', '${CLASS_5A}', '5', null, 'female'),
        ('${FARAH}', '${A}', 'A-6', 'Farah Khan', 'active', '${CLASS_5A}', '6', '2015-06-16', 'female'),
        ('${B_KID}', '${B}', 'B-1', 'Bablu Roy', 'active', '${CLASS_B}', '1', '2014-01-01', 'male'),
        ('${GITA}', '${A}', '1234 5678 9012', 'Gita Bose', 'active', '${CLASS_5A}', '7', '2015-07-17', 'female');
      insert into parents (parent_id, school_id, name, phone, relation) values ('${G_ASHA}', '${A}', 'Ravi Singh', '9000000001', 'Father'), ('${G_BINA}', '${A}', 'Meena Rao', 'not given', 'Mother'), ('${G_B}', '${B}', 'Bimal Roy', '9000000009', 'Father');
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${G_ASHA}', '${ASHA}'), ('${A}', '${G_BINA}', '${BINA}'), ('${A}', '${G_ASHA}', '${CHETAN}'), ('${A}', '${G_ASHA}', '${DEV}'), ('${A}', '${G_ASHA}', '${EKTA}'), ('${A}', '${G_ASHA}', '${FARAH}'), ('${B}', '${G_B}', '${B_KID}');
      insert into fees_ledger (school_id, student_id, amount_minor, due_date, status) values ('${A}', '${BINA}', 450000, '2026-07-10', 'overdue'), ('${A}', '${CHETAN}', 300000, '2026-07-10', 'overdue'), ('${A}', '${DEV}', 200000, '2026-07-10', 'partial'), ('${A}', '${FARAH}', 100000, '2026-07-10', 'paid');
      insert into fee_clearance_overrides (school_id, student_id, owed_minor, reason, decided_by) values ('${A}', '${CHETAN}', 300000, 'Leaving for another state; the family will pay later.', '${PRINCIPAL}');
    `);
    // Dev has paid part; Farah has paid all.
    const fee = async (s: string) => (await db.pg.query(`select fee_id from fees_ledger where student_id = $1`, [s])).rows[0].fee_id;
    await db.pg.query(`insert into payments (school_id, fee_id, amount_minor, method) values ($1, $2, 50000, 'cash'), ($1, $3, 100000, 'cash')`, [A, await fee(DEV), await fee(FARAH)]);
    await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [A, ASHA]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('the fee clearance in the database is feeClearance’s own sum: nothing owed, the counter’s override, or owed', async () => {
    const said = async (s: string) => as(admin, (c) => feeClearance(c, A, s));
    expect(await said(ASHA)).toMatchObject({ owedMinor: 0, cleared: true });
    expect(await said(BINA)).toMatchObject({ owedMinor: 450000, cleared: false });
    expect(await said(CHETAN)).toMatchObject({ owedMinor: 300000, cleared: true });
    expect(await said(DEV)).toMatchObject({ owedMinor: 150000, cleared: false });
    expect(await said(FARAH)).toMatchObject({ owedMinor: 0, cleared: true });
    const roster = await as(admin, (c) => certificateRoster(c, actor(admin), CLASS_5A, 'transfer'));
    expect(roster!.map((k) => [k.name, k.owed_minor, k.cleared, k.cleared_by])).toEqual([
      ['Asha Singh', 0, true, 'nothing_owed'],
      ['Bina Rao', 450000, false, null],
      ['Chetan Das', 300000, true, 'fee_override'],
      ['Dev Mehta', 150000, false, null],
      ['Ekta Jain', 0, true, 'nothing_owed'],
      ['Farah Khan', 0, true, 'nothing_owed'],
      ['Gita Bose', 0, true, 'nothing_owed'],
    ]);
  });

  it('a child with dues gets no certificate without a recorded waiver: not through the app, and not in the database', async () => {
    const first = await issue(admin, 'transfer', [ASHA, BINA, CHETAN, EKTA]);
    expect(first).toMatchObject({ ok: true, held: [{ studentId: BINA, owedMinor: 450000 }], duplicates: [], incomplete: [{ studentId: EKTA, fields: ['dob'] }], aadhaar: [], notFound: [] });
    if (!first.ok) throw new Error('not issued');
    expect(first.issued.map((x) => [x.studentId, x.number])).toEqual([[ASHA, 'TC/0001'], [CHETAN, 'TC/0002']]);
    ids.ashaTc = first.issued[0].certificateId;
    ids.chetanTc = first.issued[1].certificateId;
    expect(await row(ids.ashaTc)).toMatchObject({ clearance: 'nothing_owed', owed_minor: 0, waiver_reason: null, issued_by: ADMIN, class_id: CLASS_5A });
    expect(await row(ids.chetanTc)).toMatchObject({ clearance: 'fee_override', owed_minor: 300000 });
    // In the database: no waiver, no certificate; the school admin cannot waive; nobody issues in another's name.
    const insert = (who: Who, student: string, waiver: string | null, by = who.user) => as(who, (c) => c.query(`insert into certificates_issued (school_id, cert_type, student_id, issued_by, printed, waiver_reason) values ($1, 'transfer', $2, $3, '{"studentName":"x"}', $4)`, [A, student, by, waiver]));
    await expect(insert(admin, BINA, null)).rejects.toThrow(/fees are owed/);
    await expect(insert(admin, BINA, 'Hardship')).rejects.toThrow(/only the principal waives/);
    await expect(insert(admin, BINA, null, PRINCIPAL)).rejects.toThrow(/in their own name/);
    await expect(insert(principal, FARAH, 'Hardship')).rejects.toThrow(/nothing to waive/);
    // Through the app: the school admin's waiver is refused; the principal's is kept with the certificate.
    expect(await issue(admin, 'transfer', [BINA], TC, { [BINA]: 'Hardship' })).toEqual({ ok: false, reason: 'waiver_not_principal' });
    expect(await issue(principal, 'transfer', [BINA], TC, { [BINA]: '  ' })).toEqual({ ok: false, reason: 'waiver_reason', field: 'waiver' });
    const waived = await issue(principal, 'transfer', [BINA, FARAH], TC, { [BINA]: 'The family lost its income; the trust pays later.', [FARAH]: 'Not needed' });
    if (!waived.ok) throw new Error(waived.reason);
    expect(waived.issued.map((x) => x.number)).toEqual(['TC/0003', 'TC/0004']);
    ids.binaTc = waived.issued[0].certificateId;
    ids.farahTc = waived.issued[1].certificateId;
    expect(await row(ids.binaTc)).toMatchObject({ clearance: 'waived', owed_minor: 450000, waived_by: PRINCIPAL, waiver_reason: 'The family lost its income; the trust pays later.' });
    // A waiver the clearance does not need is not recorded.
    expect(await row(ids.farahTc)).toMatchObject({ clearance: 'nothing_owed', waiver_reason: null, waived_by: null });
    // The audit row says a reason was given, never what it was, and names nobody.
    const audit = (await db.pg.query(`select actor_user_id, after_state from audit_log where event_action = 'certificate.issued' and target_id = $1`, [ids.binaTc])).rows[0];
    expect(audit.actor_user_id).toBe(PRINCIPAL);
    expect(audit.after_state).toEqual({ studentId: BINA, type: 'transfer', number: 'TC/0003', clearance: 'waived', owedMinor: 450000, reasonGiven: true });
  });

  it('numbers are unbroken per school and per type, never reused, and a withdrawn certificate keeps its number', async () => {
    const bona = await issue(admin, 'bonafide', [ASHA], { purpose: 'Opening a bank account' });
    if (!bona.ok) throw new Error(bona.reason);
    expect(bona.issued[0].number).toBe('BC/0001');
    ids.ashaBc = bona.issued[0].certificateId;
    expect(await as(principal, (c) => withdrawCertificate(c, actor(principal), ids.ashaTc, 'Issued with the wrong reason for leaving.'))).toEqual({ ok: true });
    const again = await issue(admin, 'transfer', [ASHA], { reason: 'Admission in a school near the new home' });
    if (!again.ok) throw new Error(again.reason);
    expect(again.issued[0].number).toBe('TC/0005');
    ids.ashaTc2 = again.issued[0].certificateId;
    expect((await row(ids.ashaTc)).number).toBe('TC/0001');
    const seqs = (await db.pg.query(`select seq from certificates_issued where school_id = $1 and cert_type = 'transfer' order by seq`, [A])).rows.map((r: { seq: number }) => r.seq);
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
    // Another school starts its own series.
    const other = await issue(bPrincipal, 'transfer', [B_KID]);
    expect(other.ok && other.issued[0].number).toBe('TC/0001');
    // Nobody changes a number, the child or the words, and nothing is ever deleted.
    await expect(as(principal, (c) => c.query(`update certificates_issued set seq = 9 where certificate_id = $1`, [ids.chetanTc]))).rejects.toThrow(/never changes/);
    await expect(as(principal, (c) => c.query(`update certificates_issued set printed = '{"studentName":"Someone Else"}' where certificate_id = $1`, [ids.chetanTc]))).rejects.toThrow(/never changes/);
    await expect(as(principal, (c) => c.query(`update certificates_issued set number = 'TC/0099' where certificate_id = $1`, [ids.chetanTc]))).rejects.toThrow(/can only be updated to DEFAULT/);
    await expect(as(principal, (c) => c.query(`delete from certificates_issued where certificate_id = $1`, [ids.chetanTc]))).rejects.toThrow(/permission denied/);
    // (That the caller never chooses the number is proven in 'review of C228' below.)
  });

  it('no duplicate: one live TC per child; one live bonafide per purpose and day', async () => {
    expect(await issue(admin, 'transfer', [CHETAN])).toMatchObject({ ok: true, issued: [], duplicates: [{ studentId: CHETAN, number: 'TC/0002' }] });
    const dupInsert = as(admin, (c) => c.query(`insert into certificates_issued (school_id, cert_type, student_id, issued_by, printed) values ($1, 'transfer', $2, $3, '{"studentName":"x"}')`, [A, CHETAN, ADMIN]));
    await expect(dupInsert).rejects.toThrow(/certificates_one_live_tc/);
    expect(await issue(admin, 'bonafide', [ASHA], { purpose: 'opening a  BANK account ' })).toMatchObject({ ok: true, issued: [], duplicates: [{ studentId: ASHA, number: 'BC/0001' }] });
    const scholarship = await issue(admin, 'bonafide', [ASHA], { purpose: 'A scholarship form' });
    expect(scholarship.ok && scholarship.issued.map((x) => x.number)).toEqual(['BC/0002']);
  });

  it('withdrawal: the principal only, with a reason, once; audited without the words', async () => {
    expect(await as(admin, (c) => withdrawCertificate(c, actor(admin), ids.chetanTc, 'Wrong'))).toEqual({ ok: false, reason: 'not_allowed' });
    // The school admin's direct update reaches no row (row level security), and the trigger refuses one that does.
    expect((await as<Out>(admin, (c) => c.query(`update certificates_issued set withdrawn_at = now(), withdrawn_by = $2, withdraw_reason = 'x' where certificate_id = $1`, [ids.chetanTc, ADMIN]))).rowCount).toBe(0);
    expect((await row(ids.chetanTc)).withdrawn_at).toBeNull();
    await expect(as(principal, (c) => c.query(`update certificates_issued set withdrawn_at = now(), withdrawn_by = $2, withdraw_reason = 'x' where certificate_id = $1`, [ids.chetanTc, ADMIN]))).rejects.toThrow(/row-level security|in their own name/);
    await expect(as(principal, (c) => c.query(`update certificates_issued set withdrawn_at = now(), withdrawn_by = $2 where certificate_id = $1`, [ids.chetanTc, PRINCIPAL]))).rejects.toThrow(/with a reason/);
    expect(await as(principal, (c) => withdrawCertificate(c, actor(principal), ids.chetanTc, ' '))).toEqual({ ok: false, reason: 'reason' });
    expect(await as(principal, (c) => withdrawCertificate(c, actor(principal), ids.ashaTc, 'Again'))).toEqual({ ok: false, reason: 'withdrawn' });
    await expect(as(principal, (c) => c.query(`update certificates_issued set withdraw_reason = 'Changed' where certificate_id = $1`, [ids.ashaTc]))).rejects.toThrow(/stays withdrawn/);
    const audit = (await db.pg.query(`select after_state from audit_log where event_action = 'certificate.withdrawn' and target_id = $1`, [ids.ashaTc])).rows[0];
    expect(audit.after_state).toEqual({ type: 'transfer', number: 'TC/0001', reasonGiven: true });
    expect(await row(ids.ashaTc)).toMatchObject({ withdrawn_by: PRINCIPAL, withdraw_reason: 'Issued with the wrong reason for leaving.' });
  });

  it('who reads and writes: the office; a teacher, the accountant and another school nothing, by the app and in the database', async () => {
    for (const who of [tara, accountant]) {
      expect(await as(who, (c) => certificateRegister(c, actor(who), {}))).toBeNull();
      expect(await as(who, (c) => issueCertificates(c, actor(who), { type: 'transfer', studentIds: [DEV], typed: TC, waivers: {} }, TODAY))).toEqual({ ok: false, reason: 'not_allowed' });
      expect((await as<Out>(who, (c) => c.query(`select count(*)::int as n from certificates_issued`))).rows[0].n).toBe(0);
      expect((await as<Out>(who, (c) => c.query(`select count(*)::int as n from certificate_marks`))).rows[0].n).toBe(0);
      expect((await as<Out>(who, (c) => c.query(`select count(*)::int as n from audit_log where event_action like 'certificate.%'`))).rows[0].n).toBe(0);
      await expect(as(who, (c) => c.query(`insert into certificates_issued (school_id, cert_type, student_id, issued_by, printed) values ($1, 'study', $2, $3, '{"studentName":"x"}')`, [A, DEV, who.user]))).rejects.toThrow(/issued by the principal or the school admin|row-level security/);
    }
    expect((await as<Out>(bPrincipal, (c) => c.query(`select count(*)::int as n from certificates_issued`))).rows[0].n).toBe(1);
    expect(await as(bPrincipal, (c) => certificatesToPrint(c, actor(bPrincipal), [ids.chetanTc]))).toEqual([]);
    await expect(as(bPrincipal, (c) => c.query(`insert into certificates_issued (school_id, cert_type, student_id, issued_by, printed) values ($1, 'study', $2, $3, '{}')`, [A, DEV, B_PRINCIPAL]))).rejects.toThrow();
    const reg = await as(admin, (c) => certificateRegister(c, actor(admin), { type: 'transfer' }));
    expect(reg!.map((r) => r.number)).toEqual(['TC/0005', 'TC/0004', 'TC/0003', 'TC/0002', 'TC/0001']);
    expect(reg!.find((r) => r.number === 'TC/0001')).toMatchObject({ child: 'Asha Singh', class_name: '5-A', issued_by: 'Asif Admin', withdrawn_by: 'Priya Principal', withdraw_reason: 'Issued with the wrong reason for leaving.' });
    expect(reg!.find((r) => r.number === 'TC/0003')).toMatchObject({ clearance: 'waived', waived_by: 'Priya Principal', owed_minor: 450000 });
    const home = await as(admin, (c) => certificateHome(c, actor(admin), TODAY));
    expect(home).toMatchObject({ year: '2026-27', mayWaive: false, mayWithdraw: false, mayKeepMarks: false, classes: [{ class_id: CLASS_5A, name: '5-A' }] });
    expect((await as(principal, (c) => certificateHome(c, actor(principal), TODAY)))?.mayWaive).toBe(true);
  });

  it('the QR page shows only valid or withdrawn, the type, the school, the day, the number and a first name with an initial', async () => {
    const token = (await row(ids.ashaTc2)).verify_token as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(token).not.toContain('0005');
    expect(token).not.toBe((await row(ids.ashaTc)).verify_token);
    const seen = await platform((c) => verifyCertificate(c, token));
    expect(seen).toEqual({ state: 'valid', type: 'transfer', schoolName: 'School A', issuedOn: TODAY, number: 'TC/0005', nameShown: 'Asha S.' });
    // The definer function answers with these six columns, and nothing else.
    const cols = (await platform<{ fields: { name: string }[] }>((c) => c.query(`select * from public.certificate_verify($1)`, [token]))).fields.map((f: { name: string }) => f.name);
    expect(cols).toEqual(['state', 'cert_type', 'school_name', 'issued_on', 'number', 'name_shown']);
    const withdrawnToken = (await row(ids.ashaTc)).verify_token as string;
    expect(await platform((c) => verifyCertificate(c, withdrawnToken))).toMatchObject({ state: 'withdrawn', number: 'TC/0001' });
    expect(await platform((c) => verifyCertificate(c, 'A'.repeat(32)))).toBeNull();
    expect(await platform((c) => verifyCertificate(c, ids.ashaTc2))).toBeNull(); // the id is not a token
    expect(await platform((c) => verifyCertificate(c, "x' or '1'='1"))).toBeNull();
    // The platform role reads nothing of the register itself; the app's role cannot call the public function.
    await expect(platform((c) => c.query(`select count(*) from certificates_issued`))).rejects.toThrow(/permission denied/);
    await expect(as(admin, (c) => c.query(`select * from public.certificate_verify($1)`, [token]))).rejects.toThrow(/permission denied/);
  });

  it('the family gets the PDF through the send-gate only: held while the words wait for approval; the link stops when withdrawn', async () => {
    const files = new MemoryFileStorage();
    let n = 0;
    const id = () => `ce000000-0000-4000-8000-0000000009${String(++n).padStart(2, '0')}`;
    expect(await as(tara, (c) => sendCertificate(c, queue, files, actor(tara), ids.ashaTc2, PDF, id))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(admin, (c) => sendCertificate(c, queue, files, actor(admin), ids.ashaTc2, new TextEncoder().encode('not a pdf'), id))).toEqual({ ok: false, reason: 'not_a_pdf' });
    expect(await as(admin, (c) => sendCertificate(c, queue, files, actor(admin), ids.ashaTc, PDF, id))).toEqual({ ok: false, reason: 'withdrawn' });
    expect(await as(admin, (c) => sendCertificate(c, queue, files, actor(admin), ids.binaTc, PDF, id))).toEqual({ ok: false, reason: 'no_number' });
    expect(files.files.size).toBe(0);
    const held = await as(admin, (c) => sendCertificate(c, queue, files, actor(admin), ids.ashaTc2, PDF, id));
    expect(held).toEqual({ ok: true, status: 'blocked_no_template', last4: '0001' });
    const log = (await db.pg.query(`select template_name, status::text as status, to_phone, template_params from communication_log where dedupe_key like $1`, [`certificate:${ids.ashaTc2}:%`])).rows;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ template_name: 'certificate_issued', status: 'blocked_no_template' });
    const copy = (await db.pg.query(`select storage_key, copy_key, made_by from certificate_copies where certificate_id = $1`, [ids.ashaTc2])).rows[0];
    expect(copy.storage_key.startsWith(`${A}/certificates/${ids.ashaTc2}/`)).toBe(true);
    expect(copy.made_by).toBe(ADMIN);
    expect(files.files.get(copy.storage_key)?.bytes).toEqual(PDF);
    expect(await platform((c) => familyCopy(c, copy.copy_key))).toEqual({ storageKey: copy.storage_key, number: 'TC/0005' });
    const printedToken = (await row(ids.ashaTc2)).verify_token as string;
    expect(await platform((c) => familyCopy(c, printedToken))).toBeNull(); // the printed token never opens the PDF
    // Once Control and Meta approve the words, the same press is queued for the guardian, read again when it goes.
    await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, 'certificate_issued', 1, 'en', $1, $2, 'utility', 2880, 'approved')`, [TEMPLATE_REGISTRY.find((x) => x.name === 'certificate_issued')!.body.en, ['school', 'child', 'certificate', 'number', 'link']]);
    const queued = await as(admin, (c) => sendCertificate(c, queue, files, actor(admin), ids.ashaTc2, PDF, id));
    expect(queued).toMatchObject({ ok: true, status: 'queued' });
    const params = (await db.pg.query(`select template_params from communication_log where dedupe_key like $1 and status = 'queued'`, [`certificate:${ids.ashaTc2}:%`])).rows[0].template_params;
    const key = (await db.pg.query(`select copy_key from certificate_copies where certificate_id = $1 order by made_at desc limit 1`, [ids.ashaTc2])).rows[0].copy_key;
    expect(params).toEqual({ child: 'Asha Singh', certificate: 'Transfer Certificate', number: 'TC/0005', link: `https://netcyberai.com/api/public/certificates/copy/${key}` });
    const audit = (await db.pg.query(`select after_state from audit_log where event_action = 'certificate.sent' order by audit_id desc limit 1`)).rows[0].after_state;
    expect(Object.keys(audit).sort()).toEqual(['copyId', 'parentId', 'sendState']);
    // The register shows the latest message's state.
    expect((await as(admin, (c) => certificateRegister(c, actor(admin), { type: 'transfer' })))!.find((r) => r.number === 'TC/0005')?.sent).toBe('queued');
    await db.pg.query(`delete from whatsapp_templates where template_name = 'certificate_issued'`);
    // Withdrawn, the family's link answers nothing; a copy is never changed.
    await expect(as(admin, (c) => c.query(`update certificate_copies set storage_key = storage_key where certificate_id = $1`, [ids.ashaTc2]))).rejects.toThrow(/permission denied/);
    ids.ashaCopyKey = copy.copy_key;
    ids.ashaCopyPath = copy.storage_key;
    (globalThis as { files?: MemoryFileStorage }).files = files;
  });

  it('the seal and the signature: kept by the principal, read by the office to draw, nobody else', async () => {
    const files = new MemoryFileStorage();
    expect(await as(admin, (c) => saveMark(c, files, actor(admin), 'seal', png(300, 300)))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => saveMark(c, files, actor(principal), 'seal', PDF))).toEqual({ ok: false, reason: 'not_a_png' });
    expect(await as(principal, (c) => saveMark(c, files, actor(principal), 'stamp', png(3, 3)))).toEqual({ ok: false, reason: 'kind' });
    expect(await as(principal, (c) => saveMark(c, files, actor(principal), 'signature', png(2000, 10)))).toEqual({ ok: false, reason: 'shape' });
    expect(await as(principal, (c) => saveMark(c, files, actor(principal), 'seal', png(300, 300)))).toEqual({ ok: true });
    expect(await as(principal, (c) => saveMark(c, files, actor(principal), 'signature', png(400, 100)))).toEqual({ ok: true });
    expect(await as(principal, (c) => saveMark(c, files, actor(principal), 'signature', png(500, 100)))).toEqual({ ok: true }); // replaces
    expect(files.files.size).toBe(2); // the old signature's file is gone
    await expect(as(admin, (c) => c.query(`insert into certificate_marks (school_id, kind, storage_key, size_bytes, aspect, uploaded_by) values ($1, 'seal', $2, 10, 1, $3) on conflict (school_id, kind) do update set uploaded_by = excluded.uploaded_by`, [A, `${A}/certificate-marks/seal/x.png`, ADMIN]))).rejects.toThrow(/row-level security/);
    await expect(as(principal, (c) => c.query(`insert into certificate_marks (school_id, kind, storage_key, size_bytes, aspect, uploaded_by) values ($1, 'seal', $2, 10, 1, $3) on conflict (school_id, kind) do update set storage_key = excluded.storage_key`, [A, `${B}/certificate-marks/seal/x.png`, PRINCIPAL]))).rejects.toThrow(/check constraint/);
    const marks = await as(admin, (c) => markImages(c, A, storedReader(files)));
    expect(marks.unavailable).toEqual([]);
    expect(marks.seal?.aspect).toBe(1);
    expect(marks.signature?.aspect).toBe(5);
    expect(marks.seal?.src.startsWith('data:image/png;base64,')).toBe(true);
    expect((await as(admin, (c) => certificateHome(c, actor(admin), TODAY)))?.marks).toEqual({ seal: true, signature: true, signedBy: 'Priya Principal' });
    // A certificate issued now prints the signer's name under the signature.
    const study = await issue(admin, 'study', [ASHA], { purpose: 'A library card' });
    expect(study.ok && (await row(study.issued[0].certificateId)).printed).toMatchObject({ signName: 'Priya Principal', status: 'is studying', year: '2026-27' });
    expect(await as(admin, (c) => removeMark(c, files, actor(admin), 'seal'))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => removeMark(c, files, actor(principal), 'seal'))).toEqual({ ok: true });
    expect(files.files.size).toBe(1);
    // A file the storage cannot give now leaves the certificate drawn without it, and says so.
    expect((await as(admin, (c) => markImages(c, A, async () => null))).unavailable).toEqual(['signature']);
  });

  it('a batch for a class prints as one file in roll order; a withdrawn certificate is not printed again', async () => {
    const list = await as(admin, (c) => certificatesToPrint(c, actor(admin), [ids.farahTc, ids.ashaTc, ids.binaTc, ids.chetanTc]));
    expect(list!.map((x) => x.number)).toEqual(['TC/0004', 'TC/0003', 'TC/0002']);
    expect(list![0]).toMatchObject({ type: 'transfer', issuedOn: TODAY, printed: { studentName: 'Farah Khan', dues: 'Yes', reason: TC.reason } });
    expect((await as(tara, (c) => certificatesToPrint(c, actor(tara), [ids.farahTc])))).toBeNull();
  });

  it('a child’s erasure keeps each number and state in the register, and blanks every word about the child', async () => {
    const files = (globalThis as { files?: MemoryFileStorage }).files as MemoryFileStorage;
    expect(files.files.has(ids.ashaCopyPath)).toBe(true);
    await expect(as(tara, (c) => c.query(`select * from public.erase_student_certificates($1)`, [ASHA]))).rejects.toThrow(/principal or the school admin/);
    // Through the erasure itself (src/lib/consent/dsr.ts): its one line reaches certificates.
    await as(principal, (c) => pseudonymizeStudent(c, A, ASHA));
    const rows = (await db.pg.query(`select number, printed, purpose, waiver_reason, withdraw_reason, withdrawn_at is not null as withdrawn, erased_at is not null as erased from certificates_issued where student_id = $1 order by cert_type, seq`, [ASHA])).rows;
    expect(rows.map((r: { number: string; withdrawn: boolean }) => [r.number, r.withdrawn])).toEqual([['BC/0001', false], ['BC/0002', false], ['SC/0001', false], ['TC/0001', true], ['TC/0005', false]]);
    for (const r of rows) expect(r).toMatchObject({ printed: {}, purpose: null, waiver_reason: null, withdraw_reason: null, erased: true });
    expect((await db.pg.query(`select count(*)::int as n from certificate_copies where certificate_id = $1`, [ids.ashaTc2])).rows[0].n).toBe(0);
    expect(await platform((c) => familyCopy(c, ids.ashaCopyKey))).toBeNull();
    // The QR page still answers for the paper, with no name.
    const [liveToken, goneToken] = [(await row(ids.ashaTc2)).verify_token as string, (await row(ids.ashaTc)).verify_token as string];
    expect(await platform((c) => verifyCertificate(c, liveToken))).toMatchObject({ state: 'valid', number: 'TC/0005', nameShown: null });
    expect(await platform((c) => verifyCertificate(c, goneToken))).toMatchObject({ state: 'withdrawn', nameShown: null });
    // An erased certificate is not printed or sent again, and does not block a new one.
    expect(await as(admin, (c) => certificatesToPrint(c, actor(admin), [ids.ashaTc2]))).toEqual([]);
    // The family copies' files are removed by the caller (dsr.ts's own storage is the bucket; here, the memory store).
    await as(principal, (c) => c.query(`insert into certificate_copies (school_id, certificate_id, storage_key, size_bytes, made_by) values ($1, $2, $3, 10, $4)`, [A, ids.chetanTc, `${A}/certificates/${ids.chetanTc}/x.pdf`, PRINCIPAL]));
    await files.put(`${A}/certificates/${ids.chetanTc}/x.pdf`, PDF, 'application/pdf');
    expect(await as(principal, (c) => eraseCertificatesOf(c, CHETAN, files))).toBe(2);
    expect(files.files.has(`${A}/certificates/${ids.chetanTc}/x.pdf`)).toBe(false);
    // An erased certificate can still be withdrawn by the principal; the words are not kept on it.
    expect(await as(principal, (c) => withdrawCertificate(c, actor(principal), ids.ashaBc, 'Asha asked for a new one.'))).toEqual({ ok: true });
    expect(await row(ids.ashaBc)).toMatchObject({ withdrawn_by: PRINCIPAL, withdraw_reason: null, printed: {} });
    // Nothing the erasure blanks can be put back by the app's role.
    await expect(as(principal, (c) => c.query(`update certificates_issued set printed = '{"studentName":"Asha Singh"}' where certificate_id = $1`, [ids.ashaTc2]))).rejects.toThrow(/never changes/);
  });

  it('no audit row of the register holds a name or the words of a reason', async () => {
    const rows = (await db.pg.query(`select event_action, after_state::text as s from audit_log where event_action like 'certificate.%'`)).rows as { event_action: string; s: string }[];
    expect(new Set(rows.map((r) => r.event_action))).toEqual(new Set(['certificate.issued', 'certificate.withdrawn', 'certificate.sent', 'certificate.mark_saved', 'certificate.mark_removed']));
    for (const r of rows) for (const word of ['Asha', 'Bina', 'Chetan', 'Farah', 'Ravi', 'income', 'wrong reason', 'Priya', 'Asif']) expect(r.s, r.event_action).not.toContain(word);
  });

  it('the module is the plan’s: switched off, the routes refuse; every route belongs to Documents & Certificates', async () => {
    for (const p of ['/api/app/documents/certificates', '/api/app/documents/certificates/marks', `/api/app/documents/certificates/${ASHA}/withdraw`, `/api/app/documents/certificates/${ASHA}/send`]) expect(writeModuleFor(p), p).toBe('documents');
    expect(readModuleFor('/api/app/documents/certificates')).toBe('documents');
    expect(writeModuleFor(`/api/app/documents/${ASHA}/review`)).toBe('students'); // scanned documents stay with Students
    await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'documents', false, 'plan') on conflict (school_id, module_id) do update set enabled = false`, [A]);
    const off = await as(admin, (c) => loadEntitlements(c, A));
    expect(writeRefusal(off, 'documents')).toBe('module_off');
    expect(readRefusal(off, 'documents')).toBe('module_off');
    await db.pg.query(`update school_module_entitlements set enabled = true where school_id = $1 and module_id = 'documents'`, [A]);
    const on = await as(admin, (c) => loadEntitlements(c, A));
    expect(writeRefusal(on, 'documents')).toBeNull();
    // The Starter plan does not give it; Growth and Compass do (C223-A, C226).
    const plans = (await db.pg.query(`select plan_id, 'documents' = any(module_ids) as has from plans where not all_working_modules and not test_schools_only order by plan_id`)).rows;
    expect(plans).toEqual([{ plan_id: 'compass', has: true }, { plan_id: 'growth', has: true }, { plan_id: 'starter', has: false }]);
  });

  it('a record holding an Aadhaar-shaped number is reported for that child; the rest of the batch is issued', async () => {
    const made = await issue(admin, 'character', [GITA, FARAH], { period: '2019-20 to 2025-26', conduct: 'Very Good' });
    expect(made).toMatchObject({ ok: true, aadhaar: [GITA], incomplete: [], held: [] });
    expect(made.ok && made.issued.map((x) => [x.studentId, x.number])).toEqual([[FARAH, 'CC/0001']]);
    expect((await db.pg.query(`select count(*)::int as n from certificates_issued where student_id = $1`, [GITA])).rows[0].n).toBe(0);
    // The database refuses one too, whoever writes it.
    await expect(as(admin, (c) => c.query(`insert into certificates_issued (school_id, cert_type, student_id, issued_by, purpose, printed) values ($1, 'study', $2, $3, 'Library', '{"studentName":"Gita Bose","admissionNo":"1234 5678 9012"}')`, [A, GITA, ADMIN]))).rejects.toThrow(/never an Aadhaar number/);
  });

  it('the family’s link opens the PDF for 30 days from the send, then answers nothing', async () => {
    const path = `${A}/certificates/${ids.farahTc}/link.pdf`;
    const key = (await as<{ rows: { copy_key: string }[] }>(principal, (c) => c.query(`insert into certificate_copies (school_id, certificate_id, storage_key, size_bytes, made_by) values ($1, $2, $3, 10, $4) returning copy_key`, [A, ids.farahTc, path, PRINCIPAL]))).rows[0].copy_key as string;
    expect(await platform((c) => familyCopy(c, key))).toEqual({ storageKey: path, number: 'TC/0004' });
    await db.pg.exec('set session_replication_role = replica');
    await db.pg.query(`update certificate_copies set made_at = now() - interval '31 days' where copy_key = $1`, [key]);
    await db.pg.exec('set session_replication_role = origin');
    expect(await platform((c) => familyCopy(c, key))).toBeNull();
    // A copy of another school's certificate, or one stored outside this school's own place, is never made.
    await expect(as(principal, (c) => c.query(`insert into certificate_copies (school_id, certificate_id, storage_key, size_bytes, made_by) values ($1, $2, $3, 10, $4)`, [A, ids.farahTc, `${B}/certificates/x.pdf`, PRINCIPAL]))).rejects.toThrow(/check constraint/);
    await expect(as(bPrincipal, (c) => c.query(`insert into certificate_copies (school_id, certificate_id, storage_key, size_bytes, made_by) values ($1, $2, $3, 10, $4)`, [B, ids.farahTc, `${B}/certificates/x.pdf`, B_PRINCIPAL]))).rejects.toThrow();
  });
  it('review of C228: the caller never chooses the number: a seq given is replaced by the next of the series', async () => {
    const next = Number((await db.pg.query(`select coalesce(max(seq), 0) + 1 as n from certificates_issued where school_id = $1 and cert_type = 'character'`, [B])).rows[0].n);
    const made = await as<{ rows: { seq: number; number: string }[] }>(bPrincipal, (c) => c.query(`insert into certificates_issued (school_id, cert_type, seq, student_id, issued_by, printed) values ($1, 'character', 999, $2, $3, '{}') returning seq, number`, [B, B_KID, B_PRINCIPAL]));
    expect(made.rows[0]).toEqual({ seq: next, number: `CC/${String(next).padStart(4, '0')}` });
  });

  it('review of C228: after 9999 comes 10000: lpad never cuts a number into one already printed', async () => {
    // The school's bonafide series is put at 9999 by one setup row (the trigger held off for it), withdrawn so it is no duplicate.
    await db.pg.exec(`set session_replication_role = replica;
      insert into certificates_issued (school_id, cert_type, seq, student_id, issued_on, issued_by, purpose, printed, clearance, verify_token, withdrawn_at, withdrawn_by, withdraw_reason)
      values ('${B}', 'bonafide', 9999, '${B_KID}', '2026-01-01', '${B_PRINCIPAL}', 'Setup row', '{}', 'nothing_owed', '${'x'.repeat(32)}', now(), '${B_PRINCIPAL}', 'Setup row');
      set session_replication_role = origin;`);
    const made = await as<{ rows: { number: string }[] }>(bPrincipal, (c) => c.query(`insert into certificates_issued (school_id, cert_type, seq, student_id, issued_by, purpose, printed) values ($1, 'bonafide', 1, $2, $3, 'Bank account', '{}') returning number`, [B, B_KID, B_PRINCIPAL]));
    expect(made.rows[0].number).toBe('BC/10000');
  });
});
