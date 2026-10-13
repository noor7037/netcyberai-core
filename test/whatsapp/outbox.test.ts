import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { MAX_SEND_ATTEMPTS, deliverQueued, queueWhatsAppMessage, whatsappSendHandler } from '@/lib/whatsapp/gate';
import type { WhatsAppProvider } from '@/lib/whatsapp/provider';

// The outbox (docs/25 slice 7d, C185). Every number is made up; nothing leaves the process.

const A = 'c4000000-0000-4000-8000-000000000001';
const B = 'c4000000-0000-4000-8000-000000000002';
const STUDENT = 'c4500000-0000-4000-8000-000000000001';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asSchool = <T>(fn: (client: any) => Promise<T>, school = A): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    await tx.query(`select set_config('app.current_tenant_id', '${school}', true)`);
    await tx.query(`select set_config('app.current_role', 'teacher', true)`);
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
// A provider that counts what it is asked, and fails or throws when told to.
const counting = () => {
  const state = { sent: [] as string[], asked: 0, fail: 0 };
  const provider: WhatsAppProvider = {
    name: 'stand-in',
    send: async (p) => {
      state.asked += 1;
      if (state.fail > 0) {
        state.fail -= 1;
        return { success: false, providerMessageId: null, errorMessage: 'the provider did not answer', raw: null };
      }
      state.sent.push(p.toPhone);
      return { success: true, providerMessageId: `standin-${state.sent.length}-${Math.random().toString(36).slice(2)}`, errorMessage: null, raw: null };
    },
    sendText: async () => ({ success: false, providerMessageId: null, errorMessage: 'not used in this test', raw: null }),
    testConnection: async () => ({ ok: true, message: 'made up' }),
    readNotice: () => ({ ok: false, reason: 'no_secret' }),
  };
  return { provider, state };
};
// India is UTC+05:30, with no summer time: 22:00 there is 16:30 UTC.
const india = (day: number, hhmm: string) => new Date(`2099-04-${String(day).padStart(2, '0')}T${hhmm}:00+05:30`);
let n = 0;
const enqueue = (at: Date, over: { template?: string; params?: Record<string, string> } = {}) =>
  asSchool((c) => queueWhatsAppMessage(c, queue, { schoolId: A, studentId: STUDENT, purpose: 'operational_communication', toPhone: '+910000000011', templateName: over.template ?? 'absence', templateParams: over.params ?? { child: 'Asha', date: '01-04-2099' }, dedupeKey: `o-${++n}` }, () => at));
const row = async (logId: string) => (await db.pg.query(`select status::text as status, reason, not_before, attempts, sending_at, provider, template_version as version, template_params as params, provider_message_id is not null as has_id from communication_log where log_id = $1`, [logId])).rows[0];
const jobs = async (logId: string) => (await db.pg.query(`select next_run_at, status from jobs where type = 'whatsapp.send' and payload->>'logId' = $1 order by created_at`, [logId])).rows;
const deliver = (logId: string, at: Date, provider: WhatsAppProvider) => deliverQueued({ platform, queue, now: () => at, provider }, logId);

describe('the outbox, on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end, timezone) values
        ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '21:00', '07:00', 'Asia/Kolkata'), ('${B}', 'School B', 'IN-HR', false, false, true, 100000, '21:00', '07:00', 'Asia/Kolkata');
      insert into students (student_id, school_id, admission_no, name, status) values ('${STUDENT}', '${A}', 'A-1', 'Asha', 'active');
      insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version, created_at) select '${A}', '${STUDENT}', 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1', '2020-01-01';
      insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values
        (null, 'absence', 1, 'en', '{{school}}: {{child}} was absent on {{date}}.', '{school,child,date}', 'utility', 720, 'approved'),
        (null, 'short_lived', 1, 'en', '{{school}}: the gate opens in ten minutes.', '{school}', 'utility', 60, 'approved'),
        (null, 'not_approved_yet', 1, 'en', '{{school}}: hello.', '{school}', 'utility', 60, 'pending');
    `);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('by day: queued in the caller’s transaction with one job, then sent once by the runner; a second run does nothing', async () => {
    const p = counting();
    const q = await enqueue(india(1, '10:00'));
    expect(q).toMatchObject({ status: 'queued', idempotent: false });
    expect(await row(q.logId)).toMatchObject({ status: 'queued', attempts: 0, sending_at: null, provider: null, version: null, params: { child: 'Asha', date: '01-04-2099' } });
    expect(await jobs(q.logId)).toHaveLength(1);
    expect(p.state.asked).toBe(0);
    expect(await deliver(q.logId, india(1, '10:01'), p.provider)).toEqual({ status: 'sent' });
    expect(await row(q.logId)).toMatchObject({ status: 'sent', attempts: 1, sending_at: null, provider: 'stand-in', version: 1, params: { school: 'School A', child: 'Asha', date: '01-04-2099' }, has_id: true });
    expect(await deliver(q.logId, india(1, '10:02'), p.provider)).toEqual({ status: 'sent' });
    expect(p.state.sent).toHaveLength(1);
  });

  it('a message at 22:00 is sent after 07:00, once', async () => {
    const p = counting();
    const q = await enqueue(india(1, '22:00'));
    expect(q.status).toBe('queued');
    expect(new Date((await row(q.logId)).not_before)).toEqual(india(2, '07:00'));
    expect(new Date((await jobs(q.logId))[0].next_run_at)).toEqual(india(2, '07:00'));
    // A runner that looks at it during the night leaves it where it is.
    expect(await deliver(q.logId, india(1, '23:30'), p.provider)).toEqual({ status: 'queued', retryAt: india(2, '07:00') });
    expect(await deliver(q.logId, india(2, '03:00'), p.provider)).toEqual({ status: 'queued', retryAt: india(2, '07:00') });
    expect(p.state.asked).toBe(0);
    expect((await row(q.logId)).status).toBe('queued');
    // After 07:00 it goes, and only once however often the runner comes back.
    expect(await deliver(q.logId, india(2, '07:00'), p.provider)).toEqual({ status: 'sent' });
    expect(await deliver(q.logId, india(2, '07:01'), p.provider)).toEqual({ status: 'sent' });
    expect(p.state.sent).toHaveLength(1);
    expect(await row(q.logId)).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('just after midnight the wait is until 07:00 the same day', async () => {
    const q = await enqueue(india(3, '00:30'));
    expect(new Date((await row(q.logId)).not_before)).toEqual(india(3, '07:00'));
  });

  it('a message that would be stale by the time quiet hours end is not sent, and says why', async () => {
    const p = counting();
    // Worth sending for an hour; quiet hours end nine hours later.
    const q = await enqueue(india(1, '22:00'), { template: 'short_lived', params: {} });
    expect(q).toMatchObject({ status: 'blocked_quiet_hours', jobKey: null, reason: expect.stringContaining('too old to be worth sending') });
    expect(await jobs(q.logId)).toEqual([]);
    // Queued by day, but the runner only reaches it two hours later: too old.
    const late = await enqueue(india(1, '10:00'), { template: 'short_lived', params: {} });
    expect(await deliver(late.logId, india(1, '12:00'), p.provider)).toEqual({ status: 'failed', reason: 'too old to be worth sending: it was written more than 60 minutes ago' });
    expect(await row(late.logId)).toMatchObject({ status: 'failed', reason: expect.stringContaining('too old'), has_id: false });
    expect(p.state.asked).toBe(0);
  });

  it('a provider failure is retried and the message is sent once', async () => {
    const p = counting();
    p.state.fail = 1;
    const q = await enqueue(india(4, '10:00'));
    const first = await deliver(q.logId, india(4, '10:00'), p.provider);
    expect(first).toEqual({ status: 'queued', retryAt: india(4, '10:02'), reason: 'the provider did not answer' });
    expect(await row(q.logId)).toMatchObject({ status: 'queued', attempts: 1, sending_at: null });
    expect((await jobs(q.logId)).map((j: { next_run_at: string }) => new Date(j.next_run_at))).toContainEqual(india(4, '10:02'));
    // The first job coming round again before the retry time changes nothing.
    expect(await deliver(q.logId, india(4, '10:01'), p.provider)).toEqual({ status: 'queued', retryAt: india(4, '10:02') });
    expect(p.state.asked).toBe(1);
    expect(await deliver(q.logId, india(4, '10:02'), p.provider)).toEqual({ status: 'sent' });
    expect(p.state.sent).toHaveLength(1);
    expect(await row(q.logId)).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('after the last attempt it is failed, with the provider’s reason, and not tried again', async () => {
    const p = counting();
    p.state.fail = 99;
    const q = await enqueue(india(5, '10:00'));
    let at = india(5, '10:00');
    for (let i = 1; i < MAX_SEND_ATTEMPTS; i += 1) at = (await deliver(q.logId, at, p.provider)).retryAt as Date;
    expect(await deliver(q.logId, at, p.provider)).toEqual({ status: 'failed', reason: 'the provider did not answer' });
    expect(await deliver(q.logId, new Date(at.getTime() + 3_600_000), p.provider)).toMatchObject({ status: 'failed' });
    expect(p.state.asked).toBe(MAX_SEND_ATTEMPTS);
    expect(p.state.sent).toEqual([]);
  });

  it('never twice: a send that was interrupted is not repeated, and says so', async () => {
    const p = counting();
    const q = await enqueue(india(6, '10:00'));
    // The process died after "sending" was committed and before the outcome was written.
    await db.pg.query(`update communication_log set sending_at = now(), attempts = 1 where log_id = $1`, [q.logId]);
    expect(await deliver(q.logId, india(6, '10:05'), p.provider)).toMatchObject({ status: 'failed', reason: expect.stringContaining('never messaged twice') });
    expect(p.state.asked).toBe(0);
    expect(await row(q.logId)).toMatchObject({ status: 'failed', sending_at: null });
  });

  it('“sending” is committed before the provider is asked', async () => {
    const p = counting();
    const q = await enqueue(india(7, '10:00'));
    let seen: unknown = null;
    // No transaction is open while the provider is asked, so what it can read here is what was committed.
    const snapshot = db.pg.query.bind(db.pg);
    const original = p.provider.send;
    p.provider.send = async (args) => {
      seen = (await snapshot(`select sending_at is not null as sending, attempts, status::text as status from communication_log where log_id = $1`, [q.logId])).rows[0];
      return original(args);
    };
    await deliver(q.logId, india(7, '10:00'), p.provider);
    expect(seen).toEqual({ sending: true, attempts: 1, status: 'queued' });
  });

  it('every rule is read again when it is sent: consent withdrawn in between stops it', async () => {
    const p = counting();
    const q = await enqueue(india(8, '10:00'));
    await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', false, (enum_range(null::consent_method))[1], 'v1'`, [A, STUDENT]);
    expect(await deliver(q.logId, india(8, '10:01'), p.provider)).toMatchObject({ status: 'blocked_consent' });
    expect(p.state.asked).toBe(0);
    expect(await row(q.logId)).toMatchObject({ status: 'blocked_consent', has_id: false });
    // And with consent gone, the next message is held at once and never queued.
    const next = await enqueue(india(8, '10:02'));
    expect(next).toMatchObject({ status: 'blocked_consent', jobKey: null });
    expect(await jobs(next.logId)).toEqual([]);
    await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [A, STUDENT]);
  });

  it('held at once and never queued: words not approved, a value missing; the same trigger twice is one message', async () => {
    expect(await enqueue(india(9, '10:00'), { template: 'not_approved_yet', params: {} })).toMatchObject({ status: 'blocked_no_template', jobKey: null });
    expect(await enqueue(india(9, '10:00'), { params: { child: 'Asha' } })).toMatchObject({ status: 'blocked_no_template', reason: expect.stringContaining('date') });
    const once = () => asSchool((c) => queueWhatsAppMessage(c, queue, { schoolId: A, studentId: STUDENT, purpose: 'operational_communication', toPhone: '+910000000011', templateName: 'absence', templateParams: { child: 'Asha', date: '09-04-2099' }, dedupeKey: 'same-trigger' }, () => india(9, '10:00')));
    const first = await once();
    const second = await once();
    expect(second).toMatchObject({ logId: first.logId, idempotent: true, jobKey: null });
    expect(await jobs(first.logId)).toHaveLength(1);
  });

  it('the job: a bad payload is refused; a good one delivers; a school may queue only its own school’s message', async () => {
    const p = counting();
    const handler = whatsappSendHandler({ platform, queue, now: () => india(10, '10:01'), provider: p.provider });
    await expect(handler({ payload: {} })).rejects.toThrow(/bad payload/);
    await expect(handler({ payload: { logId: 'x; drop table jobs' } })).rejects.toThrow(/bad payload/);
    const q = await enqueue(india(10, '10:00'));
    await handler({ payload: { logId: q.logId } });
    expect((await row(q.logId)).status).toBe('sent');
    const put = (school: string, type: string) => asSchool((c) => c.query(`insert into jobs (job_id, type, payload, idempotency_key, school_id) values (gen_random_uuid(), $2, '{}', $3, $1)`, [school, type, `k-${Math.random()}`])).then(() => 'allowed', (e: Error) => e.message);
    expect(await put(A, 'whatsapp.send')).toBe('allowed');
    expect(await put(B, 'whatsapp.send')).toMatch(/row-level security/);
    expect(await put(A, 'email.send')).toMatch(/row-level security/);
    expect(await asSchool((c) => c.query(`select 1 from jobs`)).then(() => 'read', (e: Error) => e.message)).toMatch(/permission denied/);
  });

  it('the database: a queued message may be stopped by a rule; a sent one is as fixed as before', async () => {
    const q = await enqueue(india(11, '10:00'));
    const set = (sql: string, id = q.logId) => platform((c) => c.query(`update communication_log set ${sql} where log_id = '${id}'`)).then(() => 'allowed', (e: Error) => e.message);
    expect(await set(`to_phone = '+910000000099'`)).toMatch(/never changes/);
    expect(await set(`status = 'delivered'`)).toBe('allowed'); // forward is forward
    const held = await enqueue(india(11, '10:01'));
    expect(await set(`status = 'blocked_budget'`, held.logId)).toBe('allowed');
    expect(await set(`status = 'queued'`, held.logId)).toMatch(/only moves forward/);
    expect(await set(`status = 'sent'`, held.logId)).toMatch(/only moves forward/);
    expect(await set(`template_params = '{}'`)).toMatch(/never changes/);
  });
});
