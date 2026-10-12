import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { sendWhatsAppMessage } from '@/lib/whatsapp/gate';
import { MetaWhatsAppProvider, StandInWhatsAppProvider, signStandInNotice, type WhatsAppNotice, type WhatsAppProvider } from '@/lib/whatsapp/provider';

// The provider interface, the stand-in, and the test-school rule (docs/25 slice 7a, C182).
// Every number here is made up (+9100000000xx); nothing leaves the process.

const SECRET = 'a-secret-for-this-test-only-0123456789abcdef';

describe('the stand-in', () => {
  const standIn = new StandInWhatsAppProvider({ secret: SECRET });
  const notices: WhatsAppNotice[] = [
    { kind: 'status', providerMessageId: 'standin-1', status: 'delivered', at: '2099-04-01T06:30:00.000Z' },
    { kind: 'status', providerMessageId: 'standin-2', status: 'failed', at: '2099-04-01T06:31:00.000Z', failureCode: 'not_on_whatsapp' },
    { kind: 'inbound', providerMessageId: 'standin-in-1', fromPhone: '+910000000011', text: 'Thank you', at: '2099-04-01T06:32:00.000Z' },
  ];

  it('gives each send its own id and reaches nothing', async () => {
    const a = await standIn.send({ toPhone: '+910000000011', templateName: 't', templateParams: {} });
    const b = await standIn.send({ toPhone: '+910000000011', templateName: 't', templateParams: {} });
    expect(a).toMatchObject({ success: true, errorMessage: null });
    expect(a.providerMessageId).toMatch(/^standin-/);
    expect(a.providerMessageId).not.toBe(b.providerMessageId);
    expect(standIn.calls).toHaveLength(2);
    expect(await standIn.testConnection()).toEqual({ ok: true, message: expect.stringContaining('no message reaches a phone') });
    expect(await new StandInWhatsAppProvider({ secret: SECRET, forceFailure: true }).send({ toPhone: '+910000000011', templateName: 't', templateParams: {} })).toMatchObject({ success: false, providerMessageId: null });
  });

  it('its notices read back with its secret: where a message got to, and what a parent wrote', () => {
    const { rawBody, signature } = standIn.notice(notices);
    expect(standIn.readNotice(rawBody, signature)).toEqual({ ok: true, notices });
  });

  it('a wrong secret, a changed body, a missing or malformed signature: nothing is read', () => {
    const { rawBody, signature } = standIn.notice(notices);
    expect(new StandInWhatsAppProvider({ secret: `${SECRET}x` }).readNotice(rawBody, signature)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(standIn.readNotice(rawBody.replace('delivered', 'read'), signature)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(standIn.readNotice(rawBody, null)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(standIn.readNotice(rawBody, 'zz')).toEqual({ ok: false, reason: 'bad_signature' });
    expect(standIn.readNotice(rawBody, signature.slice(0, 62))).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('with no secret set it trusts no notice at all, even one signed with an empty secret', () => {
    const none = new StandInWhatsAppProvider({ secret: '' });
    const { rawBody, signature } = none.notice(notices);
    expect(none.readNotice(rawBody, signature)).toEqual({ ok: false, reason: 'no_secret' });
    expect(new StandInWhatsAppProvider({ secret: 'short' }).readNotice(rawBody, signStandInNotice('short', rawBody))).toEqual({ ok: false, reason: 'no_secret' });
  });

  it('a signed body that is not a notice is not understood, and nothing in it is used', () => {
    const signed = (body: unknown) => {
      const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
      return standIn.readNotice(rawBody, signStandInNotice(SECRET, rawBody));
    };
    expect(signed('not json')).toEqual({ ok: false, reason: 'not_understood' });
    expect(signed({ provider: 'meta', notices })).toEqual({ ok: false, reason: 'not_understood' });
    expect(signed({ provider: 'stand-in', notices: [{ kind: 'status', providerMessageId: 'x', status: 'paid', at: '2099-04-01T06:30:00Z' }] })).toEqual({ ok: false, reason: 'not_understood' });
    expect(signed({ provider: 'stand-in', notices: [{ kind: 'inbound', providerMessageId: 'x', fromPhone: 'a parent', text: 'hi', at: '2099-04-01T06:30:00Z' }] })).toEqual({ ok: false, reason: 'not_understood' });
    expect(signed({ provider: 'stand-in', notices: [notices[0], { kind: 'status', providerMessageId: 'x', status: 'read', at: 'yesterday' }] })).toEqual({ ok: false, reason: 'not_understood' });
  });

  it('Meta’s adapter is not built: it sends nothing and reads nothing', async () => {
    const meta = new MetaWhatsAppProvider();
    await expect(meta.send()).rejects.toThrow(/not built yet/);
    expect(await meta.testConnection()).toMatchObject({ ok: false });
    expect(meta.readNotice()).toEqual({ ok: false, reason: 'no_secret' });
  });
});

const LIVE = 'c1000000-0000-4000-8000-000000000001';
const TEST = 'c1000000-0000-4000-8000-000000000002';
const PILOT = 'c1000000-0000-4000-8000-000000000003';
const QUIET = 'c1000000-0000-4000-8000-000000000004';
const NO_BUDGET = 'c1000000-0000-4000-8000-000000000005';
const student = (school: string) => school.replace('c1000000', 'c1500000');
const parent = (school: string) => school.replace('c1000000', 'c1700000');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asSchool = <T>(school: string, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', '${school}', true)`);
    await tx.query(`select set_config('app.current_role', 'principal', true)`);
    return fn(tx);
  });
let n = 0;
const send = (school: string, over: { template?: string; purpose?: 'operational_communication' | 'daily_pulse'; provider?: WhatsAppProvider } = {}) =>
  asSchool(school, (client) =>
    sendWhatsAppMessage(
      client,
      { schoolId: school, studentId: student(school), parentId: parent(school), purpose: over.purpose ?? 'operational_communication', toPhone: '+910000000011', templateName: over.template ?? 'absence_alert', templateParams: {}, dedupeKey: `p-${++n}` },
      over.provider ? { platformDefaultProvider: over.provider } : {}
    )
  );
const row = async (logId: string) =>
  (await db.pg.query(`select status::text as status, provider, provider_used, fallback_reason, billable, est_cost_paise::int as cost, cost_basis, student_id, parent_id, purpose, provider_message_id is not null as has_id from communication_log where log_id = $1`, [logId])).rows[0];
// A made-up real account that counts what it is asked to send.
const realAccount = () => {
  const sent: string[] = [];
  const provider: WhatsAppProvider = {
    name: 'meta',
    send: async (p) => (sent.push(p.toPhone), { success: true, providerMessageId: `made-up-${sent.length}`, errorMessage: null, raw: null }),
    testConnection: async () => ({ ok: true, message: 'made up' }),
    readNotice: () => ({ ok: false, reason: 'no_secret' }),
  };
  return { provider, sent };
};

describe('the gate, on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    const school = (id: string, name: string, extra: string) => `('${id}', '${name}', 'IN-HR', ${extra})`;
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values
        ${school(LIVE, 'Live School', `false, false, true, 100000, '00:00', '00:00'`)},
        ${school(TEST, 'Test School', `true, false, true, 100000, '00:00', '00:00'`)},
        ${school(PILOT, 'Pilot School', `false, true, false, 100000, '00:00', '00:00'`)},
        ${school(QUIET, 'Quiet School', `false, false, true, 100000, '00:00', '23:59:59'`)},
        ${school(NO_BUDGET, 'No Budget School', `false, false, true, null, '00:00', '00:00'`)};
      insert into whatsapp_templates (school_id, template_name, status, billing_category) values (null, 'absence_alert', 'approved', 'utility'), (null, 'not_approved_yet', 'pending', 'utility');
    `);
    for (const s of [LIVE, TEST, PILOT, QUIET, NO_BUDGET]) {
      await db.pg.query(`insert into students (student_id, school_id, admission_no, name, status) values ($1, $2, 'A-1', 'Child', 'active')`, [student(s), s]);
      await db.pg.query(`insert into parents (parent_id, school_id, name, phone) values ($1, $2, 'A Guardian', '+910000000011')`, [parent(s), s]);
      await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [s, student(s)]);
    }
    // Both the live and the test school have their OWN WhatsApp account switched on.
    await db.pg.exec(`insert into school_whatsapp_configs (school_id, status, phone_number_id) values ('${LIVE}', 'active', '100000000000001'), ('${TEST}', 'active', '100000000000002')`);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('a test school gets the stand-in even though its own real account is switched on; the row says so and costs nothing', async () => {
    const out = await send(TEST);
    expect(out).toMatchObject({ status: 'sent', providerUsed: 'platform_default' });
    expect(await row(out.logId)).toEqual({ status: 'sent', provider: 'stand-in', provider_used: 'platform_default', fallback_reason: 'test school: the stand-in only, never a real number', billable: false, cost: 0, cost_basis: 'not_billable', student_id: student(TEST), parent_id: parent(TEST), purpose: 'operational_communication', has_id: true });
  });

  it('a test school never sends through a real account, even one handed straight to the gate', async () => {
    const real = realAccount();
    const out = await send(TEST, { provider: real.provider });
    expect(out).toMatchObject({ status: 'failed', reason: 'a test school never sends through a real account', providerUsed: null });
    expect(real.sent).toEqual([]);
    expect(await row(out.logId)).toMatchObject({ status: 'failed', provider: null, billable: false, has_id: false });
  });

  it('the same school, not a test school: its own account is what the gate turns to (and, with no verified rate, does not send)', async () => {
    const out = await send(LIVE);
    expect(out).toMatchObject({ status: 'blocked_budget', reason: expect.stringContaining('rate not verified') });
  });

  it('every rule that blocked before still blocks, before any provider is asked', async () => {
    const real = realAccount();
    const cases: [string, Parameters<typeof send>[1], string][] = [
      [PILOT, {}, 'blocked_pilot'],
      [QUIET, {}, 'blocked_quiet_hours'],
      [NO_BUDGET, {}, 'blocked_budget'],
      [TEST, { purpose: 'daily_pulse' }, 'blocked_consent'],
      [TEST, { template: 'not_approved_yet' }, 'blocked_no_template'],
    ];
    for (const [school, over, status] of cases) {
      const out = await send(school, { ...over, provider: real.provider });
      expect(out.status, `${school} ${status}`).toBe(status);
      expect(await row(out.logId)).toMatchObject({ status, provider: null, billable: false, cost: 0, has_id: false, student_id: student(school) });
    }
    expect(real.sent).toEqual([]);
  });

  it('the same trigger twice sends once', async () => {
    const standIn = new StandInWhatsAppProvider({ secret: SECRET });
    const once = (key: string) => asSchool(TEST, (client) => sendWhatsAppMessage(client, { schoolId: TEST, studentId: student(TEST), purpose: 'operational_communication', toPhone: '+910000000011', templateName: 'absence_alert', templateParams: {}, dedupeKey: key }, { platformDefaultProvider: standIn }));
    const first = await once('same-trigger');
    const second = await once('same-trigger');
    expect(second).toMatchObject({ logId: first.logId, idempotent: true });
    expect(standIn.calls).toHaveLength(1);
  });

  it('the database: what the stand-in sent can never be recorded as billable; the provider and purpose are from the known lists', async () => {
    const insert = (cols: string, vals: string) => db.pg.query(`insert into communication_log (school_id, channel, status, ${cols}) values ('${TEST}', 'whatsapp', 'sent', ${vals})`);
    await expect(insert('provider, billable, est_cost_paise', `'stand-in', true, 0`)).rejects.toThrow(/stand_in_is_free/);
    await expect(insert('provider, billable, est_cost_paise', `'stand-in', false, 115`)).rejects.toThrow(/stand_in_is_free/);
    await expect(insert('provider', `'some-vendor'`)).rejects.toThrow(/provider_check/);
    await expect(insert('purpose', `'marketing'`)).rejects.toThrow(/purpose_check/);
    await expect(insert('student_id', `'${student(LIVE)}'`)).rejects.toThrow(/school_student_fkey/); // another school's child
  });
});
