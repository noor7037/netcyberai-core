import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
// @ts-expect-error -- a plain .mjs development script, no types
import { startHarnessDb } from '../../scripts/harness/db.mjs';
import { createPgJobQueue } from '@/lib/jobs/pg-queue';
import { bookSlot, cancelPtm, createPtm, invitePtm, listPtms, markAttendance, ptmDetail, ptmRemindHandler, sayDate, sayTime, timesMeant } from '@/lib/ptm/ptm';
import { applyNotices } from '@/lib/whatsapp/delivery';
import { deliverQueued, enqueueQueued } from '@/lib/whatsapp/gate';
import { StandInWhatsAppProvider, type WhatsAppNotice } from '@/lib/whatsapp/provider';
import { TEMPLATE_REGISTRY, definitionProblem } from '@/lib/whatsapp/templates';

// Parent-teacher meetings (docs/25 slice 7k, C193). The acceptance test: a slot is booked once, and a parent with
// two children gets one message a teacher. Every name and number is made up.

describe('the words', () => {
  it('a time as a parent writes it; without am or pm both readings are offered and the meeting’s slots decide', () => {
    expect(timesMeant('10:30')).toEqual(['10:30', '22:30']);
    expect(timesMeant(' 10.30 ')).toEqual(['10:30', '22:30']);
    expect(timesMeant('1030')).toEqual(['10:30', '22:30']);
    expect(timesMeant('2:30 pm')).toEqual(['14:30']);
    expect(timesMeant('at 9 am.')).toEqual(['09:00']);
    expect(timesMeant('12 pm')).toEqual(['12:00']);
    expect(timesMeant('14:15')).toEqual(['14:15']);
    for (const other of ['1', '2', 'ok 10:30 is fine for us', 'STOP', '25:00', '10:75', '13 pm', '']) expect(timesMeant(other).length === 0 || other === '1' || other === '2', other).toBe(true);
    expect(sayTime('10:30')).toBe('10:30 am');
    expect(sayTime('14:05')).toBe('2:05 pm');
    expect(sayTime('12:00')).toBe('12:00 pm');
    expect(sayDate('2026-11-14')).toBe('Saturday, 14 November 2026');
  });
  it('every meeting template names the school first', () => {
    const mine = TEMPLATE_REGISTRY.filter((t) => t.name.startsWith('ptm_'));
    expect(mine.map((t) => t.name)).toEqual(['ptm_invitation', 'ptm_booked', 'ptm_time_not_free', 'ptm_reminder', 'ptm_cancelled']);
    for (const t of mine) expect(definitionProblem(t), t.name).toBeNull();
  });
});

const SECRET = 'a-secret-for-this-test-only-0123456789abcdef';
const A = 'cb000000-0000-4000-8000-000000000001';
const u = (n: number) => `cb000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const [PRINCIPAL, TARA, TARUN, TINA] = [u(11), u(12), u(13), u(14)];
const [CLASS_5A, CLASS_6B, CLASS_7C] = [u(51), u(52), u(53)];
const [G_ASHA, G_DEV_ESHA, G_FATIMA, G_GOPAL] = [u(41), u(44), u(46), u(47)];
const standIn = new StandInWhatsAppProvider({ secret: SECRET });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
type Who = { role: string; user: string };
const principal: Who = { role: 'principal', user: PRINCIPAL };
const tara: Who = { role: 'teacher', user: TARA };
const tarun: Who = { role: 'teacher', user: TARUN };
const tina: Who = { role: 'teacher', user: TINA };
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
const HELD_ON = day(3);
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
const said = async (template: string) => (await db.pg.query(`select to_phone as phone, template_params as p, status::text as status from communication_log where template_name = $1 order by created_at, log_id`, [template])).rows;
const bookings = async () =>
  (await db.pg.query(`select p.name as guardian, u.display_name as teacher, to_char(s.starts_at, 'HH24:MI') as time, b.booked_via as via from ptm_bookings b join parents p on p.parent_id = b.parent_id join users u on u.user_id = b.teacher_id join ptm_slots s on s.slot_id = b.slot_id order by u.display_name, s.starts_at`)).rows.map(
    (r: { guardian: string; teacher: string; time: string; via: string }) => `${r.teacher} ${r.time} ${r.guardian} (${r.via})`
  );
let PTM = '';
const slotOf = async (teacher: string, time: string) => (await db.pg.query(`select slot_id from ptm_slots where ptm_id = $1 and teacher_id = $2 and starts_at = $3::time`, [PTM, teacher, time])).rows[0].slot_id as string;

describe('on the real schema', () => {
  beforeAll(async () => {
    db = await startHarnessDb({ port: 0 });
    // 5-A (Tara): Asha; Dev and Esha, brother and sister with one guardian; Gauri. 6-B (Tarun): Farah, whose
    // guardians are Fatima and also Gopal, Gauri's father. 7-C has no class teacher. Tina teaches none of these.
    await db.pg.exec(`
      insert into schools (school_id, name, jurisdiction, is_test_fixture, is_pilot, pilot_allow_outbound, monthly_budget_paise, quiet_hours_start, quiet_hours_end) values ('${A}', 'School A', 'IN-HR', false, false, true, 100000, '00:00', '00:00');
      insert into users (user_id, school_id, email, role, display_name) values ('${PRINCIPAL}', '${A}', 'principal@school-a.example', 'principal', 'Priya Principal'), ('${TARA}', '${A}', 'tara@school-a.example', 'teacher', 'Tara Teacher'),
        ('${TARUN}', '${A}', 'tarun@school-a.example', 'teacher', 'Tarun Teacher'), ('${TINA}', '${A}', 'tina@school-a.example', 'teacher', 'Tina Teacher');
      insert into classes (class_id, school_id, name, class_teacher_id) values ('${CLASS_5A}', '${A}', '5-A', '${TARA}'), ('${CLASS_6B}', '${A}', '6-B', '${TARUN}'), ('${CLASS_7C}', '${A}', '7-C', null);
      insert into students (student_id, school_id, admission_no, name, status, class_id) values ('${u(31)}', '${A}', 'A-1', 'Asha', 'active', '${CLASS_5A}'), ('${u(34)}', '${A}', 'A-4', 'Dev', 'active', '${CLASS_5A}'),
        ('${u(35)}', '${A}', 'A-5', 'Esha', 'active', '${CLASS_5A}'), ('${u(36)}', '${A}', 'A-6', 'Farah', 'active', '${CLASS_6B}'), ('${u(37)}', '${A}', 'A-7', 'Gauri', 'active', '${CLASS_5A}');
      insert into parents (parent_id, school_id, name, phone) values ('${G_ASHA}', '${A}', 'Anita Sharma', '9000000001'), ('${G_DEV_ESHA}', '${A}', 'Deepa Rao', '+919000000004'), ('${G_FATIMA}', '${A}', 'Fatima Ali', '9000000006'), ('${G_GOPAL}', '${A}', 'Gopal Verma', '9000000007');
      insert into parent_student_map (school_id, parent_id, student_id) values ('${A}', '${G_ASHA}', '${u(31)}'), ('${A}', '${G_DEV_ESHA}', '${u(34)}'), ('${A}', '${G_DEV_ESHA}', '${u(35)}'), ('${A}', '${G_FATIMA}', '${u(36)}'), ('${A}', '${G_GOPAL}', '${u(36)}'), ('${A}', '${G_GOPAL}', '${u(37)}');
    `);
    await db.pg.query(`insert into school_module_entitlements (school_id, module_id, enabled, source) values ($1, 'ptm', true, 'plan')`, [A]);
    for (const t of TEMPLATE_REGISTRY.filter((x) => x.name.startsWith('ptm_'))) await db.pg.query(`insert into whatsapp_templates (school_id, template_name, version, language, body, variables, billing_category, stale_after_minutes, status) values (null, $1, 1, 'en', $2, $3, 'utility', $4, 'approved')`, [t.name, t.body.en, [...t.variables], t.staleAfterMinutes]);
    for (const s of [31, 34, 35, 36, 37]) await db.pg.query(`insert into consent_ledger (school_id, student_id, purpose, granted, verification_method, notice_version) select $1, $2, 'operational_communication', true, (enum_range(null::consent_method))[1], 'v1'`, [A, u(s)]);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  }, 120_000);
  afterAll(async () => db?.stop());

  it('the office makes a meeting: slots for each class teacher; a class without a teacher is named, not skipped', async () => {
    const input = { title: 'Term 2 meeting', heldOn: HELD_ON, startsAt: '10:00', endsAt: '11:00', slotMinutes: 15, classIds: [CLASS_5A, CLASS_6B] };
    expect(await as(tara, (c) => createPtm(c, actor(tara), input))).toEqual({ ok: false, reason: 'not_allowed' });
    await expect(as(tara, (c) => c.query(`insert into ptm_events (school_id, title, held_on, starts_at, ends_at, slot_minutes, class_ids, created_by) values ('${A}', 'x', '${HELD_ON}', '10:00', '11:00', 15, '{${CLASS_5A}}', '${TARA}')`))).rejects.toThrow(/row-level security/);
    expect(await as(principal, (c) => createPtm(c, actor(principal), { ...input, classIds: [CLASS_5A, CLASS_7C] }))).toEqual({ ok: false, reason: 'no_teacher', classes: ['7-C'] });
    expect(await as(principal, (c) => createPtm(c, actor(principal), { ...input, heldOn: day(-1) }))).toEqual({ ok: false, reason: 'date' });
    expect(await as(principal, (c) => createPtm(c, actor(principal), { ...input, endsAt: '10:10' }))).toEqual({ ok: false, reason: 'times' });
    const made = await as(principal, (c) => createPtm(c, actor(principal), input));
    expect(made).toMatchObject({ ok: true, teachers: 2, slots: 8 });
    PTM = (made as { ptmId: string }).ptmId;
    expect((await as(principal, (c) => listPtms(c, A)))[0]).toMatchObject({ title: 'Term 2 meeting', held_on: HELD_ON, starts_at: '10:00', ends_at: '11:00', status: 'draft', classes: '5-A, 6-B', slots: 8, booked: 0 });
    // A draft has sent nothing.
    expect((await db.pg.query(`select count(*)::int as n from communication_log`)).rows[0].n).toBe(0);
  });

  it('a parent with two children gets one message a teacher: one for both children in a class, one from each teacher across classes', async () => {
    expect(await as(tara, (c) => invitePtm(c, queue, actor(tara), PTM))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => invitePtm(c, queue, actor(principal), PTM))).toEqual({ ok: true, queued: 5, held: 0, withoutNumber: 0 });
    const rows = await said('ptm_invitation');
    expect(rows.map((r: { phone: string; p: { teacher: string; children: string } }) => `${r.phone} ${r.p.teacher}: ${r.p.children}`).sort()).toEqual([
      '+919000000001 Tara Teacher: Asha',
      '+919000000004 Tara Teacher: Dev, Esha', // brother and sister: ONE message, naming both
      '+919000000006 Tarun Teacher: Farah',
      '+919000000007 Tara Teacher: Gauri', // a child with each teacher: one message from each
      '+919000000007 Tarun Teacher: Farah',
    ]);
    expect(rows[0].p).toMatchObject({ date: sayDate(HELD_ON), from: '10:00 am', to: '11:00 am' });
    expect(await as(principal, (c) => invitePtm(c, queue, actor(principal), PTM))).toEqual({ ok: false, reason: 'not_draft' });
    expect((await db.pg.query(`select count(*)::int as n from communication_log`)).rows[0].n).toBe(5);
    const job = (await db.pg.query(`select next_run_at as run_at, payload from jobs where type = 'ptm.remind'`)).rows;
    expect(job).toHaveLength(1);
    expect(new Date(job[0].run_at).toISOString()).toBe(new Date(new Date(`${HELD_ON}T17:00:00+05:30`).getTime() - 86400_000).toISOString());
    expect(await deliverAll()).toBe(5);
  });

  it('a slot is booked once: the first to reply with a time has it; the second is told it is taken and which times are free', async () => {
    await writes('+919000000001', '10:30');
    expect(await bookings()).toEqual(['Tara Teacher 10:30 Anita Sharma (reply)']);
    expect((await said('ptm_booked')).map((r: { phone: string; p: object }) => [r.phone, r.p])).toEqual([['+919000000001', { date: sayDate(HELD_ON), time: '10:30 am', teacher: 'Tara Teacher' }]]);
    await writes('+919000000004', '10.30');
    expect(await bookings()).toEqual(['Tara Teacher 10:30 Anita Sharma (reply)']);
    expect((await said('ptm_time_not_free')).map((r: { phone: string; p: object }) => [r.phone, r.p])).toEqual([['+919000000004', { teacher: 'Tara Teacher', times: '10:00 am, 10:15 am, 10:45 am' }]]);
    // The database holds the rule, whatever the app code does: the same slot again, for anyone, is refused.
    const slot = await slotOf(TARA, '10:30');
    await expect(as(principal, (c) => c.query(`insert into ptm_bookings (school_id, ptm_id, slot_id, teacher_id, parent_id, booked_via, booked_by) values ($1, $2, $3, $4, $5, 'staff', $6)`, [A, PTM, slot, TARA, G_DEV_ESHA, PRINCIPAL]))).rejects.toThrow(/duplicate key|unique/);
    expect(await as(principal, (c) => bookSlot(c, actor(principal), { slotId: slot, parentId: G_DEV_ESHA }))).toEqual({ ok: false, reason: 'taken' });
    // A time that is not one of the meeting's, and words that are not a time: nothing is booked.
    await writes('+919000000004', '4 pm');
    await writes('+919000000004', 'Is 10:30 possible? Thank you');
    expect(await bookings()).toHaveLength(1);
    expect(await said('ptm_time_not_free')).toHaveLength(2);
  });

  it('a parent with a child under each teacher books one slot with each; replying again moves a slot, never doubles it', async () => {
    await writes('+919000000007', '10:15');
    await writes('+919000000007', '10:45 am');
    const two = await bookings();
    expect(two.filter((b: string) => b.includes('Gopal Verma'))).toHaveLength(2);
    expect(new Set(two.filter((b: string) => b.includes('Gopal Verma')).map((b: string) => b.slice(0, 5))).size).toBe(2); // one with Tara, one with Tarun
    // Anita moves from 10:30 to 10:00; 10:30 is free again and Deepa takes it.
    await writes('+919000000001', '10');
    await writes('+919000000004', '10:30');
    const now = await bookings();
    expect(now).toContain('Tara Teacher 10:00 Anita Sharma (reply)');
    expect(now).toContain('Tara Teacher 10:30 Deepa Rao (reply)');
    expect(now).toHaveLength(4);
    expect((await db.pg.query(`select count(*)::int as n from (select slot_id from ptm_bookings group by slot_id having count(*) > 1) d`)).rows[0].n).toBe(0);
  });

  it('a teacher sees their own slots and parents only; the office books for a parent who phoned', async () => {
    const mine = (await as(tarun, (c) => ptmDetail(c, actor(tarun), PTM)))!;
    expect(mine.teachers.map((t) => t.teacher)).toEqual(['Tarun Teacher']);
    expect(mine.teachers[0].guardians.map((g) => g.guardian).sort()).toEqual(['Fatima Ali', 'Gopal Verma']);
    expect(mine.mayManage).toBe(false);
    expect(await as(tina, (c) => ptmDetail(c, actor(tina), PTM))).toBeNull(); // not a meeting of her classes
    expect(await as(tina, (c) => listPtms(c, A))).toEqual([]);
    expect((await as(principal, (c) => ptmDetail(c, actor(principal), PTM)))!.teachers.map((t) => t.teacher)).toEqual(['Tara Teacher', 'Tarun Teacher']);
    // Tarun books Fatima into his own free slot; he cannot reach Tara's slots at all.
    const taken = new Set((await bookings()).filter((b: string) => b.startsWith('Tarun')).map((b: string) => b.slice(14, 19)));
    const free = ['10:00', '10:15', '10:30', '10:45'].find((t) => !taken.has(t))!;
    const tarunsOther = ['10:00', '10:15', '10:30', '10:45'].find((t) => !taken.has(t) && t !== free)!;
    const [ownSlot, otherSlot, tarasSlot] = [await slotOf(TARUN, free), await slotOf(TARUN, tarunsOther), await slotOf(TARA, '10:15')];
    expect(await as(tarun, (c) => bookSlot(c, actor(tarun), { slotId: ownSlot, parentId: G_FATIMA }))).toMatchObject({ ok: true, moved: false });
    expect(await as(tarun, (c) => bookSlot(c, actor(tarun), { slotId: tarasSlot, parentId: G_GOPAL }))).toEqual({ ok: false, reason: 'not_found' });
    // A guardian with no child in that teacher's class is not booked with them.
    expect(await as(principal, (c) => bookSlot(c, actor(principal), { slotId: otherSlot, parentId: G_ASHA }))).toEqual({ ok: false, reason: 'not_invited' });
    expect(await bookings()).toHaveLength(5);
  });

  it('the day before, each booked parent is reminded once', async () => {
    await deliverAll();
    const run = ptmRemindHandler({ platform, queue });
    const job = { jobId: 'j', type: 'ptm.remind', payload: { ptmId: PTM }, attempts: 1, maxAttempts: 3, schoolId: A, idempotencyKey: 'k' };
    await run(job);
    const first = await said('ptm_reminder');
    expect(first).toHaveLength(5);
    expect(first.find((r: { phone: string }) => r.phone === '+919000000001').p).toEqual({ date: sayDate(HELD_ON), time: '10:00 am', teacher: 'Tara Teacher' });
    await run(job);
    expect(await said('ptm_reminder')).toHaveLength(5);
  });

  it('who came is marked after the meeting has begun, by that teacher or the office, with a note', async () => {
    const d = (await as(tara, (c) => ptmDetail(c, actor(tara), PTM)))!;
    const anita = d.teachers[0].slots.find((s) => s.booking?.guardian === 'Anita Sharma')!.booking!;
    expect(await as(tara, (c) => markAttendance(c, actor(tara), { bookingId: anita.booking_id, attended: true, note: '' }))).toEqual({ ok: false, reason: 'too_early' });
    expect(await as(tarun, (c) => markAttendance(c, actor(tarun), { bookingId: anita.booking_id, attended: true, note: '' }, HELD_ON))).toEqual({ ok: false, reason: 'not_found' }); // not his booking
    expect(await as(tara, (c) => markAttendance(c, actor(tara), { bookingId: anita.booking_id, attended: true, note: 'Will read with Asha for ten minutes a day.' }, HELD_ON))).toEqual({ ok: true });
    const after = (await as(principal, (c) => ptmDetail(c, actor(principal), PTM, day(4))))!;
    expect(after.isOver).toBe(true);
    expect(after.ptm).toMatchObject({ booked: 5, attended: 1 });
    expect(after.teachers[0].slots.find((s) => s.booking?.guardian === 'Anita Sharma')!.booking).toMatchObject({ attended: true, note: 'Will read with Asha for ten minutes a day.', children: 'Asha' });
  });

  it('with the module switched off for the school, a reply books nothing and nobody is reminded', async () => {
    await db.pg.query(`update school_module_entitlements set enabled = false where school_id = $1 and module_id = 'ptm'`, [A]);
    const before = await bookings();
    await writes('+919000000001', '10:45');
    expect(await bookings()).toEqual(before);
    await db.pg.query(`update ptm_bookings set reminded_at = null`);
    await ptmRemindHandler({ platform, queue })({ jobId: 'j', type: 'ptm.remind', payload: { ptmId: PTM }, attempts: 1, maxAttempts: 3, schoolId: A, idempotencyKey: 'k' });
    expect(await said('ptm_reminder')).toHaveLength(5);
    await db.pg.exec(`update ptm_bookings set reminded_at = now(); update school_module_entitlements set enabled = true where school_id = '${A}' and module_id = 'ptm';`);
  });

  it('cancelling tells every parent who had booked; a time sent afterwards books nothing', async () => {
    expect(await as(tara, (c) => cancelPtm(c, queue, actor(tara), PTM))).toEqual({ ok: false, reason: 'not_allowed' });
    expect(await as(principal, (c) => cancelPtm(c, queue, actor(principal), PTM))).toEqual({ ok: true, told: 5 });
    expect(await as(principal, (c) => cancelPtm(c, queue, actor(principal), PTM))).toEqual({ ok: false, reason: 'already_cancelled' });
    const before = await bookings();
    await writes('+919000000006', '10:45');
    expect(await bookings()).toEqual(before);
    const run = ptmRemindHandler({ platform, queue });
    await run({ jobId: 'j', type: 'ptm.remind', payload: { ptmId: PTM }, attempts: 1, maxAttempts: 3, schoolId: A, idempotencyKey: 'k' });
    expect(await said('ptm_reminder')).toHaveLength(5);
  });
});
