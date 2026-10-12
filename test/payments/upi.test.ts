import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createPaymentLink } from '@/lib/fees/family';
import { getReceipt, reconcile } from '@/lib/fees/payments';
import { linkForPayer } from '@/lib/payments/apply';
import { setDirectUpi, setMethod } from '@/lib/payments/methods';
import { REFERENCE_ALPHABET, newReferenceCode, readUpiSettings, reportUtr, upiForPayer, upiSettingsProblem, upiUri, verifyReport, waitingReports } from '@/lib/payments/upi';

// Direct UPI, the parent's side and the school's one-by-one check
// (docs/24 §3.3, §3.4 path A, C174). The rule under test: what a parent
// says is never proof. Only a named verifier of the school, saying what
// they saw in the school's own bank, credits a payment.

describe('the reference code and the UPI link', () => {
  it('eight characters with no look-alikes', () => {
    expect(REFERENCE_ALPHABET).not.toMatch(/[ILO01]/);
    for (let i = 0; i < 200; i += 1) expect(newReferenceCode()).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(new Set(Array.from({ length: 200 }, newReferenceCode)).size).toBe(200);
  });
  it('upi://pay carries pa, pn, am, cu, tn and tr; the amount to the paisa; the reference as note and reference', () => {
    const uri = upiUri({ upiId: 'school.fees@okbank', payeeName: 'Illustrative Public School', amountMinor: 230050, referenceCode: '7K3Q9MPD' });
    expect(uri.startsWith('upi://pay?')).toBe(true);
    expect(Object.fromEntries(new URLSearchParams(uri.slice('upi://pay?'.length)))).toEqual({ pa: 'school.fees@okbank', pn: 'Illustrative Public School', am: '2300.50', cu: 'INR', tn: 'NCA-7K3Q9MPD', tr: 'NCA-7K3Q9MPD' });
    expect(new URLSearchParams(upiUri({ upiId: 'a@b', payeeName: 'A & B School', amountMinor: 5, referenceCode: 'ABCDEFGH' }).split('?')[1]).get('am')).toBe('0.05');
  });
  it('the set-up must be complete and well formed before the method can be on', () => {
    const good = readUpiSettings({ upiId: 'school.fees@okbank', payeeName: 'Illustrative Public School', bankName: 'An Example Bank', accountLast4: '4821', ifsc: 'EXMP0001234', verifiers: ['accountant', 'principal'], principalLimitMinor: 1000000, notify: 'each' });
    expect(upiSettingsProblem(good)).toBeNull();
    expect(upiSettingsProblem({ ...good, upiId: '9876543210' })).toBe('upi_id');
    expect(upiSettingsProblem({ ...good, payeeName: ' ' })).toBe('payee');
    expect(upiSettingsProblem({ ...good, accountLast4: '48211' })).toBe('last4');
    expect(upiSettingsProblem({ ...good, ifsc: 'EXMP1001234' })).toBe('ifsc');
    // Nobody chosen falls back to the default: the accountant and the principal. An unknown role is dropped.
    expect(readUpiSettings({ verifiers: ['teacher'] }).verifiers).toEqual(['accountant', 'principal']);
    expect(readUpiSettings({}).notify).toBe('digest');
  });
});

const A = 'a5000000-0000-4000-8000-000000000001';
const B = 'a5000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'a5000000-0000-4000-8000-0000000000a1';
const ACCOUNTANT = 'a5000000-0000-4000-8000-0000000000a2';
const ADMIN = 'a5000000-0000-4000-8000-0000000000a4';
const TEACHER = 'a5000000-0000-4000-8000-0000000000a3';
const PRINCIPAL_B = 'a5000000-0000-4000-8000-0000000000b1';
const FAMILY = 'a5000000-0000-4000-8000-0000000000d1';
const ASHA = 'a5000000-0000-4000-8000-000000500001';
const BILAL = 'a5000000-0000-4000-8000-000000500002';
const CHITRA = 'a5000000-0000-4000-8000-000000500003';
const OTHER = 'a5000000-0000-4000-8000-000000500009';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const principal: Who = { role: 'principal', user: PRINCIPAL, school: A };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const admin: Who = { role: 'school_admin', user: ADMIN, school: A };
const teacher: Who = { role: 'teacher', user: TEACHER, school: A };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (who: Who, fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// The parent has no account: the payer's page works as the platform role, by the link's token.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const parent = (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const SETUP = { upiId: 'school.fees@okbank', payeeName: 'School A', bankName: 'An Example Bank', accountLast4: '4821', ifsc: 'EXMP0001234', verifiers: ['accountant', 'principal'], principalLimitMinor: 1000000, notify: 'each' };
const link = async (student: string, who: Who = accountant) => {
  const r = await as(who, (c) => createPaymentLink(c, actor(who), { studentId: student, amountMinor: null }));
  expect(r).toMatchObject({ ok: true });
  return r.link as { linkId: string; token: string; amountMinor: number };
};
const money = async (school = A) => (await db.pg.query(`select (select count(*)::int from receipts where school_id = $1) as receipts, (select coalesce(sum(amount_minor), 0)::int from payments where school_id = $1) as credited`, [school])).rows[0];
const reportId = async (utr: string) => (await db.pg.query(`select report_id from payment_reports where school_id = $1 and utr = $2`, [A, utr])).rows[0].report_id as string;
const found = (who: Who, utr: string, amountSeenMinor: number, checked = true) => reportId(utr).then((id) => as(who, (c) => verifyReport(c, actor(who), id, { action: 'found', amountSeenMinor, checked })));

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Priya Principal'), ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Anil Accountant'), ('${ADMIN}', '${A}', 'ad@a.invalid', 'school_admin', 'Admin A'),
        ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Teacher A'), ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Principal B');
      insert into families (family_id, school_id, family_code, created_by) values ('${FAMILY}', '${A}', 'FAM-1', '${PRINCIPAL}');
      insert into students (student_id, school_id, admission_no, name, family_id) values ('${ASHA}', '${A}', 'A-1', 'Asha', '${FAMILY}'), ('${BILAL}', '${A}', 'A-2', 'Bilal', '${FAMILY}'), ('${CHITRA}', '${A}', 'A-3', 'Chitra', null), ('${OTHER}', '${B}', 'B-1', 'Other', null);
      alter table students disable trigger user; update students set status = 'active' where student_id <> '${BILAL}'; alter table students enable trigger user;
      insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ('${A}', '${ASHA}', 150050, '2026-04-10'), ('${A}', '${BILAL}', 80000, '2026-04-10'), ('${A}', '${CHITRA}', 1500000, '2026-04-10'), ('${B}', '${OTHER}', 99900, '2026-04-10');
    `);
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  let family: { linkId: string; token: string; amountMinor: number };

  it('direct UPI is off until the school gives its own UPI ID and account, and only the office sets it', async () => {
    family = await link(ASHA);
    expect(family.amountMinor).toBe(230050); // Asha and her brother Bilal (still waiting for consent)
    expect(await parent((c) => upiForPayer(c, family.token))).toBeNull();
    expect(await parent((c) => reportUtr(c, family.token, '412345678901'))).toEqual({ ok: false, reason: 'not_offered' });
    expect(await as(accountant, (c) => setDirectUpi(c, actor(accountant), { enabled: true, settings: SETUP }))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => setDirectUpi(c, actor(principal), { enabled: true, settings: { ...SETUP, upiId: 'not a upi id' } }))).toEqual({ ok: false, reason: 'upi_id' });
    expect(await as(principal, (c) => setMethod(c, actor(principal), { method: 'direct_upi', enabled: true, sortOrder: 1 }, async () => true))).toEqual({ ok: false, reason: 'method' }); // never on without its set-up
    expect(await as(principal, (c) => setDirectUpi(c, actor(principal), { enabled: true, settings: SETUP }))).toEqual({ ok: true });
  });

  it('the payer’s page gets the school’s UPI ID, the reference and the link; nothing about a child', async () => {
    const upi = await parent((c) => upiForPayer(c, family.token));
    expect(upi).toMatchObject({ payeeName: 'School A', upiId: 'school.fees@okbank', report: 'none' });
    expect(upi.reference).toMatch(/^NCA-[A-HJKMNP-Z2-9]{8}$/);
    expect(Object.fromEntries(new URLSearchParams(upi.uri.split('?')[1]))).toEqual({ pa: 'school.fees@okbank', pn: 'School A', am: '2300.50', cu: 'INR', tn: upi.reference, tr: upi.reference });
    expect(Object.keys(upi).sort()).toEqual(['payeeName', 'reference', 'report', 'upiId', 'uri']);
    expect(await parent((c) => upiForPayer(c, 'x'.repeat(43)))).toBeNull();
  });

  it('the parent enters the UTR: 12 digits; it is a claim, so NOTHING is credited and the page says it is being verified', async () => {
    for (const bad of ['', '12345', '1234567890123', '41234567890a', 'UTR412345678901']) expect(await parent((c) => reportUtr(c, family.token, bad)), bad).toEqual({ ok: false, reason: 'utr' });
    expect(await parent((c) => reportUtr(c, family.token, '4123 4567 8901'))).toEqual({ ok: true }); // spaces as the app shows them
    expect(await money()).toEqual({ receipts: 0, credited: 0 });
    expect((await parent((c) => upiForPayer(c, family.token))).report).toBe('being_verified');
    expect(await parent((c) => linkForPayer(c, family.token))).toMatchObject({ state: 'open', receiptNo: null }); // never "paid" from a report
    expect(await parent((c) => reportUtr(c, family.token, '499999999999'))).toEqual({ ok: false, reason: 'already_reported' });
    expect((await db.pg.query(`select count(*)::int as n from payment_evidence`)).rows[0].n).toBe(0);
  });

  it('a UTR is used once in a school: another family entering the same one is refused at once', async () => {
    const chitra = await link(CHITRA);
    expect(await parent((c) => reportUtr(c, chitra.token, '412345678901'))).toEqual({ ok: false, reason: 'utr_used' });
    // Another school is another matter: the same digits there are that school's own.
    await db.pg.query(`insert into payment_methods (school_id, method, enabled, settings, updated_by) values ($1, 'direct_upi', true, $2, $3)`, [B, JSON.stringify({ ...SETUP, upiId: 'other@okbank' }), PRINCIPAL_B]);
    const other = (await as(principalB, (c) => createPaymentLink(c, actor(principalB), { studentId: OTHER, amountMinor: null }))).link;
    expect(await parent((c) => reportUtr(c, other.token, '412345678901'))).toEqual({ ok: true });
  });

  it('the school sees who reported what; a teacher and another school see nothing', async () => {
    const waiting = await as(accountant, (c) => waitingReports(c, A));
    expect(waiting.map((r: { payer: string; utr: string; amount_minor: number; status: string }) => [r.payer, r.utr, r.amount_minor, r.status])).toEqual([['FAM-1 · Asha', '412345678901', 230050, 'reported']]);
    expect(waiting[0].reference).toMatch(/^NCA-/);
    expect(await as(teacher, (c) => waitingReports(c, A))).toEqual([]);
    expect((await as(principalB, (c) => waitingReports(c, B))).length).toBe(1);
    const id = await reportId('412345678901');
    expect(await as(teacher, (c) => verifyReport(c, actor(teacher), id, { action: 'not_found' }))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(admin, (c) => verifyReport(c, actor(admin), id, { action: 'not_found' }))).toEqual({ ok: false, reason: 'not_allowed' }); // not among this school's verifiers
    expect(await as(principalB, (c) => verifyReport(c, actor(principalB), id, { action: 'not_found' }))).toEqual({ ok: false, reason: 'not_found' });
  });

  it('"Found in bank" needs the tick and the amount seen; then ONE receipt, in the verifier’s name, through the evidence table', async () => {
    expect(await found(accountant, '412345678901', 230050, false)).toEqual({ ok: false, reason: 'not_checked' });
    expect(await found(accountant, '412345678901', 0)).toEqual({ ok: false, reason: 'amount' });
    const done = await found(accountant, '412345678901', 230050);
    expect(done).toMatchObject({ ok: true, state: 'verified', credit: { outcome: 'applied', appliedMinor: 230050 } });
    expect(await money()).toEqual({ receipts: 1, credited: 230050 });
    const receipt = await as(accountant, (c) => getReceipt(c, A, done.credit.receiptId));
    expect(receipt).toMatchObject({ method: 'upi', total_minor: 230050, issued_by_name: 'Anil Accountant', reference: 'UTR 412345678901', family_code: 'FAM-1' });
    // The brother still waiting for consent is credited too: the school's own role sees the whole family's dues.
    expect(receipt.lines.map((l: { student_name: string; amount_minor: number }) => [l.student_name, l.amount_minor]).sort()).toEqual([['Asha', 150050], ['Bilal', 80000]]);
    expect((await db.pg.query(`select v.source, v.external_id, v.rule, v.decided_by, v.mode, v.applied_minor::int as applied, r.status, r.decided_by as report_by, r.amount_seen_minor::int as seen from payment_evidence v join payment_reports r on r.evidence_id = v.evidence_id where v.school_id = $1`, [A])).rows).toEqual([{ source: 'school_confirmed', external_id: `${A}:412345678901`, rule: 'A', decided_by: ACCOUNTANT, mode: 'live', applied: 230050, status: 'verified', report_by: ACCOUNTANT, seen: 230050 }]);
    // The parent's page now says paid, with the receipt number.
    expect(await parent((c) => linkForPayer(c, family.token))).toMatchObject({ state: 'paid', receiptNo: receipt.receipt_no });
    expect((await db.pg.query(`select actor_user_id, after_state->>'amountSeenMinor' as seen from audit_log where school_id = $1 and event_action = 'fees.upi_found_in_bank'`, [A])).rows).toEqual([{ actor_user_id: ACCOUNTANT, seen: '230050' }]);
    // Decided once: a second "found", or a "not found" afterwards, changes nothing.
    expect(await found(principal, '412345678901', 230050)).toEqual({ ok: false, reason: 'already_decided' });
    expect(await money()).toEqual({ receipts: 1, credited: 230050 });
    await expect(db.pg.query(`update payment_reports set status = 'not_found' where utr = '412345678901' and school_id = $1`, [A])).rejects.toThrow(/not decided again/);
    await expect(db.pg.query(`update payment_reports set utr = '400000000000' where utr = '412345678901' and school_id = $1`, [A])).rejects.toThrow(/never edited/);
  });

  it('above the school’s limit the accountant’s check is not enough: it waits for the principal, and nothing is credited until then', async () => {
    const chitra = await link(CHITRA);
    expect(chitra.amountMinor).toBe(1500000); // 15,000: above the 10,000 limit
    expect(await parent((c) => reportUtr(c, chitra.token, '422222222222'))).toEqual({ ok: true });
    expect(await found(accountant, '422222222222', 1500000)).toEqual({ ok: true, state: 'awaiting_principal' });
    expect(await money()).toEqual({ receipts: 1, credited: 230050 });
    expect((await parent((c) => upiForPayer(c, chitra.token))).report).toBe('being_verified');
    expect((await as(principal, (c) => waitingReports(c, A))).map((r: { status: string; amount_seen_minor: number; checked_by_name: string }) => [r.status, r.amount_seen_minor, r.checked_by_name])).toEqual([['awaiting_principal', 1500000, 'Anil Accountant']]);
    expect(await found(accountant, '422222222222', 1500000)).toEqual({ ok: false, reason: 'needs_principal' });
    expect(await reportId('422222222222').then((id) => as(accountant, (c) => verifyReport(c, actor(accountant), id, { action: 'not_found' })))).toEqual({ ok: false, reason: 'needs_principal' });
    const done = await found(principal, '422222222222', 1500000);
    expect(done).toMatchObject({ ok: true, state: 'verified', credit: { outcome: 'applied', appliedMinor: 1500000 } });
    expect((await db.pg.query(`select checked_by, decided_by from payment_reports where utr = '422222222222' and school_id = $1`, [A])).rows).toEqual([{ checked_by: ACCOUNTANT, decided_by: PRINCIPAL }]);
    // The principal, checking alone, does not need a second person.
  });

  it('"Not found" credits nothing, tells the parent politely, and lets them enter a corrected UTR', async () => {
    await db.pg.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ($1, $2, 50000, '2026-05-10')`, [A, CHITRA]);
    const next = await link(CHITRA);
    await parent((c) => reportUtr(c, next.token, '433333333333'));
    const before = await money();
    expect(await as(principal, async (c) => verifyReport(c, actor(principal), await reportIdIn(c, '433333333333'), { action: 'not_found' }))).toEqual({ ok: true, state: 'not_found' });
    expect(await money()).toEqual(before);
    expect((await parent((c) => upiForPayer(c, next.token))).report).toBe('not_found');
    expect(await parent((c) => linkForPayer(c, next.token))).toMatchObject({ state: 'open' });
    expect(await parent((c) => reportUtr(c, next.token, '433333333333'))).toEqual({ ok: false, reason: 'utr_used' }); // the same wrong one again
    expect(await parent((c) => reportUtr(c, next.token, '433333333334'))).toEqual({ ok: true });
    // The amount seen in the bank is what is credited: the parent paid 300 of 500. The rest stays owed.
    const part = await found(principal, '433333333334', 30000);
    expect(part).toMatchObject({ ok: true, state: 'verified', credit: { outcome: 'applied', reason: 'less_than_the_link', appliedMinor: 30000 } });
    expect((await as(accountant, (c) => reconcile(c, A))).problems).toEqual([]);
    expect((await as(accountant, (c) => reconcile(c, A))).balanceMinor).toBe(20000);
  });

  it('nothing is ever confirmed by time passing', async () => {
    const waitingLink = await link(CHITRA);
    await parent((c) => reportUtr(c, waitingLink.token, '444444444444'));
    await db.pg.exec(`set session_replication_role = replica; update payment_reports set reported_at = now() - interval '60 days' where utr = '444444444444'; set session_replication_role = origin;`);
    const before = await money();
    expect((await as(accountant, (c) => waitingReports(c, A))).map((r: { utr: string; status: string }) => [r.utr, r.status])).toEqual([['444444444444', 'reported']]);
    expect((await parent((c) => upiForPayer(c, waitingLink.token)))?.report ?? 'link closed').not.toBe('none');
    expect(await money()).toEqual(before);
    // No code path sets "verified" without a person: the database requires a named decider, an amount seen and evidence.
    await expect(db.pg.query(`update payment_reports set status = 'verified' where utr = '444444444444'`)).rejects.toThrow(/check/);
  });

  it('rights: a school role cannot write a report (only a parent’s page does), and cannot delete one', async () => {
    await expect(as(principal, (c) => c.query(`insert into payment_reports (school_id, link_id, utr, amount_minor) values ($1, $2, '455555555555', 100)`, [A, family.linkId]))).rejects.toThrow(/permission denied/);
    await expect(as(principal, (c) => c.query(`delete from payment_reports`))).rejects.toThrow(/permission denied/);
    expect((await as(teacher, (c) => c.query(`select 1 from payment_reports`))).rows).toEqual([]);
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reportIdIn = async (c: any, utr: string) => (await c.query(`select report_id from payment_reports where utr = $1`, [utr])).rows[0].report_id as string;
