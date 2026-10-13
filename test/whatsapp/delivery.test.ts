import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { applyNotices, listMessages } from '@/lib/whatsapp/delivery';
import { sendWhatsAppMessage } from '@/lib/whatsapp/gate';
import { StandInWhatsAppProvider, type WhatsAppNotice, type WhatsAppProvider } from '@/lib/whatsapp/provider';

// Delivery states (docs/25 slice 7b, C183). Every number is made up; nothing leaves the process.

const SECRET = 'a-secret-for-this-test-only-0123456789abcdef';
const A = 'c2000000-0000-4000-8000-000000000001';
const B = 'c2000000-0000-4000-8000-000000000002';
const student = (school: string) => school.replace('c2000000', 'c2500000');
const parent = (school: string) => school.replace('c2000000', 'c2700000');
const standIn = new StandInWhatsAppProvider({ secret: SECRET });
// A made-up real account: it calls nothing and believes what it is handed.
const real: WhatsAppProvider = {
  name: 'meta',
  send: async () => ({ success: true, providerMessageId: `made-up-${Math.random().toString(36).slice(2)}`, errorMessage: null, raw: null }),
  sendText: async () => ({ success: false, providerMessageId: null, errorMessage: 'not used in this test', raw: null }),
  sendChoice: async () => ({ success: false, providerMessageId: null, errorMessage: 'not used in this test', raw: null }),
  testConnection: async () => ({ ok: true, message: 'made up' }),
  readNotice: (rawBody) => ({ ok: true, notices: JSON.parse(rawBody) }),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asSchool = <T>(school: string, fn: (client: any) => Promise<T>, role = 'principal'): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', '${school}', true)`);
    await tx.query(`select set_config('app.current_role', '${role}', true)`);
    return fn(tx);
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const platform = <T>(fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role nca_super');
    return fn(tx);
  });
let n = 0;
const send = async (school = A, provider: WhatsAppProvider = standIn, template = 'absence_alert') => {
  const out = await asSchool(school, (c) => sendWhatsAppMessage(c, { schoolId: school, studentId: student(school), parentId: parent(school), purpose: 'operational_communication', toPhone: '+910000000011', templateName: template, templateParams: {}, dedupeKey: `d-${++n}` }, { platformDefaultProvider: provider }));
  const id = (await db.pg.query(`select provider_message_id as id from communication_log where log_id = $1`, [out.logId])).rows[0].id as string;
  return { ...out, id };
};
const at = (minute: number) => `2099-04-01T06:${String(minute).padStart(2, '0')}:00.000Z`;
const status = (id: string, s: 'sent' | 'delivered' | 'read' | 'failed', minute: number, failureCode?: string): WhatsAppNotice => ({ kind: 'status', providerMessageId: id, status: s, at: at(minute), ...(failureCode ? { failureCode } : {}) });
const tell = (notices: WhatsAppNotice[], provider: StandInWhatsAppProvider = standIn) => {
  const { rawBody, signature } = provider.notice(notices);
  return platform((c) => applyNotices(c, standIn, rawBody, signature));
};
const row = async (logId: string) => (await db.pg.query(`select status::text as status, delivered_at, read_at, failed_at, failure_code, billable, est_cost_paise::int as cost, gst_paise::int as gst, cost_basis from communication_log where log_id = $1`, [logId])).rows[0];
const events = async () => (await db.pg.query(`select signature_ok, outcome, school_id, payload, processed_at is not null as processed from webhook_events order by created_at, event_id`)).rows;

describe('delivery states, on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values
        ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '00:00', '00:00'), ('${B}', 'School B', 'IN-HR', false, false, true, 100000, '00:00', '00:00');
      insert into whatsapp_templates (school_id, template_name, status, billing_category) values (null, 'absence_alert', 'approved', 'utility'), (null, 'not_approved_yet', 'pending', 'utility');
      insert into message_rate_table (channel, billing_category, rate_paise, gst_percent, verified_source, verified_at, effective_from) values ('whatsapp', 'utility', 1000, 18, 'TEST VALUE, not a real rate', now(), current_date - 30);
    `);
    for (const s of [A, B]) {
      await db.pg.query(`insert into students (student_id, school_id, admission_no, name, status) values ($1, $2, 'A-1', $3, 'active')`, [student(s), s, s === A ? 'Asha' : 'Bina']);
      await db.pg.query(`insert into parents (parent_id, school_id, name, phone) values ($1, $2, 'A Guardian', '+910000000011')`, [parent(s), s]);
      await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [s, student(s)]);
    }
    await db.pg.exec(`update whatsapp_templates set meta_status = 'approved', meta_template_id = 'made-up' where status = 'approved'`); // the made-up real account sends only what Meta has approved (C184)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('sent, then delivered, then read: each with its time, and the notice kept once with what it did', async () => {
    const m = await send();
    expect(await tell([status(m.id, 'delivered', 30)])).toEqual({ status: 200, duplicate: false, applied: 1, stale: 0, unknown: 0, inbound: 0 });
    expect(await row(m.logId)).toMatchObject({ status: 'delivered', delivered_at: new Date(at(30)), read_at: null });
    expect(await tell([status(m.id, 'read', 31)])).toMatchObject({ applied: 1 });
    expect(await row(m.logId)).toMatchObject({ status: 'read', delivered_at: new Date(at(30)), read_at: new Date(at(31)), billable: false, cost: 0 });
    const kept = await events();
    expect(kept).toHaveLength(2);
    expect(kept[0]).toMatchObject({ signature_ok: true, outcome: 'applied 1, stale 0, unknown 0, replies 0', school_id: A, processed: true });
    expect(kept[0].payload).toEqual({ provider: 'stand-in', notices: [{ kind: 'status', id: m.id, status: 'delivered', at: at(30) }] });
  });

  it('the same notice twice changes nothing', async () => {
    const m = await send();
    const { rawBody, signature } = standIn.notice([status(m.id, 'delivered', 32)]);
    expect(await platform((c) => applyNotices(c, standIn, rawBody, signature))).toMatchObject({ duplicate: false, applied: 1 });
    const before = await row(m.logId);
    const count = (await events()).length;
    expect(await platform((c) => applyNotices(c, standIn, rawBody, signature))).toEqual({ status: 200, duplicate: true, applied: 0, stale: 0, unknown: 0, inbound: 0 });
    expect(await row(m.logId)).toEqual(before);
    expect((await events()).length).toBe(count);
  });

  it('a notice out of order never moves a state backwards', async () => {
    const m = await send();
    expect(await tell([status(m.id, 'read', 40)])).toMatchObject({ applied: 1 });
    // "Delivered" arrives after "read": the message stays read, and keeps the time it was first known delivered.
    expect(await tell([status(m.id, 'delivered', 39)])).toMatchObject({ applied: 0, stale: 1 });
    expect(await tell([status(m.id, 'sent', 38)])).toMatchObject({ applied: 0, stale: 1 });
    expect(await tell([status(m.id, 'failed', 41, 'late')])).toMatchObject({ applied: 0, stale: 1 });
    expect(await row(m.logId)).toMatchObject({ status: 'read', read_at: new Date(at(40)), delivered_at: new Date(at(40)), failed_at: null, failure_code: null });
    // And a failed one does not come back.
    const f = await send();
    expect(await tell([status(f.id, 'failed', 42, 'not_on_whatsapp')])).toMatchObject({ applied: 1 });
    expect(await tell([status(f.id, 'delivered', 43)])).toMatchObject({ applied: 0, stale: 1 });
    expect(await row(f.logId)).toMatchObject({ status: 'failed', failure_code: 'not_on_whatsapp', failed_at: new Date(at(42)), delivered_at: null });
  });

  it('a notice with a bad signature is recorded and changes nothing; nothing in it is kept', async () => {
    const m = await send();
    const before = (await events()).length;
    const forged = new StandInWhatsAppProvider({ secret: `${SECRET}-someone-else` });
    expect(await tell([status(m.id, 'read', 50)], forged)).toEqual({ status: 401, duplicate: false, applied: 0, stale: 0, unknown: 0, inbound: 0, reason: 'bad_signature' });
    expect(await row(m.logId)).toMatchObject({ status: 'sent', read_at: null });
    const kept = (await events()).slice(before);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ signature_ok: false, outcome: 'refused: bad_signature', school_id: null });
    expect(JSON.stringify(kept[0].payload)).not.toContain(m.id);
  });

  it('a notice touches only its own provider’s message, and an id nobody sent is not found', async () => {
    const theirs = await send(B, real);
    expect(await tell([status(theirs.id, 'read', 51), status('standin-nobody-sent-this', 'read', 51)])).toMatchObject({ applied: 0, unknown: 2 });
    expect(await row(theirs.logId)).toMatchObject({ status: 'sent' });
  });

  it('a parent’s reply is counted and not kept until replies have a home', async () => {
    const out = await tell([{ kind: 'inbound', providerMessageId: 'standin-in-1', fromPhone: '+910000000011', text: 'My daughter is unwell today', at: at(52) }]);
    expect(out).toMatchObject({ applied: 0, inbound: 1 });
    const last = (await events()).pop();
    expect(last.outcome).toBe('applied 0, stale 0, unknown 0, replies 1');
    expect(JSON.stringify(last.payload)).not.toMatch(/unwell|\+91/);
  });

  it('money follows delivery: a real account’s message is priced when sent, billable when delivered, free if it failed', async () => {
    const tellReal = (notices: WhatsAppNotice[]) => platform((c) => applyNotices(c, real, JSON.stringify(notices), null));
    const m = await send(A, real);
    expect(await row(m.logId)).toMatchObject({ status: 'sent', billable: false, cost: 1000, gst: 180, cost_basis: 'rate_table' });
    await tellReal([status(m.id, 'delivered', 53)]);
    expect(await row(m.logId)).toMatchObject({ status: 'delivered', billable: true, cost: 1000, gst: 180, cost_basis: 'rate_table' });
    const f = await send(A, real);
    await tellReal([status(f.id, 'failed', 54, '131026')]);
    expect(await row(f.logId)).toMatchObject({ status: 'failed', billable: false, cost: 0, gst: 0, cost_basis: 'not_billable', failure_code: '131026' });
    // The budget counts what is delivered and what is still on its way, not what failed.
    const onItsWay = await send(A, real);
    expect((await row(onItsWay.logId)).billable).toBe(false);
    await db.pg.query(`update schools set monthly_budget_paise = $2 where school_id = $1`, [A, 2 * 1180 + 1000]);
    expect((await send(A, real)).status).toBe('blocked_budget');
    await db.pg.query(`update schools set monthly_budget_paise = 100000 where school_id = $1`, [A]);
  });

  it('the school’s list: its own messages only, each with its state; held ones grouped; the phone shown by its last four digits', async () => {
    await send(A, standIn, 'not_approved_yet');
    const list = await asSchool(A, (c) => listMessages(c, A, null));
    expect(list.days).toBe(14);
    expect(list.counts).toMatchObject({ read: 2, failed: 2, held: 2, delivered: 2 });
    expect(list.messages.every((m) => m.child === 'Asha' && m.guardian === 'A Guardian' && m.phone_last4 === '0011')).toBe(true);
    expect(JSON.stringify(list)).not.toContain('+910000000011');
    const held = await asSchool(A, (c) => listMessages(c, A, 'held'));
    expect(held.messages.map((m) => m.status).sort()).toEqual(['blocked_budget', 'blocked_no_template']);
    expect((await asSchool(A, (c) => listMessages(c, A, 'failed'))).messages).toHaveLength(2);
    // Another school asking for this school's list gets nothing: row level security, whatever is asked.
    expect((await asSchool(B, (c) => listMessages(c, A, null))).messages).toEqual([]);
    expect((await asSchool(B, (c) => listMessages(c, B, null))).messages.map((m) => m.child)).toEqual(['Bina']);
  });

  it('the database: a state never moves back, a held message never becomes sent, and what a message was never changes', async () => {
    const m = await send();
    await tell([status(m.id, 'delivered', 55)]);
    const set = (sql: string) => asSchool(A, (c) => c.query(`update communication_log set ${sql} where log_id = '${m.logId}'`)).then(() => 'allowed', (e: Error) => e.message);
    expect(await set(`status = 'sent'`)).toMatch(/only moves forward/);
    expect(await set(`status = 'failed'`)).toMatch(/only moves forward/);
    expect(await set(`status = 'queued'`)).toMatch(/only moves forward/);
    expect(await set(`to_phone = '+910000000099'`)).toMatch(/never changes/);
    expect(await set(`provider_message_id = 'another'`)).toMatch(/never changes/);
    expect(await set(`template_name = 'other'`)).toMatch(/never changes/);
    expect(await set(`status = 'read'`)).toBe('allowed');
    const heldId = (await db.pg.query(`select log_id from communication_log where school_id = $1 and status = 'blocked_no_template' limit 1`, [A])).rows[0].log_id;
    expect(await asSchool(A, (c) => c.query(`update communication_log set status = 'sent' where log_id = $1`, [heldId])).then(() => 'allowed', (e: Error) => e.message)).toMatch(/only moves forward/);
    // No role of the app removes a message from the log (C190); erasure will have its own audited function.
    expect(await asSchool(A, (c) => c.query(`delete from communication_log where log_id = $1`, [m.logId])).then(() => 'allowed', (e: Error) => e.message)).toMatch(/permission denied/);
    expect(await platform((c) => c.query(`delete from communication_log where log_id = $1`, [m.logId])).then(() => 'allowed', (e: Error) => e.message)).toMatch(/permission denied/);
    // A notice is kept as it came: no role may change or remove one.
    expect(await platform((c) => c.query(`update webhook_events set outcome = 'x'`)).then(() => 'allowed', (e: Error) => e.message)).toMatch(/permission denied/);
    expect(await platform((c) => c.query(`delete from webhook_events`)).then(() => 'allowed', (e: Error) => e.message)).toMatch(/permission denied/);
  });
});
