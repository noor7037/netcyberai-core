import { createHmac } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createPaymentLink } from '@/lib/fees/family';
import { handleNotice } from '@/lib/payments/apply';
import { recordTest, saveCredentials, setGatewayAccess, type CredentialsMeta } from '@/lib/payments/credentials';
import { setMethod } from '@/lib/payments/methods';
import { STAND_IN_SIGNATURE_HEADER, signStandIn, standInPaymentProvider } from '@/lib/payments/provider';
import { razorpayProvider } from '@/lib/payments/razorpay';
import { usableKeys } from '@/lib/payments/setup';

// Test keys must never credit a real school (C173). A payment made with a
// provider's test keys, or on the stand-in, moves no money. A school that is
// not a test-fixture school can never switch a gateway on with test keys,
// is never given a test checkout, never has a test notice credited, and the
// database itself refuses test-mode evidence for it. Test schools take test
// payments as before. No network: Razorpay is a stand-in `fetch`.

const TEST = { keyId: 'rzp_test_FICTIONALKEY0001', keySecret: 'fictional-key-part-AAAA1111bbbb', webhookSecret: 'fictional-hook-part-CCCC2222' };
const LIVE = { keyId: 'rzp_live_FICTIONALKEY0002', keySecret: 'fictional-key-part-DDDD3333eeee', webhookSecret: 'fictional-hook-part-FFFF4444' };
const ENV = { PAYMENT_CREDENTIALS_KEY: Buffer.alloc(32, 3).toString('base64') };
const STAND_IN = 'a-stand-in-secret-used-only-in-these-tests-0123456789';

describe('which keys a school may collect with', () => {
  const meta = (mode: 'test' | 'live', testOk: boolean | null): CredentialsMeta => ({ configId: `c-${mode}`, provider: 'razorpay', mode, keyLast4: '0000', savedAt: '', savedByName: null, savedFrom: 'school', testedAt: null, testOk, testMessage: null });
  it('a real school: live keys that passed the test, and nothing else', () => {
    expect(usableKeys([meta('test', true)], 'razorpay', false)).toBeNull(); // only test keys: cannot switch on
    expect(usableKeys([meta('test', true), meta('live', null)], 'razorpay', false)).toBeNull(); // live saved but not tested
    expect(usableKeys([meta('test', true), meta('live', false)], 'razorpay', false)).toBeNull(); // live failed the test
    expect(usableKeys([meta('test', true), meta('live', true)], 'razorpay', false)?.mode).toBe('live');
  });
  it('a test school: test keys will do; live keys are still preferred', () => {
    expect(usableKeys([meta('test', true)], 'razorpay', true)?.mode).toBe('test');
    expect(usableKeys([meta('test', true), meta('live', true)], 'razorpay', true)?.mode).toBe('live');
    expect(usableKeys([meta('test', null)], 'razorpay', true)).toBeNull();
  });
});

const REAL = 'a4000000-0000-4000-8000-000000000001';
const FIXTURE = 'a4000000-0000-4000-8000-000000000002';
const FOUNDER = 'a4000000-0000-4000-8000-0000000000f1';
const PRINCIPAL = 'a4000000-0000-4000-8000-0000000000a1';
const child = (school: string) => (school === REAL ? 'a4000000-0000-4000-8000-000000500001' : 'a4000000-0000-4000-8000-000000500002');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asPrincipal = (school: string, fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', school], ['app.current_role', 'principal'], ['app.current_user_id', PRINCIPAL]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const actor = (school: string) => ({ schoolId: school, userId: PRINCIPAL, role: 'principal' as never });
const money = async (school: string) => (await db.pg.query(`select (select count(*)::int from receipts where school_id = $1) as receipts, (select coalesce(sum(amount_minor), 0)::int from payments where school_id = $1) as credited, (select count(*)::int from payment_evidence where school_id = $1) as evidence`, [school])).rows[0];

// Razorpay, standing in: it opens a link and, asked about a payment, agrees with whatever the test put in `payments`.
const payments = new Map<string, Record<string, unknown>>();
let plink = 0;
const fakeRazorpay = (async (url: string | URL, init?: RequestInit) => {
  const u = String(url);
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (u.endsWith('/payment_links')) return json({ id: `plink_Fictional${String(++plink).padStart(6, '0')}`, amount: body.amount, short_url: 'https://rzp.io/i/fictional' });
  return json(payments.get(u.split('/payments/')[1]) ?? {});
}) as typeof fetch;
const config: Record<string, string> = {};
const saveKeys = async (school: string, mode: 'test' | 'live') => {
  const keys = mode === 'test' ? TEST : LIVE;
  const saved = await platform((c) => saveCredentials(c, { schoolId: school, userId: FOUNDER, from: 'control', reason: 'Entered for the test' }, { provider: 'razorpay', mode, keys }, ENV));
  await platform((c) => recordTest(c, saved.meta.configId, true, 'Razorpay accepted the keys.'));
  config[`${school}:${mode}`] = saved.meta.configId;
};
let n = 0;
// A correctly signed payment_link.paid notice, with Razorpay agreeing when asked: as good as a notice gets.
const paidNotice = async (school: string, mode: 'test' | 'live', amount: number) => {
  const keys = mode === 'test' ? TEST : LIVE;
  const provider = razorpayProvider(keys, fakeRazorpay);
  await db.pg.query(`update payment_links set status = 'cancelled', closed_at = now() where school_id = $1 and status = 'open'`, [school]);
  const made = await asPrincipal(school, (c) => createPaymentLink(c, actor(school), { studentId: child(school), amountMinor: amount }, provider, config[`${school}:${mode}`]));
  expect(made).toMatchObject({ ok: true, created: true });
  const ref = (await db.pg.query(`select provider_ref from payment_links where link_id = $1`, [made.link.linkId])).rows[0].provider_ref as string;
  const pay = { id: `pay_Fictional${String(++n).padStart(8, '0')}`, entity: 'payment', amount, currency: 'INR', status: 'captured', notes: { nca_link: made.link.linkId } };
  payments.set(pay.id, pay);
  const raw = JSON.stringify({ entity: 'event', event: 'payment_link.paid', payload: { payment_link: { entity: { id: ref, amount, status: 'paid' } }, payment: { entity: pay } } });
  const signature = createHmac('sha256', keys.webhookSecret).update(raw).digest('hex');
  return handleNotice(platform, provider, raw, (name) => (name === 'x-razorpay-signature' ? signature : name === 'x-razorpay-event-id' ? `evt_Fictional${String(n).padStart(8, '0')}` : null), { scope: { schoolId: school, configId: config[`${school}:${mode}`] } });
};

describe('on the real schema', () => {
  beforeAll(async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('a test tried to use the real network');
    });
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture) values ('${REAL}', 'A Real School', 'IN-HR', false), ('${FIXTURE}', 'A Test School', 'IN-DL', true);
      insert into users (user_id, school_id, email, role, display_name) values ('${FOUNDER}', null, 'f@x.invalid', 'super_admin', 'Founder'), ('${PRINCIPAL}', '${REAL}', 'p@a.invalid', 'principal', 'Principal');
      insert into students (student_id, school_id, admission_no, name) values ('${child(REAL)}', '${REAL}', 'R-1', 'Asha'), ('${child(FIXTURE)}', '${FIXTURE}', 'T-1', 'Bilal');
      alter table students disable trigger user; update students set status = 'active'; alter table students enable trigger user;
      insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ('${REAL}', '${child(REAL)}', 500000, '2026-06-10'), ('${FIXTURE}', '${child(FIXTURE)}', 500000, '2026-06-10');
    `);
    for (const school of [REAL, FIXTURE]) {
      await saveKeys(school, 'test');
      await platform((c) => setGatewayAccess(c, { userId: FOUNDER }, school, 'razorpay', true, 'Allowed for the test'));
    }
  }, 120_000);
  afterAll(async () => {
    vi.restoreAllMocks();
    await db?.stop();
  });

  it('a real school with only test keys cannot switch Razorpay on; a test school can', async () => {
    const ready = async (school: string) => {
      const creds = (await db.pg.query(`select config_id as "configId", provider, mode, test_ok as "testOk" from payment_credentials where school_id = $1`, [school])).rows as CredentialsMeta[];
      const testSchool = (await db.pg.query(`select is_test_fixture from schools where school_id = $1`, [school])).rows[0].is_test_fixture as boolean;
      return usableKeys(creds, 'razorpay', testSchool) !== null;
    };
    const realReady = await ready(REAL);
    expect(realReady).toBe(false);
    expect(await asPrincipal(REAL, async (c) => setMethod(c, actor(REAL), { method: 'razorpay', enabled: true, sortOrder: 1 }, async () => realReady))).toEqual({ ok: false, reason: 'gateway_not_ready' });
    expect((await db.pg.query(`select count(*)::int as n from payment_methods where school_id = $1 and enabled`, [REAL])).rows[0].n).toBe(0);
    expect(await ready(FIXTURE)).toBe(true);
    // With live keys that passed the test, the real school can.
    await saveKeys(REAL, 'live');
    expect(await ready(REAL)).toBe(true);
  });

  it('a TEST notice for a REAL school credits nothing: correctly signed, confirmed by Razorpay, and still refused and flagged', async () => {
    const before = await money(REAL);
    expect(await paidNotice(REAL, 'test', 230050)).toMatchObject({ status: 200, result: { outcome: 'refused', reason: 'test_mode_for_a_real_school', appliedMinor: 0 } });
    expect(await money(REAL)).toEqual(before);
    expect(before).toEqual({ receipts: 0, credited: 0, evidence: 0 });
    expect((await db.pg.query(`select outcome, reason, applied_minor::int as applied from payment_events where school_id = $1`, [REAL])).rows).toEqual([{ outcome: 'refused', reason: 'test_mode_for_a_real_school', applied: 0 }]);
    expect((await db.pg.query(`select after_state->>'reason' as reason from audit_log where school_id = $1 and event_action = 'fees.online_payment_flagged'`, [REAL])).rows).toEqual([{ reason: 'test_mode_for_a_real_school' }]);
    expect((await db.pg.query(`select distinct status::text from fees_ledger where school_id = $1`, [REAL])).rows).toEqual([{ status: 'pending' }]); // still owed, not paid
  });

  it('the stand-in is test money too: its notice for a real school is refused the same way', async () => {
    const standIn = standInPaymentProvider(STAND_IN);
    await db.pg.query(`update payment_links set status = 'cancelled', closed_at = now() where school_id = $1 and status = 'open'`, [REAL]);
    const made = await asPrincipal(REAL, (c) => createPaymentLink(c, actor(REAL), { studentId: child(REAL), amountMinor: 100000 }, standIn));
    const raw = JSON.stringify({ id: 'evt_standin_real', type: 'payment.captured', order: `standin_order_${made.link.linkId}`, payment: 'pay_standin_real', amount: 100000 });
    expect(await handleNotice(platform, standIn, raw, (name) => (name === STAND_IN_SIGNATURE_HEADER ? signStandIn(STAND_IN, raw) : null))).toMatchObject({ result: { outcome: 'refused', reason: 'test_mode_for_a_real_school' } });
    expect(await money(REAL)).toEqual({ receipts: 0, credited: 0, evidence: 0 });
  });

  it('THE DATABASE refuses it too: test-mode evidence for a real school cannot be inserted by anyone, and a mode is never changed', async () => {
    const insert = `insert into payment_evidence (school_id, source, external_id, amount_minor, mode) values ($1, 'gateway_notice', $2, 100, $3)`;
    await expect(db.pg.query(insert, [REAL, 'direct:owner', 'test'])).rejects.toThrow(/test-mode money is never credited to a real school/);
    await expect(platform((c) => c.query(insert, [REAL, 'direct:platform', 'test']))).rejects.toThrow(/test-mode money is never credited to a real school/);
    await expect(asPrincipal(REAL, (c) => c.query(insert, [REAL, 'direct:principal', 'test']))).rejects.toThrow(/test-mode money is never credited to a real school/);
    await expect(db.pg.query(insert, [REAL, 'direct:other', 'sandbox'])).rejects.toThrow(/check/);
    // Live evidence for the real school, and test evidence for the test school, are accepted.
    await db.pg.query(insert, [REAL, 'direct:live', 'live']);
    await db.pg.query(insert, [FIXTURE, 'direct:test', 'test']);
    await expect(db.pg.query(`update payment_evidence set mode = 'live' where external_id = 'direct:test'`)).rejects.toThrow(/never edited/);
    await expect(db.pg.query(`update payment_evidence set mode = 'test' where external_id = 'direct:live'`)).rejects.toThrow(/never edited/);
    // The counter writes live evidence without being told to.
    expect((await db.pg.query(`select column_default from information_schema.columns where table_name = 'payment_evidence' and column_name = 'mode'`)).rows[0].column_default).toContain('live');
    await db.pg.exec(`set session_replication_role = replica; delete from payment_evidence where external_id like 'direct:%'; set session_replication_role = origin;`);
  });

  it('a real school with LIVE keys is credited, and its evidence says live', async () => {
    expect(await paidNotice(REAL, 'live', 230050)).toMatchObject({ result: { outcome: 'applied', appliedMinor: 230050 } });
    expect((await db.pg.query(`select mode, applied_minor::int as applied from payment_evidence where school_id = $1`, [REAL])).rows).toEqual([{ mode: 'live', applied: 230050 }]);
  });

  it('a TEST school still takes test payments, as before, and its evidence says test', async () => {
    expect(await paidNotice(FIXTURE, 'test', 230050)).toMatchObject({ result: { outcome: 'applied', appliedMinor: 230050 } });
    expect(await money(FIXTURE)).toEqual({ receipts: 1, credited: 230050, evidence: 1 });
    expect((await db.pg.query(`select mode from payment_evidence where school_id = $1`, [FIXTURE])).rows).toEqual([{ mode: 'test' }]);
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  });
});
