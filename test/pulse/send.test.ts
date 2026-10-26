import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { listDrafts } from '@/lib/pulse/drafts';
import { listFollowups } from '@/lib/pulse/followups';
import { pulseAnswer } from '@/lib/pulse/replies';
import { oneLine, sendPulse } from '@/lib/pulse/send';
import { applyNotices } from '@/lib/whatsapp/delivery';
import { deliverQueued, enqueueQueued } from '@/lib/whatsapp/gate';
import { StandInWhatsAppProvider, type WhatsAppNotice } from '@/lib/whatsapp/provider';
import { TEMPLATE_REGISTRY, definitionProblem, renderTemplate } from '@/lib/whatsapp/templates';

// Daily Pulse: sending, and parents' answers (docs/25 slice 7h, C189). Every number is made up.

describe('the words and the answers', () => {
  it('the Pulse template names the school first and carries the day’s update on one line', () => {
    const t = TEMPLATE_REGISTRY.find((x) => x.name === 'daily_pulse')!;
    expect(definitionProblem(t)).toBeNull();
    expect(t.purpose).toBe('daily_pulse');
    expect(oneLine('5-A, Maths: today the class learned “Fractions”.\nHomework: Exercise 4.\t Due on 14 October.')).toBe('5-A, Maths: today the class learned “Fractions”. Homework: Exercise 4. Due on 14 October.');
    expect(renderTemplate(t.body.en, { school: 'School A', update: 'x' })).toBe('From School A: x Reply 1 if your child understood today’s lesson, or 2 if your child needs help.');
  });
  it('an answer is one of two things, said plainly; anything else is just a message', () => {
    for (const yes of ['1', ' 1 ', 'Understood', 'समझ गए']) expect(pulseAnswer(yes), yes).toBe('understood');
    for (const help of ['2', 'help', 'मदद चाहिए', 'Needs help.']) expect(pulseAnswer(help), help).toBe('needs_help');
    for (const other of ['12', 'ok thanks', '1 or 2?', 'Will there be a test?', '']) expect(pulseAnswer(other), other).toBeNull();
  });
});

const SECRET = 'a-secret-for-this-test-only-0123456789abcdef';
const A = 'c8000000-0000-4000-8000-000000000001';
const u = (n: number) => `c8000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const PRINCIPAL = u(11);
const TEACHER_5A = u(12);
const TEACHER_6B = u(13);
const ACCOUNTANT = u(14);
const CLASS_5A = u(51);
const CLASS_6B = u(52);
const PULSE_5A = u(61);
const PULSE_6B = u(62);
const PULSE_DRAFT = u(63);
const standIn = new StandInWhatsAppProvider({ secret: SECRET });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const teacher5A: Who = { role: 'teacher', user: TEACHER_5A };
const teacher6B: Who = { role: 'teacher', user: TEACHER_6B };
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
let n = 0;
const writes = (fromPhone: string, text: string) => {
  const notices: WhatsAppNotice[] = [{ kind: 'inbound', providerMessageId: `standin-in-${++n}`, fromPhone, text, at: new Date().toISOString() }];
  const { rawBody, signature } = standIn.notice(notices);
  return platform((c) => applyNotices(c, standIn, rawBody, signature, enqueueQueued(queue)));
};
const deliverAll = async () => {
  const ids = (await db.pg.query(`select log_id from communication_log where status = 'queued' order by created_at, log_id`)).rows.map((r: { log_id: string }) => r.log_id);
  for (const id of ids) await deliverQueued({ platform, queue, provider: standIn }, id);
  return ids.length;
};
const log = async () => (await db.pg.query(`select s.name as child, l.to_phone as phone, l.status::text as status, l.purpose, l.template_params as p, l.reason from communication_log l join students s on s.student_id = l.student_id where l.template_name = 'daily_pulse' order by s.name, l.to_phone`)).rows;
const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    // 5-A: Asha (guardian consents to the Pulse), Bilal (guardian has NOT agreed to the Pulse), Chitra (no number), and
    // Dev and Esha, brother and sister with one guardian. 6-B: Farah.
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '00:00', '00:00');
      insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${TEACHER_5A}', '${A}', 't5a@school-a.example', 'teacher', 'Tara Teacher'),
        ('${TEACHER_6B}', '${A}', 't6b@school-a.example', 'teacher', 'Tarun Teacher'), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${CLASS_5A}', '${A}', '5-A', '${TEACHER_5A}'), ('${CLASS_6B}', '${A}', '6-B', '${TEACHER_6B}');
      insert into students (student_id, school_id, admission_no, name, status, class_id) values ('${u(31)}', '${A}', 'A-1', 'Asha', 'active', '${CLASS_5A}'), ('${u(32)}', '${A}', 'A-2', 'Bilal', 'active', '${CLASS_5A}'),
        ('${u(33)}', '${A}', 'A-3', 'Chitra', 'active', '${CLASS_5A}'), ('${u(34)}', '${A}', 'A-4', 'Dev', 'active', '${CLASS_5A}'), ('${u(35)}', '${A}', 'A-5', 'Esha', 'active', '${CLASS_5A}'), ('${u(36)}', '${A}', 'A-6', 'Farah', 'active', '${CLASS_6B}');
      insert into parents (parent_id, school_id, name, phone) values ('${u(41)}', '${A}', 'Guardian of Asha', '9000000001'), ('${u(42)}', '${A}', 'Guardian of Bilal', '9000000002'), ('${u(43)}', '${A}', 'Guardian of Chitra', 'not given'),
        ('${u(44)}', '${A}', 'Guardian of Dev and Esha', '+919000000004'), ('${u(46)}', '${A}', 'Guardian of Farah', '9000000006');
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${u(41)}', '${u(31)}'), ('${A}', '${u(42)}', '${u(32)}'), ('${A}', '${u(43)}', '${u(33)}'), ('${A}', '${u(44)}', '${u(34)}'), ('${A}', '${u(44)}', '${u(35)}'), ('${A}', '${u(46)}', '${u(36)}');
      insert into pulse_messages (pulse_id, school_id, class_id, topic, body_en, body_hi, body_hinglish, sent_on, status, created_by) values
        ('${PULSE_5A}', '${A}', '${CLASS_5A}', 'Fractions', '5-A, Maths: today the class learned “Fractions”.\nHomework: Exercise 4. Due on 14 October.', 'हिन्दी', 'hinglish', '${today}', 'ready', '${TEACHER_5A}'),
        ('${PULSE_6B}', '${A}', '${CLASS_6B}', 'Rivers', '6-B, Geography: today the class learned “Rivers”.', 'हिन्दी', 'hinglish', '${today}', 'ready', '${TEACHER_6B}'),
        ('${PULSE_DRAFT}', '${A}', '${CLASS_5A}', 'Verbs', '5-A, English: today the class learned “Verbs”.', 'हिन्दी', 'hinglish', '${today}', 'draft', '${TEACHER_5A}');
    `);
    const t = TEMPLATE_REGISTRY.find((x) => x.name === 'daily_pulse')!;
    await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, 'daily_pulse', 1, 'en', $1, $2, 'utility', 600, 'approved')`, [t.body.en, [...t.variables]]);
    // Everyone but Bilal's family has agreed to the Daily Pulse.
    for (const s of [31, 33, 34, 35, 36]) await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'daily_pulse', true, (enum_range(null::consent_method))[1], 'v1'`, [A, u(s)]);
    await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [A, u(32)]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('only a message a person marked ready sends, and only for a class the person may see', async () => {
    expect(await as(teacher5A, (c) => sendPulse(c, queue, actor(teacher5A), PULSE_DRAFT))).toEqual({ ok: false, reason: 'not_ready' });
    expect(await as(teacher5A, (c) => sendPulse(c, queue, actor(teacher5A), PULSE_6B))).toEqual({ ok: false, reason: 'not_found' }); // another teacher's class
    expect(await as({ role: 'accountant', user: ACCOUNTANT }, (c) => sendPulse(c, queue, { schoolId: A, userId: ACCOUNTANT, role: 'accountant' as never }, PULSE_5A))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await log()).toEqual([]);
    expect((await db.pg.query(`select count(*)::int as n from pulse_messages where status = 'sent'`)).rows[0].n).toBe(0);
  });

  it('sent by its teacher: to each child’s guardian under the Pulse consent; a family that has not agreed is held; no number, no message', async () => {
    const out = await as(teacher5A, (c) => sendPulse(c, queue, actor(teacher5A), PULSE_5A));
    expect(out).toEqual({ ok: true, queued: 3, held: 1, withoutNumber: 1 });
    const rows = await log();
    expect(rows.map((r: { child: string; phone: string; status: string }) => [r.child, r.phone, r.status])).toEqual([['Asha', '+919000000001', 'queued'], ['Bilal', '+919000000002', 'blocked_consent'], ['Dev', '+919000000004', 'queued'], ['Esha', '+919000000004', 'queued']]);
    expect(rows.every((r: { purpose: string }) => r.purpose === 'daily_pulse')).toBe(true);
    expect(rows[0].p).toEqual({ update: '5-A, Maths: today the class learned “Fractions”. Homework: Exercise 4. Due on 14 October.' });
    expect(rows[1].reason).toMatch(/consent for purpose "daily_pulse"/);
    expect((await db.pg.query(`select status, sent_by, sent_at is not null as at from pulse_messages where pulse_id = $1`, [PULSE_5A])).rows[0]).toEqual({ status: 'sent', sent_by: TEACHER_5A, at: true });
    // Once sent it is sent: not twice, and its words cannot be changed.
    expect(await as(teacher5A, (c) => sendPulse(c, queue, actor(teacher5A), PULSE_5A))).toEqual({ ok: false, reason: 'already_sent' });
    expect(await deliverAll()).toBe(3);
    const audit = (await db.pg.query(`select after_state from audit_log where event_action = 'pulse.sent'`)).rows;
    expect(audit).toEqual([{ after_state: { status: 'sent', queued: 3, held: 1, withoutNumber: 1 } }]);
    const mine = (await as(teacher5A, (c) => listDrafts(c, A, today))).find((d) => d.pulse_id === PULSE_5A);
    expect(mine).toMatchObject({ status: 'sent', queued: 3, held: 1, understood: 0, needs_help: 0 });
  });

  it('“understood” is counted; “needs help” opens a follow-up for that child, which that child’s teacher sees and another class’s teacher does not', async () => {
    await as(teacher6B, (c) => sendPulse(c, queue, actor(teacher6B), PULSE_6B));
    await deliverAll();
    await writes('+919000000001', '2');
    await writes('+919000000006', '1');
    const mine = (await as(teacher5A, (c) => listDrafts(c, A, today))).find((d) => d.pulse_id === PULSE_5A);
    expect(mine).toMatchObject({ understood: 0, needs_help: 1 });
    expect((await as(principal, (c) => listDrafts(c, A, today))).find((d) => d.pulse_id === PULSE_6B)).toMatchObject({ understood: 1, needs_help: 0 });
    const open5A = (await as(teacher5A, (c) => listFollowups(c, A))).open;
    expect(open5A).toHaveLength(1);
    expect(open5A[0]).toMatchObject({ student_id: u(31), kind: 'did_not_understand' });
    expect((await as(teacher6B, (c) => listFollowups(c, A))).open).toEqual([]);
    expect((await db.pg.query(`select source, created_by, class_id from pulse_followups`)).rows).toEqual([{ source: 'parent_reply', created_by: null, class_id: CLASS_5A }]);
    // A second "needs help" from the same parent does not open a second item.
    await writes('+919000000001', 'help');
    expect((await db.pg.query(`select count(*)::int as n from pulse_followups`)).rows[0].n).toBe(1);
    expect((await db.pg.query(`select count(*)::int as n from pulse_response_log where student_id = $1`, [u(31)])).rows[0].n).toBe(2);
  });

  it('never by guess: a parent of two children who answers is not tied to either; a parent who was not sent a Pulse, or who writes something else, is only a message', async () => {
    const before = (await db.pg.query(`select count(*)::int as n from pulse_response_log`)).rows[0].n;
    await writes('+919000000004', '2'); // Dev and Esha's guardian: which child?
    await writes('+919000000002', '2'); // Bilal's guardian: the Pulse was held, never sent
    await writes('+919000000006', 'Will there be a test on Friday?');
    expect((await db.pg.query(`select count(*)::int as n from pulse_response_log`)).rows[0].n).toBe(before);
    expect((await db.pg.query(`select count(*)::int as n from pulse_followups`)).rows[0].n).toBe(1);
    // Their words are still in the school's threads for a person to read.
    expect((await db.pg.query(`select count(*)::int as n from inbound_messages where body in ('2', 'Will there be a test on Friday?')`)).rows[0].n).toBe(4);
  });

  it('the language: a guardian’s own, else the school’s, else English; Hindi only once its wording is reviewed (C190)', async () => {
    const t = TEMPLATE_REGISTRY.find((x) => x.name === 'daily_pulse')!;
    const pulse = 'c8000000-0000-4000-8000-000000000064';
    await db.pg.query(`insert into pulse_messages (pulse_id, school_id, class_id, topic, body_en, body_hi, body_hinglish, sent_on, status, created_by) values ($1, $2, $3, 'Maps', '6-B, Geography: today the class learned “Maps”.', '6-B, भूगोल: आज कक्षा में “नक्शे” पढ़ाया गया।', 'hinglish', $4, 'ready', $5)`, [pulse, A, CLASS_6B, today, TEACHER_6B]);
    await db.pg.query(`update parents set preferred_language = 'hi' where parent_id = $1`, [u(46)]);
    await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, 'daily_pulse', 1, 'hi', $1, $2, 'utility', 600, 'approved')`, [t.body.hi, [...t.variables]]);
    // The guardian prefers Hindi and the Hindi version is approved, but nobody has reviewed its wording: English goes.
    await as(teacher6B, (c) => sendPulse(c, queue, actor(teacher6B), pulse));
    const first = (await db.pg.query(`select language, template_params->>'update' as said from communication_log where dedupe_key like $1`, [`pulse:${pulse}:%`])).rows;
    expect(first).toEqual([{ language: 'en', said: '6-B, Geography: today the class learned “Maps”.' }]);
    // Reviewed: the next day's message goes in Hindi, with the Hindi words.
    await db.pg.query(`update whatsapp_templates set wording_reviewed = true, wording_reviewed_by = $1, wording_reviewed_at = now(), wording_reviewed_note = 'Read by a Hindi teacher' where template_name = 'daily_pulse' and language = 'hi'`, [PRINCIPAL]);
    const next = 'c8000000-0000-4000-8000-000000000065';
    await db.pg.query(`insert into pulse_messages (pulse_id, school_id, class_id, topic, body_en, body_hi, body_hinglish, sent_on, status, created_by) values ($1, $2, $3, 'Maps 2', '6-B, Geography: today the class learned “Maps 2”.', '6-B, भूगोल: आज कक्षा में “नक्शे 2” पढ़ाया गया।', 'hinglish', $4, 'ready', $5)`, [next, A, CLASS_6B, today, TEACHER_6B]);
    await as(teacher6B, (c) => sendPulse(c, queue, actor(teacher6B), next));
    expect((await db.pg.query(`select language, template_params->>'update' as said from communication_log where dedupe_key like $1`, [`pulse:${next}:%`])).rows).toEqual([{ language: 'hi', said: '6-B, भूगोल: आज कक्षा में “नक्शे 2” पढ़ाया गया।' }]);
  });

  it('the database: a message is “sent” only with who sent it and when', async () => {
    await expect(db.pg.query(`update pulse_messages set status = 'sent' where pulse_id = $1`, [PULSE_DRAFT])).rejects.toThrow(/sent_says_who/);
    await expect(db.pg.query(`update pulse_messages set sent_at = now(), sent_by = $2 where pulse_id = $1`, [PULSE_DRAFT, TEACHER_5A])).rejects.toThrow(/sent_says_who/);
  });
});
