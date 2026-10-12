import { createHmac } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createPaymentLink } from '@/lib/fees/family';
import { handleNotice } from '@/lib/payments/apply';
import { openCredentials, recordTest, saveCredentials, setGatewayAccess } from '@/lib/payments/credentials';
import { razorpayProvider } from '@/lib/payments/razorpay';

// The Razorpay adapter (docs/24 §3.8, C172), with NO network: every call to
// Razorpay goes to a stand-in `fetch` that answers with the shapes in
// Razorpay's documentation, and the real `fetch` throws if anything reaches
// it. The request and notice shapes below follow the documented examples
// (URLs in src/lib/payments/razorpay.ts). The keys, ids and signatures are
// made up here: a signature recorded from a real account cannot exist
// without that account's secret, so notices are signed in the test with the
// documented algorithm (hex HMAC-SHA256 of the raw body with the webhook
// secret). What is not proven until real test keys exist: a real call.

const KEYS = { keyId: 'rzp_test_FICTIONALKEY0001', keySecret: 'fictional-key-part-AAAA1111bbbb', webhookSecret: 'fictional-hook-part-CCCC2222' };
const OTHER = { keyId: 'rzp_test_FICTIONALKEY0009', keySecret: 'fictional-key-part-ZZZZ9999yyyy', webhookSecret: 'fictional-hook-part-OTHER999' };
const ENV = { PAYMENT_CREDENTIALS_KEY: Buffer.alloc(32, 5).toString('base64') };
const sign = (raw: string, secret = KEYS.webhookSecret) => createHmac('sha256', secret).update(raw).digest('hex');
const headers = (raw: string, eventId: string, signature = sign(raw)) => (name: string) => (name === 'x-razorpay-signature' ? signature : name === 'x-razorpay-event-id' ? eventId : null);

// The documented payment entity, cut to the fields the adapter reads.
const payment = (id: string, amount: number, status: string, linkId?: string) => ({ id, entity: 'payment', amount, currency: 'INR', status, order_id: 'order_QflczVVaNJciLq', method: 'upi', captured: status === 'captured', notes: linkId ? { nca_link: linkId } : [], error_code: status === 'failed' ? 'BAD_REQUEST_ERROR' : null });
const linkPaid = (plink: string, pay: ReturnType<typeof payment>, linkId: string) => JSON.stringify({ entity: 'event', account_id: 'acc_FictionalAcct01', event: 'payment_link.paid', contains: ['payment_link', 'order', 'payment'], payload: { payment_link: { entity: { id: plink, amount: pay.amount, amount_paid: pay.amount, currency: 'INR', reference_id: linkId, status: 'paid', notes: { nca_link: linkId } } }, payment: { entity: pay } }, created_at: 1791800000 });
const paymentEvent = (event: 'payment.captured' | 'payment.failed', pay: ReturnType<typeof payment>) => JSON.stringify({ entity: 'event', account_id: 'acc_FictionalAcct01', event, contains: ['payment'], payload: { payment: { entity: pay } }, created_at: 1791800001 });

// A stand-in for Razorpay's API. It records every request and answers from `payments` and `nextLink`.
type Call = { url: string; method: string; auth: string; body: Record<string, unknown> | null };
const calls: Call[] = [];
const payments = new Map<string, Record<string, unknown>>();
let nextLink = { status: 200, id: 'plink_ExjpAUN3gVHrPJ' };
let down = false;
const fakeRazorpay = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  const auth = String((init?.headers as Record<string, string>)?.Authorization ?? '');
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
  calls.push({ url: u, method: init?.method ?? 'GET', auth, body });
  if (down) throw new Error('network down');
  const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  if (!auth.startsWith('Basic ') || Buffer.from(auth.slice(6), 'base64').toString() !== `${KEYS.keyId}:${KEYS.keySecret}`) return json(401, { error: { code: 'BAD_REQUEST_ERROR', description: 'Authentication failed' } });
  if (u === 'https://api.razorpay.com/v1/payment_links' && init?.method === 'POST') return json(nextLink.status, nextLink.status === 200 ? { id: nextLink.id, amount: body?.amount, amount_paid: 0, currency: 'INR', status: 'created', reference_id: body?.reference_id, short_url: 'https://rzp.io/i/nxrHnLJ', notes: body?.notes } : { error: { code: 'BAD_REQUEST_ERROR' } });
  if (u.startsWith('https://api.razorpay.com/v1/payments/')) {
    const p = payments.get(decodeURIComponent(u.split('/payments/')[1]));
    return p ? json(200, p) : json(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'The id provided does not exist' } });
  }
  if (u === 'https://api.razorpay.com/v1/payments?count=1') return json(200, { entity: 'collection', count: 0, items: [] });
  return json(404, {});
}) as typeof fetch;
const razorpay = razorpayProvider(KEYS, fakeRazorpay);

describe('the adapter, against the documented formats', () => {
  it('opens a Payment Link: POST /v1/payment_links, Basic auth, paise, our link id as reference and note', async () => {
    calls.length = 0;
    const linkId = '11111111-2222-4333-8444-555555555555';
    const out = await razorpay.createCheckout({ linkId, token: 't'.repeat(43), amountMinor: 230050, expiresAt: new Date('2026-10-20T00:00:00Z') });
    expect(out).toEqual({ providerRef: 'plink_ExjpAUN3gVHrPJ', checkoutUrl: 'https://rzp.io/i/nxrHnLJ' });
    expect(calls).toEqual([{ url: 'https://api.razorpay.com/v1/payment_links', method: 'POST', auth: `Basic ${Buffer.from(`${KEYS.keyId}:${KEYS.keySecret}`).toString('base64')}`, body: { amount: 230050, currency: 'INR', accept_partial: false, reference_id: linkId, description: 'School fees', notes: { nca_link: linkId }, notify: { sms: false, email: false }, reminder_enable: false, expire_by: 1792454400 } }]);
    expect(linkId.length).toBeLessThanOrEqual(40); // reference_id: at most 40 characters
    // Razorpay refuses, or answers something that is not a link: no link is made, and the error says nothing of the keys.
    nextLink = { status: 400, id: '' };
    const failed = await razorpay.createCheckout({ linkId, token: 't'.repeat(43), amountMinor: 230050 }).catch((e: Error) => e.message);
    expect(failed).toBe('razorpay did not open a payment link (status 400)');
    nextLink = { status: 200, id: 'plink_ExjpAUN3gVHrPJ' };
  });

  it('reads a notice only when X-Razorpay-Signature is the HMAC-SHA256 of the raw body with the webhook secret', () => {
    const linkId = '11111111-2222-4333-8444-555555555555';
    const raw = linkPaid('plink_QflcnnZqCekuvL', payment('pay_Qfldmt5StKZFCB', 230050, 'captured', linkId), linkId);
    expect(razorpay.readNotice(raw, headers(raw, 'evt_FictionalEvent01'))).toEqual({ eventId: 'evt_FictionalEvent01', type: 'captured', providerRef: 'plink_QflcnnZqCekuvL', ourLinkId: linkId, paymentId: 'pay_Qfldmt5StKZFCB', amountMinor: 230050 });
    expect(razorpay.readNotice(raw, headers(raw, 'evt_FictionalEvent01', sign(raw, OTHER.webhookSecret)))).toBeNull(); // another account's secret
    expect(razorpay.readNotice(raw.replace('230050', '1'), headers(raw, 'evt_FictionalEvent01'))).toBeNull(); // body changed after signing
    expect(razorpay.readNotice(`${raw} `, headers(raw, 'evt_FictionalEvent01'))).toBeNull(); // not the raw body: one space added
    expect(razorpay.readNotice(raw, (n) => (n === 'x-razorpay-signature' ? sign(raw) : null))).toBeNull(); // no event id: a repeat could not be told apart
    expect(razorpay.readNotice(raw, () => null)).toBeNull();
  });

  it('maps payment_link.paid and payment.captured to "captured", payment.failed to "failed"; anything else is ignored, not an error', () => {
    const linkId = '11111111-2222-4333-8444-555555555555';
    const read = (raw: string) => razorpay.readNotice(raw, headers(raw, 'evt_FictionalEvent02'));
    expect(read(paymentEvent('payment.captured', payment('pay_Qfldmt5StKZFCB', 230050, 'captured', linkId)))).toMatchObject({ type: 'captured', providerRef: '', ourLinkId: linkId, paymentId: 'pay_Qfldmt5StKZFCB' });
    expect(read(paymentEvent('payment.failed', payment('pay_Qfldmt5StKZFCC', 230050, 'failed', linkId)))).toMatchObject({ type: 'failed', ourLinkId: linkId });
    // A payment of the school's that has nothing to do with our links (its own website, say).
    expect(read(paymentEvent('payment.captured', payment('pay_Qfldmt5StKZFCD', 500, 'captured')))).toEqual({ ignored: 'payment.captured:not_one_of_our_links' });
    expect(read(JSON.stringify({ entity: 'event', event: 'payment_link.expired', payload: {} }))).toEqual({ ignored: 'event:payment_link.expired' });
    // A "paid" notice whose payment is not captured, or not in rupees, is not read as money.
    expect(read(linkPaid('plink_QflcnnZqCekuvL', payment('pay_Qfldmt5StKZFCB', 230050, 'authorized', linkId), linkId))).toBeNull();
    expect(read(linkPaid('plink_QflcnnZqCekuvL', { ...payment('pay_Qfldmt5StKZFCB', 230050, 'captured', linkId), currency: 'USD' }, linkId))).toBeNull();
  });

  it('asks Razorpay about the payment itself: GET /v1/payments/{id} must be captured, in INR, for the notice’s amount', async () => {
    const event = { eventId: 'e', type: 'captured' as const, providerRef: 'plink_QflcnnZqCekuvL', ourLinkId: '11111111-2222-4333-8444-555555555555', paymentId: 'pay_Qfldmt5StKZFCB', amountMinor: 230050 };
    payments.set('pay_Qfldmt5StKZFCB', payment('pay_Qfldmt5StKZFCB', 230050, 'captured', event.ourLinkId));
    calls.length = 0;
    expect(await razorpay.confirmCapture(event)).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ url: 'https://api.razorpay.com/v1/payments/pay_Qfldmt5StKZFCB', method: 'GET' });
    payments.set('pay_Qfldmt5StKZFCB', payment('pay_Qfldmt5StKZFCB', 100, 'captured', event.ourLinkId));
    expect(await razorpay.confirmCapture(event)).toEqual({ ok: false, reason: 'amount' });
    payments.set('pay_Qfldmt5StKZFCB', payment('pay_Qfldmt5StKZFCB', 230050, 'authorized', event.ourLinkId));
    expect(await razorpay.confirmCapture(event)).toEqual({ ok: false, reason: 'status_authorized' });
    payments.set('pay_Qfldmt5StKZFCB', payment('pay_Qfldmt5StKZFCB', 230050, 'captured', '99999999-2222-4333-8444-555555555555'));
    expect(await razorpay.confirmCapture(event)).toEqual({ ok: false, reason: 'another_link' });
    payments.delete('pay_Qfldmt5StKZFCB');
    expect(await razorpay.confirmCapture(event)).toEqual({ ok: false, reason: 'fetch_status_400' }); // Razorpay has no such payment
    down = true;
    await expect(razorpay.confirmCapture(event)).rejects.toThrow('razorpay could not be reached'); // not "no": the notice is tried again later
    down = false;
  });

  it('"Test connection" answers in plain words, and never with a key', async () => {
    expect(await razorpay.testConnection()).toEqual({ ok: true, message: 'Razorpay accepted the keys.' });
    const wrong = await razorpayProvider(OTHER, fakeRazorpay).testConnection();
    expect(wrong).toEqual({ ok: false, message: 'Razorpay did not accept these keys. Check the key id and the key secret.' });
    down = true;
    expect(await razorpay.testConnection()).toEqual({ ok: false, message: 'Razorpay could not be reached. Try again in a minute.' });
    down = false;
  });
});

const A = 'a3000000-0000-4000-8000-000000000001';
const B = 'a3000000-0000-4000-8000-000000000002';
const FOUNDER = 'a3000000-0000-4000-8000-0000000000f1';
const ACCOUNTANT = 'a3000000-0000-4000-8000-0000000000a2';
const ASHA = 'a3000000-0000-4000-8000-000000500001';
const OTHER_CHILD = 'a3000000-0000-4000-8000-000000500009';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAccountant = (school: string, fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', school], ['app.current_role', 'accountant'], ['app.current_user_id', ACCOUNTANT]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const money = async (school = A) => (await db.pg.query(`select (select count(*)::int from receipts where school_id = $1) as receipts, (select coalesce(sum(amount_minor), 0)::int from payments where school_id = $1) as credited`, [school])).rows[0];
const lastEvent = async () => (await db.pg.query(`select kind, outcome, reason from payment_events order by received_at desc, event_pk desc limit 1`)).rows[0];
let configA = '';
let configB = '';
let n = 0;
const due = (school: string, student: string, amount: number) => db.pg.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ($1, $2, $3, '2026-06-10')`, [school, student, amount]);
const link = async (plink: string) => {
  nextLink = { status: 200, id: plink };
  const r = await asAccountant(A, (c) => createPaymentLink(c, { schoolId: A, userId: ACCOUNTANT, role: 'accountant' as never }, { studentId: ASHA, amountMinor: null }, razorpay, configA));
  expect(r).toMatchObject({ ok: true, created: true, link: { payable: true } });
  return r.link as { linkId: string; amountMinor: number };
};
const notify = (raw: string, config = configA, secret = KEYS.webhookSecret, keys = KEYS, eventId = `evt_Fictional${String(++n).padStart(6, '0')}`) => handleNotice(platform, razorpayProvider(keys, fakeRazorpay), raw, headers(raw, eventId, sign(raw, secret)), { scope: { schoolId: config === configA ? A : B, configId: config } });

describe('on the real schema, through the webhook’s own code', () => {
  beforeAll(async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('a test tried to use the real network');
    });
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${A}', 'School A', 'IN-HR', true), ('${B}', 'School B', 'IN-DL', true); -- test schools: only they take test payments (C173)
      insert into users (user_id, school_id, email, role, display_name) values ('${FOUNDER}', null, 'f@x.invalid', 'super_admin', 'Founder'), ('${ACCOUNTANT}', '${A}', 'acc@a.invalid', 'accountant', 'Accountant A');
      insert into students (student_id, school_id, admission_no, name) values ('${ASHA}', '${A}', 'A-1', 'Asha'), ('${OTHER_CHILD}', '${B}', 'B-1', 'Other');
      alter table students disable trigger user; update students set status = 'active'; alter table students enable trigger user;
    `);
    await due(A, ASHA, 230050);
    await due(B, OTHER_CHILD, 99900);
    const saved = async (school: string, keys: typeof KEYS) => (await platform((c) => saveCredentials(c, { schoolId: school, userId: FOUNDER, from: 'control', reason: 'Entered for the test' }, { provider: 'razorpay', mode: 'test', keys }, ENV))).meta.configId as string;
    configA = await saved(A, KEYS);
    configB = await saved(B, OTHER);
    await platform((c) => setGatewayAccess(c, { userId: FOUNDER }, A, 'razorpay', true, 'Allowed for the test'));
    await platform((c) => recordTest(c, configA, true, 'Razorpay accepted the keys.'));
    expect(await platform((c) => openCredentials(c, configA, ENV))).toMatchObject({ schoolId: A, keys: KEYS });
  }, 120_000);
  afterAll(async () => {
    vi.restoreAllMocks();
    await db?.stop();
  });

  let first: { linkId: string; amountMinor: number };
  let firstRaw = '';

  it('a valid notice, confirmed by Razorpay’s own answer, credits once and issues the counter’s kind of receipt', async () => {
    first = await link('plink_FirstFictional1');
    expect((await db.pg.query(`select provider, provider_ref, config_id, checkout_url from payment_links where link_id = $1`, [first.linkId])).rows).toEqual([{ provider: 'razorpay', provider_ref: 'plink_FirstFictional1', config_id: configA, checkout_url: 'https://rzp.io/i/nxrHnLJ' }]);
    const pay = payment('pay_FirstFictional1', 230050, 'captured', first.linkId);
    payments.set(pay.id, pay);
    firstRaw = linkPaid('plink_FirstFictional1', pay, first.linkId);
    expect(await notify(firstRaw, configA, KEYS.webhookSecret, KEYS, 'evt_FirstFictional1')).toMatchObject({ status: 200, result: { outcome: 'applied', appliedMinor: 230050 } });
    expect(await money()).toEqual({ receipts: 1, credited: 230050 });
    expect((await db.pg.query(`select r.method, r.gateway, r.gateway_payment_id, v.source, v.external_id from receipts r join payment_evidence v on v.evidence_id = r.evidence_id where r.school_id = $1`, [A])).rows).toEqual([{ method: 'online', gateway: 'razorpay', gateway_payment_id: 'pay_FirstFictional1', source: 'gateway_notice', external_id: 'razorpay:pay_FirstFictional1' }]);
  });

  it('REPLAYED (same event id), and the same payment’s own payment.captured notice: nothing more is credited', async () => {
    expect(await notify(firstRaw, configA, KEYS.webhookSecret, KEYS, 'evt_FirstFictional1')).toMatchObject({ result: { outcome: 'duplicate', reason: 'same_notice' } });
    expect(await notify(paymentEvent('payment.captured', payment('pay_FirstFictional1', 230050, 'captured', first.linkId)))).toMatchObject({ result: { outcome: 'duplicate', reason: 'same_payment' } });
    expect(await money()).toEqual({ receipts: 1, credited: 230050 });
  });

  it('TAMPERED, or signed with another school’s secret: 401, nothing credited', async () => {
    await due(A, ASHA, 150000);
    const second = await link('plink_SecondFictional');
    const pay = payment('pay_SecondFictional', 150000, 'captured', second.linkId);
    payments.set(pay.id, pay);
    const raw = linkPaid('plink_SecondFictional', pay, second.linkId);
    const tampered = raw.replace('"amount":150000', '"amount":15');
    expect(await handleNotice(platform, razorpay, tampered, headers(raw, 'evt_TamperedOne01'), { scope: { schoolId: A, configId: configA } })).toMatchObject({ status: 401 });
    expect(await notify(raw, configA, OTHER.webhookSecret)).toMatchObject({ status: 401 });
    expect(await money()).toEqual({ receipts: 1, credited: 230050 });

    // OTHER SCHOOL: school B's own address and secret, a correctly signed notice naming school A's link. Refused.
    payments.set(pay.id, pay);
    expect(await notify(raw, configB, OTHER.webhookSecret, OTHER)).toMatchObject({ status: 200, result: { outcome: 'refused', reason: 'other_school' } });
    expect(await money()).toEqual({ receipts: 1, credited: 230050 });
    expect(await money(B)).toEqual({ receipts: 0, credited: 0 });

    // THE FETCH DISAGREES: the notice says 1,500.00 captured; Razorpay, asked, says the payment is for 1.00. Not credited, flagged.
    payments.set(pay.id, payment(pay.id, 100, 'captured', second.linkId));
    expect(await notify(raw)).toMatchObject({ status: 200, result: { outcome: 'refused', reason: 'provider_fetch_disagrees:amount' } });
    expect(await lastEvent()).toEqual({ kind: 'captured', outcome: 'refused', reason: 'provider_fetch_disagrees:amount' });
    expect((await db.pg.query(`select count(*)::int as n from audit_log where school_id = $1 and event_action = 'fees.online_payment_flagged'`, [A])).rows[0].n).toBe(1);
    expect(await money()).toEqual({ receipts: 1, credited: 230050 });
    // Razorpay cannot be reached: the notice is not answered "ok", so it comes again; nothing is credited on the notice alone.
    down = true;
    await expect(notify(raw)).rejects.toThrow('razorpay could not be reached');
    down = false;
    expect(await money()).toEqual({ receipts: 1, credited: 230050 });

    // payment.failed is noted; the later honest notice, with Razorpay agreeing, is credited once.
    expect(await notify(paymentEvent('payment.failed', payment('pay_FailedFictional', 150000, 'failed', second.linkId)))).toMatchObject({ result: { outcome: 'noted', reason: 'payment_failed' } });
    payments.set(pay.id, pay);
    expect(await notify(paymentEvent('payment.captured', pay))).toMatchObject({ result: { outcome: 'applied', appliedMinor: 150000 } });
    expect(await notify(raw)).toMatchObject({ result: { outcome: 'duplicate', reason: 'same_payment' } });
    expect(await money()).toEqual({ receipts: 2, credited: 380050 });
  });

  it('a notice that is not about one of our links is answered 200 and changes nothing', async () => {
    const before = [await money(), (await db.pg.query(`select count(*)::int as n from payment_events`)).rows[0].n];
    const raw = JSON.stringify({ entity: 'event', event: 'payment_link.expired', payload: {} });
    expect(await notify(raw)).toMatchObject({ status: 200, result: { outcome: 'ignored' } });
    expect([await money(), (await db.pg.query(`select count(*)::int as n from payment_events`)).rows[0].n]).toEqual(before);
  });

  it('no key is in any notice record, audit row or thrown error; the real network was never used', async () => {
    let everything = '';
    for (const t of ['payment_events', 'payment_evidence', 'audit_log', 'payment_links', 'receipts']) everything += JSON.stringify((await db.pg.query(`select to_jsonb(x) as row from ${t} x`)).rows);
    for (const secret of [KEYS.keySecret, KEYS.webhookSecret, OTHER.keySecret, OTHER.webhookSecret, Buffer.from(`${KEYS.keyId}:${KEYS.keySecret}`).toString('base64')]) expect(everything).not.toContain(secret);
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
    expect(calls.every((c) => c.url.startsWith('https://api.razorpay.com/v1/'))).toBe(true);
  });
});
