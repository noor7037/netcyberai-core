import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { cutContacts, loadMonitoring } from '@/lib/control/monitoring';
import { certDocFor } from '@/lib/documents/cert-doc';
import { CLEARANCE_DEFAULTS, CERT_TYPES, certificateNumber, nextSeq, readNumbering } from '@/lib/documents/certificate-rules';
import { certificateHome, certificateRegister, certificateRoster, issueCertificates, markImages, nameSignatory, numberingOf, saveMark, setNumbering, storedReader } from '@/lib/documents/certificates';
import { COPY_PATH, copyLinkUrl, maskLinks } from '@/lib/documents/copy-link';
import { feeClearance } from '@/lib/fees/clearance';
import { loadFeesSummary } from '@/lib/fees/overdue';
import { settingsSchemaFor } from '@/lib/frameworks/settings-schemas';
import { saveSettings } from '@/lib/frameworks/settings-store';
import { en } from '@/lib/i18n/messages/en';
import { hi } from '@/lib/i18n/messages/hi';
import { MemoryFileStorage } from '@/lib/storage/file-storage';
import { indiaDate } from '@/lib/time/india';

// C232 part A: the documents and certificates close-out (the supervisor's answers in C230-A). The acceptance test:
// the fee clearance is a setting per certificate type (off for the TC, on for the other three) that the app and the
// trigger both read; a waived fee is not owed, in feeClearance() and in the trigger; a prefix and a starting number
// per school, set once (the database refuses a change after the first certificate under it), existing numbers kept;
// a certificate carries the signature of the person who signed it, decided by the database; Control never shows a
// family's certificate link. Every name and number is made up.

const TODAY = indiaDate();
const E = en as Record<string, string>;
const H = hi as Record<string, string>;
const A = 'c2000000-0000-4000-8000-000000000001';
const B = 'c2000000-0000-4000-8000-000000000002';
const u = (n: number) => `c2000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, ADMIN, TARA, ADMIN2, B_PRINCIPAL] = [u(11), u(12), u(13), u(14), u(15)];
const CLASS_A = u(51);
const [OWES, WAIVED, PAID_OLD, CLEAN, B_KID, B_KID2] = [u(31), u(32), u(33), u(34), u(35), u(36)];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school?: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const admin: Who = { role: 'school_admin', user: ADMIN };
const admin2: Who = { role: 'school_admin', user: ADMIN2 };
const tara: Who = { role: 'teacher', user: TARA };
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
const actor = (who: Who) => ({ schoolId: who.school ?? A, userId: who.user, role: who.role as never });
type Type = 'transfer' | 'bonafide' | 'character' | 'study';
const TYPED: Record<Type, Record<string, string>> = { transfer: { reason: 'Family moving to another city' }, bonafide: { purpose: 'Opening a bank account' }, study: { purpose: 'A library card' }, character: { period: '2019-20 to 2025-26', conduct: 'Good' } };
const issue = (who: Who, type: Type, ids: string[], waivers: Record<string, string> = {}, typed: Record<string, string> = TYPED[type]) => as(who, (c) => issueCertificates(c, actor(who), { type, studentIds: ids, typed, waivers }, TODAY));
const row = async (id: string) => (await db.pg.query(`select * from certificates_issued where certificate_id = $1`, [id])).rows[0];
const setting = async (who: Who, set: Record<string, boolean>) => {
  const schema = settingsSchemaFor('documents')!;
  const revision = Number((await db.pg.query(`select coalesce(max(revision), 0) as r from school_settings where school_id = $1 and module_id = 'documents'`, [who.school ?? A])).rows[0].r);
  return as(who, (c) => saveSettings(c, { schoolId: who.school ?? A, userId: who.user, role: who.role as never }, schema, { moduleId: 'documents', baseRevision: revision, set }));
};
const png = (w: number, h: number) => {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};
const issuedId = (r: Awaited<ReturnType<typeof issue>>) => {
  if (!r.ok || r.issued.length !== 1) throw new Error(`not issued: ${JSON.stringify(r)}`);
  return r.issued[0].certificateId;
};

beforeAll(async () => {
  db = await startHarnessDb({ port: 0 });
  await db.pg.exec(`
    insert into schools (school_id, name, address, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values
      ('${A}', 'School A', '1 Example Road', 'IN-HR', false, false, true, 100000, '00:00', '00:00'), ('${B}', 'School B', null, 'IN-HR', false, false, true, 100000, '00:00', '00:00');
    insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${A}', 'p@a.example', 'principal', 'Priya Principal'), ('${ADMIN}', '${A}', 'ad@a.example', 'school_admin', 'Asif Admin'),
      ('${TARA}', '${A}', 't@a.example', 'teacher', 'Tara Teacher'), ('${ADMIN2}', '${A}', 'ad2@a.example', 'school_admin', 'Bela Admin'), ('${B_PRINCIPAL}', '${B}', 'p@b.example', 'principal', 'Bina Principal');
    insert into academic_sessions (school_id, label, start_date, end_date, is_current) values ('${A}', '2026-27', '2026-04-01', '2027-03-31', true), ('${B}', '2026-27', '2026-04-01', '2027-03-31', true);
    insert into classes (class_id, school_id, name) values ('${CLASS_A}', '${A}', '6-B'), ('${u(52)}', '${B}', '7-C');
    insert into students (student_id, school_id, admission_no, name, status, class_id, roll_no, dob, gender) values
      ('${OWES}', '${A}', 'A-1', 'Asha Singh', 'active', '${CLASS_A}', '1', '2014-01-11', 'female'),
      ('${WAIVED}', '${A}', 'A-2', 'Bina Rao', 'active', '${CLASS_A}', '2', '2014-02-12', 'female'),
      ('${PAID_OLD}', '${A}', 'A-3', 'Chetan Das', 'active', '${CLASS_A}', '3', '2014-03-13', 'male'),
      ('${CLEAN}', '${A}', 'A-4', 'Dev Mehta', 'active', '${CLASS_A}', '4', '2014-04-14', 'male'),
      ('${B_KID}', '${B}', 'B-1', 'Bablu Roy', 'active', '${u(52)}', '1', '2013-01-01', 'male'),
      ('${B_KID2}', '${B}', 'B-2', 'Charu Roy', 'active', '${u(52)}', '2', '2013-02-01', 'female');
    insert into parents (parent_id, school_id, name, phone, relation) values ('${u(41)}', '${A}', 'Ravi Singh', '9000000001', 'Father'), ('${u(42)}', '${B}', 'Bimal Roy', '9000000009', 'Father');
    insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${u(41)}', '${OWES}'), ('${A}', '${u(41)}', '${WAIVED}'), ('${A}', '${u(41)}', '${PAID_OLD}'), ('${A}', '${u(41)}', '${CLEAN}'), ('${B}', '${u(42)}', '${B_KID}'), ('${B}', '${u(42)}', '${B_KID2}');
    -- Asha owes 4,500. Bina's only fee was waived (stored as waived, with its amount). Chetan's fee was stored as paid
    -- before payments were kept (no payment row). Dev owes nothing.
    insert into fees_ledger (school_id, student_id, amount_minor, due_date, status) values
      ('${A}', '${OWES}', 450000, '2026-07-10', 'overdue'), ('${A}', '${WAIVED}', 300000, '2026-07-10', 'waived'), ('${A}', '${PAID_OLD}', 200000, '2026-07-10', 'paid');
  `);
}, 120_000);
afterAll(async () => db?.stop());

describe('A2: a waived fee is not owed, in feeClearance() and in the trigger', () => {
  it('feeClearance reads the one sum, the fees summary’s own shape: a waived fee and a fee stored as paid owe nothing', async () => {
    const said = (s: string) => as(admin, (c) => feeClearance(c, A, s));
    expect(await said(OWES)).toMatchObject({ owedMinor: 450000, cleared: false });
    // On the old sum, Bina owed 3,000 (her waived fee) and Chetan 2,000 (a paid fee with no payment row): both were held.
    expect(await said(WAIVED)).toMatchObject({ owedMinor: 0, cleared: true });
    expect(await said(PAID_OLD)).toMatchObject({ owedMinor: 0, cleared: true });
    // The fees summary says the same: the waived fee is waived, not owed.
    const summary = await as(admin, (c) => loadFeesSummary(c, A));
    expect(summary).toMatchObject({ overdueMinor: 450000, waivedMinor: 300000 });
    expect((await as<{ rows: { n: string }[] }>(admin, (c) => c.query(`select public.student_owed_minor($1, $2) as n`, [A, WAIVED]))).rows[0].n).toBe(0);
  });

  it('the trigger issues a bonafide (clearance on) to the child whose only fee was waived: nothing owed', async () => {
    const id = issuedId(await issue(admin, 'bonafide', [WAIVED]));
    expect(await row(id)).toMatchObject({ clearance: 'nothing_owed', owed_minor: 0 });
    // Directly in the database too, whoever writes it (no waiver asked).
    await as(admin, (c) => c.query(`insert into certificates_issued (school_id, cert_type, student_id, issued_by, purpose, printed) values ($1, 'study', $2, $3, 'A bus pass', '{"studentName":"Chetan Das"}')`, [A, PAID_OLD, ADMIN]));
    expect((await db.pg.query(`select clearance, owed_minor from certificates_issued where student_id = $1 and cert_type = 'study'`, [PAID_OLD])).rows[0]).toEqual({ clearance: 'nothing_owed', owed_minor: 0 });
  });
});

describe('A1: fee clearance per certificate type, a setting the app and the trigger both read', () => {
  it('the defaults are one: off for the TC, on for the other three, in the settings, the rules and the database', async () => {
    const schema = settingsSchemaFor('documents')!;
    for (const ty of CERT_TYPES) {
      expect(schema.fields.find((f) => f.key === `clearance_${ty}`)?.default, ty).toBe(CLEARANCE_DEFAULTS[ty]);
      expect((await db.pg.query(`select public.certificate_needs_clearance($1, $2) as on`, [B, ty])).rows[0].on, ty).toBe(CLEARANCE_DEFAULTS[ty]);
    }
    expect(CLEARANCE_DEFAULTS).toEqual({ transfer: false, bonafide: true, character: true, study: true });
    // The screen says, in both languages, that the TC rule differs by state and the school switches it knowingly.
    expect(E['set.documents.clearance_transfer.help']).toMatch(/differs from state to state/);
    expect(E['set.documents.clearance_transfer.help']).toMatch(/knowingly/);
    expect(H['set.documents.clearance_transfer.help']).toMatch(/राज्य/);
    expect(E['crt.clearance.tcNote']).toMatch(/differs from state to state/);
    expect(await as(admin, (c) => certificateHome(c, actor(admin), TODAY))).toMatchObject({ clearance: { transfer: false, bonafide: true, character: true, study: true } });
  });

  it('by default a TC is issued to a child who owes, recording “not asked” and what was owed; a bonafide is held', async () => {
    const roster = await as(admin, (c) => certificateRoster(c, actor(admin), CLASS_A, 'transfer'));
    expect(roster!.find((k) => k.student_id === OWES)).toMatchObject({ owed_minor: 450000, cleared: true, cleared_by: 'not_required' });
    // A waiver sent anyway (main's screen still offers one) is not kept.
    const tc = issuedId(await issue(principal, 'transfer', [OWES], { [OWES]: 'Not needed' }));
    expect(await row(tc)).toMatchObject({ clearance: 'not_required', owed_minor: 450000, waiver_reason: null, waived_by: null });
    expect((await as(admin, (c) => certificateRegister(c, actor(admin), { type: 'transfer' })))![0]).toMatchObject({ clearance: 'not_required', owed_minor: 450000 });
    expect(await issue(admin, 'bonafide', [OWES])).toMatchObject({ ok: true, issued: [], held: [{ studentId: OWES, owedMinor: 450000 }] });
    await expect(as(admin, (c) => c.query(`insert into certificates_issued (school_id, cert_type, student_id, issued_by, purpose, printed) values ($1, 'bonafide', $2, $3, 'Bank', '{}')`, [A, OWES, ADMIN]))).rejects.toThrow(/fees are owed/);
  });

  it('switched knowingly in Settings (audited), the app and the trigger follow at once', async () => {
    expect(await setting(tara, { clearance_transfer: true })).toMatchObject({ ok: false, reason: 'forbidden' });
    expect(await setting(principal, { clearance_transfer: true, clearance_bonafide: false })).toMatchObject({ ok: true });
    expect((await db.pg.query(`select after_state from audit_log where event_action = 'settings.changed' and target_id = 'documents' order by audit_id desc limit 1`)).rows[0].after_state).toEqual({ keys: ['clearance_transfer', 'clearance_bonafide'], revision: 1 });
    // The TC is held now (the first one is withdrawn so a second is no duplicate).
    await as(principal, (c) => c.query(`update certificates_issued set withdrawn_at = now(), withdrawn_by = $1, withdraw_reason = 'Issued again' where student_id = $2 and cert_type = 'transfer'`, [PRINCIPAL, OWES]));
    expect((await as(admin, (c) => certificateRoster(c, actor(admin), CLASS_A, 'transfer')))!.find((k) => k.student_id === OWES)).toMatchObject({ cleared: false, cleared_by: null });
    expect(await issue(admin, 'transfer', [OWES])).toMatchObject({ ok: true, issued: [], held: [{ studentId: OWES }] });
    await expect(as(admin, (c) => c.query(`insert into certificates_issued (school_id, cert_type, student_id, issued_by, printed) values ($1, 'transfer', $2, $3, '{}')`, [A, OWES, ADMIN]))).rejects.toThrow(/fees are owed/);
    // The bonafide is issued, the clearance not asked.
    const bc = issuedId(await issue(admin, 'bonafide', [OWES]));
    expect(await row(bc)).toMatchObject({ clearance: 'not_required', owed_minor: 450000 });
    expect((await db.pg.query(`select public.certificate_needs_clearance($1, 'transfer') as t, public.certificate_needs_clearance($1, 'bonafide') as b`, [A])).rows[0]).toEqual({ t: true, b: false });
    // Back to the defaults for the rest of this file.
    expect(await setting(principal, { clearance_transfer: false, clearance_bonafide: true })).toMatchObject({ ok: true });
  });
});

describe('A3: a prefix and a starting number per school, set once', () => {
  it('the rules: the prefix is short letters, digits or hyphens, never an Aadhaar number; the start is a whole number', () => {
    expect(readNumbering({ prefix: ' SVM-26 ', startAt: 346 })).toEqual({ ok: true, value: { prefix: 'SVM-26', startAt: 346 } });
    expect(readNumbering({ prefix: '', startAt: '12' })).toEqual({ ok: true, value: { prefix: null, startAt: 12 } });
    expect(readNumbering({ prefix: 'SVM/26', startAt: 1 })).toEqual({ ok: false, reason: 'prefix' });
    expect(readNumbering({ prefix: 'ABCDEFGHIJKLM', startAt: 1 })).toEqual({ ok: false, reason: 'prefix' });
    expect(readNumbering({ prefix: '123456789012', startAt: 1 })).toEqual({ ok: false, reason: 'aadhaar' });
    expect(readNumbering({ prefix: null, startAt: 0 })).toEqual({ ok: false, reason: 'start' });
    expect(readNumbering({ prefix: null, startAt: 2.5 })).toEqual({ ok: false, reason: 'start' });
    expect(readNumbering({ prefix: null, startAt: 1_000_000 })).toEqual({ ok: false, reason: 'start' });
    expect(certificateNumber('transfer', 346, 'SVM')).toBe('SVM/TC/0346');
    expect(certificateNumber('study', 12345)).toBe('SC/12345');
    expect(nextSeq(5, { prefix: 'X', startAt: 346 })).toBe(346);
    expect(nextSeq(400, { prefix: 'X', startAt: 346 })).toBe(401);
    expect(nextSeq(0, null)).toBe(1);
  });

  it('set by the office, changeable until the first certificate under it, then fixed by the database; earlier numbers kept', async () => {
    const before = (await db.pg.query(`select number from certificates_issued where school_id = $1 order by issued_at`, [A])).rows.map((r: { number: string }) => r.number);
    expect(before).toEqual(['BC/0001', 'SC/0001', 'TC/0001', 'BC/0002']);
    expect(await as(tara, (c) => setNumbering(c, actor(tara), { prefix: 'SVM', startAt: 346 }))).toEqual({ ok: false, reason: 'not_allowed' });
    expect((await as<{ rows: unknown[] }>(tara, (c) => c.query(`select * from certificate_numbering`))).rows).toEqual([]);
    const first = await as(admin, (c) => setNumbering(c, actor(admin), { prefix: 'SVM', startAt: 300 }));
    expect(first).toMatchObject({ ok: true, numbering: { prefix: 'SVM', startAt: 300, set: true, fixed: false, setBy: 'Asif Admin', next: { transfer: 'SVM/TC/0300', bonafide: 'SVM/BC/0300' } } });
    // Changed before any certificate under it: allowed, and the same again is nothing to save.
    expect(await as(principal, (c) => setNumbering(c, actor(principal), { prefix: 'SVM', startAt: 346 }))).toMatchObject({ ok: true, numbering: { next: { transfer: 'SVM/TC/0346' } } });
    expect(await as(principal, (c) => setNumbering(c, actor(principal), { prefix: 'SVM', startAt: 346 }))).toEqual({ ok: false, reason: 'unchanged' });
    const tc = issuedId(await issue(admin, 'transfer', [CLEAN]));
    expect(await row(tc)).toMatchObject({ number: 'SVM/TC/0346', seq: 346, numbering_revision: 2 });
    const bc = issuedId(await issue(admin, 'bonafide', [CLEAN]));
    expect((await row(bc)).number).toBe('SVM/BC/0346');
    const bc2 = issuedId(await issue(admin, 'bonafide', [CLEAN], {}, { purpose: 'A scholarship form' }));
    expect((await row(bc2)).number).toBe('SVM/BC/0347'); // gap-free within the series
    // Fixed now: by the app, and by the database whoever writes it.
    expect(await as(principal, (c) => setNumbering(c, actor(principal), { prefix: 'NEW', startAt: 1 }))).toEqual({ ok: false, reason: 'fixed' });
    await expect(as(principal, (c) => c.query(`update certificate_numbering set start_at = 1, set_by = $1 where school_id = $2`, [PRINCIPAL, A]))).rejects.toThrow(/numbering is fixed/);
    expect((await as(admin, (c) => numberingOf(c, A)))).toMatchObject({ fixed: true, next: { transfer: 'SVM/TC/0347', study: 'SVM/SC/0346' } });
    // Every number given before keeps its form; nothing is computed again.
    const after = (await db.pg.query(`select number from certificates_issued where school_id = $1 order by issued_at`, [A])).rows.map((r: { number: string }) => r.number);
    expect(after.slice(0, 4)).toEqual(before);
    await expect(as(principal, (c) => c.query(`update certificates_issued set number = 'SVM/TC/0001' where certificate_id = $1`, [tc]))).rejects.toThrow(/never changes/);
    // Audited with the revision and the start, never the prefix's words.
    const audit = (await db.pg.query(`select actor_user_id, after_state from audit_log where event_action = 'certificate.numbering_set' order by audit_id`)).rows;
    expect(audit.map((r: { after_state: unknown }) => r.after_state)).toEqual([{ revision: 1, startAt: 300, withPrefix: true }, { revision: 2, startAt: 346, withPrefix: true }]);
    expect(JSON.stringify(audit)).not.toContain('SVM');
  });

  it('numbers never go back: a start below what a type has already reached continues from its last number', async () => {
    for (const kid of [B_KID, B_KID2]) issuedId(await issue(bPrincipal, 'study', [kid], {}, { purpose: `Form ${kid.slice(-2)}` }));
    issuedId(await issue(bPrincipal, 'study', [B_KID], {}, { purpose: 'A third form' }));
    expect(await as(bPrincipal, (c) => setNumbering(c, actor(bPrincipal), { prefix: null, startAt: 2 }))).toMatchObject({ ok: true, numbering: { next: { study: 'SC/0004', transfer: 'TC/0002' } } });
    const next = issuedId(await issue(bPrincipal, 'study', [B_KID2], {}, { purpose: 'A fourth form' }));
    expect((await row(next)).number).toBe('SC/0004');
    const seqs = (await db.pg.query(`select seq from certificates_issued where school_id = $1 and cert_type = 'study' order by seq`, [B])).rows.map((r: { seq: number }) => r.seq);
    expect(seqs).toEqual([1, 2, 3, 4]);
    // Another school's numbering is not this one's.
    expect((await as<{ rows: unknown[] }>(bPrincipal, (c) => c.query(`select * from certificate_numbering where school_id = $1`, [A]))).rows).toEqual([]);
    await expect(as(bPrincipal, (c) => c.query(`insert into certificate_numbering (school_id, prefix, start_at, set_by) values ($1, 'X', 5, $2)`, [A, B_PRINCIPAL]))).rejects.toThrow();
  });
});

describe('A4: a certificate carries the signature of the person who signed it', () => {
  it('the principal names a school admin; the admin then signs their own certificates with their own signature', async () => {
    const files = new MemoryFileStorage();
    let n = 0;
    const id = () => `c2000000-0000-4000-8000-0000000009${String(++n).padStart(2, '0')}`;
    expect(await as(principal, (c) => saveMark(c, files, actor(principal), 'signature', png(400, 100), id))).toEqual({ ok: true });
    // Not named: no signature, no signed certificate; the caller never chooses who signed.
    expect(await as(admin, (c) => saveMark(c, files, actor(admin), 'signature', png(300, 100), id))).toEqual({ ok: false, reason: 'not_allowed' });
    await as(admin, (c) => c.query(`insert into certificates_issued (school_id, cert_type, student_id, issued_by, signed_by, purpose, printed) values ($1, 'study', $2, $3, $4, 'A form', '{"signName":"Priya Principal"}')`, [A, CLEAN, ADMIN, PRINCIPAL]));
    const forged = (await db.pg.query(`select signed_by, printed from certificates_issued where student_id = $1 and cert_type = 'study' and purpose = 'A form'`, [CLEAN])).rows[0];
    expect(forged.signed_by).toBeNull();
    expect(forged.printed).toEqual({ signTitle: 'Principal' });
    // Only the principal names, and only a school admin of the school.
    expect(await as(admin, (c) => nameSignatory(c, files, actor(admin), ADMIN, true))).toEqual({ ok: false, reason: 'not_allowed' });
    await expect(as(admin, (c) => c.query(`insert into certificate_signatories (school_id, user_id, named_by) values ($1, $2, $2)`, [A, ADMIN]))).rejects.toThrow(/row-level security|only the principal/);
    expect(await as(principal, (c) => nameSignatory(c, files, actor(principal), TARA, true))).toEqual({ ok: false, reason: 'not_admin' });
    await expect(as(principal, (c) => c.query(`insert into certificate_signatories (school_id, user_id, named_by) values ($1, $2, $3)`, [A, TARA, PRINCIPAL]))).rejects.toThrow(/a signatory is a school admin/);
    expect(await as(principal, (c) => nameSignatory(c, files, actor(principal), ADMIN, true))).toEqual({ ok: true });
    expect((await as(admin, (c) => certificateHome(c, actor(admin), TODAY)))?.signing).toEqual({ iSign: true, mySignature: false, principal: false, signers: null });
    expect(await as(admin, (c) => saveMark(c, files, actor(admin), 'signature', png(300, 100), id))).toEqual({ ok: true });
    const mine = issuedId(await issue(admin, 'character', [CLEAN]));
    expect(await row(mine)).toMatchObject({ signed_by: ADMIN, printed: { signName: 'Asif Admin', signTitle: 'School Administrator' } });
    const other = issuedId(await issue(admin2, 'character', [WAIVED])); // a school admin not named
    expect(await row(other)).toMatchObject({ signed_by: null, printed: { signTitle: 'Principal' } });
    const drawn = await as(admin, (c) => markImages(c, A, storedReader(files), [mine, other]));
    expect(Object.keys(drawn.signatures ?? {})).toEqual([mine]);
    expect(drawn.signatures?.[mine]?.aspect).toBe(3); // the admin's own, never the principal's (4)
    expect((await as(principal, (c) => certificateHome(c, actor(principal), TODAY)))?.signing.signers).toEqual([
      { user_id: ADMIN, name: 'Asif Admin', named: true, hasSignature: true },
      { user_id: ADMIN2, name: 'Bela Admin', named: false, hasSignature: false },
    ]);
    expect((await as(admin, (c) => certificateRegister(c, actor(admin), { type: 'character' })))!.map((r) => [r.number, r.signed_by])).toEqual([['SVM/CC/0347', null], ['SVM/CC/0346', 'Asif Admin']]);
    // Un-named: the admin's signature goes with it (the row, and the file), and their next certificate is unsigned.
    const adminKey = (await db.pg.query(`select storage_key from certificate_signatures where user_id = $1`, [ADMIN])).rows[0].storage_key;
    expect(await as(principal, (c) => nameSignatory(c, files, actor(principal), ADMIN, false))).toEqual({ ok: true });
    expect((await db.pg.query(`select count(*)::int as n from certificate_signatures where user_id = $1`, [ADMIN])).rows[0].n).toBe(0);
    expect(files.files.has(adminKey)).toBe(false);
    const later = issuedId(await issue(admin, 'character', [CLEAN], {}, { period: '2019-20 to 2025-26', conduct: 'Good', purpose: 'A sports trial' }));
    expect((await row(later)).signed_by).toBeNull();
    await expect(as(principal, (c) => c.query(`update certificates_issued set signed_by = $1 where certificate_id = $2`, [PRINCIPAL, later]))).rejects.toThrow(/never changes/);
    // The audit rows name people by id only.
    const audit = (await db.pg.query(`select event_action, after_state from audit_log where event_action like 'certificate.signatory_%' order by audit_id`)).rows;
    expect(audit).toEqual([{ event_action: 'certificate.signatory_named', after_state: { userId: ADMIN } }, { event_action: 'certificate.signatory_unnamed', after_state: { userId: ADMIN, signatureRemoved: true } }]);
  });

  it('the principal’s signature kept the C228 way goes with the principal’s first change of it', async () => {
    const files = new MemoryFileStorage();
    const legacy = `${B}/certificate-marks/signature/legacy.png`;
    await files.put(legacy, png(200, 100), 'image/png');
    await as(bPrincipal, (c) => c.query(`insert into certificate_marks (school_id, kind, storage_key, size_bytes, aspect, uploaded_by) values ($1, 'signature', $2, 64, 2, $3)`, [B, legacy, B_PRINCIPAL]));
    expect(await as(bPrincipal, (c) => saveMark(c, files, actor(bPrincipal), 'signature', png(400, 100), () => 'c2000000-0000-4000-8000-000000000999'))).toEqual({ ok: true });
    expect((await db.pg.query(`select count(*)::int as n from certificate_marks where school_id = $1 and kind = 'signature'`, [B])).rows[0].n).toBe(0);
    expect(files.files.has(legacy)).toBe(false);
  });

  it('a teacher reads and writes nothing of the signatories, the signatures or the numbering', async () => {
    for (const table of ['certificate_signatories', 'certificate_signatures', 'certificate_numbering']) {
      expect((await as<{ rows: { n: number }[] }>(tara, (c) => c.query(`select count(*)::int as n from ${table}`))).rows[0].n, table).toBe(0);
    }
    await expect(as(tara, (c) => c.query(`insert into certificate_signatures (school_id, user_id, storage_key, size_bytes, aspect) values ($1, $2, $3, 10, 1)`, [A, TARA, `${A}/certificate-marks/signature/t.png`]))).rejects.toThrow();
  });
});

describe('A5: Control never shows a family’s certificate link', () => {
  const key = 'abcdefghijABCDEFGHIJ0123456789_-';
  it('a link keeps its domain and “…”; the key never shows', () => {
    expect(copyLinkUrl(key)).toBe(`https://netcyberai.com${COPY_PATH}${key}`);
    expect(maskLinks(`Parameter value ${copyLinkUrl(key)} is not valid`)).toBe('Parameter value netcyberai.com/… is not valid');
    expect(maskLinks(`netcyberai.com${COPY_PATH}${key}`)).toBe('netcyberai.com/…');
    expect(maskLinks(`path ${COPY_PATH}${key} refused`)).toBe(`path ${COPY_PATH}… refused`);
    for (const text of [`Meta answered 400 (code 132000): Parameter value ${copyLinkUrl(key)} is not valid`, `link=${copyLinkUrl(key)}`, `the link (${copyLinkUrl(key)}) failed`, `${COPY_PATH}${key}`]) {
      const cut = cutContacts(text)!;
      expect(cut, text).not.toContain(key);
      expect(cut, text).not.toContain(key.slice(0, 10));
    }
    expect(cutContacts(`Meta answered 400 (code 132000): Parameter value ${copyLinkUrl(key)} is not valid`)).toBe('Meta answered 400 (code 132000): Parameter value netcyberai.com/… is not valid');
    // The texts Control already showed are unchanged.
    expect(cutContacts(`current time falls within this school's quiet hours (21:00:00-07:00:00 Asia/Kolkata)`)).toBe(`current time falls within this school's quiet hours (21:00:00-07:00:00 Asia/Kolkata)`);
    expect(cutContacts('fees.nightly: 2 school(s) not done')).toBe('fees.nightly: 2 school(s) not done');
  });

  it('on Control’s monitoring page, a failed certificate message’s reason and a job’s error show no key', async () => {
    await db.pg.query(
      `insert into communication_log (school_id, to_phone, channel, template_name, billing_category, billable, est_cost_paise, gst_paise, cost_basis, status, dedupe_key, provider_used, purpose, provider, template_params, failure_code, reason, created_at)
       values ($1, '+919000000001', 'whatsapp', 'certificate_issued', 'utility', false, 0, 0, 'not_billable', 'failed', 'certificate:closeout:1', 'platform_default', 'operational_communication', 'meta', $2, '132000', $3, now() - interval '1 hour')`,
      [A, JSON.stringify({ child: 'Asha Singh', link: copyLinkUrl(key) }), `Meta answered 400 (code 132000): Parameter value ${copyLinkUrl(key)} is not valid`]
    );
    await db.pg.query(`insert into jobs (type, idempotency_key, status, attempts, max_attempts, last_error) values ('whatsapp.send', 'closeout-job', 'dead', 3, 3, $1)`, [`send failed: ${copyLinkUrl(key)}`]);
    const m = await platform((c) => loadMonitoring(c));
    const seen = JSON.stringify(m);
    expect(seen).not.toContain(key);
    expect(seen).toContain('netcyberai.com/…');
  });
});

describe('the certificate drawing uses the signature the database chose', () => {
  it('certDocFor draws the certificate’s own signature, and none for another', () => {
    const sig = { src: 'data:image/png;base64,', aspect: 3 };
    const base = { type: 'study' as const, number: 'SC/0001', issuedOn: '2026-10-15', token: 'abcdefghijABCDEFGHIJ0123456789_-', printed: { schoolName: 'School A', studentName: 'Dev Mehta' } };
    const marks = { signatures: { mine: sig } };
    expect(certDocFor({ ...base, certificateId: 'mine' }, marks).images.signature?.aspect).toBe(3);
    expect(certDocFor({ ...base, certificateId: 'other' }, marks).images.signature).toBeUndefined();
  });
});
