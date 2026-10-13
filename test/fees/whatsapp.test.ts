import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createPaymentLink } from '@/lib/fees/family';
import { recordFollowUp } from '@/lib/fees/recovery';
import { runFeeReminders } from '@/lib/fees/reminders';
import { feeGuardians, tellPaymentInitiated, tellReceipt } from '@/lib/fees/whatsapp';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { reportUtr, verifyReport } from '@/lib/payments/upi';
import { recordMetaTest, saveMetaAccount, setMetaEnabled } from '@/lib/whatsapp/credentials';
import { whatsappIsLive } from '@/lib/whatsapp/gate';
import { TEMPLATE_REGISTRY } from '@/lib/whatsapp/templates';
import { indiaDate } from '@/lib/time/india';

// Fees on WhatsApp (docs/25 slice 7g, C188). Every number, address, token and key here is made up; nothing
// leaves the process: messages are only ever QUEUED in these tests, never handed to a provider.

// A key for this test file only: thirty-two bytes of one value. Not the server's key.
const ENV = { MESSAGING_CREDENTIALS_KEY: Buffer.alloc(32, 9).toString('base64') };
const A = 'c7000000-0000-4000-8000-000000000001';
const T = 'c7000000-0000-4000-8000-000000000002'; // a test school
const u = (n: number) => `c7000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const FOUNDER = u(1);
const PRINCIPAL = u(11);
const ACCOUNTANT = u(12);
const FAMILY = u(20);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const accountant: Who = { role: 'accountant', user: ACCOUNTANT };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = (who: Who, fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = (fn: (c: any) => Promise<any>): Promise<any> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
const queue = createPgJobQueue(platform);
const actor = (who: Who) => ({ schoolId: A, userId: who.user, role: who.role as never });
const today = indiaDate();
const day = (offset: number) => indiaDate(new Date(Date.now() + offset * 86400_000));
const night = (on = today, env: Record<string, string | undefined> = ENV) => platform((c) => runFeeReminders(c, queue, A, on, env));
const whatsapp = async (template?: string) => (await db.pg.query(`select template_name as t, status::text as s, to_phone as phone, template_params as p, reason from communication_log where channel = 'whatsapp' and ($1::text is null or template_name = $1) order by template_name desc, to_phone, created_at`, [template ?? null])).rows;
const emails = async () => (await db.pg.query(`select payload->'to' as "to" from jobs where type = 'email.send' and payload->>'template' = 'fee_reminder' order by created_at`)).rows;
const reminders = async () => (await db.pg.query(`select s.name, r.which, r.outcome, r.held_reason as why, r.channel from fee_reminders r join fees_ledger l on l.fee_id = r.fee_id join students s on s.student_id = l.student_id order by s.name, r.which`)).rows;
const reset = () => db.pg.exec(`set session_replication_role = replica; delete from fee_reminders; delete from jobs; delete from communication_log; delete from payment_reports; delete from payment_link_lines; delete from payment_links; delete from fee_followups; delete from fee_concessions; delete from whatsapp_opt_outs; set session_replication_role = origin;`);
const goLive = async () => {
  await platform((c) => saveMetaAccount(c, { userId: FOUNDER }, { phoneNumberId: '106540352242922', wabaId: '102290129340398', accessToken: 'MADEUPTOKEN_0123456789abcdefghijklmnopqrstuvwxyz', appSecret: 'madeupappsecret0123456789abcdef', verifyToken: 'made-up-verify-token-0123456789' }, ENV));
  await platform((c) => recordMetaTest(c, true, 'Connected.'));
  await platform((c) => setMetaEnabled(c, { userId: FOUNDER }, true, ENV));
};

describe('the words', () => {
  const body = (name: string) => TEMPLATE_REGISTRY.find((t) => t.name === name)!.body;
  it('“payment initiated” says the school will verify, and never says paid or received', () => {
    for (const text of Object.values(body('fee_payment_initiated'))) expect(text).not.toMatch(/\b(paid|received|receipt number|successful|confirmed)\b|भुगतान सफल|प्राप्त हुए/i);
    expect(body('fee_payment_initiated').en).toMatch(/will check it in its bank account/);
  });
  it('the reminder and the receipt carry an amount and a date or number, and no child’s name', () => {
    for (const name of ['fee_reminder', 'fee_overdue', 'fee_receipt', 'fee_payment_initiated']) expect(TEMPLATE_REGISTRY.find((t) => t.name === name)!.variables).not.toContain('child');
  });
});

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    // Asha and Bina: one family, guardian with a phone and an email. Chetan: guardian with a phone only.
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values
        ('${A}', 'School A', 'IN-HR', false, false, true, 1000000, '00:00', '00:00'), ('${T}', 'Test School', 'IN-HR', true, false, true, 1000000, '00:00', '00:00');
      insert into users (user_id, school_id, email, role, display_name) values ('${FOUNDER}', null, 'founder@netcyberai.example', 'super_admin', 'The Founder'),
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant');
      insert into memberships (user_id, school_id, role, is_active) values ('${PRINCIPAL}', '${A}', 'principal', true), ('${ACCOUNTANT}', '${A}', 'accountant', true);
      insert into families (family_id, school_id, family_code, created_by) values ('${FAMILY}', '${A}', 'FAM-1', '${PRINCIPAL}');
      insert into students (student_id, school_id, admission_no, name, family_id) values ('${u(31)}', '${A}', 'A-1', 'Asha', '${FAMILY}'), ('${u(32)}', '${A}', 'A-2', 'Bina', '${FAMILY}'), ('${u(33)}', '${A}', 'A-3', 'Chetan', null);
      alter table students disable trigger user; update students set status = 'active'; alter table students enable trigger user;
      insert into parents (parent_id, school_id, name, phone, email) values ('${u(41)}', '${A}', 'Guardian One', '90000 00001', 'guardian.one@example.invalid'), ('${u(42)}', '${A}', 'Guardian One again', '+919000000001', null), ('${u(43)}', '${A}', 'Guardian Three', '09000000003', null);
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${u(41)}', '${u(31)}'), ('${A}', '${u(42)}', '${u(32)}'), ('${A}', '${u(43)}', '${u(33)}');
      insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ('${A}', '${u(31)}', 100000, '${today}'), ('${A}', '${u(32)}', 50000, '${day(3)}'), ('${A}', '${u(33)}', 70000, '${day(-7)}');
      insert into payment_methods (school_id, method, enabled, settings, updated_by) values ('${A}', 'direct_upi', true, '${JSON.stringify({ upiId: 'school.fees@okbank', payeeName: 'School A', bankName: 'An Example Bank', accountLast4: '4821', ifsc: 'EXMP0001234', verifiers: ['accountant', 'principal'], principalLimitMinor: 0, notify: 'digest' })}', '${PRINCIPAL}');
      insert into school_settings (school_id, module_id, setting_values, schema_version, updated_by) values ('${A}', 'fees', '{"reminders_enabled": true}', 6, '${PRINCIPAL}');
      insert into message_rate_table (channel, billing_category, rate_paise, gst_percent, verified_source, verified_at, effective_from) values ('whatsapp', 'utility', 1000, 18, 'TEST VALUE, not a real rate', now(), current_date - 30);
    `);
    for (const t of TEMPLATE_REGISTRY) await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status, meta_status, meta_template_id) values (null, $1, $2, 'en', $3, $4, $5, $6, 'approved', 'approved', 'made-up') on conflict do nothing`, [t.name, t.version, t.body.en, [...t.variables], t.category, t.staleAfterMinutes]);
    await db.pg.exec(`delete from whatsapp_templates where body is null`);
    for (const s of [31, 32, 33]) await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [A, u(s)]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('guardians with a usable number: one per number, however it was written down', async () => {
    const family = await platform((c) => feeGuardians(c, A, { familyId: FAMILY, studentId: u(31) }));
    expect(family).toEqual([{ parentId: u(41), studentId: u(31), phone: '+919000000001' }]); // the same number twice is one guardian
    expect(await platform((c) => feeGuardians(c, A, { familyId: null, studentId: u(33) }))).toEqual([{ parentId: u(43), studentId: u(33), phone: '+919000000003' }]);
  });

  it('while WhatsApp reaches no phone, reminders go by email exactly as before, and nothing is queued on WhatsApp', async () => {
    expect(await platform((c) => whatsappIsLive(c, A, ENV))).toBe(false);
    expect(await night()).toEqual({ sent: 2, held: 1, linksMade: 1, byWhatsApp: 0 });
    expect(await emails()).toEqual([{ to: ['guardian.one@example.invalid'] }]);
    expect(await whatsapp('fee_reminder')).toEqual([]);
    expect(await reminders()).toEqual([
      { name: 'Asha', which: 'due_day', outcome: 'sent', why: null, channel: 'email' },
      { name: 'Bina', which: 'before_3', outcome: 'sent', why: null, channel: 'email' },
      { name: 'Chetan', which: 'after_7', outcome: 'held', why: 'no_email', channel: null },
    ]);
  });

  it('once WhatsApp is live: one channel a family a day. WhatsApp where the gate lets it through, with the link; no email as well', async () => {
    await reset();
    await goLive();
    expect(await platform((c) => whatsappIsLive(c, A, ENV))).toBe(true);
    expect(await platform((c) => whatsappIsLive(c, T, ENV))).toBe(false); // never a test school
    expect(await platform((c) => whatsappIsLive(c, A, {}))).toBe(false); // this server does not hold the key
    expect(await night()).toEqual({ sent: 3, held: 0, linksMade: 2, byWhatsApp: 3 });
    expect(await emails()).toEqual([]);
    const sent = await whatsapp();
    expect(sent.map((m: { t: string; s: string; phone: string }) => [m.t, m.s, m.phone])).toEqual([['fee_reminder', 'queued', '+919000000001'], ['fee_overdue', 'queued', '+919000000003']]);
    expect(sent[0].p).toEqual({ amount: '1,000.00', due_date: today.split('-').reverse().join('-'), pay_link: expect.stringMatching(/\/pay\/[A-Za-z0-9_-]{32,}$/) });
    expect(JSON.stringify(sent)).not.toMatch(/Asha|Bina|Chetan/);
    expect((await reminders()).map((r: { channel: string }) => r.channel)).toEqual(['whatsapp', 'whatsapp', 'whatsapp']);
    // The same night again: nothing more, on either channel.
    expect(await night()).toEqual({ sent: 0, held: 0, linksMade: 0, byWhatsApp: 0 });
    expect(await whatsapp()).toHaveLength(2);
  });

  it('a parent who wrote STOP is reminded by email instead; a guardian with neither is held, and says why', async () => {
    await reset();
    await db.pg.exec(`insert into whatsapp_opt_outs (school_id, phone) values ('${A}', '+919000000001'), ('${A}', '+919000000003')`);
    expect(await night()).toEqual({ sent: 2, held: 1, linksMade: 2, byWhatsApp: 0 });
    expect(await emails()).toEqual([{ to: ['guardian.one@example.invalid'] }]);
    expect((await whatsapp()).map((m: { s: string; reason: string }) => [m.s, m.reason])).toEqual([['blocked_consent', 'this number asked to stop WhatsApp messages from the school'], ['blocked_consent', 'this number asked to stop WhatsApp messages from the school']]);
    expect((await reminders()).map((r: { name: string; channel: string; why: string }) => [r.name, r.channel, r.why])).toEqual([['Asha', 'email', null], ['Bina', 'email', null], ['Chetan', null, 'no_email']]);
  });

  it('a promise to pay or hardship holds both channels', async () => {
    await reset();
    expect((await as(accountant, (c) => recordFollowUp(c, actor(accountant), { kind: 'promise', studentId: u(31), note: 'After salary', promiseDate: day(2) }))).ok).toBe(true);
    expect((await as(accountant, (c) => recordFollowUp(c, actor(accountant), { kind: 'hardship', studentId: u(33), note: 'Lost work', percentOff: 25 }))).ok).toBe(true);
    expect(await night()).toEqual({ sent: 0, held: 3, linksMade: 0, byWhatsApp: 0 });
    expect(await emails()).toEqual([]);
    expect(await whatsapp()).toEqual([]);
    expect((await reminders()).map((r: { why: string }) => r.why)).toEqual(['promise', 'promise', 'hardship']);
  });

  it('a UTR entered: “payment initiated” is queued to the guardian with the last four digits; no receipt message before the school has verified; one after', async () => {
    await reset();
    const link = (await as(accountant, (c) => createPaymentLink(c, actor(accountant), { studentId: u(33), amountMinor: null }))).link;
    const out = await platform((c) => reportUtr(c, link.token, '412345678901', (_school, reportId) => tellPaymentInitiated(c, reportId, queue)));
    expect(out).toEqual({ ok: true });
    expect(await whatsapp()).toEqual([{ t: 'fee_payment_initiated', s: 'queued', phone: '+919000000003', p: { amount: '700.00', utr_last4: '8901' }, reason: null }]);
    expect(await whatsapp('fee_receipt')).toEqual([]);
    const reportId = (await db.pg.query(`select report_id from payment_reports`)).rows[0].report_id;
    // Found in the bank: the receipt is issued, and only then is its message queued, once.
    const verified = await as(principal, (c) => verifyReport(c, actor(principal), reportId, { action: 'found', amountSeenMinor: 70000, checked: true }));
    expect(verified).toMatchObject({ ok: true, state: 'verified' });
    const receipt = await whatsapp('fee_receipt');
    expect(receipt).toEqual([{ t: 'fee_receipt', s: 'queued', phone: '+919000000003', p: { amount: '700.00', receipt_no: verified.credit.receiptNo }, reason: null }]);
    expect((await db.pg.query(`select count(*)::int as n from jobs where type = 'whatsapp.send'`)).rows[0].n).toBe(2);
  });

  it('“not found” sends no receipt message', async () => {
    await reset();
    await db.pg.query(`insert into fees_ledger (school_id, student_id, amount_minor, due_date) values ($1, $2, 30000, $3)`, [A, u(33), day(20)]);
    const link = (await as(accountant, (c) => createPaymentLink(c, actor(accountant), { studentId: u(33), amountMinor: null }))).link;
    await platform((c) => reportUtr(c, link.token, '412345678902', (_school, reportId) => tellPaymentInitiated(c, reportId, queue)));
    const reportId = (await db.pg.query(`select report_id from payment_reports`)).rows[0].report_id;
    await as(accountant, (c) => verifyReport(c, actor(accountant), reportId, { action: 'not_found' }));
    expect(await whatsapp('fee_receipt')).toEqual([]);
  });

  it('a message that cannot be queued never undoes what it is about', async () => {
    const broken = { ...queue, enqueue: async () => { throw new Error('the queue is down'); } };
    const out = await platform(async (c) => {
      await c.query(`insert into webhook_events (school_id, provider, payload_hash, payload) values ($1, 'whatsapp', 'made-up-hash-for-this-test', '{}')`, [A]);
      const told = await tellReceipt(c, { schoolId: A, familyId: null, studentId: u(33), receiptId: u(99), receiptNo: 'RCP-MADE-UP', amountMinor: 100 }, broken as never);
      return { told };
    });
    expect(out.told).toBeNull();
    // What was done in the same transaction before the message is still there.
    expect((await db.pg.query(`select count(*)::int as n from webhook_events where payload_hash = 'made-up-hash-for-this-test'`)).rows[0].n).toBe(1);
    expect(await whatsapp('fee_receipt')).toEqual([]);
  });
});
