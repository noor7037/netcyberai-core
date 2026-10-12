import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { cancelPaymentLink, createPaymentLink } from '@/lib/fees/family';
import { getReceipt, reconcile, takePayment } from '@/lib/fees/payments';
import { applyProviderEvent, handleNotice, linkForPayer, planCapture } from '@/lib/payments/apply';
import { STAND_IN_SIGNATURE_HEADER, configuredPaymentProvider, signStandIn, standInPaymentProvider } from '@/lib/payments/provider';

// Online payments on the stand-in provider (docs/23 6f, C169). The promise
// under test: a provider's notice is believed only if its signature holds,
// and money is credited exactly once, whatever arrives twice, late, out of
// order, short or over.

const SECRET = 'a-stand-in-secret-used-only-in-these-tests-0123456789';
const provider = standInPaymentProvider(SECRET);
const sig = (value: string | null) => (name: string) => (name === STAND_IN_SIGNATURE_HEADER ? value : null);
let n = 0;
const notice = (type: 'payment.captured' | 'payment.failed', order: string, payment: string, amount: number, id = `evt_${++n}`) => JSON.stringify({ id, type, order, payment, amount });

describe('the provider door', () => {
  const raw = notice('payment.captured', 'order_1', 'pay_1', 150050, 'evt_fixed');
  it('reads a notice only when its signature holds', () => {
    expect(provider.readNotice(raw, sig(signStandIn(SECRET, raw)))).toEqual({ eventId: 'evt_fixed', type: 'captured', providerRef: 'order_1', paymentId: 'pay_1', amountMinor: 150050 });
    expect(provider.readNotice(raw, sig(null))).toBeNull();
    expect(provider.readNotice(raw, sig('not-a-signature'))).toBeNull();
    expect(provider.readNotice(raw, sig(signStandIn('another-secret-another-secret-another-secret', raw)))).toBeNull();
    // The body changed after signing (the amount raised): the old signature no longer holds.
    expect(provider.readNotice(raw.replace('150050', '999999'), sig(signStandIn(SECRET, raw)))).toBeNull();
  });
  it('refuses a signed notice that is not well formed', () => {
    for (const bad of ['not json', JSON.stringify({ id: 'e', type: 'payment.refunded', order: 'o', payment: 'p', amount: 1 }), JSON.stringify({ id: 'e', type: 'payment.captured', order: 'o', payment: 'p', amount: 10.5 }), JSON.stringify({ id: 'e', type: 'payment.captured', order: 'o', payment: 'p', amount: -1 }), JSON.stringify({ type: 'payment.captured', order: 'o', payment: 'p', amount: 1 })])
      expect(provider.readNotice(bad, sig(signStandIn(SECRET, bad))), bad).toBeNull();
  });
  it('the stand-in is never the provider of a production build, and never without its own secret', () => {
    expect(configuredPaymentProvider({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'stand-in' }, SECRET)).toBeNull();
    expect(configuredPaymentProvider({ NODE_ENV: 'development', PAYMENT_PROVIDER: 'stand-in' }, 'short')).toBeNull();
    expect(configuredPaymentProvider({ NODE_ENV: 'development' }, SECRET)).toBeNull();
    expect(configuredPaymentProvider({ NODE_ENV: 'development', PAYMENT_PROVIDER: 'stand-in' }, SECRET)?.name).toBe('stand-in');
  });
});

describe('where a captured amount goes', () => {
  const lines = [{ feeId: 'a', lineMinor: 100000, balanceMinor: 100000 }, { feeId: 'b', lineMinor: 50000, balanceMinor: 50000 }];
  const others = [{ feeId: 'a', balanceMinor: 100000 }, { feeId: 'b', balanceMinor: 50000 }, { feeId: 'c', balanceMinor: 30000 }];
  it('exactly the link: its lines, nothing else', () => {
    expect(planCapture(150000, lines, others)).toEqual({ parts: [{ feeId: 'a', amountMinor: 100000 }, { feeId: 'b', amountMinor: 50000 }], unappliedMinor: 0 });
  });
  it('less than the link: the oldest line first, to the paisa', () => {
    expect(planCapture(100001, lines, others)).toEqual({ parts: [{ feeId: 'a', amountMinor: 100000 }, { feeId: 'b', amountMinor: 1 }], unappliedMinor: 0 });
  });
  it('more than the link: the family’s other dues next; what is still left is not credited to anything', () => {
    expect(planCapture(200000, lines, others)).toEqual({ parts: [{ feeId: 'a', amountMinor: 100000 }, { feeId: 'b', amountMinor: 50000 }, { feeId: 'c', amountMinor: 30000 }], unappliedMinor: 20000 });
  });
  it('a line partly paid at the counter meanwhile: never more than is still owed on any due', () => {
    const paidMeanwhile = [{ feeId: 'a', lineMinor: 100000, balanceMinor: 40000 }, { feeId: 'b', lineMinor: 50000, balanceMinor: 50000 }];
    const plan = planCapture(150000, paidMeanwhile, [{ feeId: 'a', balanceMinor: 40000 }, { feeId: 'b', balanceMinor: 50000 }]);
    expect(plan).toEqual({ parts: [{ feeId: 'a', amountMinor: 40000 }, { feeId: 'b', amountMinor: 50000 }], unappliedMinor: 60000 });
    for (const amount of [0, 1, 39999, 40000, 40001, 90000, 90001, 500000]) {
      const p = planCapture(amount, paidMeanwhile, [{ feeId: 'a', balanceMinor: 40000 }, { feeId: 'b', balanceMinor: 50000 }]);
      expect(p.parts.reduce((t, x) => t + x.amountMinor, 0) + p.unappliedMinor, String(amount)).toBe(amount);
      expect(p.parts.every((x) => x.amountMinor <= (x.feeId === 'a' ? 40000 : 50000))).toBe(true);
    }
  });
});

const A = 'f1000000-0000-4000-8000-000000000001';
const B = 'f1000000-0000-4000-8000-000000000002';
const PRINCIPAL = 'f1000000-0000-4000-8000-0000000000a1';
const ACCOUNTANT = 'f1000000-0000-4000-8000-0000000000a2';
const TEACHER = 'f1000000-0000-4000-8000-0000000000a3';
const PRINCIPAL_B = 'f1000000-0000-4000-8000-0000000000b1';
const C5 = 'f1000000-0000-4000-8000-0000000000c1';
const FAMILY = 'f1000000-0000-4000-8000-0000000000d1';
const ASHA = 'f1000000-0000-4000-8000-000000500001';
const BILAL = 'f1000000-0000-4000-8000-000000500002';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string; school: string };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT, school: A };
const teacher: Who = { role: 'teacher', user: TEACHER, school: A };
const principalB: Who = { role: 'principal', user: PRINCIPAL_B, school: B };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (who: Who, fn: (client: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', $1, true)`, [who.school]);
    await tx.query(`select set_config('app.current_role', $1, true)`, [who.role]);
    await tx.query(`select set_config('app.current_user_id', $1, true)`, [who.user]);
    return fn(tx);
  });
// A notice is applied as the platform role, in one transaction.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = (fn: (client: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const actor = (who: Who) => ({ schoolId: who.school, userId: who.user, role: who.role as never });
const send = (raw: string, signature: string | null = signStandIn(SECRET, raw)) => handleNotice(platform, provider, raw, (name) => (name === STAND_IN_SIGNATURE_HEADER ? signature : null));
const due = (student: string, amount: number, date: string) => db.pg.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ($1, $2, $3, $4)`, [A, student, amount, date]);
const makeLink = async (amountMinor: number | null = null) => {
  const r = await as(accountant, (c) => createPaymentLink(c, actor(accountant), { studentId: ASHA, amountMinor }, provider));
  expect(r).toMatchObject({ ok: true, created: true, link: { payable: true } });
  return { ...r.link, ref: `standin_order_${r.link.linkId}` } as { linkId: string; token: string; amountMinor: number; ref: string };
};
const money = async () => (await db.pg.query(`select (select count(*)::int from receipts where school_id = $1) as receipts, (select coalesce(sum(amount_minor), 0)::int from payments where school_id = $1) as credited, (select coalesce(sum(l.amount_minor), 0)::int from fees_ledger l where l.school_id = $1) - (select coalesce(sum(amount_minor), 0)::int from payments where school_id = $1) as owed`, [A])).rows[0];
const events = async () => (await db.pg.query(`select kind, outcome, reason, applied_minor::int as applied, unapplied_minor::int as unapplied from payment_events order by received_at, event_pk`)).rows;

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction) values ('${A}', 'School A', 'IN-HR'), ('${B}', 'School B', 'IN-DL');
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'p@a.invalid', 'principal', 'Principal A'), ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Accountant A'),
        ('${TEACHER}', '${A}', 't@a.invalid', 'teacher', 'Teacher A'), ('${PRINCIPAL_B}', '${B}', 'p@b.invalid', 'principal', 'Principal B');
      insert into classes (class_id, school_id, name) values ('${C5}', '${A}', '5-A');
      insert into families (family_id, school_id, family_code, created_by) values ('${FAMILY}', '${A}', 'FAM-1', '${PRINCIPAL}');
      insert into students (student_id, school_id, admission_no, name, class_id, family_id) values ('${ASHA}', '${A}', 'A-1', 'Asha', '${C5}', '${FAMILY}'), ('${BILAL}', '${A}', 'A-2', 'Bilal', '${C5}', '${FAMILY}');
      alter table students disable trigger user;
      update students set status = 'active';
      alter table students enable trigger user;
    `);
    // April: Asha 1,500.50 and Bilal 800.00. May: Asha 1,500.50. The family owes 3,801.00.
    await due(ASHA, 150050, '2026-04-10');
    await due(BILAL, 80000, '2026-04-10');
    await due(ASHA, 150050, '2026-05-10');
  }, 120_000);
  afterAll(async () => {
    await db?.stop();
  });

  let first: { linkId: string; token: string; amountMinor: number; ref: string };
  let firstRaw = '';

  it('a captured payment for the link’s amount credits exactly its lines and issues one numbered receipt, like the counter’s', async () => {
    first = await makeLink();
    expect(first.amountMinor).toBe(380100);
    expect(await platform((c) => linkForPayer(c, first.token))).toEqual({ schoolName: 'School A', amountMinor: 380100, state: 'open', receiptNo: null, provider: 'stand-in', providerRef: first.ref, checkoutUrl: `/pay/${first.token}`, testMode: true });
    firstRaw = notice('payment.captured', first.ref, 'pay_one', 380100);
    const got = await send(firstRaw);
    expect(got).toMatchObject({ status: 200, result: { outcome: 'applied', appliedMinor: 380100, unappliedMinor: 0 } });
    expect(await money()).toEqual({ receipts: 1, credited: 380100, owed: 0 });
    const receipt = await as(accountant, (c) => getReceipt(c, A, got.result.receiptId as string));
    expect(receipt).toMatchObject({ receipt_no: got.result.receiptNo, total_minor: 380100, method: 'online', issued_by_name: null, family_code: 'FAM-1', reversed_at: null });
    expect(receipt.receipt_no).toMatch(/^RCP-\d{4}-00001$/);
    expect(receipt.lines.map((l: { student_name: string; amount_minor: number }) => [l.student_name, l.amount_minor]).sort()).toEqual([['Asha', 150050], ['Asha', 150050], ['Bilal', 80000]]);
    expect((await db.pg.query(`select status, receipt_id is not null as has_receipt from payment_links where link_id = $1`, [first.linkId])).rows).toEqual([{ status: 'paid', has_receipt: true }]);
    expect((await db.pg.query(`select distinct status::text from fees_ledger where school_id = $1`, [A])).rows).toEqual([{ status: 'paid' }]);
    expect(await platform((c) => linkForPayer(c, first.token))).toMatchObject({ state: 'paid', receiptNo: receipt.receipt_no });
    expect((await db.pg.query(`select actor_user_id, impersonated_by from audit_log where school_id = $1 and event_action = 'fees.online_payment_applied'`, [A])).rows).toEqual([{ actor_user_id: null, impersonated_by: null }]);
  });

  it('REPLAY: the same notice again, any number of times, changes nothing', async () => {
    const before = [await money(), (await events()).length];
    for (let i = 0; i < 3; i += 1) expect(await send(firstRaw)).toMatchObject({ status: 200, result: { outcome: 'duplicate', reason: 'same_notice' } });
    expect([await money(), (await events()).length]).toEqual(before);
  });

  it('DUPLICATE: the same payment under a new notice id is not credited again; the database refuses a second receipt for it', async () => {
    expect(await send(notice('payment.captured', first.ref, 'pay_one', 380100))).toMatchObject({ result: { outcome: 'duplicate', reason: 'same_payment' } });
    expect(await money()).toEqual({ receipts: 1, credited: 380100, owed: 0 });
    await expect(db.pg.query(`insert into receipts (school_id, receipt_no, student_id, total_minor, method, payment_link_id, gateway, gateway_payment_id) values ($1, 'RCP-X', $2, 100, 'online', $3, 'stand-in', 'pay_one')`, [A, ASHA, first.linkId])).rejects.toThrow(/receipts_one_per_gateway_payment/);
    // Calling the applying code directly, twice, with one notice: once.
    await due(ASHA, 1000, '2026-05-20');
    const tiny = await makeLink();
    const event = { eventId: 'evt_direct', type: 'captured' as const, providerRef: tiny.ref, paymentId: 'pay_direct', amountMinor: 1000 };
    expect((await platform((c) => applyProviderEvent(c, 'stand-in', event))).outcome).toBe('applied');
    expect((await platform((c) => applyProviderEvent(c, 'stand-in', event))).outcome).toBe('duplicate');
    expect(await money()).toEqual({ receipts: 2, credited: 381100, owed: 0 });
  });

  it('TAMPERED: a notice whose signature does not hold credits nothing, and is recorded once however often it is sent', async () => {
    await due(ASHA, 150050, '2026-06-10');
    await due(BILAL, 80000, '2026-06-10');
    const link = await makeLink();
    const honest = notice('payment.captured', link.ref, 'pay_forged', 230050);
    const before = await money();
    // Signed for another amount; signed with another secret; not signed at all.
    for (const [raw, signature] of [[honest.replace('230050', '1'), signStandIn(SECRET, honest)], [honest, signStandIn('someone-elses-secret-someone-elses-secret', honest)], [honest, null], [honest, null]] as const) expect(await send(raw, signature)).toMatchObject({ status: 401, result: { outcome: 'refused' } });
    expect(await money()).toEqual(before);
    expect((await events()).filter((e: { kind: string }) => e.kind === 'unreadable').length).toBe(2); // two different bodies; the repeats are the same row
    expect((await db.pg.query(`select status from payment_links where link_id = $1`, [link.linkId])).rows[0].status).toBe('open');

    // OUT OF ORDER and PARTIAL, on this same link. A failed attempt is noted and leaves the link open.
    expect(await send(notice('payment.failed', link.ref, 'pay_try1', 230050))).toMatchObject({ result: { outcome: 'noted', reason: 'payment_failed' } });
    expect((await db.pg.query(`select status from payment_links where link_id = $1`, [link.linkId])).rows[0].status).toBe('open');
    expect(await money()).toEqual(before);
    // The provider captured less than the link asked: what came in is credited, oldest first, and the rest stays owed.
    const part = await send(notice('payment.captured', link.ref, 'pay_try2', 200000));
    expect(part).toMatchObject({ result: { outcome: 'applied', reason: 'less_than_the_link', appliedMinor: 200000, unappliedMinor: 0 } });
    expect(await money()).toEqual({ receipts: before.receipts + 1, credited: before.credited + 200000, owed: 30050 });
    // A "failed" for that same payment arriving late does not undo it.
    expect(await send(notice('payment.failed', link.ref, 'pay_try2', 200000))).toMatchObject({ result: { outcome: 'ignored', reason: 'already_captured' } });
    expect((await money()).owed).toBe(30050);
  });

  it('OUT OF ORDER: money captured for a link the office has since cancelled is still credited, never lost', async () => {
    const link = await makeLink();
    expect(link.amountMinor).toBe(30050);
    expect(await as(accountant, (c) => cancelPaymentLink(c, actor(accountant), link.linkId))).toEqual({ ok: true, cancelled: true });
    expect(await send(notice('payment.captured', link.ref, 'pay_late', 30050))).toMatchObject({ result: { outcome: 'applied', reason: 'link_was_cancelled', appliedMinor: 30050 } });
    expect((await money()).owed).toBe(0);
    expect((await db.pg.query(`select status from payment_links where link_id = $1`, [link.linkId])).rows[0].status).toBe('paid');
  });

  it('PAID AT THE COUNTER MEANWHILE: nothing is credited beyond what is owed; the rest is recorded for a refund', async () => {
    await due(ASHA, 150050, '2026-07-10');
    const link = await makeLink();
    expect(await as(accountant, (c) => takePayment(c, actor(accountant), { studentId: ASHA, scope: 'student', amountMinor: 100000, method: 'cash', reference: null, allocations: null }))).toMatchObject({ ok: true });
    const over = await send(notice('payment.captured', link.ref, 'pay_over', 150050));
    expect(over).toMatchObject({ result: { outcome: 'applied_in_part', reason: 'more_than_owed', appliedMinor: 50050, unappliedMinor: 100000 } });
    expect((await money()).owed).toBe(0);
    // Nothing owed at all: the whole amount is for a refund, and no receipt is made.
    await due(BILAL, 5000, '2026-07-10');
    const small = await makeLink();
    await as(accountant, (c) => takePayment(c, actor(accountant), { studentId: BILAL, scope: 'student', amountMinor: 5000, method: 'cash', reference: null, allocations: null }));
    const receiptsBefore = (await money()).receipts;
    expect(await send(notice('payment.captured', small.ref, 'pay_nothing', 5000))).toMatchObject({ result: { outcome: 'not_applied', reason: 'nothing_owed', appliedMinor: 0, unappliedMinor: 5000 } });
    expect((await money()).receipts).toBe(receiptsBefore);
    expect((await db.pg.query(`select status from payment_links where link_id = $1`, [small.linkId])).rows[0].status).toBe('cancelled'); // it cannot be paid a second time
    expect((await events()).filter((e: { unapplied: number }) => e.unapplied > 0).map((e: { outcome: string; unapplied: number }) => [e.outcome, e.unapplied])).toEqual([['applied_in_part', 100000], ['not_applied', 5000]]);
  });

  it('a notice for a checkout we never opened is refused; a zero amount is refused', async () => {
    const before = await money();
    expect(await send(notice('payment.captured', 'standin_order_unknown', 'pay_x', 1000))).toMatchObject({ result: { outcome: 'refused', reason: 'unknown_link' } });
    await due(ASHA, 2000, '2026-08-10');
    const link = await makeLink();
    expect(await send(notice('payment.captured', link.ref, 'pay_zero', 0))).toMatchObject({ result: { outcome: 'refused', reason: 'no_amount' } });
    expect(await money()).toEqual({ ...before, owed: 2000 });
  });

  it('IT RECONCILES: every credit is on a receipt, no due is paid beyond its amount, and the totals add up', async () => {
    const books = await as(accountant, (c) => reconcile(c, A));
    expect(books.problems).toEqual([]);
    const m = await money();
    expect(books.paidMinor).toBe(m.credited);
    expect(books.balanceMinor).toBe(2000);
    // What came in online and was credited = the online receipts' totals.
    const online = (await db.pg.query(`select coalesce(sum(total_minor), 0)::int as receipts, (select coalesce(sum(applied_minor), 0)::int from payment_events) as applied from receipts where school_id = $1 and method = 'online'`, [A])).rows[0];
    expect(online.receipts).toBe(online.applied);
  });

  it('who may see what: the fee desk reads its school’s notices and writes none; a payer’s page learns nothing about a child', async () => {
    expect((await as(accountant, (c) => c.query(`select 1 from payment_events`))).rows.length).toBeGreaterThan(5);
    expect((await as(teacher, (c) => c.query(`select 1 from payment_events`))).rows).toEqual([]);
    expect((await as(principalB, (c) => c.query(`select 1 from payment_events`))).rows).toEqual([]);
    await expect(as(accountant, (c) => c.query(`insert into payment_events (provider, event_id, kind, outcome) values ('stand-in', 'evt_fake', 'captured', 'applied')`))).rejects.toThrow(/permission denied/);
    await expect(as(accountant, (c) => c.query(`update payment_events set outcome = 'applied'`))).rejects.toThrow(/permission denied/);
    expect(Object.keys((await platform((c) => linkForPayer(c, first.token))) ?? {}).sort()).toEqual(['amountMinor', 'checkoutUrl', 'provider', 'providerRef', 'receiptNo', 'schoolName', 'state', 'testMode']);
    for (const bad of ['', 'short', `${first.token}'; drop table receipts; --`]) expect(await platform((c) => linkForPayer(c, bad))).toBeNull();
    // A link made with no provider configured cannot be paid online.
    await due(BILAL, 3000, '2026-08-10');
    await db.pg.query(`update payment_links set status = 'cancelled', closed_at = now() where school_id = $1 and status = 'open'`, [A]);
    expect(await as(accountant, (c) => createPaymentLink(c, actor(accountant), { studentId: BILAL, amountMinor: null }))).toMatchObject({ ok: true, link: { payable: false } });
  });
});
