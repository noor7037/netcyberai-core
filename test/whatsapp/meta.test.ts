import { createHmac } from 'crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { accountProblem, messagingKey, metaAccountMeta, openMetaCredentials, recordMetaTest, saveMetaAccount, sealMeta, setMetaEnabled, unsealMeta } from '@/lib/whatsapp/credentials';
import { applyNotices } from '@/lib/whatsapp/delivery';
import { deliverQueued, queueWhatsAppMessage, sendWhatsAppMessage } from '@/lib/whatsapp/gate';
import { GRAPH_VERSION, MetaWhatsAppProvider, answerChallenge, choiceSendBody, templateSendBody } from '@/lib/whatsapp/meta';

// Meta's Cloud API adapter and the platform's credentials (docs/25 slice 7e, C186).
// NO NETWORK CALL IS MADE: every answer "from Meta" below is a recorded example in Meta's documented shape,
// handed in as `fetch`. Every token, secret and number is made up for this file.

const CONFIG = { accessToken: 'MADEUPTOKEN_0123456789abcdefghijklmnopqrstuvwxyz_LAST', appSecret: 'madeupappsecret0123456789abcdef', verifyToken: 'made-up-verify-token-0123456789', phoneNumberId: '106540352242922' };
const ACCOUNT = { ...CONFIG, wabaId: '102290129340398' };
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
const recorded = (answer: { ok: boolean; status: number; body: unknown } | Error) => {
  const calls: Call[] = [];
  const fetcher = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    if (answer instanceof Error) throw answer;
    return { ok: answer.ok, status: answer.status, json: async () => answer.body };
  };
  return { calls, fetcher };
};
const sign = (rawBody: string, secret = CONFIG.appSecret) => `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
const SEND = { toPhone: '+16505551234', templateName: 'order_confirmation', templateParams: { first_name: 'Jessica', order_number: 'SKBUP2-4CPIG9' }, language: 'en' as const, testSchool: false };
// Meta's documented answer to a send (reference/messages).
const SENT_OK = { ok: true, status: 200, body: { messaging_product: 'whatsapp', contacts: [{ input: '+16505551234', wa_id: '16505551234' }], messages: [{ id: 'wamid.HBgLMTY1MDM4Nzk0MzkVAgARGBI0QUQ2MjA4NEYyRkExNjMyREUA', message_status: 'accepted' }] } };
// Meta's documented webhook examples (webhooks/reference/messages/status and /text).
const envelope = (value: Record<string, unknown>, phoneNumberId = '106540352242922') => ({ object: 'whatsapp_business_account', entry: [{ id: '102290129340398', changes: [{ value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '15550783881', phone_number_id: phoneNumberId }, ...value }, field: 'messages' }] }] });
const FAILED = envelope({ statuses: [{ id: 'wamid.HBgLMTY1MDM4Nzk0MzkVAgARGBI0QUQ2MjA4NEYyRkExNjMyREUA', status: 'failed', timestamp: '1751142888', recipient_id: '16505551234', errors: [{ code: 131049, title: 'This message was not delivered to maintain healthy ecosystem engagement.', message: 'This message was not delivered to maintain healthy ecosystem engagement.', error_data: { details: 'In order to maintain a healthy ecosystem engagement, the message failed to be delivered.' }, href: '/documentation/business-messaging/whatsapp/support/error-codes' }] }] });
const TEXT = envelope({ contacts: [{ profile: { name: 'Sheena Nelson' }, wa_id: '16505551234' }], messages: [{ from: '16505551234', id: 'wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTA0QTY1OTlBRUUwMzgxMDE0NEYA=', timestamp: '1749416383', type: 'text', text: { body: 'Does it come in another color?' } }] });

describe('Meta’s formats, against Meta’s documented examples', () => {
  it('a template send is the documented request, to the phone number’s own address, with the token only in the header', async () => {
    expect(templateSendBody(SEND)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+16505551234',
      type: 'template',
      // Positional (C345): the values in the template's own order, {{1}} first, with no names.
      template: { name: 'order_confirmation', language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Jessica' }, { type: 'text', text: 'SKBUP2-4CPIG9' }] }] },
    });
    expect(templateSendBody({ ...SEND, templateOrder: ['order_number', 'first_name'] })).toMatchObject({ template: { components: [{ parameters: [{ type: 'text', text: 'SKBUP2-4CPIG9' }, { type: 'text', text: 'Jessica' }] }] } });
    const meta = recorded(SENT_OK);
    const out = await new MetaWhatsAppProvider(CONFIG, meta.fetcher).send(SEND);
    expect(out).toEqual({ success: true, providerMessageId: 'wamid.HBgLMTY1MDM4Nzk0MzkVAgARGBI0QUQ2MjA4NEYyRkExNjMyREUA', errorMessage: null, raw: null });
    expect(meta.calls).toEqual([{ url: `https://graph.facebook.com/${GRAPH_VERSION}/106540352242922/messages`, method: 'POST', headers: { Authorization: `Bearer ${CONFIG.accessToken}`, 'Content-Type': 'application/json' }, body: templateSendBody(SEND) }]);
    expect(JSON.stringify(meta.calls[0].body)).not.toContain(CONFIG.accessToken);
    expect(templateSendBody({ ...SEND, language: 'hi' })).toMatchObject({ template: { language: { code: 'hi' } } });
  });

  it('Meta’s refusal is said shortly, with its code; a dead line is said as that; the token is in neither', async () => {
    const refused = await new MetaWhatsAppProvider(CONFIG, recorded({ ok: false, status: 400, body: { error: { message: '(#132001) Template name does not exist in the translation', type: 'OAuthException', code: 132001, fbtrace_id: 'made-up' } } }).fetcher).send(SEND);
    expect(refused).toEqual({ success: false, providerMessageId: null, errorMessage: 'Meta answered 400 (code 132001): (#132001) Template name does not exist in the translation', raw: null });
    const down = await new MetaWhatsAppProvider(CONFIG, recorded(new Error(`connect failed with ${CONFIG.accessToken}`)).fetcher).send(SEND);
    expect(down).toMatchObject({ success: false, errorMessage: 'Meta could not be reached (Error)' });
    expect(JSON.stringify([refused, down])).not.toContain(CONFIG.accessToken);
    expect(await new MetaWhatsAppProvider(CONFIG, recorded({ ok: true, status: 200, body: { messages: [] } }).fetcher).send(SEND)).toMatchObject({ success: false, errorMessage: expect.stringContaining('no message id') });
  });

  it('the second lock: a test school’s message is refused by the adapter itself, and nothing is asked of Meta', async () => {
    const meta = recorded(SENT_OK);
    const provider = new MetaWhatsAppProvider(CONFIG, meta.fetcher);
    expect(await provider.send({ ...SEND, testSchool: true })).toMatchObject({ success: false, errorMessage: 'a test school never sends through a real account' });
    const { testSchool: _unsaid, ...unsaid } = SEND;
    expect(await provider.send(unsaid)).toMatchObject({ success: false, errorMessage: 'a test school never sends through a real account' }); // not said to be a real school: refused
    expect(await provider.send({ ...SEND, toPhone: '9876543210' })).toMatchObject({ success: false, errorMessage: 'the number is not a full international number' });
    expect(meta.calls).toEqual([]);
  });

  it('the webhook’s first check: our token and Meta’s challenge back; anything else is refused', () => {
    expect(answerChallenge(CONFIG, { mode: 'subscribe', token: CONFIG.verifyToken, challenge: '1158201444' })).toBe('1158201444');
    expect(answerChallenge(CONFIG, { mode: 'subscribe', token: 'another-token-of-the-same-size!!', challenge: '1' })).toBeNull();
    expect(answerChallenge(CONFIG, { mode: 'unsubscribe', token: CONFIG.verifyToken, challenge: '1' })).toBeNull();
    expect(answerChallenge(CONFIG, { mode: 'subscribe', token: null, challenge: '1' })).toBeNull();
    expect(answerChallenge(CONFIG, { mode: 'subscribe', token: CONFIG.verifyToken, challenge: null })).toBeNull();
  });

  it('a notice signed with the App Secret is read: Meta’s "failed" example and its text-message example', () => {
    const provider = new MetaWhatsAppProvider(CONFIG, recorded(SENT_OK).fetcher);
    const failed = JSON.stringify(FAILED);
    expect(provider.readNotice(failed, sign(failed))).toEqual({ ok: true, notices: [{ kind: 'status', providerMessageId: 'wamid.HBgLMTY1MDM4Nzk0MzkVAgARGBI0QUQ2MjA4NEYyRkExNjMyREUA', status: 'failed', at: '2025-06-28T20:34:48.000Z', failureCode: '131049', recipient: '+16505551234' }] });
    const text = JSON.stringify(TEXT);
    expect(provider.readNotice(text, sign(text))).toEqual({ ok: true, notices: [{ kind: 'inbound', providerMessageId: 'wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTA0QTY1OTlBRUUwMzgxMDE0NEYA=', fromPhone: '+16505551234', text: 'Does it come in another color?', at: '2025-06-08T20:59:43.000Z' }] });
    const many = JSON.stringify(envelope({ statuses: [{ id: 'wamid.A', status: 'sent', timestamp: '1751142800', recipient_id: '1' }, { id: 'wamid.A', status: 'delivered', timestamp: '1751142801', recipient_id: '1' }, { id: 'wamid.A', status: 'read', timestamp: '1751142802', recipient_id: '1' }, { id: 'wamid.B', status: 'played', timestamp: '1751142803', recipient_id: '1' }, { id: 'wamid.C', status: 'deleted', timestamp: 'soon' }] }));
    const read = provider.readNotice(many, sign(many));
    expect(read.ok && read.notices.map((n) => (n.kind === 'status' ? n.status : n.kind))).toEqual(['sent', 'delivered', 'read']);
  });

  it('a question with quick replies is Meta’s documented body, within its limits; the tap comes back with the reply’s id (C190)', async () => {
    const q = { toPhone: '+16505551234', text: 'Which school is your message about?', choices: [{ id: 'school:a', title: 'School A' }, { id: 'school:b', title: 'School B' }], testSchool: false };
    expect(choiceSendBody(q)).toEqual({ messaging_product: 'whatsapp', recipient_type: 'individual', to: '+16505551234', type: 'interactive', interactive: { type: 'button', body: { text: 'Which school is your message about?' }, action: { buttons: [{ type: 'reply', reply: { id: 'school:a', title: 'School A' } }, { type: 'reply', reply: { id: 'school:b', title: 'School B' } }] } } });
    const meta = recorded(SENT_OK);
    const provider = new MetaWhatsAppProvider(CONFIG, meta.fetcher);
    expect((await provider.sendChoice(q)).success).toBe(true);
    expect(meta.calls[0].body).toEqual(choiceSendBody(q));
    // Four buttons, or a title over 20 characters: refused here, Meta is not asked.
    expect((await provider.sendChoice({ ...q, choices: [1, 2, 3, 4].map((n) => ({ id: `s:${n}`, title: `School ${n}` })) })).success).toBe(false);
    expect((await provider.sendChoice({ ...q, choices: [{ id: 's', title: 'A school with a very long name' }] })).success).toBe(false);
    expect((await provider.sendChoice({ ...q, testSchool: true })).errorMessage).toBe('a test school never sends through a real account');
    expect(meta.calls).toHaveLength(1);
    const tap = JSON.stringify(envelope({ messages: [{ from: '16505551234', id: 'wamid.tap', timestamp: '1749416383', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'school:b', title: 'School B' } } }] }));
    expect(provider.readNotice(tap, sign(tap))).toEqual({ ok: true, notices: [{ kind: 'inbound', providerMessageId: 'wamid.tap', fromPhone: '+16505551234', text: 'School B', at: '2025-06-08T20:59:43.000Z', choiceId: 'school:b' }] });
  });

  it('a wrong secret, a changed body, a signature without its prefix: nothing is read; another number’s notice is left alone', () => {
    const provider = new MetaWhatsAppProvider(CONFIG, recorded(SENT_OK).fetcher);
    const body = JSON.stringify(FAILED);
    expect(provider.readNotice(body, sign(body, 'someoneelsessecret0123456789abcd'))).toEqual({ ok: false, reason: 'bad_signature' });
    expect(provider.readNotice(body.replace('failed', 'read'), sign(body))).toEqual({ ok: false, reason: 'bad_signature' });
    expect(provider.readNotice(body, sign(body).replace('sha256=', ''))).toEqual({ ok: false, reason: 'bad_signature' });
    expect(provider.readNotice(body, null)).toEqual({ ok: false, reason: 'bad_signature' });
    const other = JSON.stringify(envelope({ statuses: (FAILED.entry[0].changes[0].value as unknown as { statuses: unknown[] }).statuses }, '999999999999'));
    expect(provider.readNotice(other, sign(other))).toEqual({ ok: true, notices: [] });
    const notOurs = JSON.stringify({ object: 'page', entry: [] });
    expect(provider.readNotice(notOurs, sign(notOurs))).toEqual({ ok: false, reason: 'not_understood' });
    expect(provider.readNotice('not json', sign('not json'))).toEqual({ ok: false, reason: 'not_understood' });
  });

  it('“test the connection” asks about the number and sends nothing', async () => {
    const ok = recorded({ ok: true, status: 200, body: { code_verification_status: 'VERIFIED', display_phone_number: '15555555555', id: '106540352242922', quality_rating: 'GREEN', verified_name: 'Support Number' } });
    expect(await new MetaWhatsAppProvider(CONFIG, ok.fetcher).testConnection()).toEqual({ ok: true, message: 'Connected: Support Number (15555555555), quality GREEN.' });
    expect(ok.calls).toEqual([{ url: `https://graph.facebook.com/${GRAPH_VERSION}/106540352242922?fields=verified_name,display_phone_number,quality_rating`, method: 'GET', headers: expect.objectContaining({ Authorization: `Bearer ${CONFIG.accessToken}` }), body: null }]);
    expect(await new MetaWhatsAppProvider(CONFIG, recorded({ ok: true, status: 200, body: { id: '1', verified_name: 'Someone Else' } }).fetcher).testConnection()).toEqual({ ok: false, message: 'Meta answered for another phone number.' });
    expect(await new MetaWhatsAppProvider(CONFIG, recorded({ ok: false, status: 401, body: { error: { message: 'Invalid OAuth access token.', code: 190 } } }).fetcher).testConnection()).toEqual({ ok: false, message: 'Meta answered 401 (code 190): Invalid OAuth access token.' });
  });
});

// A key for this test file only, made here: thirty-two bytes of one value. Not the server's key, and not a secret.
const ENV = { MESSAGING_CREDENTIALS_KEY: Buffer.alloc(32, 7).toString('base64'), MESSAGING_CREDENTIALS_KEY_VERSION: '1' };
const FOUNDER = 'c5000000-0000-4000-8000-0000000000f1';
const LIVE = 'c5000000-0000-4000-8000-000000000001';
const TEST = 'c5000000-0000-4000-8000-000000000002';
const student = (school: string) => school.replace('c5000000', 'c5500000');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asSchool = <T>(school: string, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', '${school}', true)`);
    await tx.query(`select set_config('app.current_role', 'principal', true)`);
    return fn(tx);
  });
const queue = createPgJobQueue(platform);
const everythingKept = async () => JSON.stringify(await Promise.all(['whatsapp_credentials', 'audit_log', 'jobs', 'communication_log', 'webhook_events'].map(async (t) => (await db.pg.query(`select * from ${t}`)).rows)));

describe('the platform’s credentials, on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into users (user_id, school_id, email, role, display_name) values ('${FOUNDER}', null, 'founder@netcyberai.example', 'super_admin', 'The Founder');
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values
        ('${LIVE}', 'Live School', 'IN-HR', false, false, true, 100000, '00:00', '00:00'), ('${TEST}', 'Test School', 'IN-HR', true, false, true, 100000, '00:00', '00:00');
      insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status, meta_status, meta_template_id) values
        (null, 'absence', 1, 'en', '{{school}}: {{child}} was absent on {{date}}.', '{school,child,date}', 'utility', 720, 'approved', 'approved', 'made-up-meta-id');
      insert into message_rate_table (channel, billing_category, rate_paise, gst_percent, verified_source, verified_at, effective_from) values ('whatsapp', 'utility', 1000, 18, 'TEST VALUE, not a real rate', now(), current_date - 30);
    `);
    for (const s of [LIVE, TEST]) {
      await db.pg.query(`insert into students (student_id, school_id, admission_no, name, status) values ($1, $2, 'A-1', 'Asha', 'active')`, [student(s), s]);
      await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [s, student(s)]);
    }
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    delete process.env.MESSAGING_CREDENTIALS_KEY;
    await db?.stop();
  });

  it('with no key on the server, saving is refused in plain words and nothing is written', async () => {
    for (const env of [{}, { MESSAGING_CREDENTIALS_KEY: '' }, { MESSAGING_CREDENTIALS_KEY: 'too-short' }, { MESSAGING_CREDENTIALS_KEY: Buffer.alloc(16, 1).toString('base64') }, { PAYMENT_CREDENTIALS_KEY: ENV.MESSAGING_CREDENTIALS_KEY }]) {
      expect(messagingKey(env)).toBeNull();
      expect(await platform((c) => saveMetaAccount(c, { userId: FOUNDER }, ACCOUNT, env))).toEqual({ ok: false, reason: 'no_encryption_key' });
    }
    expect((await db.pg.query(`select count(*)::int as n from whatsapp_credentials`)).rows[0].n).toBe(0);
    expect(await platform((c) => metaAccountMeta(c, {}))).toBeNull();
  });

  it('what is typed is checked; what is saved is switched off, sealed, and bound to its number', async () => {
    expect(accountProblem(ACCOUNT)).toBeNull();
    expect(accountProblem({ ...ACCOUNT, phoneNumberId: '+91 98765' })).toBe('phone_number_id');
    expect(accountProblem({ ...ACCOUNT, wabaId: '' })).toBe('waba_id');
    expect(accountProblem({ ...ACCOUNT, accessToken: 'short' })).toBe('access_token');
    expect(accountProblem({ ...ACCOUNT, appSecret: 'has spaces in it, which no secret has' })).toBe('app_secret');
    expect(accountProblem({ ...ACCOUNT, verifyToken: 'short' })).toBe('verify_token');
    expect(await platform((c) => saveMetaAccount(c, { userId: FOUNDER }, ACCOUNT, ENV))).toEqual({ ok: true });
    const meta = await platform((c) => metaAccountMeta(c, ENV));
    expect(meta).toMatchObject({ phoneNumberId: ACCOUNT.phoneNumberId, wabaId: ACCOUNT.wabaId, tokenLast4: 'LAST', enabled: false, savedByName: 'The Founder', testOk: null, keyAvailable: true });
    // The same row under another number, or another key, does not open.
    const key = messagingKey(ENV)!;
    const sealed = sealMeta(key, ACCOUNT.phoneNumberId, CONFIG);
    const row = { ciphertext: sealed.ciphertext, iv: sealed.iv, tag: sealed.tag, key_version: sealed.keyVersion };
    expect(unsealMeta(key, ACCOUNT.phoneNumberId, row)).toMatchObject({ accessToken: CONFIG.accessToken });
    expect(() => unsealMeta(key, '999999999999', row)).toThrow();
    expect(() => unsealMeta({ key: Buffer.alloc(32, 8), version: 1 }, ACCOUNT.phoneNumberId, row)).toThrow();
    expect(() => unsealMeta({ key: key.key, version: 2 }, ACCOUNT.phoneNumberId, row)).toThrow(/another key version/);
  });

  it('switched on only after a test that passed; a failed test switches it off; replacing it switches it off', async () => {
    const by = { userId: FOUNDER };
    expect(await platform((c) => openMetaCredentials(c, true, ENV))).toBeNull(); // saved, not switched on: the gate does not use it
    expect(await platform((c) => openMetaCredentials(c, false, ENV))).toMatchObject({ accessToken: CONFIG.accessToken, phoneNumberId: ACCOUNT.phoneNumberId });
    expect(await platform((c) => setMetaEnabled(c, by, true, ENV))).toEqual({ ok: false, reason: 'not_tested' });
    await platform((c) => recordMetaTest(c, false, 'Meta answered 401 (code 190): Invalid OAuth access token.'));
    expect(await platform((c) => setMetaEnabled(c, by, true, ENV))).toEqual({ ok: false, reason: 'not_tested' });
    await platform((c) => recordMetaTest(c, true, 'Connected: Support Number (15555555555), quality GREEN.'));
    expect(await platform((c) => setMetaEnabled(c, by, true, {}))).toEqual({ ok: false, reason: 'no_encryption_key' });
    expect(await platform((c) => setMetaEnabled(c, by, true, ENV))).toEqual({ ok: true });
    expect(await platform((c) => openMetaCredentials(c, true, ENV))).toMatchObject({ appSecret: CONFIG.appSecret });
    expect(await platform((c) => openMetaCredentials(c, true, {}))).toBeNull(); // this server does not hold the key
    await platform((c) => recordMetaTest(c, false, 'Meta could not be reached (Error).'));
    expect((await platform((c) => metaAccountMeta(c, ENV)))?.enabled).toBe(false);
    await platform((c) => recordMetaTest(c, true, 'Connected.'));
    await platform((c) => setMetaEnabled(c, by, true, ENV));
    await platform((c) => saveMetaAccount(c, by, ACCOUNT, ENV));
    expect(await platform((c) => metaAccountMeta(c, ENV))).toMatchObject({ enabled: false, testOk: null });
    // The database holds the rule too: on is impossible without a passed test.
    await expect(platform((c) => c.query(`update whatsapp_credentials set enabled = true`))).rejects.toThrow(/check/);
    await platform((c) => recordMetaTest(c, true, 'Connected.'));
    expect(await platform((c) => setMetaEnabled(c, by, true, ENV))).toEqual({ ok: true });
  });

  it('no school role can read or write the table', async () => {
    await expect(asSchool(LIVE, (c) => c.query(`select 1 from whatsapp_credentials`))).rejects.toThrow(/permission denied/);
    await expect(asSchool(LIVE, (c) => c.query(`update whatsapp_credentials set enabled = false`))).rejects.toThrow(/permission denied/);
  });

  it('the gate: a live school’s queued message goes through the real account, once; a test school’s never does; a school session cannot reach it', async () => {
    process.env.MESSAGING_CREDENTIALS_KEY = ENV.MESSAGING_CREDENTIALS_KEY;
    const asked: Call[] = [];
    vi.stubGlobal('fetch', async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
      asked.push({ url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
      return { ok: true, status: 200, json: async () => ({ messaging_product: 'whatsapp', contacts: [{ input: '+910000000011', wa_id: '910000000011' }], messages: [{ id: `wamid.made-up-${asked.length}`, message_status: 'accepted' }] }) };
    });
    const params = (school: string, key: string) => ({ schoolId: school, studentId: student(school), purpose: 'operational_communication' as const, toPhone: '+910000000011', templateName: 'absence', templateParams: { child: 'Asha', date: '01-04-2099' }, dedupeKey: key });
    // A live school, through the outbox, as the job runner.
    const live = await asSchool(LIVE, (c) => queueWhatsAppMessage(c, queue, params(LIVE, 'meta-live')));
    expect(await deliverQueued({ platform, queue }, live.logId)).toEqual({ status: 'sent' });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ url: `https://graph.facebook.com/${GRAPH_VERSION}/${ACCOUNT.phoneNumberId}/messages`, method: 'POST', body: { to: '+910000000011', type: 'template', template: { name: 'absence', language: { code: 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: 'Live School' }, { type: 'text', text: 'Asha' }, { type: 'text', text: '01-04-2099' }] }] } } });
    const row = (await db.pg.query(`select status::text as status, provider, provider_message_id as id, billable, est_cost_paise::int as cost, cost_basis from communication_log where log_id = $1`, [live.logId])).rows[0];
    expect(row).toEqual({ status: 'sent', provider: 'meta', id: 'wamid.made-up-1', billable: false, cost: 1000, cost_basis: 'rate_table' });
    // Meta's delivery notice, signed with the App Secret, makes it delivered and billable.
    const account = await platform((c) => openMetaCredentials(c, true));
    const notice = JSON.stringify(envelope({ statuses: [{ id: 'wamid.made-up-1', status: 'delivered', timestamp: '1751142888', recipient_id: '910000000011' }] }));
    expect(await platform((c) => applyNotices(c, new MetaWhatsAppProvider(account!), notice, sign(notice)))).toMatchObject({ status: 200, applied: 1 });
    expect((await db.pg.query(`select status::text as status, billable from communication_log where log_id = $1`, [live.logId])).rows[0]).toEqual({ status: 'delivered', billable: true });
    // A test school, the same way: the stand-in, and Meta is not asked.
    const test = await asSchool(TEST, (c) => queueWhatsAppMessage(c, queue, params(TEST, 'meta-test')));
    expect(await deliverQueued({ platform, queue }, test.logId)).toEqual({ status: 'sent' });
    expect((await db.pg.query(`select provider, fallback_reason from communication_log where log_id = $1`, [test.logId])).rows[0]).toEqual({ provider: 'stand-in', fallback_reason: 'test school: the stand-in only, never a real number' });
    // A school's own session sending directly cannot read the credentials: the stand-in.
    const direct = await asSchool(LIVE, (c) => sendWhatsAppMessage(c, params(LIVE, 'meta-direct')));
    expect(direct.status).toBe('sent');
    expect((await db.pg.query(`select provider from communication_log where log_id = $1`, [direct.logId])).rows[0].provider).toBe('stand-in');
    expect(asked).toHaveLength(1);
    // Switched off in Control: the next message goes nowhere.
    await platform((c) => setMetaEnabled(c, { userId: FOUNDER }, false));
    const after = await asSchool(LIVE, (c) => queueWhatsAppMessage(c, queue, params(LIVE, 'meta-after-off')));
    await deliverQueued({ platform, queue }, after.logId);
    expect((await db.pg.query(`select provider from communication_log where log_id = $1`, [after.logId])).rows[0].provider).toBe('stand-in');
    expect(asked).toHaveLength(1);
  });

  it('write-only: no secret, nor any part of one, is in the table, the audit trail, a job, the message log or a kept notice', async () => {
    const kept = await everythingKept();
    for (const secret of [CONFIG.accessToken, CONFIG.appSecret, CONFIG.verifyToken, CONFIG.accessToken.slice(0, 24), CONFIG.appSecret.slice(0, 16)]) expect(kept).not.toContain(secret);
    expect(JSON.stringify(await platform((c) => metaAccountMeta(c, ENV)))).not.toMatch(/MADEUPTOKEN|madeupappsecret|made-up-verify/);
    const audit = (await db.pg.query(`select event_action, after_state from audit_log where event_action like 'whatsapp.%' order by audit_id`)).rows;
    expect(audit.map((a: { event_action: string }) => a.event_action)).toEqual(expect.arrayContaining(['whatsapp.account_saved', 'whatsapp.account_switched_on', 'whatsapp.account_switched_off']));
    expect(Object.keys(audit[0].after_state).sort()).toEqual(['enabled', 'keyVersion', 'phoneNumberId', 'wabaId']);
  });
});
