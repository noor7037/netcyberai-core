import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { cancelEvent, createEvent, eventAnswer, eventRemindHandler, inviteEvent, listEvents } from '@/lib/events/events';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { sayDate } from '@/lib/ptm/ptm';
import { applyNotices } from '@/lib/whatsapp/delivery';
import { deliverQueued, enqueueQueued } from '@/lib/whatsapp/gate';
import { StandInWhatsAppProvider, type WhatsAppNotice } from '@/lib/whatsapp/provider';
import { TEMPLATE_REGISTRY, definitionProblem } from '@/lib/whatsapp/templates';

// School events (docs/25 slice 7l, C194). The acceptance test: only the invited classes receive it, and a cancelled
// event tells those invited. Every name and number is made up.

describe('the words', () => {
  it('YES and NO, said plainly; anything else is just a message', () => {
    for (const yes of ['YES', ' yes. ', 'Y', 'haan', 'हाँ']) expect(eventAnswer(yes), yes).toBe('yes');
    for (const no of ['NO', 'no!', 'n', 'nahi', 'नहीं']) expect(eventAnswer(no), no).toBe('no');
    for (const other of ['yes we will come with grandparents', 'maybe', '1', '10:30', 'STOP', '']) expect(eventAnswer(other), other).toBeNull();
  });
  it('every event template names the school first', () => {
    const mine = TEMPLATE_REGISTRY.filter((t) => t.name.startsWith('event_'));
    expect(mine.map((t) => t.name)).toEqual(['event_invitation', 'event_reminder', 'event_cancelled']);
    for (const t of mine) expect(definitionProblem(t), t.name).toBeNull();
  });
});

const SECRET = 'a-secret-for-this-test-only-0123456789abcdef';
const A = 'cc000000-0000-4000-8000-000000000001';
const u = (n: number) => `cc000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, TARA, TARUN] = [u(11), u(12), u(13)];
const [CLASS_5A, CLASS_6B] = [u(51), u(52)];
const standIn = new StandInWhatsAppProvider({ secret: SECRET });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const tara: Who = { role: 'teacher', user: TARA };
const tarun: Who = { role: 'teacher', user: TARUN };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const as = <T>(who: Who, fn: (client: any) => Promise<T>): Promise<T> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.pg.transaction(async (tx: any) => {
    await tx.query('set local role app_user');
    for (const [k, v] of [['app.current_tenant_id', A], ['app.current_role', who.role], ['app.current_user_id', who.user]]) await tx.query(`select set_config($1, $2, true)`, [k, v]);
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
const actor = (who: Who) => ({ schoolId: A, userId: who.user, role: who.role as never });
const day = (plus: number) => new Date(Date.now() + 5.5 * 3600_000 + plus * 86400_000).toISOString().slice(0, 10);
let n = 0;
const writes = (fromPhone: string, text: string) => {
  const notices: WhatsAppNotice[] = [{ kind: 'inbound', providerMessageId: `standin-in-${++n}`, fromPhone, text, at: new Date().toISOString() }];
  const { rawBody, signature } = standIn.notice(notices);
  return platform((c) => applyNotices(c, standIn, rawBody, signature, enqueueQueued(queue)));
};
const deliverAll = async () => {
  const ids = (await db.pg.query(`select log_id from communication_log where status = 'queued' order by created_at, log_id`)).rows.map((r: { log_id: string }) => r.log_id);
  for (const id of ids) await deliverQueued({ platform, queue, provider: standIn }, id);
};
const phones = async (template: string, eventId: string) => (await db.pg.query(`select to_phone from communication_log where template_name = $1 and dedupe_key like $2 order by to_phone`, [template, `event:${eventId}:%`])).rows.map((r: { to_phone: string }) => r.to_phone);
const remind = (eventId: string) => eventRemindHandler({ platform, queue })({ jobId: 'j', type: 'event.remind', payload: { eventId }, attempts: 1, maxAttempts: 3, schoolId: A, idempotencyKey: 'k' });
const made = async (input: { title: string; classIds: string[]; heldOn?: string }) => {
  const r = await as(principal, (c) => createEvent(c, actor(principal), { title: input.title, heldOn: input.heldOn ?? day(4), startsAt: '09:30', details: 'In the school hall. Please be seated by 9:15.', classIds: input.classIds }));
  if (!r.ok) throw new Error(r.reason);
  return r.eventId;
};
let SPORTS = '';
let FAIR = '';

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    // 5-A (Tara): Asha; Dev and Esha with one guardian; Bilal, whose guardian has not agreed to messages. 6-B (Tarun): Farah.
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '00:00', '00:00');
      insert into school_module_entitlements (school_id, module_id, enabled, source) values ('${A}', 'events', true, 'plan'), ('${A}', 'ptm', true, 'plan');
      insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher'), ('${TARUN}', '${A}', 'tarun@school-a.example', 'teacher', 'Tarun Teacher');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${CLASS_5A}', '${A}', '5-A', '${TARA}'), ('${CLASS_6B}', '${A}', '6-B', '${TARUN}');
      insert into students (student_id, school_id, admission_no, name, status, class_id) values ('${u(31)}', '${A}', 'A-1', 'Asha', 'active', '${CLASS_5A}'), ('${u(32)}', '${A}', 'A-2', 'Bilal', 'active', '${CLASS_5A}'),
        ('${u(34)}', '${A}', 'A-4', 'Dev', 'active', '${CLASS_5A}'), ('${u(35)}', '${A}', 'A-5', 'Esha', 'active', '${CLASS_5A}'), ('${u(36)}', '${A}', 'A-6', 'Farah', 'active', '${CLASS_6B}');
      insert into parents (parent_id, school_id, name, phone) values ('${u(41)}', '${A}', 'Anita Sharma', '9000000001'), ('${u(42)}', '${A}', 'Bashir Khan', '9000000002'), ('${u(44)}', '${A}', 'Deepa Rao', '+919000000004'), ('${u(46)}', '${A}', 'Fatima Ali', '9000000006');
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${u(41)}', '${u(31)}'), ('${A}', '${u(42)}', '${u(32)}'), ('${A}', '${u(44)}', '${u(34)}'), ('${A}', '${u(44)}', '${u(35)}'), ('${A}', '${u(46)}', '${u(36)}');
    `);
    for (const t of TEMPLATE_REGISTRY.filter((x) => x.name.startsWith('event_'))) await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, $1, 1, 'en', $2, $3, 'utility', $4, 'approved')`, [t.name, t.body.en, [...t.variables], t.staleAfterMinutes]);
    for (const s of [31, 34, 35, 36]) await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [A, u(s)]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('the office makes an event; a teacher cannot; a draft sends nothing', async () => {
    const input = { title: 'Sports day', heldOn: day(4), startsAt: '09:30', details: 'On the school ground.', classIds: [CLASS_5A] };
    expect(await as(tara, (c) => createEvent(c, actor(tara), input))).toEqual({ ok: false, reason: 'not_allowed' });
    await expect(as(tara, (c) => c.query(`insert into school_events (school_id, title, held_on, details, class_ids, created_by) values ('${A}', 'x', '${day(4)}', 'y', '{}', '${TARA}')`))).rejects.toThrow(/row-level security/);
    expect(await as(principal, (c) => createEvent(c, actor(principal), { ...input, heldOn: day(-1) }))).toEqual({ ok: false, reason: 'date' });
    expect(await as(principal, (c) => createEvent(c, actor(principal), { ...input, details: ' ' }))).toEqual({ ok: false, reason: 'details' });
    expect(await as(principal, (c) => createEvent(c, actor(principal), { ...input, classIds: [u(99)] }))).toEqual({ ok: false, reason: 'classes' });
    SPORTS = await made({ title: 'Sports day', classIds: [CLASS_5A] });
    expect((await db.pg.query(`select count(*)::int as n from communication_log`)).rows[0].n).toBe(0);
    // A teacher sees the events of their own classes; another class's teacher does not see this one.
    expect((await as(tara, (c) => listEvents(c, A))).map((e) => e.title)).toEqual(['Sports day']);
    expect(await as(tarun, (c) => listEvents(c, A))).toEqual([]);
  });

  it('only the invited classes receive it: once to each guardian’s number; no consent, held', async () => {
    expect(await as(tara, (c) => inviteEvent(c, queue, actor(tara), SPORTS))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => inviteEvent(c, queue, actor(principal), SPORTS))).toEqual({ ok: true, queued: 2, held: 1, withoutNumber: 0 });
    // Asha's and Dev-and-Esha's guardians (one message for brother and sister); Bilal's is held; Farah's (6-B) is not in it at all.
    const rows = (await db.pg.query(`select to_phone as phone, status::text as status, template_params as p from communication_log order by to_phone`)).rows;
    expect(rows.map((r: { phone: string; status: string }) => [r.phone, r.status])).toEqual([['+919000000001', 'queued'], ['+919000000002', 'blocked_consent'], ['+919000000004', 'queued']]);
    expect(rows[0].p).toEqual({ title: 'Sports day', when: `${sayDate(day(4))} at 9:30 am`, details: 'In the school hall. Please be seated by 9:15.' });
    expect(await as(principal, (c) => inviteEvent(c, queue, actor(principal), SPORTS))).toEqual({ ok: false, reason: 'not_draft' });
    expect((await db.pg.query(`select count(*)::int as n from jobs where type = 'event.remind'`)).rows[0].n).toBe(1);
    await deliverAll();
    expect((await as(principal, (c) => listEvents(c, A)))[0]).toMatchObject({ status: 'invited', classes: '5-A', invited: 2, yes: 0, no: 0 });
  });

  it('YES and NO are counted, the latest answer kept; a number not invited, or words that are not an answer, count for nothing', async () => {
    await writes('+919000000001', 'YES');
    await writes('+919000000004', 'no');
    await writes('+919000000006', 'yes'); // Farah's guardian was not invited
    await writes('+919000000002', 'yes'); // Bilal's guardian's invitation was held back, never sent
    await writes('+919000000001', 'We will all come, thank you');
    expect((await as(principal, (c) => listEvents(c, A)))[0]).toMatchObject({ invited: 2, yes: 1, no: 1 });
    await writes('+919000000004', 'Yes.');
    expect((await as(principal, (c) => listEvents(c, A)))[0]).toMatchObject({ yes: 2, no: 0 });
    await writes('+919000000004', 'NO');
    expect((await db.pg.query(`select count(*)::int as n from event_replies`)).rows[0].n).toBe(2);
    // The class teacher sees the answers of her own class's guardians.
    expect((await as(tara, (c) => listEvents(c, A)))[0]).toMatchObject({ yes: 1, no: 1 });
  });

  it('an event for every class goes to every class; then YES is not guessed between two events', async () => {
    FAIR = await made({ title: 'Science fair', classIds: [] });
    expect(await as(principal, (c) => inviteEvent(c, queue, actor(principal), FAIR))).toEqual({ ok: true, queued: 3, held: 1, withoutNumber: 0 });
    expect(await phones('event_invitation', FAIR)).toEqual(['+919000000001', '+919000000002', '+919000000004', '+919000000006']);
    await deliverAll();
    expect((await as(tarun, (c) => listEvents(c, A))).map((e) => e.title)).toEqual(['Science fair']); // the whole school's, not 5-A's
    await writes('+919000000006', 'yes'); // invited to one event: counted
    await writes('+919000000001', 'no'); // invited to two: not guessed
    const [fair, sports] = await as(principal, (c) => listEvents(c, A));
    expect(fair).toMatchObject({ title: 'Science fair', classes: null, invited: 3, yes: 1, no: 0 });
    expect(sports).toMatchObject({ yes: 1, no: 1 });
  });

  it('the day before, those invited who did not say no are reminded, once', async () => {
    await remind(SPORTS);
    expect(await phones('event_reminder', SPORTS)).toEqual(['+919000000001']); // Deepa said no; Bashir was never invited
    await remind(SPORTS);
    expect(await phones('event_reminder', SPORTS)).toHaveLength(1);
  });

  it('a cancelled event tells those invited, whatever they answered, and nobody else; then it reminds nobody and counts nothing', async () => {
    expect(await as(tara, (c) => cancelEvent(c, queue, actor(tara), SPORTS))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => cancelEvent(c, queue, actor(principal), SPORTS))).toEqual({ ok: true, told: 2 });
    expect(await phones('event_cancelled', SPORTS)).toEqual(['+919000000001', '+919000000004']);
    expect((await db.pg.query(`select template_params as p from communication_log where template_name = 'event_cancelled' limit 1`)).rows[0].p).toEqual({ title: 'Sports day', when: `${sayDate(day(4))} at 9:30 am` });
    expect(await as(principal, (c) => cancelEvent(c, queue, actor(principal), SPORTS))).toEqual({ ok: false, reason: 'already_cancelled' });
    await remind(SPORTS);
    expect(await phones('event_reminder', SPORTS)).toHaveLength(1); // the one from before; none after the cancellation
    // With one event left open for her, Anita's NO is now plain.
    await writes('+919000000001', 'no');
    expect((await as(principal, (c) => listEvents(c, A))).find((e) => e.title === 'Science fair')).toMatchObject({ yes: 1, no: 1 });
    // A draft that is cancelled tells nobody.
    const draft = await made({ title: 'Picnic', classIds: [CLASS_6B] });
    expect(await as(principal, (c) => cancelEvent(c, queue, actor(principal), draft))).toEqual({ ok: true, told: 0 });
  });
});
