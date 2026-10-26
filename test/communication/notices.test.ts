import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { decideNotice, listNotices, noticeClasses, writeNotice } from '@/lib/communication/notices';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { applyNotices } from '@/lib/whatsapp/delivery';
import { deliverQueued, enqueueQueued } from '@/lib/whatsapp/gate';
import { StandInWhatsAppProvider, type WhatsAppNotice } from '@/lib/whatsapp/provider';
import { TEMPLATE_REGISTRY, definitionProblem, renderTemplate } from '@/lib/whatsapp/templates';

// Notices to parents (docs/25 slice 7i, C191). The acceptance test: a teacher reaches only their own classes, and
// nothing sends unapproved. Every name and number is made up.

const SECRET = 'a-secret-for-this-test-only-0123456789abcdef';
const A = 'c9000000-0000-4000-8000-000000000001';
const u = (n: number) => `c9000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const PRINCIPAL = u(11);
const TEACHER_5A = u(12);
const TEACHER_6B = u(13);
const ADMIN = u(14);
const ACCOUNTANT = u(15);
const CLASS_5A = u(51);
const CLASS_6B = u(52);
const standIn = new StandInWhatsAppProvider({ secret: SECRET });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const teacher5A: Who = { role: 'teacher', user: TEACHER_5A };
const teacher6B: Who = { role: 'teacher', user: TEACHER_6B };
const admin: Who = { role: 'school_admin', user: ADMIN };
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
const sends = async () => (await db.pg.query(`select count(*)::int as n from communication_log`)).rows[0].n + (await db.pg.query(`select count(*)::int as n from jobs where type = 'whatsapp.send'`)).rows[0].n;
const log = async (noticeId: string) => (await db.pg.query(`select s.name as child, l.to_phone as phone, l.status::text as status, l.purpose, l.template_name as template, l.template_params as p from communication_log l join students s on s.student_id = l.student_id where l.dedupe_key like $1 order by s.name, l.to_phone`, [`notice:${noticeId}:%`])).rows;
const tell = (notices: WhatsAppNotice[]) => {
  const { rawBody, signature } = standIn.notice(notices);
  return platform((c) => applyNotices(c, standIn, rawBody, signature, enqueueQueued(queue)));
};
const written = async (who: Who, classId: string | null, body: string) => {
  const r = await as(who, (c) => writeNotice(c, actor(who), { classId, body }));
  if (!r.ok) throw new Error(`not written: ${r.reason}`);
  return r.noticeId;
};

describe('the words', () => {
  it('the notice template names the school first, then the class, then the notice', () => {
    const t = TEMPLATE_REGISTRY.find((x) => x.name === 'class_notice')!;
    expect(definitionProblem(t)).toBeNull();
    expect(t.purpose).toBe('operational_communication');
    expect(renderTemplate(t.body.en, { school: 'School A', class: '5-A', notice: 'The parent meeting is on Saturday at 10 am.' })).toBe('From School A: Notice for 5-A. The parent meeting is on Saturday at 10 am. For any question, please contact the school office.');
  });
});

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    // 5-A: Asha, Bilal (guardian has not agreed to messages), Chitra (no number), and Dev and Esha, brother and
    // sister with one guardian. 6-B: Farah.
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '00:00', '00:00');
      insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${TEACHER_5A}', '${A}', 't5a@school-a.example', 'teacher', 'Tara Teacher'),
        ('${TEACHER_6B}', '${A}', 't6b@school-a.example', 'teacher', 'Tarun Teacher'), ('${ADMIN}', '${A}', 'admin@school-a.example', 'school_admin', 'Asif Admin'), ('${ACCOUNTANT}', '${A}', 'accounts@school-a.example', 'accountant', 'Anil Accountant');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${CLASS_5A}', '${A}', '5-A', '${TEACHER_5A}'), ('${CLASS_6B}', '${A}', '6-B', '${TEACHER_6B}');
      insert into students (student_id, school_id, admission_no, name, status, class_id) values ('${u(31)}', '${A}', 'A-1', 'Asha', 'active', '${CLASS_5A}'), ('${u(32)}', '${A}', 'A-2', 'Bilal', 'active', '${CLASS_5A}'),
        ('${u(33)}', '${A}', 'A-3', 'Chitra', 'active', '${CLASS_5A}'), ('${u(34)}', '${A}', 'A-4', 'Dev', 'active', '${CLASS_5A}'), ('${u(35)}', '${A}', 'A-5', 'Esha', 'active', '${CLASS_5A}'), ('${u(36)}', '${A}', 'A-6', 'Farah', 'active', '${CLASS_6B}');
      insert into parents (parent_id, school_id, name, phone) values ('${u(41)}', '${A}', 'Guardian of Asha', '9000000001'), ('${u(42)}', '${A}', 'Guardian of Bilal', '9000000002'), ('${u(43)}', '${A}', 'Guardian of Chitra', 'not given'),
        ('${u(44)}', '${A}', 'Guardian of Dev and Esha', '+919000000004'), ('${u(46)}', '${A}', 'Guardian of Farah', '9000000006');
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${u(41)}', '${u(31)}'), ('${A}', '${u(42)}', '${u(32)}'), ('${A}', '${u(43)}', '${u(33)}'), ('${A}', '${u(44)}', '${u(34)}'), ('${A}', '${u(44)}', '${u(35)}'), ('${A}', '${u(46)}', '${u(36)}');
    `);
    const t = TEMPLATE_REGISTRY.find((x) => x.name === 'class_notice')!;
    await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, 'class_notice', 1, 'en', $1, $2, 'utility', 1440, 'approved')`, [t.body.en, [...t.variables]]);
    for (const s of [31, 33, 34, 35, 36]) await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [A, u(s)]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('a teacher reaches only their own classes: to write for, and to see', async () => {
    expect(await as(teacher5A, (c) => noticeClasses(c, actor(teacher5A)))).toEqual([{ class_id: CLASS_5A, name: '5-A' }]);
    expect((await as(admin, (c) => noticeClasses(c, actor(admin)))).map((c) => c.name)).toEqual(['5-A', '6-B']);
    expect(await as(teacher5A, (c) => writeNotice(c, actor(teacher5A), { classId: CLASS_6B, body: 'For another class.' }))).toEqual({ ok: false, reason: 'class' });
    expect(await as(teacher5A, (c) => writeNotice(c, actor(teacher5A), { classId: null, body: 'For every class.' }))).toEqual({ ok: false, reason: 'whole_school' });
    expect(await as({ role: 'accountant', user: ACCOUNTANT }, (c) => writeNotice(c, { schoolId: A, userId: ACCOUNTANT, role: 'accountant' as never }, { classId: CLASS_5A, body: 'x' }))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(teacher5A, (c) => writeNotice(c, actor(teacher5A), { classId: CLASS_5A, body: '   ' }))).toEqual({ ok: false, reason: 'words' });
    // The database holds the same line, whatever the app code says: another class, every class, or another writer's name.
    for (const [classId, by] of [[`'${CLASS_6B}'`, TEACHER_5A], ['null', TEACHER_5A], [`'${CLASS_5A}'`, PRINCIPAL]]) {
      await expect(as(teacher5A, (c) => c.query(`insert into class_notices (school_id, class_id, body, written_by) values ('${A}', ${classId}, 'direct', '${by}')`)), `${classId} by ${by}`).rejects.toThrow(/row-level security/);
    }
    await expect(as({ role: 'accountant', user: ACCOUNTANT }, (c) => c.query(`insert into class_notices (school_id, class_id, body, written_by) values ('${A}', '${CLASS_5A}', 'direct', '${ACCOUNTANT}')`))).rejects.toThrow(/row-level security/);
    const mine = await written(teacher5A, CLASS_5A, 'The parent meeting is on Saturday\nat 10 am.');
    const theirs = await written(teacher6B, CLASS_6B, 'Bring the geography atlas on Monday.');
    const all = await written(admin, null, 'School is closed on Friday.');
    expect((await as(teacher5A, (c) => listNotices(c, A))).map((n) => n.notice_id)).toEqual([mine]);
    expect((await as(teacher6B, (c) => listNotices(c, A))).map((n) => n.notice_id)).toEqual([theirs]);
    expect((await as(principal, (c) => listNotices(c, A))).map((n) => n.notice_id).sort()).toEqual([mine, theirs, all].sort());
    expect((await as({ role: 'accountant', user: ACCOUNTANT }, (c) => listNotices(c, A)))).toEqual([]);
  });

  it('nothing sends unapproved: writing sends nothing, and only the principal can approve', async () => {
    expect(await sends()).toBe(0);
    const [mine] = await as(teacher5A, (c) => listNotices(c, A));
    for (const who of [teacher5A, admin]) expect(await as(who, (c) => decideNotice(c, queue, actor(who), mine.notice_id, { approve: true })), who.role).toEqual({ ok: false, reason: 'not_allowed' });
    // Marking it sent in the database directly: a teacher's and an admin's update touches no row.
    for (const who of [teacher5A, admin]) expect((await as<{ rowCount: number }>(who, (c) => c.query(`update class_notices set status = 'sent', decided_by = '${who.user}', decided_at = now() where notice_id = '${mine.notice_id}'`))).rowCount, who.role).toBe(0);
    // Nor can the words be changed after writing, by anyone.
    await expect(as(principal, (c) => c.query(`update class_notices set body = 'other words' where notice_id = '${mine.notice_id}'`))).rejects.toThrow(/never edited/);
    await expect(as(principal, (c) => c.query(`delete from class_notices where notice_id = '${mine.notice_id}'`))).rejects.toThrow(/permission denied/);
    expect(await sends()).toBe(0);
    expect((await as(principal, (c) => listNotices(c, A))).every((n) => n.status === 'waiting')).toBe(true);
  });

  it('approved by the principal: once to each guardian of that class and no other; no consent, held; no number, no message', async () => {
    const [mine] = await as(teacher5A, (c) => listNotices(c, A));
    expect(await as(principal, (c) => decideNotice(c, queue, actor(principal), mine.notice_id, { approve: true }))).toEqual({ ok: true, queued: 2, held: 1, withoutNumber: 1 });
    const rows = await log(mine.notice_id);
    // Dev and Esha share a guardian: one message, not two. Farah (6-B) is not in it.
    expect(rows.map((r: { child: string; phone: string; status: string }) => [r.child, r.phone, r.status])).toEqual([['Asha', '+919000000001', 'queued'], ['Bilal', '+919000000002', 'blocked_consent'], ['Dev', '+919000000004', 'queued']]);
    expect(rows[0]).toMatchObject({ purpose: 'operational_communication', template: 'class_notice', p: { class: '5-A', notice: 'The parent meeting is on Saturday at 10 am.' } });
    expect((await db.pg.query(`select count(*)::int as n from communication_log`)).rows[0].n).toBe(3);
    expect(await as(principal, (c) => decideNotice(c, queue, actor(principal), mine.notice_id, { approve: true }))).toEqual({ ok: false, reason: 'already_decided' });
    await expect(as(principal, (c) => c.query(`update class_notices set status = 'rejected', reject_reason = 'late' where notice_id = '${mine.notice_id}'`))).rejects.toThrow(/decided once/);
    expect((await db.pg.query(`select after_state from audit_log where event_action = 'notice.approved_and_sent'`)).rows).toEqual([{ after_state: { status: 'sent', queued: 2, held: 1, withoutNumber: 1 } }]);
  });

  it('who received and who read it is counted from the message log, and the writer sees it', async () => {
    const ids = (await db.pg.query(`select log_id from communication_log where status = 'queued' order by to_phone`)).rows.map((r: { log_id: string }) => r.log_id);
    for (const id of ids) await deliverQueued({ platform, queue, provider: standIn }, id);
    const sent = (await db.pg.query(`select provider_message_id as id from communication_log where status = 'sent' order by to_phone`)).rows;
    expect(sent).toHaveLength(2);
    const at = new Date().toISOString();
    await tell([{ kind: 'status', providerMessageId: sent[0].id, status: 'delivered', at }, { kind: 'status', providerMessageId: sent[0].id, status: 'read', at }, { kind: 'status', providerMessageId: sent[1].id, status: 'delivered', at }]);
    const [mine] = await as(teacher5A, (c) => listNotices(c, A));
    expect(mine).toMatchObject({ status: 'sent', decided_by_name: 'Priya Principal', on_its_way: 0, delivered: 2, read: 1, held: 1 });
  });

  it('not approved needs a reason, sends nothing, and the writer sees why', async () => {
    const [theirs] = await as(teacher6B, (c) => listNotices(c, A));
    const before = await sends();
    expect(await as(principal, (c) => decideNotice(c, queue, actor(principal), theirs.notice_id, { approve: false, reason: '  ' }))).toEqual({ ok: false, reason: 'reason' });
    expect(await as(principal, (c) => decideNotice(c, queue, actor(principal), theirs.notice_id, { approve: false, reason: 'Say which Monday.' }))).toEqual({ ok: true, queued: 0, held: 0, withoutNumber: 0 });
    expect(await sends()).toBe(before);
    expect((await as(teacher6B, (c) => listNotices(c, A)))[0]).toMatchObject({ status: 'rejected', reject_reason: 'Say which Monday.', decided_by_name: 'Priya Principal' });
    expect(await as(principal, (c) => decideNotice(c, queue, actor(principal), theirs.notice_id, { approve: true }))).toEqual({ ok: false, reason: 'already_decided' });
  });

  it('a notice for all classes goes to every class’s guardians, once each', async () => {
    const all = (await as(principal, (c) => listNotices(c, A))).find((n) => n.class_id === null)!;
    expect(await as(principal, (c) => decideNotice(c, queue, actor(principal), all.notice_id, { approve: true }))).toEqual({ ok: true, queued: 3, held: 1, withoutNumber: 1 });
    const rows = await log(all.notice_id);
    expect(rows.map((r: { child: string }) => r.child)).toEqual(['Asha', 'Bilal', 'Dev', 'Farah']);
    expect(rows[0].p).toEqual({ class: 'All classes', notice: 'School is closed on Friday.' });
  });

  it('a class where no guardian has a usable number: nothing is sent and the notice stays waiting', async () => {
    await db.pg.exec(`insert into classes (class_id, school_id, name, class_teacher_id) values ('${u(53)}', '${A}', '7-C', null); insert into students (student_id, school_id, admission_no, name, status, class_id) values ('${u(37)}', '${A}', 'A-7', 'Gita', 'active', '${u(53)}');`);
    const id = await written(admin, u(53), 'Sports day is on the 20th.');
    expect(await as(principal, (c) => decideNotice(c, queue, actor(principal), id, { approve: true }))).toEqual({ ok: false, reason: 'nobody' });
    expect((await db.pg.query(`select status from class_notices where notice_id = $1`, [id])).rows[0].status).toBe('waiting');
  });
});
