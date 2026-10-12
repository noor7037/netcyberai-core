import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { applyNotices } from '@/lib/whatsapp/delivery';
import { deliverQueued, enqueueQueued, queueThreadReply, queueWhatsAppMessage } from '@/lib/whatsapp/gate';
import { textSendBody } from '@/lib/whatsapp/meta';
import { normalizePhone, writtenForms } from '@/lib/whatsapp/phone';
import { StandInWhatsAppProvider, type WhatsAppNotice, type WhatsAppProvider } from '@/lib/whatsapp/provider';
import { isStop, liftOptOut, listThreads, threadMessages, unknownSenders } from '@/lib/whatsapp/replies';

// Parents' replies, threaded (docs/25 slice 7f, C187). Every number is made up; nothing leaves the process.

describe('numbers and words', () => {
  it('a number is written one way: plus, country code, number', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('+919876543210');
    expect(normalizePhone('9876543210')).toBe('+919876543210');
    expect(normalizePhone('09876543210')).toBe('+919876543210');
    expect(normalizePhone('919876543210')).toBe('+919876543210');
    expect(normalizePhone('+1 (650) 555-1234')).toBe('+16505551234');
    for (const bad of ['12345', '1234567890', 'not a number', '', '+0123456789']) expect(normalizePhone(bad), bad).toBeNull();
    expect(writtenForms('+919876543210')).toEqual(['919876543210', '9876543210', '09876543210']);
    expect(writtenForms('+16505551234')).toEqual(['16505551234']);
  });
  it('STOP is the whole message, in English or Hindi, and nothing else is', () => {
    for (const yes of ['STOP', ' stop ', 'Stop.', 'रोकें', 'बंद', 'बंद करें', 'UNSUBSCRIBE']) expect(isStop(yes), yes).toBe(true);
    for (const no of ['please do not stop the bus', 'stop sending homework so late', 'रोकें मत', 'ok']) expect(isStop(no), no).toBe(false);
  });
  it('a free-text send is Meta’s documented body', () => {
    expect(textSendBody({ toPhone: '+16505551234', text: 'Thank you, noted.' })).toEqual({ messaging_product: 'whatsapp', recipient_type: 'individual', to: '+16505551234', type: 'text', text: { preview_url: false, body: 'Thank you, noted.' } });
  });
});

const SECRET = 'a-secret-for-this-test-only-0123456789abcdef';
const A = 'c6000000-0000-4000-8000-000000000001';
const B = 'c6000000-0000-4000-8000-000000000002';
const TEST = 'c6000000-0000-4000-8000-000000000003';
const u = (n: number) => `c6000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const PRINCIPAL = u(11);
const TEACHER_5A = u(12);
const TEACHER_6B = u(13);
const ACCOUNTANT = u(14);
const B_PRINCIPAL = u(21);
const CLASS_5A = u(51);
const CLASS_6B = u(52);
const P_ASHA = u(71); // guardian of Asha (5-A), school A:            +919000000001
const P_BINA = u(72); // guardian of Bina (6-B), school A:            9000000002, written bare
const P_BOTH_A = u(73); // the same number is a guardian in A and B:  +919000000003
const P_BOTH_B = u(74);
const P_TEST = u(75); // a guardian in the test school:               +919000000005
const standIn = new StandInWhatsAppProvider({ secret: SECRET });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { school: string; role: string; user: string };
const principal: Who = { school: A, role: 'principal', user: PRINCIPAL };
const teacher5A: Who = { school: A, role: 'teacher', user: TEACHER_5A };
const teacher6B: Who = { school: A, role: 'teacher', user: TEACHER_6B };
const accountant: Who = { school: A, role: 'accountant', user: ACCOUNTANT };
const principalB: Who = { school: B, role: 'principal', user: B_PRINCIPAL };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', who.school], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
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
let n = 0;
const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
const writes = (fromPhone: string, text: string, hoursAgo = 0, id = `standin-in-${++n}`) => {
  const notices: WhatsAppNotice[] = [{ kind: 'inbound', providerMessageId: id, fromPhone, text, at: at(hoursAgo) }];
  const { rawBody, signature } = standIn.notice(notices);
  return platform((c) => applyNotices(c, standIn, rawBody, signature, enqueueQueued(queue)));
};
// A provider that keeps what it was asked to say.
const listening = () => {
  const said: { to: string; text: string }[] = [];
  const provider: WhatsAppProvider = {
    name: 'stand-in',
    send: async () => ({ success: true, providerMessageId: `standin-t-${Math.random().toString(36).slice(2)}`, errorMessage: null, raw: null }),
    sendText: async (p) => (said.push({ to: p.toPhone, text: p.text }), { success: true, providerMessageId: `standin-x-${said.length}-${Math.random().toString(36).slice(2)}`, errorMessage: null, raw: null }),
    testConnection: async () => ({ ok: true, message: 'made up' }),
    readNotice: () => ({ ok: false, reason: 'no_secret' }),
  };
  return { provider, said };
};
const runQueued = async (provider: WhatsAppProvider, now?: Date) => {
  const ids = (await db.pg.query(`select log_id from communication_log where status = 'queued' order by created_at`)).rows.map((r: { log_id: string }) => r.log_id);
  const out = [];
  for (const id of ids) out.push(await deliverQueued({ platform, queue, provider, ...(now ? { now: () => now } : {}) }, id));
  return out;
};
const threadOf = async (school: string, phone: string) => (await db.pg.query(`select thread_id from message_threads where school_id = $1 and phone = $2`, [school, phone])).rows[0]?.thread_id as string | undefined;

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values
        ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '00:00', '00:00'), ('${B}', 'School B', 'IN-HR', false, false, true, 100000, '00:00', '00:00'), ('${TEST}', 'Test School', 'IN-HR', true, false, true, 100000, '00:00', '00:00');
      insert into users (user_id, school_id, email, role, display_name) values
        ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${TEACHER_5A}', '${A}', 't5a@school-a.example', 'teacher', 'Tara Teacher'), ('${TEACHER_6B}', '${A}', 't6b@school-a.example', 'teacher', 'Tarun Teacher'),
        ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant'), ('${B_PRINCIPAL}', '${B}', 'principal@school-b.example', 'principal', 'Principal B');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${CLASS_5A}', '${A}', '5-A', '${TEACHER_5A}'), ('${CLASS_6B}', '${A}', '6-B', '${TEACHER_6B}');
      insert into students (student_id, school_id, admission_no, name, status, class_id) values ('${u(31)}', '${A}', 'A-1', 'Asha', 'active', '${CLASS_5A}'), ('${u(32)}', '${A}', 'A-2', 'Bina', 'active', '${CLASS_6B}'), ('${u(33)}', '${A}', 'A-3', 'Chetan', 'active', '${CLASS_5A}'),
        ('${u(34)}', '${B}', 'B-1', 'Deepa', 'active', null), ('${u(35)}', '${TEST}', 'T-1', 'Esha', 'active', null);
      insert into parents (parent_id, school_id, name, phone) values ('${P_ASHA}', '${A}', 'Guardian of Asha', '+919000000001'), ('${P_BINA}', '${A}', 'Guardian of Bina', '9000000002'),
        ('${P_BOTH_A}', '${A}', 'Guardian in both', '+91 90000 00003'), ('${P_BOTH_B}', '${B}', 'Guardian in both', '09000000003'), ('${P_TEST}', '${TEST}', 'Test Guardian', '+919000000005');
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${P_ASHA}', '${u(31)}'), ('${A}', '${P_BINA}', '${u(32)}'), ('${A}', '${P_BOTH_A}', '${u(33)}'), ('${B}', '${P_BOTH_B}', '${u(34)}'), ('${TEST}', '${P_TEST}', '${u(35)}');
      insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, 'absence', 1, 'en', '{{school}}: {{child}} was absent on {{date}}.', '{school,child,date}', 'utility', 720, 'approved');
    `);
    for (const [school, student] of [[A, u(31)], [A, u(32)], [A, u(33)], [B, u(34)], [TEST, u(35)]]) await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [school, student]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('a parent’s message lands in their own school’s thread, however the school wrote the number down; the same message twice is one', async () => {
    expect(await writes('+919000000001', 'Asha has fever today', 1, 'standin-in-fixed')).toMatchObject({ status: 200, inbound: 1 });
    expect(await writes('+919000000001', 'Asha has fever today', 1, 'standin-in-fixed')).toMatchObject({ status: 200, inbound: 0 }); // the same message again: counted once, kept once
    await writes('+919000000002', 'Will Bina’s bus be late?', 2);
    const office = await as(principal, (c) => listThreads(c, A));
    expect(office.map((t) => [t.guardian, t.children, t.phone_last4, t.unread, t.last_text, t.window_open, t.stopped])).toEqual([
      ['Guardian of Asha', 'Asha', '0001', 1, 'Asha has fever today', true, false],
      ['Guardian of Bina', 'Bina', '0002', 1, 'Will Bina’s bus be late?', true, false],
    ]);
    expect((await db.pg.query(`select count(*)::int as n from inbound_messages`)).rows[0].n).toBe(2);
    // The notice kept in webhook_events has no words and no number.
    expect(JSON.stringify((await db.pg.query(`select payload from webhook_events`)).rows)).not.toMatch(/fever|bus|9000000001/);
  });

  it('it reaches only its own school and the right staff: a teacher sees their own classes’ guardians, an accountant none, another school none', async () => {
    expect((await as(teacher5A, (c) => listThreads(c, A))).map((t) => t.guardian)).toEqual(['Guardian of Asha']);
    expect((await as(teacher6B, (c) => listThreads(c, A))).map((t) => t.guardian)).toEqual(['Guardian of Bina']);
    expect(await as(accountant, (c) => listThreads(c, A))).toEqual([]);
    expect(await as(principalB, (c) => listThreads(c, B))).toEqual([]);
    expect(await as(principalB, (c) => listThreads(c, A))).toEqual([]);
    const binas = (await threadOf(A, '+919000000002')) as string;
    expect(await as(teacher5A, (c) => threadMessages(c, A, binas))).toBeNull();
    expect(((await as(teacher5A, (c) => c.query(`select 1 from inbound_messages`))) as { rows: unknown[] }).rows).toHaveLength(1);
    expect(((await as(accountant, (c) => c.query(`select 1 from inbound_messages`))) as { rows: unknown[] }).rows).toHaveLength(0);
    // A teacher cannot answer a thread that is not theirs: for them it does not exist.
    expect(await as(teacher5A, (c) => queueThreadReply(c, queue, { schoolId: A, userId: TEACHER_5A }, binas, 'hello'))).toEqual({ ok: false, reason: 'no_thread' });
  });

  it('a number no school knows: counted, without its words or the number; a number in two schools goes to the one that last wrote to it, or to neither', async () => {
    expect(await writes('+919999999999', 'Is this the tuition centre?')).toMatchObject({ inbound: 1 });
    expect(await platform((c) => unknownSenders(c))).toBe(1);
    const kept: unknown[] = (await db.pg.query(`select school_id, thread_id, body from inbound_messages where school_id is null`)).rows;
    expect(kept).toEqual([{ school_id: null, thread_id: null, body: null }]);
    expect(JSON.stringify((await db.pg.query(`select * from inbound_messages where school_id is null`)).rows)).not.toMatch(/tuition|9999999999/);
    // Guardian in both A and B; neither school has written to the number: nobody's.
    await writes('+919000000003', 'Which school is this from?');
    expect(await platform((c) => unknownSenders(c))).toBe(2);
    expect(await threadOf(A, '+919000000003')).toBeUndefined();
    expect(await threadOf(B, '+919000000003')).toBeUndefined();
    // School B writes to that number; the parent's next message is B's, and A never sees it.
    const sent = await as(principalB, (c) => queueWhatsAppMessage(c, queue, { schoolId: B, studentId: u(34), parentId: P_BOTH_B, purpose: 'operational_communication', toPhone: '09000000003', templateName: 'absence', templateParams: { child: 'Deepa', date: '01-04-2099' }, dedupeKey: 'b-absence' }));
    await deliverQueued({ platform, queue, provider: listening().provider }, sent.logId);
    await writes('+919000000003', 'Deepa was at the doctor');
    expect((await as(principalB, (c) => listThreads(c, B))).map((t) => [t.guardian, t.last_text])).toEqual([['Guardian in both', 'Deepa was at the doctor']]);
    expect((await as(principal, (c) => listThreads(c, A))).some((t) => t.phone_last4 === '0003')).toBe(false);
  });

  it('staff answer in their own words inside 24 hours; the reply goes once, through the gate, and shows in the thread; opening marks it read', async () => {
    const p = listening();
    const thread = (await threadOf(A, '+919000000001')) as string;
    expect(await as(teacher5A, (c) => queueThreadReply(c, queue, { schoolId: A, userId: TEACHER_5A }, thread, '   '))).toEqual({ ok: false, reason: 'text' });
    const reply = await as(teacher5A, (c) => queueThreadReply(c, queue, { schoolId: A, userId: TEACHER_5A }, thread, 'Thank you. I hope Asha feels better soon.'));
    expect(reply.ok).toBe(true);
    expect(p.said).toEqual([]);
    expect(await runQueued(p.provider)).toEqual([{ status: 'sent', reason: null }]);
    expect(await runQueued(p.provider)).toEqual([]);
    expect(p.said).toEqual([{ to: '+919000000001', text: 'Thank you. I hope Asha feels better soon.' }]);
    const view = await as(teacher5A, (c) => threadMessages(c, A, thread));
    expect(view?.messages.map((m) => [m.direction, m.text, m.status, m.by])).toEqual([['in', 'Asha has fever today', null, null], ['out', 'Thank you. I hope Asha feels better soon.', 'sent', 'Tara Teacher']]);
    const row = (await db.pg.query(`select billable, cost_basis, provider, sent_by, template_name from communication_log where thread_id = $1`, [thread])).rows[0];
    expect(row).toEqual({ billable: false, cost_basis: 'not_billable', provider: 'stand-in', sent_by: TEACHER_5A, template_name: null });
  });

  it('free text after 24 hours is refused, when asked and again when it would be sent', async () => {
    const p = listening();
    await writes('+919000000002', 'An old question', 30);
    const thread = (await threadOf(A, '+919000000002')) as string;
    // The newest message from this parent is 2 hours old (the first test): still open.
    expect((await as(principal, (c) => queueThreadReply(c, queue, { schoolId: A, userId: PRINCIPAL }, thread, 'The bus is on time.'))).ok).toBe(true);
    // The runner only reaches it 23 hours later: the window has closed in between.
    expect(await runQueued(p.provider, new Date(Date.now() + 23 * 3_600_000))).toEqual([{ status: 'failed', reason: 'more than 24 hours have passed since the parent last wrote; free text can no longer be sent' }]);
    expect(p.said).toEqual([]);
    // And asked for after 24 hours, it is not even queued.
    expect(await as(principal, (c) => queueThreadReply(c, queue, { schoolId: A, userId: PRINCIPAL }, thread, 'Hello?', () => new Date(Date.now() + 25 * 3_600_000)))).toEqual({ ok: false, reason: 'window_closed' });
    expect((await as(principal, (c) => listThreads(c, A))).find((t) => t.thread_id === thread)?.window_open).toBe(true);
  });

  it('STOP: the number is stopped at once, the parent is told once, the next send is held, the consent ledger is untouched, and the office can lift it', async () => {
    const p = listening();
    const consentBefore = (await db.pg.query(`select count(*)::int as n from consent_ledger`)).rows[0].n;
    await writes('+919000000001', 'STOP');
    const thread = (await threadOf(A, '+919000000001')) as string;
    expect((await as(principal, (c) => listThreads(c, A))).find((t) => t.thread_id === thread)).toMatchObject({ stopped: true });
    // Told once, in the words written in the code, naming the school first.
    expect(await runQueued(p.provider)).toEqual([{ status: 'sent', reason: null }]);
    expect(p.said).toEqual([{ to: '+919000000001', text: 'School A: You will not get WhatsApp messages from the school any more. To start them again, please tell the school office.' }]);
    await writes('+919000000001', 'stop');
    expect(await runQueued(p.provider)).toEqual([]);
    expect(p.said).toHaveLength(1);
    // The next message to that number is held, at once, for consent; another guardian's still goes.
    const absent = (student: string, parent: string, phone: string, key: string) => as(principal, (c) => queueWhatsAppMessage(c, queue, { schoolId: A, studentId: student, parentId: parent, purpose: 'operational_communication', toPhone: phone, templateName: 'absence', templateParams: { child: 'x', date: '01-04-2099' }, dedupeKey: key }));
    expect(await absent(u(31), P_ASHA, '+91 90000 00001', 'after-stop')).toMatchObject({ status: 'blocked_consent', reason: 'this number asked to stop WhatsApp messages from the school', jobKey: null });
    expect((await absent(u(32), P_BINA, '9000000002', 'other-guardian')).status).toBe('queued');
    // A reply in the thread is refused too.
    expect(await as(teacher5A, (c) => queueThreadReply(c, queue, { schoolId: A, userId: TEACHER_5A }, thread, 'Are you sure?'))).toEqual({ ok: false, reason: 'stopped' });
    // WhatsApp only: nothing was written to the consent ledger.
    expect((await db.pg.query(`select count(*)::int as n from consent_ledger`)).rows[0].n).toBe(consentBefore);
    // A teacher cannot lift it in the database either.
    expect(((await as(teacher5A, (c) => c.query(`update whatsapp_opt_outs set lifted_at = now(), lifted_by = $1, lift_reason = 'x' where lifted_at is null`, [TEACHER_5A]))) as { rowCount: number }).rowCount).toBe(0);
    // Lifted by the office, with a reason; a teacher cannot.
    expect(await as(teacher5A, (c) => liftOptOut(c, { schoolId: A, userId: TEACHER_5A, role: 'teacher' as never }, thread, 'x'))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => liftOptOut(c, { schoolId: A, userId: PRINCIPAL, role: 'principal' as never }, thread, ''))).toEqual({ ok: false, reason: 'reason' });
    expect(await as(principal, (c) => liftOptOut(c, { schoolId: A, userId: PRINCIPAL, role: 'principal' as never }, thread, 'The mother came to the office and asked for messages again'))).toEqual({ ok: true });
    expect(await as(principal, (c) => liftOptOut(c, { schoolId: A, userId: PRINCIPAL, role: 'principal' as never }, thread, 'again'))).toEqual({ ok: false, reason: 'not_found' });
    expect((await absent(u(31), P_ASHA, '+919000000001', 'after-lift')).status).toBe('queued');
    const audit = (await db.pg.query(`select event_action from audit_log where event_action like 'whatsapp.stop%' order by audit_id`)).rows.map((r: { event_action: string }) => r.event_action);
    expect(audit).toEqual(['whatsapp.stopped_by_parent', 'whatsapp.stop_lifted']);
  });

  it('a test school’s reply never goes to a real account', async () => {
    await writes('+919000000005', 'Hello from a test guardian');
    const thread = (await threadOf(TEST, '+919000000005')) as string;
    const who: Who = { school: TEST, role: 'principal', user: PRINCIPAL };
    expect((await as(who, (c) => queueThreadReply(c, queue, { schoolId: TEST, userId: PRINCIPAL }, thread, 'Hello'))).ok).toBe(true);
    const real = { ...listening().provider, name: 'meta' as const };
    const asked = vi.fn();
    real.sendText = async () => (asked(), { success: true, providerMessageId: 'x', errorMessage: null, raw: null });
    const mine = (await db.pg.query(`select log_id from communication_log where thread_id = $1 and status = 'queued'`, [thread])).rows[0].log_id;
    expect(await deliverQueued({ platform, queue, provider: real }, mine)).toEqual({ status: 'failed', reason: 'a test school never sends through a real account' });
    expect(asked).not.toHaveBeenCalled();
  });

  it('the database: a thread is whose it is; an opt-out is only lifted, once; free text belongs to a thread; no school role writes a parent’s words', async () => {
    const thread = (await threadOf(A, '+919000000002')) as string;
    const no = (run: () => Promise<unknown>) => run().then(() => 'allowed', (e: Error) => e.message);
    expect(await no(() => as(principal, (c) => c.query(`update message_threads set phone = '+919000000009' where thread_id = $1`, [thread])))).toMatch(/never changes/);
    expect(await no(() => as(principal, (c) => c.query(`update message_threads set unread = 0 where thread_id = $1`, [thread])))).toBe('allowed');
    expect(await no(() => as(principal, (c) => c.query(`insert into inbound_messages (school_id, thread_id, provider, provider_message_id, body, received_at) values ($1, $2, 'stand-in', 'forged', 'I agree to everything', now())`, [A, thread])))).toMatch(/permission denied/);
    expect(await no(() => as(principal, (c) => c.query(`delete from inbound_messages`)))).toMatch(/permission denied/);
    expect(await no(() => as(principal, (c) => c.query(`insert into whatsapp_opt_outs (school_id, phone) values ($1, '+919000000002')`, [A])))).toMatch(/permission denied/);
    expect(await no(() => platform((c) => c.query(`update whatsapp_opt_outs set lifted_at = null, lifted_by = null, lift_reason = null`)))).toMatch(/only ever lifted, once/);
    expect(await no(() => platform((c) => c.query(`insert into communication_log (school_id, channel, status, body) values ($1, 'whatsapp', 'queued', 'words out of nowhere')`, [A])))).toMatch(/free_text_is_a_reply/);
    const reply = (await db.pg.query(`select log_id from communication_log where body is not null and status = 'sent' limit 1`)).rows[0].log_id;
    expect(await no(() => platform((c) => c.query(`update communication_log set body = 'other words' where log_id = $1`, [reply])))).toMatch(/never changes/);
  });
});
